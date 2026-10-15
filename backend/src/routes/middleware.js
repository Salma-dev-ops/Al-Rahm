import { ValidationError } from '../services/users.js';

export function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Attaches req.user when a valid session token is sent; anonymous requests continue. */
export function authenticate(users) {
  return (req, res, next) => {
    req.user = users.userForToken(bearerToken(req));
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

/** Turns validation errors into 400s; anything else becomes a 500 without leaking details. */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
