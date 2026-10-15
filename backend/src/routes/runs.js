import { Router } from 'express';
import { BENCHMARK } from '../data/benchmark.js';
import { CUSTOM_QUESTION_LIMIT } from '../config.js';
import { getPack } from '../data/packs.js';
import { getTestCase, TEST_CASES } from '../data/testCases.js';
import { AppError } from '../errors.js';
import { getModel } from '../models/index.js';
import { scoreResponse } from '../scoring/rubric.js';
import { exportCsv, exportSummaryCsv } from '../services/export.js';
import { isPremium } from '../services/users.js';
import { requireUser } from './middleware.js';

const MAX_QUESTION_LENGTH = 2000;

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('Request body must be a JSON object.');
  return body;
}

function answerText(response, max, allowBlank = false) {
  if (typeof response !== 'string' || (!allowBlank && !response.trim()) || response.length > max) {
    throw new AppError(`response must be ${allowBlank ? '' : 'a non-empty '}string of up to ${max} characters.`);
  }
}

function canView(run, user) {
  return !run.private || (user && run.userId === user.id);
}

function checkPrivacy(wantsPrivate, user) {
  if (!wantsPrivate) return false;
  if (!isPremium(user)) throw new AppError('Private results are a Premium feature.', 403, 'PREMIUM_REQUIRED');
  return true;
}

export function runRoutes({ evaluations, config }) {
  const router = Router();

  // Find a test the requester may see; private tests look like they don't exist to anyone else.
  function visibleRun(req) {
    const run = evaluations.getRun(req.params.id);
    if (!run || !canView(run, req.user)) throw new AppError('Run not found.', 404, 'NOT_FOUND');
    return run;
  }

  // Stateless scoring is useful for integrations; manual runs persist answers and reports.
  router.post('/evaluate', (req, res) => {
    const { caseId, response } = bodyObject(req.body);
    const c = getTestCase(caseId);
    if (!c) throw new AppError('Unknown question.');
    answerText(response, config.maxAnswerLength);
    res.json({ caseId, specialty: c.specialty, ...scoreResponse(c, response), benchmark: BENCHMARK });
  });

  // Run the questions against a model configured on the server.
  router.post('/runs', (req, res) => {
    const { modelId, packId, specialty, caseIds, private: wantsPrivate } = bodyObject(req.body);
    const model = typeof modelId === 'string' && getModel(modelId);
    if (!model) throw new AppError('Unknown model. Choose a model from /api/models.');
    if (packId !== undefined && !getPack(packId)) throw new AppError(`Unknown question pack: ${packId}`);
    const isPrivate = checkPrivacy(wantsPrivate, req.user);
    const selection = packId ? { specialty, caseIds: caseIds ?? getPack(packId).caseIds } : { specialty, caseIds };
    if (packId && specialty) selection.caseIds = selection.caseIds.filter((id) => getTestCase(id)?.specialty === specialty);
    const { run } = evaluations.startRun(model, selection, { userId: req.user?.id ?? null, isPrivate });
    res.status(202).json(run);
  });

  // Score answers copied from the tester's own chatbot.
  // Body: { botName, answers: [{ caseId, values?, response }], customQuestions?: [{ question, response }], private? }
  router.post('/runs/manual', async (req, res) => {
    const { botName, answers = [], customQuestions = [], private: wantsPrivate } = bodyObject(req.body);
    const name = typeof botName === 'string' ? botName.trim() : '';
    if (!name || name.length > 80) throw new AppError('Give your chatbot a name (up to 80 characters).');
    if (!Array.isArray(answers) || answers.length > TEST_CASES.length) {
      throw new AppError(`answers must be a list of up to ${TEST_CASES.length} entries.`);
    }
    if (!Array.isArray(customQuestions)) throw new AppError('customQuestions must be a list.');
    for (const a of answers) {
      bodyObject(a);
      if (!getTestCase(a.caseId)) throw new AppError(`Unknown question: ${a.caseId}`);
      answerText(a.response, config.maxAnswerLength, true);
      if (a.values !== undefined && (typeof a.values !== 'object' || a.values === null || Array.isArray(a.values))) {
        throw new AppError('values must be an object of question details.');
      }
    }
    if (new Set(answers.map((a) => a.caseId)).size !== answers.length) throw new AppError('Each question can only be answered once.');

    const limit = isPremium(req.user) ? CUSTOM_QUESTION_LIMIT.premium : CUSTOM_QUESTION_LIMIT.free;
    const custom = [];
    for (const q of customQuestions) {
      bodyObject(q);
      if (typeof q.question !== 'string' || q.question.length > MAX_QUESTION_LENGTH) {
        throw new AppError(`Own questions must be text of up to ${MAX_QUESTION_LENGTH} characters.`);
      }
      answerText(q.response ?? '', config.maxAnswerLength, true);
      if (q.question.trim() && q.response?.trim()) custom.push({ question: q.question.trim(), response: q.response });
    }
    if (custom.length > limit) {
      throw new AppError(isPremium(req.user)
        ? `You can add up to ${limit} of your own questions per test.`
        : `Free tests can include ${limit} of your own questions. Upgrade to Premium for up to ${CUSTOM_QUESTION_LIMIT.premium}.`);
    }

    const filled = answers.filter((a) => a.response.trim());
    if (!filled.length && !custom.length) throw new AppError('Paste at least one answer.');
    const isPrivate = checkPrivacy(wantsPrivate, req.user);

    res.status(201).json(await evaluations.scoreManualAnswers({
      botName: name,
      answers: filled.map(({ caseId, values, response }) => ({ caseId, values, response })),
      customQuestions: custom,
      userId: req.user?.id ?? null,
      isPrivate,
    }));
  });

  router.post('/runs/compare', (req, res) => {
    const { runIds } = bodyObject(req.body);
    if (!Array.isArray(runIds) || runIds.length < 2 || runIds.length > 5 || runIds.some((id) => typeof id !== 'string') || new Set(runIds).size !== runIds.length) {
      throw new AppError('runIds must contain 2 to 5 distinct run IDs.');
    }
    for (const id of runIds) {
      const run = evaluations.getRun(id);
      if (run && !canView(run, req.user)) throw new AppError('One or more runs were not found.', 404, 'NOT_FOUND');
    }
    res.json(evaluations.compare(runIds));
  });

  router.get('/runs', (req, res) => {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError('limit must be an integer from 1 to 100.');
    res.json(evaluations.listRuns(limit));
  });

  // Full report for integrations: JSON, or CSV with one row per check.
  router.get('/runs/:id/export', (req, res) => {
    const format = req.query.format ?? 'json';
    if (!['json', 'csv'].includes(format)) throw new AppError('format must be json or csv.');
    const run = visibleRun(req);
    res.attachment(`al-rahm-${encodeURIComponent(run.id)}.${format}`);
    if (format === 'csv') return res.type('text/csv').send(exportCsv(run));
    res.json(run);
  });

  // Spreadsheet-friendly summary (one row per question): the in-app Premium download.
  router.get('/runs/:id/export.csv', requireUser, (req, res) => {
    if (!isPremium(req.user)) throw new AppError('Exporting results is a Premium feature.', 403, 'PREMIUM_REQUIRED');
    const run = visibleRun(req);
    const filename = `al-rahm-${run.modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${run.id.slice(0, 8)}.csv`;
    res.attachment(filename).type('text/csv; charset=utf-8').send(exportSummaryCsv(run));
  });

  router.get('/runs/:id', (req, res) => res.json(visibleRun(req)));

  router.get('/leaderboard', (req, res) => res.json(evaluations.leaderboard()));
  router.get('/dashboard', (req, res) => res.json(evaluations.dashboard()));

  return router;
}
