import { createHash } from 'node:crypto';
import { TEST_CASES } from './testCases.js';
import { ERROR_CATEGORIES, SEVERITY_WEIGHTS, SPECIALTIES } from './taxonomy.js';

export const ENGINE_VERSION = '2.0.1';
export const BENCHMARK_VERSION = '2026.10.15';

export function validateBenchmark(cases = TEST_CASES) {
  const ids = new Set();
  for (const c of cases) {
    if (!c.id || ids.has(c.id)) throw new Error(`Duplicate or missing case ID: ${c.id}`);
    ids.add(c.id);
    if (!SPECIALTIES.some((s) => s.id === c.specialty)) throw new Error(`Invalid specialty: ${c.id}`);
    if (!c.prompt || !c.referenceAnswer || !c.sources?.length || !c.checks?.length) {
      throw new Error(`Incomplete benchmark case: ${c.id}`);
    }
    const checkIds = new Set();
    for (const check of c.checks) {
      if (!check.id || checkIds.has(check.id)) throw new Error(`Duplicate check in ${c.id}`);
      checkIds.add(check.id);
      if (!Object.hasOwn(SEVERITY_WEIGHTS, check.severity) || !ERROR_CATEGORIES.some((e) => e.id === check.errorCategory)) {
        throw new Error(`Invalid check taxonomy: ${c.id}/${check.id}`);
      }
      if (!['includes_any', 'excludes_all', 'care_escalation', 'dose_limit'].includes(check.type) || !check.patterns?.length) {
        throw new Error(`Invalid check rule: ${c.id}/${check.id}`);
      }
      if (check.type === 'dose_limit' && [check.maxDailyMg, check.maxSingleMg, check.minIntervalHours].some((n) => !Number.isFinite(n) || n <= 0)) {
        throw new Error(`Invalid dose limit: ${c.id}/${check.id}`);
      }
    }
  }
  return true;
}

validateBenchmark();

export const BENCHMARK = Object.freeze({
  id: 'al-rahm-womens-health',
  version: BENCHMARK_VERSION,
  engineVersion: ENGINE_VERSION,
  hash: createHash('sha256').update(JSON.stringify({ cases: TEST_CASES, weights: SEVERITY_WEIGHTS })).digest('hex'),
  caseCount: TEST_CASES.length,
  checkCount: TEST_CASES.reduce((n, c) => n + c.checks.length, 0),
  scoringMethod: 'Deterministic, severity-weighted rules with clause-level negation and care-action checks.',
  clinicalValidation: 'Not clinically validated; synthetic research benchmark requiring clinician review.',
  languages: ['en'],
  limitations: [
    'A pass means the written checks matched, not that the answer is medically safe or complete.',
    'English phrase matching can miss paraphrases, quotations, conditional advice and complex negation.',
    'The benchmark is small, synthetic and not representative of Kenyan patients or all clinical guidelines.',
    'Life-stage breakdowns show benchmark coverage; they do not establish demographic fairness.',
    'Numeric dose checks cover explicit doses in sentences naming paracetamol, not all regimens or patient-specific limits.',
  ],
});
