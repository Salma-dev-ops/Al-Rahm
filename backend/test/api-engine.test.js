import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { TEST_CASES } from '../src/data/testCases.js';
import { exportCsv } from '../src/services/export.js';

describe('engine API integration', () => {
  let db, server, base, evaluations;
  before(async () => {
    db = openDatabase(':memory:');
    const created = createApp(db);
    evaluations = created.evaluations;
    server = created.app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const post = (endpoint, body) => fetch(`${base}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it('scores one response with provenance without saving a run', async () => {
    const before = evaluations.listRuns().length;
    const res = await post('/evaluate', { caseId: TEST_CASES[0].id, response: TEST_CASES[0].referenceAnswer });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.score, 100);
    assert.match(result.benchmark.hash, /^[a-f0-9]{64}$/);
    assert.equal(evaluations.listRuns().length, before);
  });
  it('returns JSON errors for bad bodies, wrong types and unknown routes', async () => {
    for (const body of [null, [], { modelId: 'demo:reference', caseIds: [] },
      { modelId: 'demo:reference', caseIds: ['bad'] }, { modelId: 'demo:reference', specialty: 123 }]) {
      const res = await post('/runs', body);
      assert.equal(res.status, 400);
      assert.equal(typeof (await res.json()).error, 'string');
    }
    const malformed = await fetch(`${base}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).code, 'INVALID_JSON');
    const text = await fetch(`${base}/runs`, { method: 'POST', body: 'hello' });
    assert.equal(text.status, 415);
    const missing = await fetch(`${base}/does-not-exist`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, 'NOT_FOUND');
    assert.equal((await fetch(`${base}/runs?limit=-1`)).status, 400);
    assert.equal((await fetch(`${base}/test-cases?specialty=nope`)).status, 400);
  });
  it('rejects invalid manual answer types and oversized responses', async () => {
    for (const answer of [null, { caseId: TEST_CASES[0].id, response: 123 },
      { caseId: TEST_CASES[0].id, response: 'x'.repeat(20001) }]) {
      assert.equal((await post('/runs/manual', { botName: 'Bot', answers: [answer] })).status, 400);
    }
  });
  it('exports a saved report and provides dashboard and comparison metrics', async () => {
    const a = await (await post('/runs/manual', { botName: 'Reference', answers: [{ caseId: TEST_CASES[0].id, response: TEST_CASES[0].referenceAnswer }] })).json();
    const b = await (await post('/runs/manual', { botName: 'Dismissive', answers: [{ caseId: TEST_CASES[0].id, response: 'Just rest.' }] })).json();
    const json = await fetch(`${base}/runs/${a.id}/export`);
    assert.match(json.headers.get('content-disposition'), /attachment/);
    assert.equal((await json.json()).results[0].testCase.prompt, TEST_CASES[0].prompt);
    const csv = await fetch(`${base}/runs/${a.id}/export?format=csv`);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(await csv.text(), /benchmark_hash/);
    const compared = await post('/runs/compare', { runIds: [a.id, b.id] });
    assert.equal(compared.status, 200);
    const report = await compared.json();
    assert.deepEqual(report.commonCaseIds, [TEST_CASES[0].id]);
    assert.equal(report.runs[1].summary.missedUrgencyChecks, 1);
    const dashboard = await (await fetch(`${base}/dashboard`)).json();
    assert.equal(dashboard.modelCount, 2);
    assert.equal(dashboard.summary.scored, 2);
    assert.equal(dashboard.summary.urgencyDetectionRate, 50);
  });
  it('sets CORS only for the configured frontend and disables caching', async () => {
    const allowed = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    const other = await fetch(`${base}/health`, { headers: { Origin: 'https://other.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  });
});

it('protects API data when an optional bearer token is configured', async () => {
  const db = openDatabase(':memory:');
  const { app } = createApp(db, { apiToken: 'test-only-token' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const unauth = await fetch(`${base}/runs`);
    assert.equal(unauth.status, 401);
    assert.equal((await unauth.json()).code, 'UNAUTHORIZED');
    assert.equal((await fetch(`${base}/runs`, { headers: { Authorization: 'Bearer test-only-token' } })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

it('escapes CSV quotes, newlines and spreadsheet formula injection', () => {
  const csv = exportCsv({ id: 'run', modelName: '=HYPERLINK("example")', results: [{
    caseId: 'case', response: '@SUM(1,2)\n"quoted"', checks: [],
  }] });
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"example\"\")\""));
  assert.ok(csv.includes("\"'@SUM(1,2)\n\"\"quoted\"\"\""));
});
