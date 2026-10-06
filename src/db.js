import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Each entry upgrades the schema by one version (PRAGMA user_version).
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE workspaces (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    site_key TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL UNIQUE,
    webhook_secret TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'SAR',
    default_model TEXT NOT NULL DEFAULT 'last_non_direct',
    default_window INTEGER NOT NULL DEFAULT 30,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE user_workspaces (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, workspace_id)
  );

  CREATE TABLE touchpoints (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    channel TEXT NOT NULL,
    source TEXT, medium TEXT, campaign TEXT, content TEXT,
    click_id TEXT, referrer TEXT, landing_url TEXT, device TEXT
  );
  CREATE INDEX touchpoints_ws_ts ON touchpoints(workspace_id, ts);
  CREATE INDEX touchpoints_ws_visitor ON touchpoints(workspace_id, visitor_id, ts);

  -- Funnel steps: view_item | add_to_cart | begin_checkout
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX events_ws_ts ON events(workspace_id, ts);

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT, city TEXT,
    UNIQUE (workspace_id, external_id)
  );
  -- Identity graph: every browser (visitor) a customer was seen on.
  CREATE TABLE visitor_customers (
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    PRIMARY KEY (workspace_id, visitor_id, customer_id)
  );
  CREATE INDEX visitor_customers_customer ON visitor_customers(customer_id);

  -- type: purchase | form | whatsapp | call
  -- dedupe_key: "order:<id>" for purchases, "<visitor>:<type>:<day>" for leads
  CREATE TABLE conversions (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    visitor_id TEXT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 0,
    currency TEXT,
    order_id TEXT,
    status TEXT,
    confirmed INTEGER NOT NULL DEFAULT 0,
    dedupe_key TEXT NOT NULL,
    url TEXT,
    UNIQUE (workspace_id, dedupe_key)
  );
  CREATE INDEX conversions_ws_ts ON conversions(workspace_id, ts);
  CREATE INDEX conversions_customer ON conversions(customer_id);

  -- Daily ad-level spend + what the platform itself reports.
  CREATE TABLE spend (
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    channel TEXT NOT NULL,
    campaign TEXT NOT NULL DEFAULT '',
    ad TEXT NOT NULL DEFAULT '',
    campaign_id TEXT NOT NULL DEFAULT '',
    ad_id TEXT NOT NULL DEFAULT '',
    spend REAL NOT NULL DEFAULT 0,
    impressions REAL NOT NULL DEFAULT 0,
    clicks REAL NOT NULL DEFAULT 0,
    platform_conversions REAL NOT NULL DEFAULT 0,
    platform_revenue REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'csv',
    PRIMARY KEY (workspace_id, date, channel, campaign, ad)
  );

  CREATE TABLE connections (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    account_id TEXT NOT NULL,
    credentials TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT,
    last_sync_at INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE (workspace_id, platform, account_id)
  );
  `,
];

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  for (let v = version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
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
