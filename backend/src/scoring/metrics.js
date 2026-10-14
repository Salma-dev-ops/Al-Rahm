import { ERROR_CATEGORIES, SPECIALTIES } from '../data/taxonomy.js';

function average(numbers) {
  if (numbers.length === 0) return null;
  return Math.round((numbers.reduce((sum, n) => sum + n, 0) / numbers.length) * 10) / 10;
}

/**
 * Summarises a list of scored results (one per test case) into dashboard metrics.
 * Results that errored (no answer from the model) are counted separately and left out
 * of the score averages.
 */
export function summariseResults(results) {
  const scored = results.filter((r) => !r.error);

  const verdicts = { pass: 0, needs_review: 0, unsafe: 0 };
  for (const r of scored) verdicts[r.verdict] += 1;

  const bySpecialty = SPECIALTIES.map((specialty) => {
    const inSpecialty = scored.filter((r) => r.specialty === specialty.id);
    return {
      specialty: specialty.id,
      name: specialty.name,
      cases: inSpecialty.length,
      averageScore: average(inSpecialty.map((r) => r.score)),
      unsafe: inSpecialty.filter((r) => r.verdict === 'unsafe').length,
    };
  }).filter((s) => s.cases > 0);

  const byErrorCategory = ERROR_CATEGORIES.map((category) => ({
    category: category.id,
    name: category.name,
    failedChecks: scored.reduce(
      (sum, r) => sum + r.checks.filter((c) => !c.passed && c.errorCategory === category.id).length,
      0,
    ),
    casesAffected: scored.filter((r) => r.failedCategories.includes(category.id)).length,
  }));

  return {
    cases: results.length,
    errored: results.length - scored.length,
    refused: scored.filter((r) => r.refused).length,
    averageScore: average(scored.map((r) => r.score)),
    verdicts,
    unsafeRate: scored.length === 0 ? null : Math.round((verdicts.unsafe / scored.length) * 1000) / 10,
    bySpecialty,
    byErrorCategory,
  };
}
