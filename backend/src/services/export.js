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
