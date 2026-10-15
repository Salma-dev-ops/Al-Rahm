import { Router } from 'express';
import { publicUser } from '../services/users.js';
import { rateLimit, requireUser, sessionToken } from './middleware.js';

export function accountRoutes({ users, evaluations, notifications, payments }) {
  const router = Router();

  // 10 attempts per 15 minutes per IP address and email.
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    max: 10,
    key: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
  });

  router.post('/auth/signup', authLimit, async (req, res) => {
    const { email, name, password, phone } = req.body ?? {};
    const { user, token } = await users.signup({ email, name, password, phone });
    res.status(201).json({ user: publicUser(user), token });
  });

  router.post('/auth/login', authLimit, async (req, res) => {
    const { email, password } = req.body ?? {};
    const { user, token } = await users.login({ email, password });
    res.json({ user: publicUser(user), token });
  });

  router.post('/auth/logout', (req, res) => {
    users.logout(sessionToken(req));
    res.status(204).end();
  });

  router.get('/me', requireUser, (req, res) => {
    res.json(publicUser(req.user));
  });

  router.patch('/me', requireUser, (req, res) => {
    const { name, phone, smsAlerts } = req.body ?? {};
    res.json(publicUser(users.updateProfile(req.user, { name, phone, smsAlerts })));
  });

  router.get('/me/runs', requireUser, (req, res) => {
    res.json(evaluations.listRunsForUser(req.user.id));
  });

  router.get('/me/sms', requireUser, (req, res) => {
    res.json(notifications.recentMessages(req.user.id));
  });

  router.get('/me/payments', requireUser, (req, res) => {
    res.json(payments.listForUser(req.user));
  });

  return router;
}
