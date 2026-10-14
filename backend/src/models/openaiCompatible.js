// Any model served through an OpenAI-compatible /chat/completions endpoint
// (OpenAI, Groq, OpenRouter, Together, a local Ollama server, ...).
//
// Configure with:
//   OPENAI_COMPATIBLE_BASE_URL  e.g. https://api.openai.com/v1 or http://localhost:11434/v1
//   OPENAI_COMPATIBLE_API_KEY   (optional for local servers)
//   OPENAI_COMPATIBLE_MODELS    comma-separated model names
//   OPENAI_COMPATIBLE_LABEL     optional display name for the provider

export function openaiCompatibleModels() {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL?.replace(/\/$/, '');
  const ids = process.env.OPENAI_COMPATIBLE_MODELS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  if (!baseUrl || ids.length === 0) return [];

  const label = process.env.OPENAI_COMPATIBLE_LABEL || 'OpenAI-compatible';
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;

  return ids.map((model) => ({
    id: `openai-compatible:${model}`,
    name: model,
    provider: 'openai-compatible',
    description: `${label} endpoint at ${baseUrl}.`,
    async generate(prompt) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) {
        throw new Error(`${label} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = await res.json();
      const choice = data.choices?.[0];
      return {
        text: choice?.message?.content ?? '',
        refused: Boolean(choice?.message?.refusal) || choice?.finish_reason === 'content_filter',
      };
    },
  }));
}
