import cors from 'cors';
import express from 'express';
import { accountRoutes } from './routes/account.js';
import { catalogRoutes } from './routes/catalog.js';
import { authenticate, errorHandler } from './routes/middleware.js';
import { paymentRoutes } from './routes/payments.js';
import { runRoutes } from './routes/runs.js';
import { createEvaluationService } from './services/evaluation.js';
import { createNotificationService } from './services/notifications.js';
import { createPaymentService } from './services/payments.js';
import { createUserService } from './services/users.js';

export function createApp(db, { mockPaymentDelayMs } = {}) {
  const users = createUserService(db);
  const notifications = createNotificationService(db);
  const payments = createPaymentService(db, { users, notifications, mockDelayMs: mockPaymentDelayMs });
  const evaluations = createEvaluationService(db, {
    // Premium users with SMS alerts on get a text when a test finishes.
    onRunCompleted: (run) => run.userId && notifications.runCompleted(users.getById(run.userId), run),
  });

  const app = express();
  // Set TRUST_PROXY=1 when hosted behind a proxy (Render, Railway…) so req.ip is the real client
  // address. Left off locally, so a client can't fake its IP to dodge rate limits.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') ?? 'http://localhost:3000' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(authenticate(users));

  app.use('/api', catalogRoutes());
  app.use('/api', runRoutes({ evaluations }));
  app.use('/api', accountRoutes({ users, evaluations, notifications, payments }));
  app.use('/api', paymentRoutes({ payments }));
  app.use(errorHandler);

  return { app, evaluations, users, payments, notifications };
}
