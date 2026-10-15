import { APP_URL, EXPIRY_REMINDER_DAYS } from '../config.js';
import { sendSms, smsMode } from '../integrations/sms.js';
import { isPremium } from './users.js';

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });

export function createNotificationService(db) {
  const insertSms = db.prepare(
    `INSERT INTO sms_messages (user_id, phone, message, status, mode, provider_response, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const recentForUser = db.prepare(
    'SELECT phone, message, status, mode, created_at FROM sms_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?',
  );
  const usersDueReminder = db.prepare(
    `SELECT * FROM users
     WHERE sms_alerts = 1 AND phone IS NOT NULL
       AND premium_until > ? AND premium_until <= ?
       AND (expiry_reminded_for IS NULL OR expiry_reminded_for <> premium_until)`,
  );
  const markReminded = db.prepare('UPDATE users SET expiry_reminded_for = premium_until WHERE id = ?');

  async function send(userId, phone, message) {
    const { status, providerResponse } = await sendSms(phone, message);
    insertSms.run(userId, phone, message, status, smsMode(), providerResponse, new Date().toISOString());
    return status;
  }

  return {
    /** Payment receipt: transactional, so it goes to the number that paid even without alerts on. */
    async paymentReceipt(user, phone, receipt) {
      return send(
        user.id,
        phone,
        `Al-Rahm: Payment received${receipt ? ` (M-Pesa ${receipt})` : ''}. Premium is active until ${formatDate(user.premium_until)}. Thank you!`,
      );
    },

    /** "Your test finished" alert, for Premium users who turned SMS alerts on. */
    async runCompleted(user, run) {
      if (!user?.phone || !user.sms_alerts || !isPremium(user)) return null;
      const { averageScore, verdicts } = run.summary;
      const unsafe = verdicts.unsafe;
      const headline =
        averageScore == null
          ? `${run.modelName} test finished.`
          : `${run.modelName} scored ${averageScore}%. ${unsafe} unsafe answer${unsafe === 1 ? '' : 's'}.`;
      return send(user.id, user.phone, `Al-Rahm: ${headline} See why: ${APP_URL}/runs/${run.id}`);
    },

    /** Reminds Premium users with alerts on that their pass expires soon. Safe to call repeatedly. */
    async sendExpiryReminders(now = new Date()) {
      const horizon = new Date(now.getTime() + EXPIRY_REMINDER_DAYS * 86400000).toISOString();
      const due = usersDueReminder.all(now.toISOString(), horizon);
      for (const user of due) {
        markReminded.run(user.id);
        await send(
          user.id,
          user.phone,
          `Al-Rahm: Your Premium ends on ${formatDate(user.premium_until)}. Renew with M-Pesa at ${APP_URL}/premium to keep private results, exports and SMS alerts.`,
        );
      }
      return due.length;
    },

    recentMessages(userId, limit = 10) {
      return recentForUser.all(userId, limit);
    },
  };
}
