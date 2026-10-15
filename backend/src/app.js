import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { BENCHMARK } from './data/benchmark.js';
import { loadConfig } from './config.js';
import { AppError } from './errors.js';
import { accountRoutes } from './routes/account.js';
import { catalogRoutes } from './routes/catalog.js';
import { authenticate, errorHandler, SESSION_HEADER } from './routes/middleware.js';
import { mpesaCallbackRoute, paymentRoutes } from './routes/payments.js';
import { runRoutes } from './routes/runs.js';
import { createEvaluationService } from './services/evaluation.js';
import { createNotificationService } from './services/notifications.js';
import { createPaymentService } from './services/payments.js';
import { createUserService } from './services/users.js';

export function createApp(db, options = {}) {
  const { mockPaymentDelayMs, ...overrides } = options;
  const config = { ...loadConfig(), ...overrides };
  const users = createUserService(db);
  const notifications = createNotificationService(db);
  const payments = createPaymentService(db, { users, notifications, mockDelayMs: mockPaymentDelayMs });
  const evaluations = createEvaluationService(db, {
    ...config,
    // Premium users with SMS alerts on get a text when a test finishes.
    onRunCompleted: (run) => run.userId && notifications.runCompleted(users.getById(run.userId), run),
  });

  const app = express();
  app.disable('x-powered-by');
  // Set TRUST_PROXY=1 when hosted behind a proxy (Render, Railway…) so req.ip is the real client
  // address. Left off locally, so a client can't fake its IP to dodge rate limits.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  app.use(cors({ origin: config.origins, allowedHeaders: ['Content-Type', 'Authorization', SESSION_HEADER] }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, engineVersion: BENCHMARK.engineVersion, activeRuns: evaluations.activeRuns });
  });

  app.use((req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) throw new AppError('Send Content-Type: application/json.', 415, 'UNSUPPORTED_MEDIA_TYPE');
    next();
  });
  app.use(express.json({ limit: '1mb', strict: true }));

  // Safaricom's payment callback can't send the API token, so it is mounted first.
  app.use('/api', mpesaCallbackRoute({ payments }));

  // Optional token for private integrations (API_AUTH_TOKEN). Login sessions use their own header.
  app.use('/api', (req, res, next) => {
    if (!config.apiToken) return next();
    const expected = Buffer.from(`Bearer ${config.apiToken}`);
    const provided = Buffer.from(req.get('authorization') || '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new AppError('A valid API bearer token is required.', 401, 'UNAUTHORIZED');
    }
    next();
  });
  app.use(authenticate(users));

  app.use('/api', catalogRoutes());
  app.use('/api', runRoutes({ evaluations, config }));
  app.use('/api', accountRoutes({ users, evaluations, notifications, payments }));
  app.use('/api', paymentRoutes({ payments }));

  app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.', code: 'NOT_FOUND' }));
  app.use(errorHandler);

  return { app, evaluations, users, payments, notifications };
}
