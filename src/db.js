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
  // v2: SaaS accounts. Every user and workspace belongs to an organization
  // (a subscribing agency or store); billing, limits and usage are per org.
  `
  CREATE TABLE organizations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'trial',
    status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'expired', 'suspended')),
    trial_ends_at INTEGER,
    current_period_end INTEGER,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    reminder_sent TEXT,
    created_at INTEGER NOT NULL
  );
  ALTER TABLE users ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
  ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE workspaces ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
  CREATE INDEX users_org ON users(org_id);
  CREATE INDEX workspaces_org ON workspaces(org_id);

  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    cycle TEXT NOT NULL,
    amount INTEGER NOT NULL, -- smallest currency unit (halalas)
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    url TEXT,
    created_at INTEGER NOT NULL,
    paid_at INTEGER,
    period_end INTEGER
  );
  CREATE INDEX payments_org ON payments(org_id, created_at);

  -- Tracked events per org per month (YYYY-MM), for plan quotas.
  CREATE TABLE usage_monthly (
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    events INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (org_id, month)
  );

  -- Existing single-agency installs become one organization; its first
  -- admin becomes the platform owner.
  INSERT INTO organizations (id, name, plan, status, created_at)
    SELECT 1, 'الوكالة', 'agency', 'active', CAST(strftime('%s', 'now') AS INTEGER) * 1000
    WHERE EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM workspaces);
  UPDATE organizations SET current_period_end = created_at + 3650 * 86400000 WHERE id = 1;
  UPDATE users SET org_id = 1 WHERE org_id IS NULL AND EXISTS (SELECT 1 FROM organizations WHERE id = 1);
  UPDATE workspaces SET org_id = 1 WHERE org_id IS NULL AND EXISTS (SELECT 1 FROM organizations WHERE id = 1);
  UPDATE users SET is_superadmin = 1 WHERE id = (SELECT MIN(id) FROM users WHERE role = 'admin');
  `,
  // v3: the AZWO app in the Salla App Store. One app webhook serves every
  // installed store; the merchant links their store to a workspace by entering
  // the workspace's secret link code in the app settings on Salla.
  `
  ALTER TABLE workspaces ADD COLUMN salla_link_code TEXT;
  UPDATE workspaces SET salla_link_code = 'azwo-' || lower(hex(randomblob(12))) WHERE salla_link_code IS NULL;
  CREATE UNIQUE INDEX workspaces_salla_link ON workspaces(salla_link_code);

  CREATE TABLE salla_merchants (
    merchant_id TEXT PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    tokens TEXT,               -- encrypted {access_token, refresh_token, expires, scope}
    status TEXT NOT NULL DEFAULT 'installed',
    installed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX salla_merchants_ws ON salla_merchants(workspace_id) WHERE workspace_id IS NOT NULL;
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
