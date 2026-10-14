import { anthropicModels } from './anthropic.js';
import { DEMO_MODELS } from './demo.js';
import { openaiCompatibleModels } from './openaiCompatible.js';

// Every model that can be evaluated right now. Real providers appear only when their
// environment variables are set.
export function listModels() {
  return [...DEMO_MODELS, ...anthropicModels(), ...openaiCompatibleModels()];
}

export function getModel(id) {
  return listModels().find((model) => model.id === id);
}
