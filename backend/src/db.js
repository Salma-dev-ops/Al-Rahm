import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(here, '..', 'data', 'al-rahm.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    email              TEXT NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    phone              TEXT,                -- 2547XXXXXXXX
    password_hash      TEXT NOT NULL,
    sms_alerts         INTEGER NOT NULL DEFAULT 0,
    premium_until      TEXT,                -- ISO date; Premium while in the future
    expiry_reminded_for TEXT,               -- the premium_until value we last sent a reminder for
    created_at         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,           -- SHA-256 of the bearer token; the token itself is never stored
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id            TEXT PRIMARY KEY,
    model_id      TEXT NOT NULL,
    model_name    TEXT NOT NULL,
    status        TEXT NOT NULL,            -- running | completed | failed
    case_count    INTEGER NOT NULL,
    created_at    TEXT NOT NULL,
    completed_at  TEXT,
    error         TEXT
  );

  CREATE TABLE IF NOT EXISTS results (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id             TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    case_id            TEXT NOT NULL,
    specialty          TEXT NOT NULL,
    response_text      TEXT,
    refused            INTEGER NOT NULL DEFAULT 0,
    score              REAL,
    verdict            TEXT,                -- pass | needs_review | unsafe (custom: flagged | no_flags)
    checks_json        TEXT,
    failed_categories  TEXT,
    latency_ms         INTEGER,
    error              TEXT,
    UNIQUE (run_id, case_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id                   TEXT PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    phone                TEXT NOT NULL,
    amount               INTEGER NOT NULL,
    status               TEXT NOT NULL,     -- pending | paid | failed | cancelled
    mode                 TEXT NOT NULL,     -- daraja | mock
    checkout_request_id  TEXT UNIQUE,
    merchant_request_id  TEXT,
    receipt              TEXT,
    result_desc          TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sms_messages (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER REFERENCES users(id),
    phone              TEXT NOT NULL,
    message            TEXT NOT NULL,
    status             TEXT NOT NULL,       -- sent | failed | mock
    mode               TEXT NOT NULL,       -- africastalking | mock
    provider_response  TEXT,
    created_at         TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_results_run ON results(run_id);
  CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);
`;

// Columns added after the first release. Existing databases get them on startup.
const ADDED_COLUMNS = [
  // Benchmark snapshot recorded with each run, so old reports stay reproducible.
  ['runs', 'benchmark_json', 'TEXT'],
  ['runs', 'case_ids_json', 'TEXT'],
  ['runs', 'case_snapshot_json', 'TEXT'],
  ['runs', 'user_id', 'INTEGER REFERENCES users(id)'],
  ['runs', 'private', 'INTEGER NOT NULL DEFAULT 0'],
  ['results', 'kind', "TEXT NOT NULL DEFAULT 'standard'"], // standard | custom
  ['results', 'prompt_text', 'TEXT'], // the exact question asked, with details filled in
  ['results', 'variables_json', 'TEXT'],
];

function migrate(db) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, created_at)');
}

export function openDatabase(dbPath = process.env.DB_PATH || DEFAULT_PATH) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
