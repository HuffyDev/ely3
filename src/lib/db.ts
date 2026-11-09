import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,              -- contract | wallet
  network TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL,            -- queued | running | done | failed
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  json TEXT,                       -- public report body (already redacted for publication)
  error TEXT,
  source TEXT NOT NULL DEFAULT 'user'   -- user | watcher | demo
);
CREATE INDEX IF NOT EXISTS reports_target ON reports(target, network);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  priority REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS jobs_pick ON jobs(status, priority DESC, id);

-- Encrypted proofs. Only the operator can decrypt (PROOF_ENCRYPTION_KEY).
CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ciphertext TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disclosures (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  network TEXT NOT NULL,
  target TEXT NOT NULL,
  severity TEXT NOT NULL,
  internal_title TEXT NOT NULL,     -- operator-only
  status TEXT NOT NULL,
  contact TEXT,
  notice_approved_by TEXT,
  notice_approved_at INTEGER,
  notified_at INTEGER,
  deadline_at INTEGER,
  fixed_at INTEGER,
  public_summary TEXT,
  publish_approved_by TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS disclosure_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disclosure_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  at INTEGER NOT NULL,
  report_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_day ON ai_usage(day);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_key ON rate_limits(key, at);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- Private privacy reports. Encrypted at rest, keyed to the proven owner. Never listed or searchable.
CREATE TABLE IF NOT EXISTS privacy_reports (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  network TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  share_token TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS watcher_state (
  network TEXT PRIMARY KEY,
  chain_id INTEGER,
  last_block INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  address TEXT NOT NULL,
  network TEXT NOT NULL,
  block INTEGER NOT NULL,
  tx_hash TEXT,
  deployer TEXT,
  value_at_risk_wei TEXT NOT NULL DEFAULT '0',
  report_id TEXT,
  discovered_at INTEGER NOT NULL,
  PRIMARY KEY (address, network)
);

-- Public spending ledger. Entries are added by the operator only, from real transactions.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  direction TEXT NOT NULL,         -- in | out
  category TEXT NOT NULL,          -- creator_fees | compute | ai | bounty | other
  amount TEXT NOT NULL,
  asset TEXT NOT NULL,
  tx_hash TEXT,
  note TEXT
);

-- Contracts we deployed ourselves on a local chain for demos. Full details may be shown for these only.
CREATE TABLE IF NOT EXISTS own_contracts (
  address TEXT NOT NULL,
  network TEXT NOT NULL,
  name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  PRIMARY KEY (address, network)
);
`;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = config.dataDir;
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "whitehat.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

/** For tests: use a fresh in-memory database. */
export function useMemoryDb(): Database.Database {
  db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

export const now = () => Date.now();
