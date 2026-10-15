import { Router } from 'express';
import { CUSTOM_QUESTION_LIMIT } from '../config.js';
import { getPack } from '../data/packs.js';
import { SPECIALTIES } from '../data/taxonomy.js';
import { getTestCase, TEST_CASES } from '../data/testCases.js';
import { getModel } from '../models/index.js';
import { isPremium, ValidationError } from '../services/users.js';
import { requireUser } from './middleware.js';

const MAX_ANSWER_LENGTH = 20000;
const MAX_QUESTION_LENGTH = 2000;

const filled = (value) => typeof value === 'string' && value.trim() !== '';

function canView(run, user) {
  return !run.private || (user && run.userId === user.id);
}

function checkPrivacy(wantsPrivate, user) {
  if (!wantsPrivate) return false;
  if (!isPremium(user)) throw new ValidationError('Private results are a Premium feature.');
  return true;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function runToCsv(run) {
  const header = ['Question type', 'Specialty', 'Question', 'Chatbot answer', 'Score', 'Verdict', 'Explanation', 'Checks not met'];
  const rows = run.results.map((r) => [
    r.kind === 'custom' ? 'Own question (screened)' : 'Benchmark',
    r.specialty,
    r.prompt,
    r.response,
    r.score,
    r.verdict,
    r.explanation,
    r.checks.filter((c) => !c.passed).map((c) => c.reason).join(' | '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function runRoutes({ evaluations }) {
  const router = Router();

  // Run the questions against a model configured on the server.
  router.post('/runs', (req, res) => {
    const { modelId, packId, specialty, caseIds, private: wantsPrivate } = req.body ?? {};
    const model = getModel(modelId);
    if (!model) return res.status(400).json({ error: `Unknown model: ${modelId}` });
    if (specialty && !SPECIALTIES.some((s) => s.id === specialty)) {
      return res.status(400).json({ error: `Unknown specialty: ${specialty}` });
    }
    if (packId && !getPack(packId)) return res.status(400).json({ error: `Unknown question pack: ${packId}` });
    const isPrivate = checkPrivacy(wantsPrivate, req.user);

    let ids = packId ? getPack(packId).caseIds : TEST_CASES.map((c) => c.id);
    if (specialty) ids = ids.filter((id) => getTestCase(id).specialty === specialty);
    if (Array.isArray(caseIds) && caseIds.length) ids = ids.filter((id) => caseIds.includes(id));
    if (ids.length === 0) return res.status(400).json({ error: 'No questions match that selection.' });

    const items = evaluations.buildItems({ standard: ids.map((caseId) => ({ caseId })) });
    const { run } = evaluations.startRun(model, items, { userId: req.user?.id ?? null, isPrivate });
    res.status(202).json(run);
  });

  // Score answers copied from the tester's own chatbot.
  // Body: { botName, answers: [{ caseId, values?, response }], customQuestions: [{ question, response }], private? }
  router.post('/runs/manual', async (req, res) => {
    const { botName, answers = [], customQuestions = [], private: wantsPrivate } = req.body ?? {};
    const name = typeof botName === 'string' ? botName.trim() : '';
    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Give your chatbot a name (up to 80 characters).' });
    }
    if (!Array.isArray(answers) || !Array.isArray(customQuestions)) {
      return res.status(400).json({ error: 'answers and customQuestions must be lists.' });
    }

    const standard = answers.filter((a) => filled(a?.response));
    for (const answer of standard) {
      if (!getTestCase(answer.caseId)) return res.status(400).json({ error: `Unknown question: ${answer.caseId}` });
      if (answer.response.length > MAX_ANSWER_LENGTH) {
        return res.status(400).json({ error: `Answers must be under ${MAX_ANSWER_LENGTH} characters.` });
      }
    }
    if (new Set(standard.map((a) => a.caseId)).size !== standard.length) {
      return res.status(400).json({ error: 'Each question can only be answered once.' });
    }

    const custom = customQuestions.filter((q) => filled(q?.question) && filled(q?.response));
    const limit = isPremium(req.user) ? CUSTOM_QUESTION_LIMIT.premium : CUSTOM_QUESTION_LIMIT.free;
    if (custom.length > limit) {
      return res.status(400).json({
        error: isPremium(req.user)
          ? `You can add up to ${limit} of your own questions per test.`
          : `Free tests can include ${limit} of your own questions. Upgrade to Premium for up to ${CUSTOM_QUESTION_LIMIT.premium}.`,
      });
    }
    for (const q of custom) {
      if (q.question.length > MAX_QUESTION_LENGTH || q.response.length > MAX_ANSWER_LENGTH) {
        return res.status(400).json({ error: 'One of your own questions or answers is too long.' });
      }
    }
    if (standard.length + custom.length === 0) {
      return res.status(400).json({ error: 'Paste at least one answer.' });
    }
    const isPrivate = checkPrivacy(wantsPrivate, req.user);

    const run = await evaluations.scoreManualAnswers({
      botName: name,
      answers: standard.map(({ caseId, values, response }) => ({ caseId, values, response })),
      customQuestions: custom.map(({ question, response }) => ({ question: question.trim(), response })),
      userId: req.user?.id ?? null,
      isPrivate,
    });
    res.status(201).json(run);
  });

  router.get('/runs', (req, res) => {
    res.json(evaluations.listRuns());
  });

  router.get('/runs/:id', (req, res) => {
    const run = evaluations.getRun(req.params.id);
    // Private tests look like they don't exist to anyone but their owner.
    if (!run || !canView(run, req.user)) return res.status(404).json({ error: 'Test not found.' });
    res.json(run);
  });

  router.get('/runs/:id/export.csv', requireUser, (req, res) => {
    if (!isPremium(req.user)) return res.status(403).json({ error: 'Exporting results is a Premium feature.' });
    const run = evaluations.getRun(req.params.id);
    if (!run || !canView(run, req.user)) return res.status(404).json({ error: 'Test not found.' });
    const filename = `al-rahm-${run.modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${run.id.slice(0, 8)}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM so Excel opens the UTF-8 file with the right characters.
    res.send(`﻿${runToCsv(run)}`);
  });

  router.get('/leaderboard', (req, res) => {
    res.json(evaluations.leaderboard());
  });

  return router;
}
