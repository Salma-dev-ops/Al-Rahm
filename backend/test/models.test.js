import assert from 'node:assert/strict';
import { it } from 'node:test';
import { openaiCompatibleModels } from '../src/models/openaiCompatible.js';

it('handles provider success, refusal, errors and malformed completions without calling a paid API', async () => {
  const keys = ['OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_MODELS', 'OPENAI_COMPATIBLE_API_KEY'];
  const previous = keys.map((key) => process.env[key]);
  const originalFetch = globalThis.fetch;
  try {
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://provider.invalid/v1/';
    process.env.OPENAI_COMPATIBLE_MODELS = 'test-model';
    process.env.OPENAI_COMPATIBLE_API_KEY = 'test-key';
    const [model] = openaiCompatibleModels();
    const signal = new AbortController().signal;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://provider.invalid/v1/chat/completions');
      assert.equal(options.signal, signal);
      assert.deepEqual(JSON.parse(options.body).messages, [{ role: 'user', content: 'Question' }]);
      return Response.json({ choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }] });
    };
    assert.deepEqual(await model.generate('Question', { signal }), { text: 'Answer', refused: false });
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: null, refusal: 'Cannot answer' } }] });
    assert.equal((await model.generate('Question')).refused, true);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }] });
    await assert.rejects(model.generate('Question'), /truncated/);
    globalThis.fetch = async () => Response.json({ unexpected: true });
    await assert.rejects(model.generate('Question'), /invalid chat completion/);
    globalThis.fetch = async () => new Response('secret-provider-details', { status: 429 });
    await assert.rejects(model.generate('Question'), (err) => err.message.includes('429') && !err.message.includes('secret-provider-details'));
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]);
  }
});
