import { randomUUID } from 'node:crypto';
import { renderTestCase, TEST_CASES } from '../data/testCases.js';
import { summariseResults } from '../scoring/metrics.js';
import { explainVerdict, scoreResponse } from '../scoring/rubric.js';
import { explainScreen, screenCustomQuestion } from '../scoring/screen.js';

// How many questions are sent to a model at the same time.
const CONCURRENCY = 3;

function rowToResult(row) {
  const checks = row.checks_json ? JSON.parse(row.checks_json) : [];
  const kind = row.kind ?? 'standard';
  let explanation = null;
  if (row.verdict) explanation = kind === 'custom' ? explainScreen(row.verdict, checks) : explainVerdict(row.verdict, checks);
  return {
    caseId: row.case_id,
    kind, // 'standard' (scored with a rubric) | 'custom' (user's own question, screened only)
    specialty: row.specialty,
    prompt: row.prompt_text,
    values: row.variables_json ? JSON.parse(row.variables_json) : null,
    response: row.response_text,
    refused: Boolean(row.refused),
    score: row.score,
    verdict: row.verdict,
    explanation,
    checks,
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
    // 'manual' runs were scored from answers pasted in by a user; 'api' runs called the model.
    source: row.model_id.startsWith('manual:') ? 'manual' : 'api',
    status: row.status,
    caseCount: row.case_count,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    error: row.error,
    userId: row.user_id ?? null,
    private: Boolean(row.private),
  };
}

/** One sentence summing up a whole test, shown at the top of its report. */
export function summariseRunInWords(summary, customResults) {
  const parts = [];
  if (summary.cases > 0) {
    const { pass, needs_review: review, unsafe } = summary.verdicts;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    let verdict = 'All answers passed the safety checks.';
    if (unsafe > 0) {
      verdict = `${plural(unsafe, 'answer')} could put a woman at risk: ${unsafe === 1 ? 'it' : 'they'} failed a critical check, such as missing an emergency or giving unsafe medicine advice.`;
    } else if (review > 0) {
      verdict = `No answer failed a critical check, but ${plural(review, 'answer')} missed something important.`;
    }
    parts.push(`Average score ${summary.averageScore}% across ${plural(summary.cases, 'question')} (${pass} passed). ${verdict}`);
  }
  const flagged = customResults.filter((r) => r.verdict === 'flagged').length;
  if (customResults.length === 1) {
    parts.push(
      `Your own question was screened for red flags: ${flagged ? 'red flags found' : 'none found'}. Own questions don't count towards the score.`,
    );
  } else if (customResults.length > 1) {
    parts.push(
      `Your ${customResults.length} own questions were screened for red flags: ${flagged} flagged. Own questions don't count towards the score.`,
    );
  }
  return parts.join(' ');
}

export function createEvaluationService(db, { onRunCompleted } = {}) {
  const insertRun = db.prepare(
    `INSERT INTO runs (id, model_id, model_name, status, case_count, created_at, user_id, private)
     VALUES (?, ?, ?, 'running', ?, ?, ?, ?)`,
  );
  const insertResult = db.prepare(
    `INSERT INTO results
       (run_id, case_id, kind, specialty, prompt_text, variables_json, response_text, refused, score, verdict,
        checks_json, failed_categories, latency_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const finishRun = db.prepare('UPDATE runs SET status = ?, completed_at = ?, error = ? WHERE id = ?');
  const selectRun = db.prepare('SELECT * FROM runs WHERE id = ?');
  const selectPublicRuns = db.prepare('SELECT * FROM runs WHERE private = 0 ORDER BY created_at DESC LIMIT ?');
  const selectUserRuns = db.prepare('SELECT * FROM runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?');
  const selectResults = db.prepare('SELECT * FROM results WHERE run_id = ? ORDER BY id');
  // Leaderboard: each chatbot's most recent completed public test.
  const selectLatestPublicPerModel = db.prepare(
    `SELECT r.* FROM runs r
     WHERE r.status = 'completed' AND r.private = 0
       AND r.created_at = (SELECT MAX(created_at) FROM runs
                           WHERE model_id = r.model_id AND status = 'completed' AND private = 0)
     ORDER BY r.model_name`,
  );

  async function evaluateItem(runId, model, item) {
    const started = Date.now();
    try {
      const { text, refused } = await model.generate(item.prompt, { caseId: item.caseId, values: item.values });
      const scored =
        item.kind === 'custom' ? { score: null, ...screenCustomQuestion(item.prompt, text) } : scoreResponse(item.testCase, text);
      insertResult.run(
        runId,
        item.caseId,
        item.kind,
        item.specialty,
        item.prompt,
        item.values ? JSON.stringify(item.values) : null,
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
      insertResult.run(
        runId, item.caseId, item.kind, item.specialty, item.prompt, null, null, 0, null, null, null, null,
        Date.now() - started, err.message,
      );
    }
  }

  async function execute(runId, model, items) {
    try {
      const queue = [...items];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) await evaluateItem(runId, model, queue.shift());
      });
      await Promise.all(workers);
      finishRun.run('completed', new Date().toISOString(), null, runId);
    } catch (err) {
      finishRun.run('failed', new Date().toISOString(), err.message, runId);
    }
    if (onRunCompleted) {
      await Promise.resolve(onRunCompleted(getRun(runId))).catch((err) =>
        console.error('Run completion hook failed:', err.message),
      );
    }
  }

  function getRun(id) {
    const row = selectRun.get(id);
    if (!row) return null;
    const results = selectResults.all(id).map(rowToResult);
    const standard = results.filter((r) => r.kind === 'standard');
    const custom = results.filter((r) => r.kind === 'custom');
    const summary = summariseResults(standard);
    return {
      ...rowToRun(row),
      completedCases: results.length,
      results,
      summary,
      overview: row.status === 'completed' ? summariseRunInWords(summary, custom) : null,
    };
  }

  function listSummaries(rows) {
    return rows.map((row) => {
      const results = selectResults.all(row.id).map(rowToResult).filter((r) => r.kind === 'standard');
      const { averageScore, unsafeRate, verdicts } = summariseResults(results);
      return { ...rowToRun(row), completedCases: results.length, averageScore, unsafeRate, verdicts };
    });
  }

  return {
    /**
     * Starts a test. `items` come from buildItems(). Returns the new run immediately; the
     * questions are evaluated in the background and the run can be polled with getRun().
     * `done` resolves when the run has finished.
     */
    startRun(model, items, { userId = null, isPrivate = false } = {}) {
      if (items.length === 0) throw new Error('No questions selected.');
      const id = randomUUID();
      insertRun.run(id, model.id, model.name, items.length, new Date().toISOString(), userId, isPrivate ? 1 : 0);
      const done = execute(id, model, items);
      return { run: getRun(id), done };
    },

    /**
     * Turns a selection into the questions to ask.
     * standard: [{ caseId, values? }]  (values fill in details like weeks pregnant)
     * custom:   [{ question }]         (the tester's own questions)
     */
    buildItems({ standard = [], custom = [] }) {
      const items = standard.map(({ caseId, values }) => {
        const testCase = TEST_CASES.find((c) => c.id === caseId);
        if (!testCase) throw new Error(`Unknown question: ${caseId}`);
        const rendered = renderTestCase(testCase, values);
        return {
          kind: 'standard',
          caseId,
          specialty: testCase.specialty,
          testCase,
          prompt: rendered.prompt,
          values: rendered.values,
        };
      });
      custom.forEach(({ question }, i) => {
        items.push({ kind: 'custom', caseId: `custom-${i + 1}`, specialty: 'custom', prompt: question, values: null });
      });
      return items;
    },

    /**
     * Scores answers a tester copied from their own chatbot.
     * answers: [{ caseId, values?, response }], customQuestions: [{ question, response }]
     * Resolves with the completed run.
     */
    async scoreManualAnswers({ botName, answers = [], customQuestions = [], userId = null, isPrivate = false }) {
      const responses = new Map(answers.map((a) => [a.caseId, a.response]));
      customQuestions.forEach((q, i) => responses.set(`custom-${i + 1}`, q.response));

      const slug = botName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bot';
      const model = {
        // Signed-in users' bots are kept separate from anonymous bots with the same name.
        id: userId ? `manual:u${userId}:${slug}` : `manual:${slug}`,
        name: botName,
        async generate(prompt, { caseId }) {
          return { text: responses.get(caseId), refused: false };
        },
      };
      const items = this.buildItems({
        standard: answers.map(({ caseId, values }) => ({ caseId, values })),
        custom: customQuestions.map(({ question }) => ({ question })),
      });
      const { run, done } = this.startRun(model, items, { userId, isPrivate });
      await done;
      return getRun(run.id);
    },

    getRun,

    /** Recent public tests. */
    listRuns(limit = 50) {
      return listSummaries(selectPublicRuns.all(limit));
    },

    /** A signed-in user's own tests, public and private. */
    listRunsForUser(userId, limit = 100) {
      return listSummaries(selectUserRuns.all(userId, limit));
    },

    leaderboard() {
      return selectLatestPublicPerModel.all().map((row) => {
        const results = selectResults.all(row.id).map(rowToResult).filter((r) => r.kind === 'standard');
        return { ...rowToRun(row), summary: summariseResults(results) };
      });
    },
  };
}
