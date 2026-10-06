// The AZWO app in the Salla App Store. Salla sends every installed store's
// events to one app webhook; each payload names the merchant (store) it is for.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './http.js';
import { SALLA_ORDER_EVENTS, recordSallaWebhook } from './ingest.js';
import { encrypt } from './secrets.js';

const LINK_CODE = /^azwo-[0-9a-f]{24}$/;

const sameString = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Signature strategy: hex HMAC-SHA256 of the raw body. Token strategy: the secret itself. */
export function verifySallaApp(raw, headers, secret = config.salla.webhookSecret) {
  if (!secret) return false;
  const sig = headers['x-salla-signature'];
  if (sig && sameString(createHmac('sha256', secret).update(raw).digest('hex'), String(sig).trim())) return true;
  const auth = String(headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(auth) && sameString(auth, secret);
}

/** The first workspace link code anywhere in the settings payload (field names are up to the app builder). */
function findLinkCode(value, depth = 0) {
  if (depth > 5 || value == null) return null;
  if (typeof value === 'string') return LINK_CODE.test(value.trim()) ? value.trim() : null;
  if (typeof value === 'object') {
    for (const v of Object.values(value)) {
      const hit = findLinkCode(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function upsertMerchant(db, merchantId, fields, now) {
  db.prepare(`INSERT INTO salla_merchants (merchant_id, status, installed_at, updated_at) VALUES (?, 'installed', ?, ?)
              ON CONFLICT(merchant_id) DO NOTHING`).run(merchantId, now, now);
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE salla_merchants SET ${sets ? `${sets}, ` : ''}updated_at = ? WHERE merchant_id = ?`)
    .run(...Object.values(fields), now, merchantId);
}

export function sallaWorkspaceFor(db, merchantId) {
  return db.prepare(`SELECT w.* FROM salla_merchants m JOIN workspaces w ON w.id = m.workspace_id
                     WHERE m.merchant_id = ? AND m.status = 'installed'`).get(String(merchantId)) || null;
}

/**
 * Handles one app webhook. `admit(ws)` decides whether the store's plan still
 * accepts orders. Returns a small result object for logging and tests.
 */
export function handleSallaAppEvent(db, payload, { admit = () => true, now = Date.now() } = {}) {
  const event = String(payload?.event || '');
  const merchantId = payload?.merchant != null ? String(payload.merchant) : '';
  if (!merchantId) throw new HttpError(400, 'missing merchant');
  const data = payload.data || {};

  switch (event) {
    case 'app.installed':
      upsertMerchant(db, merchantId, { status: 'installed' }, now);
      return { ok: true, event };
    case 'app.store.authorize': {
      const tokens = { access_token: data.access_token, refresh_token: data.refresh_token, expires: data.expires, scope: data.scope };
      upsertMerchant(db, merchantId, { status: 'installed', tokens: encrypt(tokens) }, now);
      return { ok: true, event };
    }
    case 'app.uninstalled':
      upsertMerchant(db, merchantId, { status: 'uninstalled', tokens: null }, now);
      return { ok: true, event };
    case 'app.settings.updated': {
      const code = findLinkCode(data);
      if (!code) return { ok: true, event, linked: false };
      const ws = db.prepare('SELECT id FROM workspaces WHERE salla_link_code = ?').get(code);
      if (!ws) return { ok: true, event, linked: false, reason: 'unknown code' };
      upsertMerchant(db, merchantId, { status: 'installed' }, now);
      // A workspace follows one store at a time: relinking moves it.
      db.prepare('UPDATE salla_merchants SET workspace_id = NULL WHERE workspace_id = ? AND merchant_id <> ?').run(ws.id, merchantId);
      db.prepare('UPDATE salla_merchants SET workspace_id = ? WHERE merchant_id = ?').run(ws.id, merchantId);
      return { ok: true, event, linked: true, workspace: ws.id };
    }
    default: {
      if (!SALLA_ORDER_EVENTS.has(event)) return { ok: true, event, ignored: true };
      const ws = sallaWorkspaceFor(db, merchantId);
      if (!ws) return { ok: true, event, stored: null, reason: 'store not linked' };
      if (!admit(ws)) return { ok: true, event, stored: null, reason: 'subscription' };
      return { ok: true, ...recordSallaWebhook(db, ws, payload, now) };
    }
  }
}

export function sallaStatus(db, workspaceId) {
  const m = db.prepare('SELECT merchant_id, status, updated_at FROM salla_merchants WHERE workspace_id = ?').get(workspaceId);
  return m ? { linked: m.status === 'installed', merchant_id: m.merchant_id, status: m.status, updated_at: m.updated_at } : { linked: false };
}

/** Loader for the App Snippet: finds the store id on the storefront and pulls that store's tracker. */
export const SALLA_SNIPPET = (base) => `(function () {
  var tries = 0;
  (function load() {
    var s = window.salla, id = s && s.config && s.config.get && s.config.get('store.id');
    if (!id) { if (++tries < 40) setTimeout(load, 250); return; }
    var el = document.createElement('script');
    el.async = true;
    el.src = '${base}/t.js?salla=' + encodeURIComponent(id);
    document.head.appendChild(el);
  })();
})();`;
