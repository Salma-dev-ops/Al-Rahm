import cors from 'cors';
import express from 'express';
import { ERROR_CATEGORIES, SEVERITY_WEIGHTS, SPECIALTIES } from './data/taxonomy.js';
import { getTestCase, TEST_CASES } from './data/testCases.js';
import { getModel, listModels } from './models/index.js';
import { createEvaluationService } from './services/evaluation.js';

const MAX_ANSWER_LENGTH = 20000;

export function createApp(db) {
  const evaluations = createEvaluationService(db);
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') ?? 'http://localhost:3000' }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/taxonomy', (req, res) => {
    res.json({
      specialties: SPECIALTIES,
      errorCategories: ERROR_CATEGORIES,
      severityWeights: SEVERITY_WEIGHTS,
      totalQuestions: TEST_CASES.length,
    });
  });

  app.get('/api/test-cases', (req, res) => {
    const { specialty } = req.query;
    const cases = specialty ? TEST_CASES.filter((c) => c.specialty === specialty) : TEST_CASES;
    // The rubric is public on purpose, so anyone can see how answers are judged.
    res.json(cases);
  });

  app.get('/api/test-cases/:id', (req, res) => {
    const testCase = getTestCase(req.params.id);
    if (!testCase) return res.status(404).json({ error: 'Test case not found.' });
    res.json(testCase);
  });

  app.get('/api/models', (req, res) => {
    res.json(listModels().map(({ id, name, provider, description }) => ({ id, name, provider, description })));
  });

  app.post('/api/runs', (req, res) => {
    const { modelId, specialty, caseIds } = req.body ?? {};
    const model = getModel(modelId);
    if (!model) return res.status(400).json({ error: `Unknown model: ${modelId}` });
    if (specialty && !SPECIALTIES.some((s) => s.id === specialty)) {
      return res.status(400).json({ error: `Unknown specialty: ${specialty}` });
    }
    try {
      const { run } = evaluations.startRun(model, { specialty, caseIds });
      res.status(202).json(run);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Score answers copied from a user's own chatbot. Body: { botName, answers: [{ caseId, response }] }
  app.post('/api/runs/manual', async (req, res) => {
    const { botName, answers } = req.body ?? {};
    const name = typeof botName === 'string' ? botName.trim() : '';
    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Give your chatbot a name (up to 80 characters).' });
    }
    if (!Array.isArray(answers)) return res.status(400).json({ error: 'answers must be a list.' });

    const filled = answers.filter((a) => typeof a?.response === 'string' && a.response.trim() !== '');
    if (filled.length === 0) return res.status(400).json({ error: 'Paste at least one answer.' });
    for (const answer of filled) {
      if (!getTestCase(answer.caseId)) return res.status(400).json({ error: `Unknown question: ${answer.caseId}` });
      if (answer.response.length > MAX_ANSWER_LENGTH) {
        return res.status(400).json({ error: `Answers must be under ${MAX_ANSWER_LENGTH} characters.` });
      }
    }
    if (new Set(filled.map((a) => a.caseId)).size !== filled.length) {
      return res.status(400).json({ error: 'Each question can only be answered once.' });
    }

    const run = await evaluations.scoreManualAnswers(name, filled);
    res.status(201).json(run);
  });

  app.get('/api/runs', (req, res) => {
    res.json(evaluations.listRuns());
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = evaluations.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    res.json(run);
  });

  app.get('/api/leaderboard', (req, res) => {
    res.json(evaluations.leaderboard());
  });

  return { app, evaluations };
}
