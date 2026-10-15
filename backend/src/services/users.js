import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SESSION_DAYS } from '../config.js';
import { formatPhone, normaliseKenyanPhone } from '../lib/phone.js';

const scrypt = promisify(scryptCb);
const KEY_LENGTH = 64;

export class ValidationError extends Error {}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function isPremium(user, now = new Date()) {
  return Boolean(user?.premium_until && new Date(user.premium_until) > now);
}

/** The user as sent to the browser: never includes the password hash. */
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    phoneDisplay: formatPhone(user.phone),
    smsAlerts: Boolean(user.sms_alerts),
    premiumUntil: user.premium_until,
    isPremium: isPremium(user),
  };
}

function cleanName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value || value.length > 80) throw new ValidationError('Enter your name (up to 80 characters).');
  return value;
}

function cleanPhone(phone) {
  if (phone == null || phone === '') return null;
  const normalised = normaliseKenyanPhone(phone);
  if (!normalised) throw new ValidationError('Enter a Kenyan mobile number, e.g. 0712 345 678.');
  return normalised;
}

export function createUserService(db) {
  const insertUser = db.prepare(
    'INSERT INTO users (email, name, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const byId = db.prepare('SELECT * FROM users WHERE id = ?');
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const sessionUser = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  );
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const updateProfile = db.prepare('UPDATE users SET name = ?, phone = ?, sms_alerts = ? WHERE id = ?');
  const setPremiumUntil = db.prepare('UPDATE users SET premium_until = ? WHERE id = ?');

  function createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
    insertSession.run(hashToken(token), userId, now.toISOString(), expires.toISOString());
    return token;
  }

  return {
    async signup({ email, name, password, phone }) {
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 200) {
        throw new ValidationError('Enter a valid email address.');
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
        throw new ValidationError('Use a password of at least 8 characters.');
      }
      const user = { name: cleanName(name), phone: cleanPhone(phone) };
      if (byEmail.get(cleanEmail)) throw new ValidationError('An account with that email already exists. Log in instead.');

      const { lastInsertRowid } = insertUser.run(
        cleanEmail,
        user.name,
        user.phone,
        await hashPassword(password),
        new Date().toISOString(),
      );
      return { user: byId.get(lastInsertRowid), token: createSession(lastInsertRowid) };
    },

    async login({ email, password }) {
      const user = typeof email === 'string' ? byEmail.get(email.trim().toLowerCase()) : null;
      // Same message whether the email or the password is wrong, so accounts can't be probed.
      const valid = user && typeof password === 'string' && (await verifyPassword(password, user.password_hash));
      if (!valid) throw new ValidationError('Wrong email or password.');
      return { user, token: createSession(user.id) };
    },

    userForToken(token) {
      if (!token) return null;
      return sessionUser.get(hashToken(token), new Date().toISOString()) ?? null;
    },

    logout(token) {
      if (token) deleteSession.run(hashToken(token));
    },

    getById(id) {
      return byId.get(id) ?? null;
    },

    updateProfile(user, { name, phone, smsAlerts }) {
      const nextPhone = phone === undefined ? user.phone : cleanPhone(phone);
      const nextAlerts = smsAlerts === undefined ? Boolean(user.sms_alerts) : Boolean(smsAlerts);
      if (nextAlerts && !nextPhone) throw new ValidationError('Add a phone number to get SMS alerts.');
      updateProfile.run(name === undefined ? user.name : cleanName(name), nextPhone, nextAlerts ? 1 : 0, user.id);
      return byId.get(user.id);
    },

    /** Adds `days` of Premium, starting from now or from the end of the current pass. */
    extendPremium(userId, days) {
      const user = byId.get(userId);
      const now = new Date();
      const from = isPremium(user, now) ? new Date(user.premium_until) : now;
      const until = new Date(from.getTime() + days * 86400000).toISOString();
      setPremiumUntil.run(until, userId);
      return byId.get(userId);
    },
  };
}
