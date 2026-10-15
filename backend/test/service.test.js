import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { openDatabase } from '../src/db.js';
import { createEvaluationService, selectCases } from '../src/services/evaluation.js';
import { getModel } from '../src/models/index.js';
import { TEST_CASES } from '../src/data/testCases.js';

it('rejects invalid selections instead of silently running the full benchmark', () => {
  for (const selection of [{ caseIds: [] }, { caseIds: 'obgyn-preeclampsia' }, { caseIds: ['typo'] },
    { caseIds: ['obgyn-preeclampsia', 'obgyn-preeclampsia'] }, { specialty: 'oncology', caseIds: ['obgyn-preeclampsia'] }]) {
    assert.throws(() => selectCases(selection));
  }
});

it('limits concurrency and active runs, preserves errors and excludes failed runs from leaderboard', async () => {
  const db = openDatabase(':memory:');
  try {
    const service = createEvaluationService(db, { concurrency: 2, maxActiveRuns: 1 });
    let inFlight = 0;
    let peak = 0;
    const model = { id: 'test:mixed', name: 'Mixed', async generate(prompt, { caseId }) {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      if (caseId === TEST_CASES[0].id) throw new Error('Provider unavailable');
      return { text: TEST_CASES.find((c) => c.id === caseId).referenceAnswer };
    } };
    const { run, done } = service.startRun(model, { caseIds: TEST_CASES.slice(0, 4).map((c) => c.id) });
    assert.throws(() => service.startRun(model), (err) => err.status === 429);
    await done;
    const saved = service.getRun(run.id);
    assert.equal(peak, 2);
    assert.equal(saved.status, 'failed');
    assert.equal(saved.summary.scored, 3);
    assert.equal(saved.summary.errored, 1);
    assert.equal(saved.summary.coverageRate, 75);
    assert.equal(saved.summary.averageScore, 100);
    assert.equal(service.activeRuns, 0);
    assert.deepEqual(service.leaderboard(), []);
  } finally { db.close(); }
});

it('times out a hung provider and propagates an abort signal', async () => {
  const db = openDatabase(':memory:');
  try {
    const service = createEvaluationService(db, { timeoutMs: 15 });
    let signal;
    const { run, done } = service.startRun({ id: 'test:timeout', name: 'Hung provider', generate(prompt, options) {
      signal = options.signal;
      return new Promise(() => {});
    } }, { caseIds: [TEST_CASES[0].id] });
    await done;
    assert.equal(signal.aborted, true);
    const saved = service.getRun(run.id);
    assert.equal(saved.status, 'failed');
    assert.match(saved.results[0].error, /timed out/);
    assert.equal(saved.summary.averageScore, null);
  } finally { db.close(); }
});

it('persists reports with rubric snapshots and recovers interrupted runs on restart', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'al-rahm-test-'));
  let db;
  try {
    const file = path.join(dir, 'evaluation.db');
    db = openDatabase(file);
    const service = createEvaluationService(db);
    const { run, done } = service.startRun(getModel('demo:reference'), { caseIds: [TEST_CASES[0].id] });
    await done;
    db.prepare("INSERT INTO runs (id, model_id, model_name, status, case_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run('interrupted', 'test:old', 'Old', 'running', 1, new Date().toISOString());
    db.close();
    db = openDatabase(file);
    const restored = createEvaluationService(db);
    const report = restored.getRun(run.id);
    assert.equal(report.status, 'completed');
    assert.equal(report.summary.averageScore, 100);
    assert.equal(report.benchmark.engineVersion, '2.0.0');
    assert.deepEqual(report.results[0].testCase, TEST_CASES[0]);
    assert.equal(restored.getRun('interrupted').status, 'failed');
    assert.match(restored.getRun('interrupted').error, /restarted/);
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('compares only common scored cases and rejects benchmark mismatches', async () => {
  const db = openDatabase(':memory:');
  try {
    const service = createEvaluationService(db);
    const a = service.startRun(getModel('demo:reference'), { caseIds: TEST_CASES.slice(0, 3).map((c) => c.id) });
    const b = service.startRun(getModel('demo:careless'), { caseIds: TEST_CASES.slice(1, 4).map((c) => c.id) });
    await Promise.all([a.done, b.done]);
    const comparison = service.compare([a.run.id, b.run.id]);
    assert.deepEqual(comparison.commonCaseIds, TEST_CASES.slice(1, 3).map((c) => c.id));
    assert.equal(comparison.runs[0].summary.averageScore, 100);
    assert.equal(comparison.runs[1].summary.unsafeRate, 100);
    assert.equal(comparison.runs[0].excludedCases, 1);
    db.prepare('UPDATE runs SET benchmark_json = NULL WHERE id = ?').run(b.run.id);
    assert.throws(() => service.compare([a.run.id, b.run.id]), /same recorded benchmark/);
  } finally { db.close(); }
});

it('keeps a single latest leaderboard entry for runs with identical timestamps', async () => {
  const db = openDatabase(':memory:');
  try {
    const service = createEvaluationService(db);
    const a = service.startRun(getModel('demo:reference'), { caseIds: [TEST_CASES[0].id] });
    const b = service.startRun(getModel('demo:reference'), { caseIds: [TEST_CASES[1].id] });
    await Promise.all([a.done, b.done]);
    db.prepare('UPDATE runs SET created_at = ?').run('2026-10-15T10:00:00.000Z');
    const board = service.leaderboard();
    assert.equal(board.length, 1);
    assert.equal(board[0].id, b.run.id);
  } finally { db.close(); }
});
