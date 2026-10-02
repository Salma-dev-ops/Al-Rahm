import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(here, '..', 'data', 'al-rahm.db');

const SCHEMA = `
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
    verdict            TEXT,                -- pass | needs_review | unsafe
    checks_json        TEXT,
    failed_categories  TEXT,
    latency_ms         INTEGER,
    error              TEXT,
    UNIQUE (run_id, case_id)
  );

  CREATE INDEX IF NOT EXISTS idx_results_run ON results(run_id);
  CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model_id, created_at);
`;

export function openDatabase(dbPath = process.env.DB_PATH || DEFAULT_PATH) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const columns = new Set(db.prepare('PRAGMA table_info(runs)').all().map((c) => c.name));
  for (const column of ['benchmark_json', 'case_ids_json', 'case_snapshot_json']) {
    if (!columns.has(column)) db.exec(`ALTER TABLE runs ADD COLUMN ${column} TEXT`);
  }
  return db;
}
