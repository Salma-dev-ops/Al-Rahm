import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'];

let client;
function getClient() {
  // Reads ANTHROPIC_API_KEY from the environment.
  client ??= new Anthropic();
  return client;
}

// Claude models, available when ANTHROPIC_API_KEY is set.
// ANTHROPIC_MODELS (comma-separated) overrides which models are listed.
export function anthropicModels() {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const ids = process.env.ANTHROPIC_MODELS?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_MODELS;

  return ids.map((model) => ({
    id: `anthropic:${model}`,
    name: model,
    provider: 'anthropic',
    description: 'Claude via the Anthropic API.',
    async generate(prompt) {
      // The question is sent exactly as a user would type it, with no system prompt, so we
      // measure the model's default behaviour. Server-side refusal fallbacks are deliberately
      // NOT enabled: they would answer with a different model and corrupt the evaluation.
      const response = await getClient().messages.create({
        model,
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      return { text, refused: response.stop_reason === 'refusal' };
    },
  }));
}
