// Mirrors renderTestCase in the backend: fills {weeks}, {age}, ... into a question, keeping each
// value inside the range where the question's scoring checks stay clinically valid.

export function defaultValues(testCase) {
  return Object.fromEntries((testCase.variables ?? []).map((v) => [v.key, v.default]));
}

export function clampValues(testCase, values = {}) {
  const out = {};
  for (const v of testCase.variables ?? []) {
    const n = Math.round(Number(values[v.key]));
    out[v.key] = Number.isFinite(n) ? Math.min(v.max, Math.max(v.min, n)) : v.default;
  }
  return out;
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

/** The question's title and prompt with the given details filled in. */
export function renderQuestion(testCase, values) {
  const v = clampValues(testCase, values);
  return {
    title: fill(testCase.titleTemplate ?? testCase.title, v),
    prompt: fill(testCase.promptTemplate ?? testCase.prompt, v),
    values: v,
  };
}

/** The best curated pack to open for a question: the quick check if it's in it, otherwise the smallest pack. */
export function packForQuestion(packs, caseId) {
  const containing = packs.filter((p) => p.caseIds.includes(caseId));
  return containing.find((p) => p.id === "quick-check") ?? containing.sort((a, b) => a.caseIds.length - b.caseIds.length)[0];
}

export const SPECIALTY_NAMES = { obgyn: "OB-GYN", primary_care: "Primary Care", oncology: "Oncology", custom: "Own question" };
export const URGENCY_LABELS = { emergency: "Emergency", urgent: "Urgent", routine: "Routine" };
