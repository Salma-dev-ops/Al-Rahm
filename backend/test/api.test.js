import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { TEST_CASES } from '../src/data/testCases.js';
import { getModel } from '../src/models/index.js';

describe('API', () => {
  let server;
  let baseUrl;
  let evaluations;

  before(async () => {
    const created = createApp(openDatabase(':memory:'));
    evaluations = created.evaluations;
    server = created.app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://localhost:${server.address().port}/api`;
  });

  after(() => server.close());

  it('lists the demo models', async () => {
    const models = await (await fetch(`${baseUrl}/models`)).json();
    assert.ok(models.some((m) => m.id === 'demo:reference'));
  });

  it('filters test cases by specialty', async () => {
    const cases = await (await fetch(`${baseUrl}/test-cases?specialty=oncology`)).json();
    assert.ok(cases.length > 0);
    assert.ok(cases.every((c) => c.specialty === 'oncology'));
  });

  it('rejects an unknown model', async () => {
    const res = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'nope' }),
    });
    assert.equal(res.status, 400);
  });

  it('starts a run and returns it immediately', async () => {
    const res = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'demo:reference', specialty: 'obgyn' }),
    });
    assert.equal(res.status, 202);
    const run = await res.json();
    assert.equal(run.status, 'running');
    assert.equal(run.caseCount, TEST_CASES.filter((c) => c.specialty === 'obgyn').length);
  });

  it('scores the reference model at 100 and the OB-GYN blind spot model low on OB-GYN', async () => {
    const reference = evaluations.startRun(getModel('demo:reference'));
    const blindSpot = evaluations.startRun(getModel('demo:obgyn-blind-spot'));
    await Promise.all([reference.done, blindSpot.done]);

    const referenceRun = await (await fetch(`${baseUrl}/runs/${reference.run.id}`)).json();
    assert.equal(referenceRun.status, 'completed');
    assert.equal(referenceRun.summary.averageScore, 100);
    assert.equal(referenceRun.summary.verdicts.unsafe, 0);

    const blindSpotRun = evaluations.getRun(blindSpot.run.id);
    const obgyn = blindSpotRun.summary.bySpecialty.find((s) => s.specialty === 'obgyn');
    const oncology = blindSpotRun.summary.bySpecialty.find((s) => s.specialty === 'oncology');
    assert.ok(obgyn.averageScore < 50, `OB-GYN scored ${obgyn.averageScore}`);
    assert.equal(oncology.averageScore, 100);

    const leaderboard = await (await fetch(`${baseUrl}/leaderboard`)).json();
    assert.ok(leaderboard.some((entry) => entry.modelId === 'demo:obgyn-blind-spot'));
  });

  describe('pasting answers from your own chatbot', () => {
    const post = (body) =>
      fetch(`${baseUrl}/runs/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('scores pasted answers with reasons', async () => {
      const res = await post({
        botName: 'My Clinic Bot',
        answers: [
          { caseId: 'obgyn-preeclampsia', response: 'This is normal in pregnancy, just rest.' },
          { caseId: 'oncology-cervical-screening', response: TEST_CASES.find((c) => c.id === 'oncology-cervical-screening').referenceAnswer },
          { caseId: 'obgyn-ectopic', response: '   ' },
        ],
      });
      assert.equal(res.status, 201);
      const run = await res.json();
      assert.equal(run.status, 'completed');
      assert.equal(run.source, 'manual');
      assert.equal(run.modelName, 'My Clinic Bot');
      assert.equal(run.caseCount, 2, 'blank answers are skipped');

      const preeclampsia = run.results.find((r) => r.caseId === 'obgyn-preeclampsia');
      assert.equal(preeclampsia.verdict, 'unsafe');
      assert.match(preeclampsia.explanation, /^Unsafe/);
      assert.ok(preeclampsia.checks.every((c) => c.reason));
      assert.equal(run.results.find((r) => r.caseId === 'oncology-cervical-screening').score, 100);
    });

    it('requires a bot name and at least one answer', async () => {
      assert.equal((await post({ botName: '', answers: [{ caseId: 'obgyn-ectopic', response: 'x' }] })).status, 400);
      assert.equal((await post({ botName: 'Bot', answers: [] })).status, 400);
      assert.equal((await post({ botName: 'Bot', answers: [{ caseId: 'nope', response: 'x' }] })).status, 400);
    });

    it('rejects the same question answered twice', async () => {
      const res = await post({
        botName: 'Bot',
        answers: [
          { caseId: 'obgyn-ectopic', response: 'a' },
          { caseId: 'obgyn-ectopic', response: 'b' },
        ],
      });
      assert.equal(res.status, 400);
    });
  });
});
