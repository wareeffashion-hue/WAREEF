import { createHmac, timingSafeEqual } from 'node:crypto';
import { classify, deviceOf, normalizeChannel } from './channels.js';
import { dayOf } from './config.js';
import { transaction } from './db.js';
import { HttpError } from './http.js';

export const LEAD_TYPES = ['form', 'whatsapp', 'call'];
export const FUNNEL_TYPES = ['view_item', 'add_to_cart', 'begin_checkout'];
export const CANCELLED_STATUSES = ['canceled', 'cancelled', 'refunded', 'restored', 'deleted'];

const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;
const clip = (v, n = 300) => String(v ?? '').trim().slice(0, n);

/** Handles one event from the tracking snippet. */
export function recordEvent(db, ws, event, { now = Date.now(), userAgent = '' } = {}) {
  const visitorId = String(event.v || '');
  if (!VISITOR_ID.test(visitorId)) throw new HttpError(400, 'invalid visitor id');
  const url = clip(event.url, 2000);
  const referrer = clip(event.ref, 2000);

  switch (event.e) {
    case 'pageview': {
      // The snippet flags session starts; mid-session pageviews only count
      // when they carry fresh campaign params.
      const touch = classify({ url, referrer });
      if (!touch) return { stored: null };
      if (!event.s && touch.channel === 'direct') return { stored: null };
      db.prepare(`INSERT INTO touchpoints (workspace_id, visitor_id, ts, channel, source, medium, campaign, content, click_id, referrer, landing_url, device)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(ws.id, visitorId, now, touch.channel, clip(touch.source), clip(touch.medium), clip(touch.campaign), clip(touch.content),
          touch.clickId, referrer, url, deviceOf(userAgent));
      return { stored: 'touchpoint', channel: touch.channel };
    }
    case 'view_item':
    case 'add_to_cart':
    case 'begin_checkout':
      db.prepare('INSERT INTO events (workspace_id, visitor_id, ts, type, value) VALUES (?, ?, ?, ?, ?)')
        .run(ws.id, visitorId, now, event.e, Number(event.value) || 0);
      return { stored: event.e };
    case 'form':
    case 'whatsapp':
    case 'call': {
      // Once per visitor per type per day, so repeated clicks don't inflate leads.
      const key = `${visitorId}:${event.e}:${dayOf(now)}`;
      const res = db.prepare(`INSERT OR IGNORE INTO conversions (workspace_id, visitor_id, ts, type, dedupe_key, url) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(ws.id, visitorId, now, event.e, key, url);
      return { stored: res.changes ? event.e : null };
    }
    case 'purchase': {
      const orderId = clip(event.order_id, 100);
      if (!orderId) throw new HttpError(400, 'order_id is required');
      const customerId = event.customer_id ? upsertCustomer(db, ws, { externalId: event.customer_id }) : null;
      upsertOrder(db, ws, {
        orderId, visitorId, customerId, ts: now, value: Number(event.value) || 0,
        currency: event.currency, url, confirmed: false,
      });
      return { stored: 'purchase' };
    }
    default:
      throw new HttpError(400, `unknown event: ${event.e}`);
  }
}

export function upsertCustomer(db, ws, { externalId, name = null, city = null }) {
  const ext = clip(externalId, 100);
  if (!ext) return null;
  db.prepare(`INSERT INTO customers (workspace_id, external_id, name, city) VALUES (?, ?, ?, ?)
              ON CONFLICT(workspace_id, external_id) DO UPDATE SET
                name = COALESCE(excluded.name, customers.name), city = COALESCE(excluded.city, customers.city)`)
    .run(ws.id, ext, name ? clip(name, 100) : null, city ? clip(city, 100) : null);
  return db.prepare('SELECT id FROM customers WHERE workspace_id = ? AND external_id = ?').get(ws.id, ext).id;
}

function linkVisitor(db, ws, visitorId, customerId) {
  if (visitorId && customerId) {
    db.prepare('INSERT OR IGNORE INTO visitor_customers (workspace_id, visitor_id, customer_id) VALUES (?, ?, ?)')
      .run(ws.id, visitorId, customerId);
  }
}

/**
 * Orders arrive twice: from the pixel (knows the browser) and from the store
 * (knows the real amount, status and customer). Merge both on the order id;
 * the store's confirmed amount always wins. Linking browser and customer is
 * what lets journeys span devices: a customer's earlier orders from other
 * browsers bring those browsers' touchpoints into later attributions.
 */
export function upsertOrder(db, ws, { orderId, altOrderIds = [], visitorId = null, customerId = null, ts, value, currency = null, status = null, url = null, confirmed }) {
  let key = `order:${orderId}`;
  for (const alt of altOrderIds.filter(Boolean)) {
    const altKey = `order:${alt}`;
    if (db.prepare('SELECT 1 FROM conversions WHERE workspace_id = ? AND dedupe_key = ?').get(ws.id, altKey)) key = altKey;
  }
  const common = `visitor_id = COALESCE(conversions.visitor_id, excluded.visitor_id),
                  customer_id = COALESCE(excluded.customer_id, conversions.customer_id)`;
  const onConflict = confirmed
    ? `value = excluded.value, currency = excluded.currency, status = excluded.status, confirmed = 1, ts = MIN(conversions.ts, excluded.ts), ${common}`
    : `value = CASE WHEN conversions.confirmed = 1 THEN conversions.value ELSE excluded.value END, url = COALESCE(conversions.url, excluded.url), ${common}`;
  db.prepare(`INSERT INTO conversions (workspace_id, visitor_id, customer_id, ts, type, value, currency, order_id, status, confirmed, dedupe_key, url)
              VALUES (?, ?, ?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(workspace_id, dedupe_key) DO UPDATE SET ${onConflict}`)
    .run(ws.id, visitorId, customerId, ts, value, currency, orderId, status, confirmed ? 1 : 0, key, url);
  const row = db.prepare('SELECT visitor_id, customer_id FROM conversions WHERE workspace_id = ? AND dedupe_key = ?').get(ws.id, key);
  linkVisitor(db, ws, row.visitor_id, row.customer_id);
}

export function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature).trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Salla order webhooks (order.created / order.updated / order.status.updated / order.deleted). */
export function recordSallaWebhook(db, ws, payload, now = Date.now()) {
  const event = String(payload?.event || '');
  if (!event.startsWith('order.')) return { stored: null, ignored: event };
  const order = payload.data || {};
  if (order.id == null) throw new HttpError(400, 'missing order id');
  const amount = order.amounts?.total?.amount ?? order.total?.amount ?? order.amount ?? 0;
  const created = Date.parse(order.date?.date || order.created_at || '') || now;
  const status = order.status?.slug || order.status?.name || (typeof order.status === 'string' ? order.status : null);
  const c = order.customer || {};
  const customerId = c.id != null
    ? upsertCustomer(db, ws, { externalId: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name, city: c.city })
    : null;
  upsertOrder(db, ws, {
    orderId: String(order.id),
    altOrderIds: [order.reference_id && String(order.reference_id)],
    customerId,
    ts: created,
    value: Number(amount) || 0,
    currency: order.amounts?.total?.currency || order.currency || null,
    status: event === 'order.deleted' ? 'deleted' : status,
    confirmed: true,
  });
  return { stored: 'purchase', orderId: String(order.id) };
}

/** Generic order import (any store): {order_id, value, status?, ts?, visitor_id?, customer_id?, customer_name?, city?} */
export function recordOrders(db, ws, body) {
  const orders = Array.isArray(body) ? body : [body];
  transaction(db, () => {
    for (const o of orders) {
      if (!o || !o.order_id) throw new HttpError(400, 'order_id is required');
      const customerId = o.customer_id ? upsertCustomer(db, ws, { externalId: o.customer_id, name: o.customer_name, city: o.city }) : null;
      upsertOrder(db, ws, {
        orderId: clip(o.order_id, 100), visitorId: VISITOR_ID.test(o.visitor_id || '') ? o.visitor_id : null, customerId,
        ts: Date.parse(o.ts || '') || Date.now(), value: Number(o.value) || 0, currency: o.currency || null,
        status: o.status || null, confirmed: true,
      });
    }
  });
  return { imported: orders.length };
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const SPEND_COLUMNS = {
  date: ['date', 'day', 'التاريخ'],
  channel: ['channel', 'platform', 'source', 'المنصة', 'القناة'],
  campaign: ['campaign', 'campaign_name', 'الحملة'],
  ad: ['ad', 'ad_name', 'creative', 'الإعلان', 'الإبداع'],
  spend: ['spend', 'cost', 'amount', 'الصرف'],
  impressions: ['impressions', 'الظهور'],
  clicks: ['clicks', 'النقرات'],
  platform_conversions: ['platform_conversions', 'conversions', 'purchases', 'التحويلات'],
  platform_revenue: ['platform_revenue', 'revenue', 'conversion_value', 'purchase_value', 'المبيعات'],
};

/**
 * Writes spend rows. With `replace` ({channel, from, to}) the rows a platform
 * sync previously wrote for that range are removed first, so renamed or
 * deleted ads don't linger.
 */
export function upsertSpendRows(db, ws, rows, source, replace = null) {
  const stmt = db.prepare(`INSERT INTO spend (workspace_id, date, channel, campaign, ad, campaign_id, ad_id, spend, impressions, clicks, platform_conversions, platform_revenue, source)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                           ON CONFLICT(workspace_id, date, channel, campaign, ad) DO UPDATE SET
                             campaign_id = excluded.campaign_id, ad_id = excluded.ad_id, spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks,
                             platform_conversions = excluded.platform_conversions, platform_revenue = excluded.platform_revenue,
                             source = excluded.source`);
  transaction(db, () => {
    if (replace) {
      db.prepare('DELETE FROM spend WHERE workspace_id = ? AND channel = ? AND source = ? AND date >= ? AND date <= ?')
        .run(ws.id, replace.channel, source, replace.from, replace.to);
    }
    for (const r of rows) {
      stmt.run(ws.id, r.date, r.channel, clip(r.campaign), clip(r.ad), clip(r.campaign_id, 100), clip(r.ad_id, 100), r.spend || 0, r.impressions || 0, r.clicks || 0,
        r.platform_conversions || 0, r.platform_revenue || 0, source);
    }
  });
}

/**
 * Imports ad spend + what each platform claims, from a CSV with a header row:
 * date,channel,campaign,ad,spend,impressions,clicks,platform_conversions,platform_revenue
 * Only date, channel and spend are required.
 */
export function importSpendCsv(db, ws, text) {
  const rows = parseCsv(String(text).replace(/^﻿/, ''));
  if (rows.length < 2) throw new HttpError(400, 'الملف لازم يحتوي سطر عناوين وسطر بيانات واحد على الأقل');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [col, names] of Object.entries(SPEND_COLUMNS)) idx[col] = header.findIndex((h) => names.includes(h));
  for (const col of ['date', 'channel', 'spend']) {
    if (idx[col] < 0) throw new HttpError(400, `عمود ناقص: ${col}`);
  }
  const num = (r, col) => (idx[col] < 0 ? 0 : Number(String(r[idx[col]] ?? '').replace(/[^\d.-]/g, '')) || 0);
  const str = (r, col) => (idx[col] < 0 ? '' : String(r[idx[col]] || '').trim());
  const errors = [];
  const parsed = [];
  rows.slice(1).forEach((r, i) => {
    const date = str(r, 'date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`سطر ${i + 2}: التاريخ لازم يكون YYYY-MM-DD`); return; }
    parsed.push({
      date, channel: normalizeChannel(str(r, 'channel')), campaign: str(r, 'campaign'), ad: str(r, 'ad'),
      spend: num(r, 'spend'), impressions: num(r, 'impressions'), clicks: num(r, 'clicks'),
      platform_conversions: num(r, 'platform_conversions'), platform_revenue: num(r, 'platform_revenue'),
    });
  });
  upsertSpendRows(db, ws, parsed, 'csv');
  return { imported: parsed.length, errors };
}
