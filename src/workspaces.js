import { randomBytes } from 'node:crypto';
import { MODELS } from './attribution.js';
import { HttpError } from './http.js';

const key = (prefix, bytes) => `${prefix}_${randomBytes(bytes).toString('base64url')}`;

export function createWorkspace(db, { name, currency = 'SAR' }) {
  name = String(name || '').trim().slice(0, 100);
  if (!name) throw new HttpError(400, 'اسم العميل مطلوب');
  const res = db.prepare(`INSERT INTO workspaces (name, site_key, api_key, webhook_secret, currency, created_at)
                          VALUES (?, ?, ?, ?, ?, ?)`)
    .run(name, key('site', 9), key('key', 24), randomBytes(24).toString('hex'), String(currency).toUpperCase().slice(0, 3), Date.now());
  return getWorkspace(db, Number(res.lastInsertRowid));
}

export function getWorkspace(db, id) {
  const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!ws) throw new HttpError(404, 'العميل غير موجود');
  return { ...ws };
}

export function workspaceBySiteKey(db, siteKey) {
  const ws = db.prepare('SELECT * FROM workspaces WHERE site_key = ?').get(String(siteKey || ''));
  return ws ? { ...ws } : null;
}

export function workspaceByApiKey(db, apiKey) {
  const ws = db.prepare('SELECT * FROM workspaces WHERE api_key = ?').get(String(apiKey || ''));
  return ws ? { ...ws } : null;
}

export function listWorkspaces(db, user) {
  const rows = user.role === 'admin'
    ? db.prepare('SELECT id, name, currency FROM workspaces ORDER BY name').all()
    : db.prepare(`SELECT w.id, w.name, w.currency FROM workspaces w JOIN user_workspaces uw ON uw.workspace_id = w.id
                  WHERE uw.user_id = ? ORDER BY w.name`).all(user.id);
  return rows.map((r) => ({ ...r }));
}

export function updateWorkspace(db, id, patch) {
  const ws = getWorkspace(db, id);
  const name = patch.name != null ? String(patch.name).trim().slice(0, 100) : ws.name;
  if (!name) throw new HttpError(400, 'اسم العميل مطلوب');
  const currency = patch.currency != null ? String(patch.currency).toUpperCase().slice(0, 3) : ws.currency;
  const model = patch.default_model != null ? String(patch.default_model) : ws.default_model;
  if (!MODELS[model]) throw new HttpError(400, 'invalid model');
  const window = patch.default_window != null ? Math.min(Math.max(Number(patch.default_window) || 30, 1), 90) : ws.default_window;
  db.prepare('UPDATE workspaces SET name = ?, currency = ?, default_model = ?, default_window = ? WHERE id = ?')
    .run(name, currency, model, window, id);
  return getWorkspace(db, id);
}

export function rotateKey(db, id, which) {
  const col = { api_key: 'api_key', webhook_secret: 'webhook_secret' }[which];
  if (!col) throw new HttpError(400, 'invalid key');
  const value = col === 'api_key' ? key('key', 24) : randomBytes(24).toString('hex');
  db.prepare(`UPDATE workspaces SET ${col} = ? WHERE id = ?`).run(value, id);
  return getWorkspace(db, id);
}

export function deleteWorkspace(db, id) {
  getWorkspace(db, id);
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
}
