function cell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet programs may interpret user-supplied answers as formulas.
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(run) {
  const rows = [[
    'run_id', 'model', 'benchmark_version', 'benchmark_hash', 'engine_version', 'case_id', 'specialty', 'life_stage',
    'score', 'verdict', 'error', 'response', 'check_id', 'category', 'severity', 'passed', 'evidence', 'reason',
  ]];
  for (const r of run.results) {
    for (const check of r.checks.length ? r.checks : [null]) {
      rows.push([run.id, run.modelName, run.benchmark?.version, run.benchmark?.hash, run.benchmark?.engineVersion,
        r.caseId, r.specialty, r.lifeStage, r.score, r.verdict, r.error, r.response,
        check?.id, check?.errorCategory, check?.severity, check?.passed, check?.evidence, check?.reason]);
    }
  }
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

const SUMMARY_HEADER = ['Question type', 'Specialty', 'Question', 'Chatbot answer', 'Score', 'Verdict', 'Explanation', 'Checks not met'];

/** One row per question, for reading in a spreadsheet (the in-app Premium download). */
export function exportSummaryCsv(run) {
  const rows = run.results.map((r) => [
    r.kind === 'custom' ? 'Own question (screened)' : 'Benchmark',
    r.specialty, r.prompt ?? r.testCase?.prompt, r.response, r.score, r.verdict, r.explanation,
    r.checks.filter((c) => !c.passed).map((c) => c.reason).join(' | '),
  ]);
  // BOM so Excel opens the UTF-8 file with the right characters.
  return `\uFEFF${[SUMMARY_HEADER, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
