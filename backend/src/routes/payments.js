import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { rateLimit, requireUser } from './middleware.js';

function sameSecret(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function paymentRoutes({ payments }) {
  const router = Router();

  // 5 payment prompts per 10 minutes per user, so nobody's phone can be spammed with PIN prompts.
  const payLimit = rateLimit({ windowMs: 10 * 60000, max: 5, key: (req) => `pay:${req.user?.id}` });

  // Start an M-Pesa STK Push for a Premium pass. Body: { phone }
  router.post('/payments/premium', requireUser, payLimit, async (req, res) => {
    const payment = await payments.startPremiumPayment(req.user, req.body?.phone);
    res.status(202).json(payment);
  });

  // Polled by the payment screen; checks with M-Pesa directly if the callback is late.
  router.get('/payments/:id', requireUser, async (req, res) => {
    const payment = await payments.getForUser(req.params.id, req.user);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    res.json(payment);
  });

  // Safaricom calls this when the customer approves or cancels. The URL contains a secret
  // (MPESA_CALLBACK_SECRET) because Daraja callbacks are not signed. Always answer 200 with
  // ResultCode 0 so Safaricom does not keep retrying.
  router.post('/payments/mpesa/callback/:secret', async (req, res) => {
    if (!sameSecret(req.params.secret, process.env.MPESA_CALLBACK_SECRET)) {
      return res.status(404).json({ error: 'Not found.' });
    }
    try {
      await payments.handleCallback(req.body);
    } catch (err) {
      console.error('M-Pesa callback failed:', err.message);
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  return router;
}
