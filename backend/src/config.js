function integer(name, fallback, min, max) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function loadConfig() {
  return {
    port: integer('PORT', 4000, 1, 65535),
    concurrency: integer('EVALUATION_CONCURRENCY', 3, 1, 10),
    maxActiveRuns: integer('MAX_ACTIVE_RUNS', 3, 1, 20),
    timeoutMs: integer('MODEL_TIMEOUT_MS', 30000, 100, 300000),
    maxAnswerLength: 20000,
    origins: (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
    apiToken: process.env.API_AUTH_TOKEN || '',
  };
}
