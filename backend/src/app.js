import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { ERROR_CATEGORIES, SEVERITY_WEIGHTS, SPECIALTIES } from './data/taxonomy.js';
import { getTestCase, TEST_CASES } from './data/testCases.js';
import { BENCHMARK } from './data/benchmark.js';
import { getModel, listModels } from './models/index.js';
import { createEvaluationService, selectCases } from './services/evaluation.js';
import { scoreResponse } from './scoring/rubric.js';
import { loadConfig } from './config.js';
import { AppError } from './errors.js';
import { exportCsv } from './services/export.js';

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('Request body must be a JSON object.');
  return body;
}

function answerText(response, max, allowBlank = false) {
  if (typeof response !== 'string' || (!allowBlank && !response.trim()) || response.length > max) {
    throw new AppError(`response must be ${allowBlank ? '' : 'a non-empty '}string of up to ${max} characters.`);
  }
}

export function createApp(db, options = {}) {
  const config = { ...loadConfig(), ...options };
  const evaluations = createEvaluationService(db, config);
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.origins }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, engineVersion: BENCHMARK.engineVersion, activeRuns: evaluations.activeRuns });
  });
  app.use('/api', (req, res, next) => {
    if (!config.apiToken) return next();
    const expected = Buffer.from(`Bearer ${config.apiToken}`);
    const provided = Buffer.from(req.get('authorization') || '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new AppError('A valid API bearer token is required.', 401, 'UNAUTHORIZED');
    }
    next();
  });
  app.use((req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) throw new AppError('Send Content-Type: application/json.', 415, 'UNSUPPORTED_MEDIA_TYPE');
    next();
  });
  app.use(express.json({ limit: '1mb', strict: true }));

  app.get('/api/benchmark', (req, res) => res.json(BENCHMARK));
  app.get('/api/taxonomy', (req, res) => res.json({
    specialties: SPECIALTIES, errorCategories: ERROR_CATEGORIES,
    severityWeights: SEVERITY_WEIGHTS, totalQuestions: TEST_CASES.length, benchmark: BENCHMARK,
  }));
  app.get('/api/test-cases', (req, res) => {
    res.json(selectCases({ specialty: req.query.specialty }));
  });
  app.get('/api/test-cases/:id', (req, res) => {
    const testCase = getTestCase(req.params.id);
    if (!testCase) throw new AppError('Test case not found.', 404, 'NOT_FOUND');
    res.json(testCase);
  });
  app.get('/api/models', (req, res) => {
    res.json(listModels().map(({ id, name, provider, description }) => ({ id, name, provider, description })));
  });

  // Stateless scoring is useful for integrations; manual runs persist answers and reports.
  app.post('/api/evaluate', (req, res) => {
    const { caseId, response } = bodyObject(req.body);
    const c = getTestCase(caseId);
    if (!c) throw new AppError('Unknown question.');
    answerText(response, config.maxAnswerLength);
    res.json({ caseId, specialty: c.specialty, ...scoreResponse(c, response), benchmark: BENCHMARK });
  });
  app.post('/api/runs', (req, res) => {
    const { modelId, specialty, caseIds } = bodyObject(req.body);
    const model = typeof modelId === 'string' && getModel(modelId);
    if (!model) throw new AppError('Unknown model. Choose a model from /api/models.');
    const { run } = evaluations.startRun(model, { specialty, caseIds });
    res.status(202).json(run);
  });
  app.post('/api/runs/manual', async (req, res) => {
    const { botName, answers } = bodyObject(req.body);
    const name = typeof botName === 'string' ? botName.trim() : '';
    if (!name || name.length > 80) throw new AppError('Give your chatbot a name (up to 80 characters).');
    if (!Array.isArray(answers) || !answers.length || answers.length > TEST_CASES.length) {
      throw new AppError(`answers must contain between 1 and ${TEST_CASES.length} entries.`);
    }
    for (const a of answers) {
      bodyObject(a);
      if (!getTestCase(a.caseId)) throw new AppError(`Unknown question: ${a.caseId}`);
      answerText(a.response, config.maxAnswerLength, true);
    }
    if (new Set(answers.map((a) => a.caseId)).size !== answers.length) throw new AppError('Each question can only be answered once.');
    const filled = answers.filter((a) => a.response.trim());
    if (!filled.length) throw new AppError('Paste at least one answer.');
    res.status(201).json(await evaluations.scoreManualAnswers(name, filled));
  });
  app.post('/api/runs/compare', (req, res) => {
    const { runIds } = bodyObject(req.body);
    if (!Array.isArray(runIds) || runIds.length < 2 || runIds.length > 5 || runIds.some((id) => typeof id !== 'string') || new Set(runIds).size !== runIds.length) {
      throw new AppError('runIds must contain 2 to 5 distinct run IDs.');
    }
    res.json(evaluations.compare(runIds));
  });
  app.get('/api/runs', (req, res) => {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError('limit must be an integer from 1 to 100.');
    res.json(evaluations.listRuns(limit));
  });
  app.get('/api/runs/:id/export', (req, res) => {
    const format = req.query.format ?? 'json';
    if (!['json', 'csv'].includes(format)) throw new AppError('format must be json or csv.');
    const run = evaluations.getRun(req.params.id);
    if (!run) throw new AppError('Run not found.', 404, 'NOT_FOUND');
    res.attachment(`al-rahm-${encodeURIComponent(run.id)}.${format}`);
    if (format === 'csv') return res.type('text/csv').send(exportCsv(run));
    res.json(run);
  });
  app.get('/api/runs/:id', (req, res) => {
    const run = evaluations.getRun(req.params.id);
    if (!run) throw new AppError('Run not found.', 404, 'NOT_FOUND');
    res.json(run);
  });
  app.get('/api/leaderboard', (req, res) => res.json(evaluations.leaderboard()));
  app.get('/api/dashboard', (req, res) => res.json(evaluations.dashboard()));

  app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.', code: 'NOT_FOUND' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'JSON body exceeds 1 MB.', code: 'BODY_TOO_LARGE' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.', code: 'INVALID_JSON' });
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('API error:', err.message);
    res.status(500).json({ error: 'An internal error occurred.', code: 'INTERNAL_ERROR' });
  });
  return { app, evaluations };
}
