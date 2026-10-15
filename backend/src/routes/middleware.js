import { AppError } from '../errors.js';

// Login sessions use their own header, so they never clash with the optional
// API_AUTH_TOKEN integration token, which uses Authorization: Bearer.
export const SESSION_HEADER = 'x-session-token';

export function sessionToken(req) {
  return req.get(SESSION_HEADER) || null;
}

/** Attaches req.user when a valid session token is sent; anonymous requests continue. */
export function authenticate(users) {
  return (req, res, next) => {
    req.user = users.userForToken(sessionToken(req));
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

/**
 * Small in-memory rate limiter (per process). Enough for a single server; use a shared store
 * such as Redis if the API is ever run on several servers.
 */
export function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const id = key(req);
    const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    recent.push(now);
    hits.set(id, recent);
    if (hits.size > 10000) hits.clear();
    next();
  };
}

/** Turns AppErrors into their status code; anything else becomes a 500 without leaking details. */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'JSON body exceeds 1 MB.', code: 'BODY_TOO_LARGE' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.', code: 'INVALID_JSON' });
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error('API error:', err.message);
  res.status(500).json({ error: 'An internal error occurred.', code: 'INTERNAL_ERROR' });
}
