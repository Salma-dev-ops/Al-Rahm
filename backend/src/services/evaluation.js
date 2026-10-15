import { randomUUID, createHash } from 'node:crypto';
import { TEST_CASES } from '../data/testCases.js';
import { BENCHMARK } from '../data/benchmark.js';
import { SPECIALTIES } from '../data/taxonomy.js';
import { loadConfig } from '../config.js';
import { AppError } from '../errors.js';
import { summariseResults } from '../scoring/metrics.js';
import { explainVerdict, scoreResponse } from '../scoring/rubric.js';

function rowToRun(row) {
  return {
    id: row.id, modelId: row.model_id, modelName: row.model_name,
    source: row.model_id.startsWith('manual:') ? 'manual' : 'api',
    isDemo: row.model_id.startsWith('demo:'),
    status: row.status, caseCount: row.case_count,
    createdAt: row.created_at, completedAt: row.completed_at, error: row.error,
    benchmark: row.benchmark_json ? JSON.parse(row.benchmark_json) : null,
    caseIds: row.case_ids_json ? JSON.parse(row.case_ids_json) : null,
  };
}

function resultsFor(db, row) {
  const snapshots = new Map((row.case_snapshot_json ? JSON.parse(row.case_snapshot_json) : []).map((c) => [c.id, c]));
  return db.prepare('SELECT * FROM results WHERE run_id = ? ORDER BY id').all(row.id).map((r) => {
    const checks = r.checks_json ? JSON.parse(r.checks_json) : [];
    const testCase = snapshots.get(r.case_id) ?? null;
    return {
      caseId: r.case_id, specialty: r.specialty,
      lifeStage: testCase?.lifeStage ?? null, urgency: testCase?.urgency ?? null,
      response: r.response_text, refused: Boolean(r.refused), score: r.score, verdict: r.verdict,
      explanation: r.verdict ? explainVerdict(r.verdict, checks) : null, checks,
      failedCategories: r.failed_categories ? JSON.parse(r.failed_categories) : [],
      latencyMs: r.latency_ms, error: r.error, testCase,
    };
  });
}

export function selectCases({ specialty, caseIds } = {}) {
  if (specialty !== undefined && !SPECIALTIES.some((s) => s.id === specialty)) throw new AppError('Unknown specialty.');
  if (caseIds !== undefined) {
    if (!Array.isArray(caseIds) || !caseIds.length || caseIds.length > TEST_CASES.length || caseIds.some((id) => typeof id !== 'string')) {
      throw new AppError('caseIds must be a non-empty list of benchmark question IDs.');
    }
    if (new Set(caseIds).size !== caseIds.length) throw new AppError('caseIds must not contain duplicates.');
    for (const id of caseIds) {
      const c = TEST_CASES.find((c) => c.id === id);
      if (!c) throw new AppError(`Unknown question: ${id}`);
      if (specialty && c.specialty !== specialty) throw new AppError(`Question ${id} does not belong to ${specialty}.`);
    }
  }
  return TEST_CASES.filter((c) => (!specialty || c.specialty === specialty) && (!caseIds || caseIds.includes(c.id)));
}

export function createEvaluationService(db, options = {}) {
  const config = { ...loadConfig(), ...options };
  const active = new Set();
  const insertRun = db.prepare(`INSERT INTO runs
    (id, model_id, model_name, status, case_count, created_at, benchmark_json, case_ids_json, case_snapshot_json)
    VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?)`);
  const insertResult = db.prepare(`INSERT INTO results
    (run_id, case_id, specialty, response_text, refused, score, verdict, checks_json, failed_categories, latency_ms, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const finish = db.prepare('UPDATE runs SET status = ?, completed_at = ?, error = ? WHERE id = ?');
  // In-process jobs cannot resume after a crash; report this instead of polling forever.
  db.prepare("UPDATE runs SET status = 'failed', completed_at = ?, error = ? WHERE status = 'running'")
    .run(new Date().toISOString(), 'Server restarted before this run finished. Start a new run to retry.');

  function getRun(id) {
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    if (!row) return null;
    const results = resultsFor(db, row);
    return { ...rowToRun(row), completedCases: results.length, results, summary: summariseResults(results, row.case_count) };
  }

  async function evaluateCase(runId, model, testCase) {
    const started = Date.now();
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Model request timed out after ${config.timeoutMs} ms.`));
          controller.abort();
        }, config.timeoutMs);
      });
      const answer = await Promise.race([
        Promise.resolve().then(() => model.generate(testCase.prompt, { caseId: testCase.id, signal: controller.signal })), timeout,
      ]);
      if (typeof answer?.text !== 'string' || answer.text.length > config.maxAnswerLength) throw new Error('Model returned an invalid or oversized answer.');
      const scored = scoreResponse(testCase, answer.text);
      insertResult.run(runId, testCase.id, testCase.specialty, answer.text, answer.refused ? 1 : 0,
        scored.score, scored.verdict, JSON.stringify(scored.checks), JSON.stringify(scored.failedCategories), Date.now() - started, null);
    } catch (err) {
      insertResult.run(runId, testCase.id, testCase.specialty, null, 0, null, null, null, null, Date.now() - started, err.message);
    } finally {
      clearTimeout(timer);
    }
  }

  async function execute(id, model, cases) {
    try {
      const queue = [...cases];
      await Promise.all(Array.from({ length: Math.min(config.concurrency, queue.length) }, async () => {
        while (queue.length) await evaluateCase(id, model, queue.shift());
      }));
      const errors = db.prepare('SELECT COUNT(*) AS n FROM results WHERE run_id = ? AND error IS NOT NULL').get(id).n;
      finish.run(errors ? 'failed' : 'completed', new Date().toISOString(), errors ? `${errors} of ${cases.length} model requests failed. Successful answers remain available.` : null, id);
    } catch (err) {
      finish.run('failed', new Date().toISOString(), err.message, id);
    } finally {
      active.delete(id);
    }
  }

  function startRun(model, selection = {}) {
    const cases = selectCases(selection);
    if (active.size >= config.maxActiveRuns) throw new AppError('Too many active evaluations. Try again when a run finishes.', 429, 'RUN_CAPACITY');
    const id = randomUUID();
    insertRun.run(id, model.id, model.name, cases.length, new Date().toISOString(), JSON.stringify(BENCHMARK),
      JSON.stringify(cases.map((c) => c.id)), JSON.stringify(cases));
    active.add(id);
    const done = execute(id, model, cases);
    return { run: getRun(id), done };
  }

  function leaderboard() {
    // rowid breaks ties for runs created in the same millisecond.
    const rows = db.prepare(`SELECT * FROM (
      SELECT r.*, ROW_NUMBER() OVER (PARTITION BY model_id ORDER BY created_at DESC, rowid DESC) AS rank
      FROM runs r WHERE status = 'completed'
    ) WHERE rank = 1 ORDER BY model_name`).all();
    return rows.map((row) => ({ ...rowToRun(row), summary: summariseResults(resultsFor(db, row), row.case_count) }));
  }

  return {
    startRun, getRun, leaderboard,
    get activeRuns() { return active.size; },
    async scoreManualAnswers(botName, answers) {
      const byCase = new Map(answers.map((a) => [a.caseId, a.response]));
      // Hash the full name so different punctuation and non-Latin names do not collide.
      const identity = createHash('sha256').update(botName.toLowerCase()).digest('hex').slice(0, 16);
      const model = { id: `manual:${identity}`, name: botName,
        async generate(prompt, { caseId }) { return { text: byCase.get(caseId), refused: false }; } };
      const { run, done } = startRun(model, { caseIds: [...byCase.keys()] });
      await done;
      return getRun(run.id);
    },
    listRuns(limit = 50) {
      return db.prepare('SELECT * FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit).map((row) => {
        const results = resultsFor(db, row);
        const { averageScore, unsafeRate, verdicts, coverageRate, errored } = summariseResults(results, row.case_count);
        return { ...rowToRun(row), completedCases: results.length, averageScore, unsafeRate, verdicts, coverageRate, errored };
      });
    },
    dashboard() {
      const counts = db.prepare(`SELECT COUNT(*) AS totalRuns,
        SUM(status = 'completed') AS completedRuns, SUM(status = 'failed') AS failedRuns FROM runs`).get();
      const latest = leaderboard();
      const results = latest.flatMap((run) => resultsFor(db, db.prepare('SELECT * FROM runs WHERE id = ?').get(run.id)));
      return {
        totalRuns: counts.totalRuns, activeRuns: active.size,
        completedRuns: counts.completedRuns ?? 0, failedRuns: counts.failedRuns ?? 0, modelCount: latest.length,
        summary: summariseResults(results), benchmark: BENCHMARK,
        scope: 'Latest completed run per model; different selections and demo models may be included. Use comparison for matched cases.',
      };
    },
    compare(runIds) {
      const runs = runIds.map(getRun);
      if (runs.some((r) => !r)) throw new AppError('One or more runs were not found.', 404, 'NOT_FOUND');
      if (runs.some((r) => r.status === 'running')) throw new AppError('Wait for all runs to finish before comparing.');
      const hashes = runs.map((r) => r.benchmark?.hash);
      if (hashes.some((h) => !h) || new Set(hashes).size !== 1 || new Set(runs.map((r) => r.benchmark.engineVersion)).size !== 1) {
        throw new AppError('Runs must use the same recorded benchmark and engine version to be compared.');
      }
      const commonCaseIds = runs[0].results.filter((r) => !r.error).map((r) => r.caseId)
        .filter((id) => runs.every((run) => run.results.some((r) => r.caseId === id && !r.error)));
      if (!commonCaseIds.length) throw new AppError('Runs have no successfully scored questions in common.');
      return {
        benchmark: runs[0].benchmark, commonCaseIds,
        runs: runs.map((run) => ({ id: run.id, modelId: run.modelId, modelName: run.modelName, isDemo: run.isDemo,
          excludedCases: run.caseCount - commonCaseIds.length,
          summary: summariseResults(run.results.filter((r) => commonCaseIds.includes(r.caseId))) })),
      };
    },
  };
}
