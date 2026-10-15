import { randomUUID } from 'node:crypto';
import { PREMIUM } from '../config.js';
import { mpesaMode, parseStkCallback, queryStkStatus, stkPush } from '../integrations/mpesa.js';
import { normaliseKenyanPhone } from '../lib/phone.js';
import { ValidationError } from './users.js';

// If no callback has arrived this long after the PIN prompt, ask Daraja directly.
const QUERY_AFTER_MS = 20000;
// After this long with no answer at all, treat the payment as timed out.
const GIVE_UP_AFTER_MS = 3 * 60000;

function rowToPayment(row) {
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    phone: row.phone,
    mode: row.mode,
    receipt: row.receipt,
    message: row.result_desc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPaymentService(db, { users, notifications, mockDelayMs = 5000 }) {
  const insert = db.prepare(
    `INSERT INTO payments (id, user_id, phone, amount, status, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
  );
  const setCheckout = db.prepare(
    'UPDATE payments SET checkout_request_id = ?, merchant_request_id = ?, updated_at = ? WHERE id = ?',
  );
  const byId = db.prepare('SELECT * FROM payments WHERE id = ?');
  const byCheckout = db.prepare('SELECT * FROM payments WHERE checkout_request_id = ?');
  const forUser = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10');
  // Only moves a payment out of 'pending' once, so duplicate callbacks can't grant Premium twice.
  const settle = db.prepare(
    `UPDATE payments SET status = ?, receipt = ?, result_desc = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
  );
  const touch = db.prepare('UPDATE payments SET updated_at = ? WHERE id = ?');

  async function finish(payment, { status, receipt = null, resultDesc = null }) {
    const { changes } = settle.run(status, receipt, resultDesc, new Date().toISOString(), payment.id);
    if (changes === 0) return byId.get(payment.id); // already settled
    if (status === 'paid') {
      const user = users.extendPremium(payment.user_id, PREMIUM.days);
      await notifications.paymentReceipt(user, payment.phone, receipt).catch((err) => {
        console.error('Could not send payment receipt SMS:', err.message);
      });
    }
    return byId.get(payment.id);
  }

  return {
    /** Sends the M-Pesa PIN prompt for a Premium pass. Returns the pending payment. */
    async startPremiumPayment(user, phoneInput) {
      const phone = normaliseKenyanPhone(phoneInput ?? user.phone ?? '');
      if (!phone) throw new ValidationError('Enter the Safaricom number to pay from, e.g. 0712 345 678.');

      const mode = mpesaMode();
      const id = randomUUID();
      const now = new Date().toISOString();
      insert.run(id, user.id, phone, PREMIUM.priceKes, mode, now, now);

      if (mode === 'mock') {
        const checkoutRequestId = `mock-${id}`;
        setCheckout.run(checkoutRequestId, null, now, id);
        // Simulate the customer entering their PIN, then Safaricom calling us back.
        setTimeout(() => {
          this.handleCallback({
            Body: {
              stkCallback: {
                CheckoutRequestID: checkoutRequestId,
                ResultCode: 0,
                ResultDesc: 'The service request is processed successfully. (mock)',
                CallbackMetadata: {
                  Item: [
                    { Name: 'Amount', Value: PREMIUM.priceKes },
                    { Name: 'MpesaReceiptNumber', Value: `MOCK${id.slice(0, 6).toUpperCase()}` },
                    { Name: 'PhoneNumber', Value: Number(phone) },
                  ],
                },
              },
            },
          }).catch((err) => console.error('Mock M-Pesa callback failed:', err.message));
        }, mockDelayMs).unref?.();
        return rowToPayment(byId.get(id));
      }

      try {
        const result = await stkPush({
          phone,
          amount: PREMIUM.priceKes,
          accountReference: 'AlRahm',
          description: 'Premium pass',
        });
        setCheckout.run(result.checkoutRequestId, result.merchantRequestId, new Date().toISOString(), id);
      } catch (err) {
        await finish(byId.get(id), { status: 'failed', resultDesc: err.message });
        throw new ValidationError(err.message);
      }
      return rowToPayment(byId.get(id));
    },

    /** Handles Safaricom's STK callback. Unknown or already-settled payments are ignored. */
    async handleCallback(body) {
      const cb = parseStkCallback(body);
      if (!cb) return null;
      const payment = byCheckout.get(cb.checkoutRequestId);
      if (!payment || payment.status !== 'pending') return payment ? rowToPayment(payment) : null;

      if (cb.status === 'paid') {
        if (Number(cb.amount) !== payment.amount) {
          return rowToPayment(await finish(payment, { status: 'failed', resultDesc: `Amount mismatch: paid ${cb.amount}` }));
        }
        // Callbacks are not signed, so a real-mode success is confirmed with Daraja first.
        if (payment.mode === 'daraja') {
          const confirmed = await queryStkStatus(payment.checkout_request_id).catch(() => ({ status: 'pending' }));
          if (confirmed.status !== 'paid') return rowToPayment(payment); // re-checked when the page polls
        }
      }
      return rowToPayment(await finish(payment, { status: cb.status, receipt: cb.receipt, resultDesc: cb.resultDesc }));
    },

    /**
     * Returns a payment for its owner. While it is pending and the callback is late, asks
     * Daraja for the result, so the page never needs a manual refresh.
     */
    async getForUser(id, user) {
      let payment = byId.get(id);
      if (!payment || payment.user_id !== user.id) return null;

      const age = Date.now() - new Date(payment.created_at).getTime();
      const sinceCheck = Date.now() - new Date(payment.updated_at).getTime();
      if (payment.status === 'pending' && payment.mode === 'daraja' && age > QUERY_AFTER_MS && sinceCheck > 5000) {
        touch.run(new Date().toISOString(), id);
        const result = await queryStkStatus(payment.checkout_request_id).catch(() => ({ status: 'pending' }));
        if (result.status !== 'pending') payment = await finish(payment, result);
      }
      if (payment.status === 'pending' && age > GIVE_UP_AFTER_MS) {
        payment = await finish(payment, { status: 'failed', resultDesc: 'No response from M-Pesa. Please try again.' });
      }
      return rowToPayment(payment);
    },

    listForUser(user) {
      return forUser.all(user.id).map(rowToPayment);
    },
  };
}
