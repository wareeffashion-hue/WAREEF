import { addDays, config, dayOf } from '../config.js';
import { HttpError } from '../http.js';
import { upsertSpendRows } from '../ingest.js';
import { decrypt, encrypt } from '../secrets.js';
import { getWorkspace } from '../workspaces.js';
import { google } from './google.js';
import { meta } from './meta.js';
import { snapchat } from './snapchat.js';
import { tiktok } from './tiktok.js';

export const PLATFORMS = { meta, snapchat, tiktok, google };
const BACKFILL_DAYS = 90;
const RESYNC_DAYS = 3; // platforms keep revising recent days (late conversions)

export function platformInfo() {
  return Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, {
    label: p.label, accountLabel: p.accountLabel, fields: p.fields, urlTemplate: p.urlTemplate,
  }]));
}

export function listConnections(db, wsId) {
  return db.prepare(`SELECT id, platform, account_id, status, last_error, last_sync_at, created_at FROM connections
      WHERE workspace_id = ? ORDER BY platform, account_id`).all(wsId).map((r) => ({ ...r }));
}

export function saveConnection(db, wsId, { platform, account_id: accountId, credentials = {} }) {
  const p = PLATFORMS[platform];
  if (!p) throw new HttpError(400, 'منصة غير مدعومة');
  accountId = String(accountId || '').trim();
  if (!accountId) throw new HttpError(400, `${p.accountLabel} مطلوب`);
  const clean = Object.fromEntries(p.fields.map((f) => [f.key, String(credentials[f.key] || '').trim()]).filter(([, v]) => v));
  db.prepare(`INSERT INTO connections (workspace_id, platform, account_id, credentials, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)
              ON CONFLICT(workspace_id, platform, account_id) DO UPDATE SET credentials = excluded.credentials, status = 'pending', last_error = NULL`)
    .run(wsId, platform, accountId, encrypt(clean), Date.now());
  return db.prepare('SELECT id FROM connections WHERE workspace_id = ? AND platform = ? AND account_id = ?').get(wsId, platform, accountId).id;
}

export function deleteConnection(db, wsId, id) {
  const res = db.prepare('DELETE FROM connections WHERE id = ? AND workspace_id = ?').run(id, wsId);
  if (!res.changes) throw new HttpError(404, 'الربط غير موجود');
}

export async function syncConnection(db, id, { fetchImpl = fetch, from, to } = {}) {
  const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(id);
  if (!conn) throw new HttpError(404, 'الربط غير موجود');
  const platform = PLATFORMS[conn.platform];
  const ws = getWorkspace(db, conn.workspace_id);
  const today = dayOf(Date.now());
  to ||= today;
  from ||= addDays(to, -((conn.last_sync_at ? RESYNC_DAYS : BACKFILL_DAYS) - 1));
  try {
    const result = await platform.fetchRange({ credentials: decrypt(conn.credentials), accountId: conn.account_id, from, to, fetch: fetchImpl });
    const rows = result.rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).map((r) => ({ ...r, channel: platform.channel }));
    upsertSpendRows(db, ws, rows, conn.platform, { channel: platform.channel, from, to });
    db.prepare(`UPDATE connections SET status = 'ok', last_error = NULL, last_sync_at = ?, credentials = ? WHERE id = ?`)
      .run(Date.now(), result.credentials ? encrypt(result.credentials) : conn.credentials, id);
    return { ok: true, rows: rows.length, from, to };
  } catch (err) {
    db.prepare(`UPDATE connections SET status = 'error', last_error = ? WHERE id = ?`).run(String(err.message).slice(0, 500), id);
    return { ok: false, error: err.message };
  }
}

export function startScheduler(db) {
  if (!config.syncIntervalMinutes) return null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const { id } of db.prepare('SELECT id FROM connections').all()) {
        const r = await syncConnection(db, id);
        if (!r.ok) console.warn(`sync ${id} failed: ${r.error}`);
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, config.syncIntervalMinutes * 60_000);
  timer.unref();
  setTimeout(tick, 10_000).unref();
  return timer;
}
