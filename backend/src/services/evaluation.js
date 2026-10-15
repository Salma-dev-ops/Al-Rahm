import { createHash, randomUUID } from 'node:crypto';
import { BENCHMARK } from '../data/benchmark.js';
import { SPECIALTIES } from '../data/taxonomy.js';
import { renderTestCase, TEST_CASES } from '../data/testCases.js';
import { loadConfig } from '../config.js';
import { AppError } from '../errors.js';
import { summariseResults } from '../scoring/metrics.js';
import { explainVerdict, scoreResponse } from '../scoring/rubric.js';
import { explainScreen, screenCustomQuestion } from '../scoring/screen.js';

function rowToRun(row) {
  return {
    id: row.id, modelId: row.model_id, modelName: row.model_name,
    // 'manual' runs were scored from answers a user entered; 'api' runs called the model.
    source: row.model_id.startsWith('manual:') ? 'manual' : 'api',
    isDemo: row.model_id.startsWith('demo:'),
    status: row.status, caseCount: row.case_count,
    createdAt: row.created_at, completedAt: row.completed_at, error: row.error,
    benchmark: row.benchmark_json ? JSON.parse(row.benchmark_json) : null,
    caseIds: row.case_ids_json ? JSON.parse(row.case_ids_json) : null,
    userId: row.user_id ?? null,
    private: Boolean(row.private),
  };
}

function resultsFor(db, row) {
  const snapshots = new Map((row.case_snapshot_json ? JSON.parse(row.case_snapshot_json) : []).map((c) => [c.id, c]));
  return db.prepare('SELECT * FROM results WHERE run_id = ? ORDER BY id').all(row.id).map((r) => {
    const checks = r.checks_json ? JSON.parse(r.checks_json) : [];
    const kind = r.kind ?? 'standard'; // 'standard' (scored with a rubric) | 'custom' (own question, screened only)
    const testCase = snapshots.get(r.case_id) ?? null;
    let explanation = null;
    if (r.verdict) explanation = kind === 'custom' ? explainScreen(r.verdict, checks) : explainVerdict(r.verdict, checks);
    return {
      caseId: r.case_id, kind, specialty: r.specialty,
      lifeStage: testCase?.lifeStage ?? null, urgency: testCase?.urgency ?? null,
      prompt: r.prompt_text, values: r.variables_json ? JSON.parse(r.variables_json) : null,
      response: r.response_text, refused: Boolean(r.refused), score: r.score, verdict: r.verdict,
      explanation, checks,
      failedCategories: r.failed_categories ? JSON.parse(r.failed_categories) : [],
      latencyMs: r.latency_ms, error: r.error, testCase,
    };
  });
}

/** Benchmark questions only: own questions are screened, never scored or averaged. */
const standardOnly = (results) => results.filter((r) => r.kind !== 'custom');

function summaryFor(row, results) {
  const caseIds = row.case_ids_json ? JSON.parse(row.case_ids_json) : null;
  return summariseResults(standardOnly(results), caseIds?.length ?? row.case_count);
}

/** One paragraph summing up a whole test, shown at the top of its report. */
export function summariseRunInWords(summary, customResults) {
  const parts = [];
  if (summary.scored > 0) {
    const { pass, needs_review: review, unsafe } = summary.verdicts;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    let verdict = 'All answers passed the safety checks.';
    if (unsafe > 0) {
      verdict = `${plural(unsafe, 'answer')} could put a woman at risk: ${unsafe === 1 ? 'it' : 'they'} failed a critical check, such as missing an emergency or giving unsafe medicine advice.`;
    } else if (review > 0) {
      verdict = `No answer failed a critical check, but ${plural(review, 'answer')} missed something important.`;
    }
    parts.push(`Average score ${summary.averageScore}% across ${plural(summary.scored, 'question')} (${pass} passed). ${verdict}`);
  }
  const flagged = customResults.filter((r) => r.verdict === 'flagged').length;
  if (customResults.length === 1) {
    parts.push(`Your own question was screened for red flags: ${flagged ? 'red flags found' : 'none found'}. Own questions don't count towards the score.`);
  } else if (customResults.length > 1) {
    parts.push(`Your ${customResults.length} own questions were screened for red flags: ${flagged} flagged. Own questions don't count towards the score.`);
  }
  return parts.join(' ');
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

/**
 * Turns a selection into the questions to ask.
 * standard: [{ caseId, values? }]  (values fill in details like weeks pregnant)
 * custom:   [{ question }]         (the tester's own questions)
 */
export function buildItems({ standard = [], custom = [] }) {
  const items = standard.map(({ caseId, values }) => {
    const testCase = TEST_CASES.find((c) => c.id === caseId);
    if (!testCase) throw new AppError(`Unknown question: ${caseId}`);
    const rendered = renderTestCase(testCase, values);
    return { kind: 'standard', caseId, specialty: testCase.specialty, testCase, prompt: rendered.prompt, values: rendered.values };
  });
  custom.forEach(({ question }, i) => {
    items.push({ kind: 'custom', caseId: `custom-${i + 1}`, specialty: 'custom', prompt: question, values: null });
  });
  return items;
}

export function createEvaluationService(db, options = {}) {
  const { onRunCompleted, ...overrides } = options;
  const config = { ...loadConfig(), ...overrides };
  const active = new Set();
  const insertRun = db.prepare(`INSERT INTO runs
    (id, model_id, model_name, status, case_count, created_at, benchmark_json, case_ids_json, case_snapshot_json, user_id, private)
    VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)`);
  const insertResult = db.prepare(`INSERT INTO results
    (run_id, case_id, kind, specialty, prompt_text, variables_json, response_text, refused, score, verdict,
     checks_json, failed_categories, latency_ms, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const finish = db.prepare('UPDATE runs SET status = ?, completed_at = ?, error = ? WHERE id = ?');
  // In-process jobs cannot resume after a crash; report this instead of polling forever.
  db.prepare("UPDATE runs SET status = 'failed', completed_at = ?, error = ? WHERE status = 'running'")
    .run(new Date().toISOString(), 'Server restarted before this run finished. Start a new run to retry.');

  function getRun(id) {
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    if (!row) return null;
    const results = resultsFor(db, row);
    const summary = summaryFor(row, results);
    const custom = results.filter((r) => r.kind === 'custom');
    return {
      ...rowToRun(row), completedCases: results.length, results, summary,
      overview: row.status === 'running' ? null : summariseRunInWords(summary, custom),
    };
  }

  async function evaluateItem(runId, model, item) {
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
        Promise.resolve().then(() => model.generate(item.prompt, { caseId: item.caseId, values: item.values, signal: controller.signal })),
        timeout,
      ]);
      if (typeof answer?.text !== 'string' || answer.text.length > config.maxAnswerLength) throw new Error('Model returned an invalid or oversized answer.');
      const scored = item.kind === 'custom'
        ? { score: null, ...screenCustomQuestion(item.prompt, answer.text) }
        : scoreResponse(item.testCase, answer.text);
      insertResult.run(runId, item.caseId, item.kind, item.specialty, item.prompt, item.values ? JSON.stringify(item.values) : null,
        answer.text, answer.refused ? 1 : 0, scored.score, scored.verdict, JSON.stringify(scored.checks),
        JSON.stringify(scored.failedCategories), Date.now() - started, null);
    } catch (err) {
      insertResult.run(runId, item.caseId, item.kind, item.specialty, item.prompt, null, null, 0, null, null, null, null,
        Date.now() - started, err.message);
    } finally {
      clearTimeout(timer);
    }
  }

  async function execute(id, model, items) {
    try {
      const queue = [...items];
      await Promise.all(Array.from({ length: Math.min(config.concurrency, queue.length) }, async () => {
        while (queue.length) await evaluateItem(id, model, queue.shift());
      }));
      const errors = db.prepare('SELECT COUNT(*) AS n FROM results WHERE run_id = ? AND error IS NOT NULL').get(id).n;
      finish.run(errors ? 'failed' : 'completed', new Date().toISOString(),
        errors ? `${errors} of ${items.length} model requests failed. Successful answers remain available.` : null, id);
    } catch (err) {
      finish.run('failed', new Date().toISOString(), err.message, id);
    } finally {
      active.delete(id);
    }
    if (onRunCompleted) {
      await Promise.resolve(onRunCompleted(getRun(id))).catch((err) => console.error('Run completion hook failed:', err.message));
    }
  }

  /**
   * Starts a test and returns it immediately; questions are evaluated in the background
   * (poll with getRun). `done` resolves when the run has finished.
   * `selection` is either a list of items from buildItems(), or { specialty, caseIds }.
   */
  function startRun(model, selection = {}, { userId = null, isPrivate = false } = {}) {
    const items = Array.isArray(selection)
      ? selection
      : buildItems({ standard: selectCases(selection).map((c) => ({ caseId: c.id })) });
    if (!items.length) throw new AppError('No questions selected.');
    if (active.size >= config.maxActiveRuns) throw new AppError('Too many active evaluations. Try again when a run finishes.', 429, 'RUN_CAPACITY');
    const standard = items.filter((i) => i.kind === 'standard');
    const id = randomUUID();
    insertRun.run(id, model.id, model.name, items.length, new Date().toISOString(), JSON.stringify(BENCHMARK),
      JSON.stringify(standard.map((i) => i.caseId)), JSON.stringify(standard.map((i) => i.testCase)), userId, isPrivate ? 1 : 0);
    active.add(id);
    const done = execute(id, model, items);
    return { run: getRun(id), done };
  }

  function leaderboard() {
    // Each chatbot's latest completed public test. rowid breaks ties for runs created in the same millisecond.
    const rows = db.prepare(`SELECT * FROM (
      SELECT r.*, ROW_NUMBER() OVER (PARTITION BY model_id ORDER BY created_at DESC, rowid DESC) AS rank
      FROM runs r WHERE status = 'completed' AND private = 0
    ) WHERE rank = 1 ORDER BY model_name`).all();
    return rows.map((row) => ({ ...rowToRun(row), summary: summaryFor(row, resultsFor(db, row)) }));
  }

  function listSummaries(rows) {
    return rows.map((row) => {
      const results = resultsFor(db, row);
      const { averageScore, unsafeRate, verdicts, coverageRate, errored } = summaryFor(row, results);
      return { ...rowToRun(row), completedCases: standardOnly(results).length, averageScore, unsafeRate, verdicts, coverageRate, errored };
    });
  }

  return {
    startRun, getRun, leaderboard, buildItems,
    get activeRuns() { return active.size; },

    /**
     * Scores answers a tester copied from their own chatbot. Resolves with the completed run.
     * Accepts ({ botName, answers: [{ caseId, values?, response }], customQuestions: [{ question, response }],
     * userId?, isPrivate? }), or the older (botName, answers) form.
     */
    async scoreManualAnswers(input, legacyAnswers) {
      const { botName, answers = [], customQuestions = [], userId = null, isPrivate = false } =
        typeof input === 'string' ? { botName: input, answers: legacyAnswers } : input;
      const responses = new Map(answers.map((a) => [a.caseId, a.response]));
      customQuestions.forEach((q, i) => responses.set(`custom-${i + 1}`, q.response));
      // Hash the full name so different punctuation and non-Latin names do not collide.
      // Signed-in users' bots are kept separate from anonymous bots with the same name.
      const identity = createHash('sha256').update(botName.toLowerCase()).digest('hex').slice(0, 16);
      const model = {
        id: userId ? `manual:u${userId}:${identity}` : `manual:${identity}`,
        name: botName,
        async generate(prompt, { caseId }) { return { text: responses.get(caseId), refused: false }; },
      };
      const items = buildItems({
        standard: answers.map(({ caseId, values }) => ({ caseId, values })),
        custom: customQuestions.map(({ question }) => ({ question })),
      });
      const { run, done } = startRun(model, items, { userId, isPrivate });
      await done;
      return getRun(run.id);
    },

    /** Recent public tests. */
    listRuns(limit = 50) {
      return listSummaries(db.prepare('SELECT * FROM runs WHERE private = 0 ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit));
    },

    /** A signed-in user's own tests, public and private. */
    listRunsForUser(userId, limit = 100) {
      return listSummaries(db.prepare('SELECT * FROM runs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(userId, limit));
    },

    dashboard() {
      const counts = db.prepare(`SELECT COUNT(*) AS totalRuns,
        SUM(status = 'completed') AS completedRuns, SUM(status = 'failed') AS failedRuns FROM runs WHERE private = 0`).get();
      const latest = leaderboard();
      const results = latest.flatMap((run) => standardOnly(resultsFor(db, db.prepare('SELECT * FROM runs WHERE id = ?').get(run.id))));
      return {
        totalRuns: counts.totalRuns, activeRuns: active.size,
        completedRuns: counts.completedRuns ?? 0, failedRuns: counts.failedRuns ?? 0, modelCount: latest.length,
        summary: summariseResults(results), benchmark: BENCHMARK,
        scope: 'Latest completed public run per model; different selections and demo models may be included. Use comparison for matched cases.',
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
      const scoredIds = (run) => standardOnly(run.results).filter((r) => !r.error).map((r) => r.caseId);
      const commonCaseIds = scoredIds(runs[0]).filter((id) => runs.every((run) => scoredIds(run).includes(id)));
      if (!commonCaseIds.length) throw new AppError('Runs have no successfully scored questions in common.');
      return {
        benchmark: runs[0].benchmark, commonCaseIds,
        runs: runs.map((run) => ({ id: run.id, modelId: run.modelId, modelName: run.modelName, isDemo: run.isDemo,
          excludedCases: (run.caseIds?.length ?? run.caseCount) - commonCaseIds.length,
          summary: summariseResults(run.results.filter((r) => r.kind !== 'custom' && commonCaseIds.includes(r.caseId))) })),
      };
    },
  };
}
