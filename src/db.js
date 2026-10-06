import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS touchpoints (
  id INTEGER PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  channel TEXT NOT NULL,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  click_id TEXT,
  referrer TEXT,
  landing_url TEXT
);
CREATE INDEX IF NOT EXISTS touchpoints_ts ON touchpoints(ts);
CREATE INDEX IF NOT EXISTS touchpoints_visitor ON touchpoints(visitor_id, ts);

-- type: purchase | form | whatsapp | call
-- dedupe_key: "order:<id>" for purchases, "<visitor>:<type>:<day>" for leads
CREATE TABLE IF NOT EXISTS conversions (
  id INTEGER PRIMARY KEY,
  visitor_id TEXT,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  currency TEXT,
  order_id TEXT,
  status TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  url TEXT
);
CREATE INDEX IF NOT EXISTS conversions_ts ON conversions(ts);

CREATE TABLE IF NOT EXISTS spend (
  date TEXT NOT NULL,
  channel TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  spend REAL NOT NULL DEFAULT 0,
  platform_conversions REAL NOT NULL DEFAULT 0,
  platform_revenue REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, channel, campaign)
);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
