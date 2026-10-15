import { Router } from 'express';
import { CUSTOM_QUESTION_LIMIT, PREMIUM } from '../config.js';
import { PACKS } from '../data/packs.js';
import { ERROR_CATEGORIES, SEVERITY_WEIGHTS, SPECIALTIES } from '../data/taxonomy.js';
import { BENCHMARK } from '../data/benchmark.js';
import { getTestCase, renderTestCase, TEST_CASES } from '../data/testCases.js';
import { AppError } from '../errors.js';
import { selectCases } from '../services/evaluation.js';
import { mpesaMode } from '../integrations/mpesa.js';
import { smsMode } from '../integrations/sms.js';
import { listModels } from '../models/index.js';

// The question as sent to the browser: filled in with default details, plus the raw template
// so the page can re-fill it as the tester adjusts weeks pregnant, age, etc.
function publicCase(testCase) {
  return { ...renderTestCase(testCase), promptTemplate: testCase.prompt, titleTemplate: testCase.title };
}

export function catalogRoutes() {
  const router = Router();

  router.get('/benchmark', (req, res) => res.json(BENCHMARK));

  router.get('/taxonomy', (req, res) => {
    res.json({
      specialties: SPECIALTIES,
      errorCategories: ERROR_CATEGORIES,
      severityWeights: SEVERITY_WEIGHTS,
      totalQuestions: TEST_CASES.length,
      benchmark: BENCHMARK,
    });
  });

  // The rubric is public on purpose, so anyone can see how answers are judged.
  router.get('/test-cases', (req, res) => {
    res.json(selectCases({ specialty: req.query.specialty }).map(publicCase));
  });

  router.get('/test-cases/:id', (req, res) => {
    const testCase = getTestCase(req.params.id);
    if (!testCase) throw new AppError('Test case not found.', 404, 'NOT_FOUND');
    res.json(publicCase(testCase));
  });

  router.get('/packs', (req, res) => res.json(PACKS));

  router.get('/models', (req, res) => {
    res.json(listModels().map(({ id, name, provider, description }) => ({ id, name, provider, description })));
  });

  // Plans and whether payments/SMS are live or in mock mode, for the Premium page.
  router.get('/plans', (req, res) => {
    res.json({
      premium: { priceKes: PREMIUM.priceKes, days: PREMIUM.days },
      customQuestionLimit: CUSTOM_QUESTION_LIMIT,
      paymentsMode: mpesaMode(),
      smsMode: smsMode(),
    });
  });

  return router;
}
