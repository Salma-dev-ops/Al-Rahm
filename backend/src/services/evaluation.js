import { randomUUID } from 'node:crypto';
import { TEST_CASES } from '../data/testCases.js';
import { summariseResults } from '../scoring/metrics.js';
import { scoreResponse } from '../scoring/rubric.js';

// How many test cases are sent to a model at the same time.
const CONCURRENCY = 3;

function rowToResult(row) {
  return {
    caseId: row.case_id,
    specialty: row.specialty,
    response: row.response_text,
    refused: Boolean(row.refused),
    score: row.score,
    verdict: row.verdict,
    checks: row.checks_json ? JSON.parse(row.checks_json) : [],
    failedCategories: row.failed_categories ? JSON.parse(row.failed_categories) : [],
    latencyMs: row.latency_ms,
    error: row.error,
  };
}

function rowToRun(row) {
  return {
    id: row.id,
    modelId: row.model_id,
    modelName: row.model_name,
    status: row.status,
    caseCount: row.case_count,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    error: row.error,
  };
}

export function createEvaluationService(db) {
  const insertRun = db.prepare(
    `INSERT INTO runs (id, model_id, model_name, status, case_count, created_at)
     VALUES (?, ?, ?, 'running', ?, ?)`,
  );
  const insertResult = db.prepare(
    `INSERT INTO results
       (run_id, case_id, specialty, response_text, refused, score, verdict, checks_json, failed_categories, latency_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const finishRun = db.prepare(`UPDATE runs SET status = ?, completed_at = ?, error = ? WHERE id = ?`);
  const selectRun = db.prepare(`SELECT * FROM runs WHERE id = ?`);
  const selectRuns = db.prepare(`SELECT * FROM runs ORDER BY created_at DESC LIMIT ?`);
  const selectResults = db.prepare(`SELECT * FROM results WHERE run_id = ? ORDER BY id`);
  const selectLatestCompletedPerModel = db.prepare(
    `SELECT r.* FROM runs r
     WHERE r.status = 'completed'
       AND r.created_at = (SELECT MAX(created_at) FROM runs WHERE model_id = r.model_id AND status = 'completed')
     ORDER BY r.model_name`,
  );

  async function evaluateCase(runId, model, testCase) {
    const started = Date.now();
    try {
      const { text, refused } = await model.generate(testCase.prompt, { caseId: testCase.id });
      const scored = scoreResponse(testCase, text);
      insertResult.run(
        runId,
        testCase.id,
        testCase.specialty,
        text,
        refused ? 1 : 0,
        scored.score,
        scored.verdict,
        JSON.stringify(scored.checks),
        JSON.stringify(scored.failedCategories),
        Date.now() - started,
        null,
      );
    } catch (err) {
      insertResult.run(runId, testCase.id, testCase.specialty, null, 0, null, null, null, null, Date.now() - started, err.message);
    }
  }

  async function execute(runId, model, cases) {
    try {
      const queue = [...cases];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) await evaluateCase(runId, model, queue.shift());
      });
      await Promise.all(workers);
      finishRun.run('completed', new Date().toISOString(), null, runId);
    } catch (err) {
      finishRun.run('failed', new Date().toISOString(), err.message, runId);
    }
  }

  function getRun(id) {
    const row = selectRun.get(id);
    if (!row) return null;
    const results = selectResults.all(id).map(rowToResult);
    return { ...rowToRun(row), completedCases: results.length, results, summary: summariseResults(results) };
  }

  return {
    /**
     * Starts evaluating `model` on the selected test cases. Returns the new run immediately;
     * cases are evaluated in the background and the run can be polled with getRun().
     * `done` resolves when the run has finished (used by tests).
     */
    startRun(model, { specialty, caseIds } = {}) {
      let cases = TEST_CASES;
      if (specialty) cases = cases.filter((c) => c.specialty === specialty);
      if (caseIds?.length) cases = cases.filter((c) => caseIds.includes(c.id));
      if (cases.length === 0) throw new Error('No test cases match that selection.');

      const id = randomUUID();
      insertRun.run(id, model.id, model.name, cases.length, new Date().toISOString());
      const done = execute(id, model, cases);
      return { run: getRun(id), done };
    },

    getRun,

    listRuns(limit = 50) {
      return selectRuns.all(limit).map((row) => {
        const results = selectResults.all(row.id).map(rowToResult);
        const { averageScore, unsafeRate, verdicts } = summariseResults(results);
        return { ...rowToRun(row), completedCases: results.length, averageScore, unsafeRate, verdicts };
      });
    },

    /** Leaderboard: each model's most recent completed run. */
    leaderboard() {
      return selectLatestCompletedPerModel.all().map((row) => {
        const results = selectResults.all(row.id).map(rowToResult);
        return { ...rowToRun(row), summary: summariseResults(results) };
      });
    },
  };
}
