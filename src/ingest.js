import { createHmac, timingSafeEqual } from 'node:crypto';
import { classify, normalizeChannel } from './channels.js';
import { dayOf } from './config.js';
import { transaction } from './db.js';

export const LEAD_TYPES = ['form', 'whatsapp', 'call'];
export const CANCELLED_STATUSES = ['canceled', 'cancelled', 'refunded', 'restored', 'deleted'];

const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Handles one event from the tracking snippet. Returns what was stored. */
export function recordEvent(db, event, now = Date.now()) {
  const visitorId = String(event.v || '');
  if (!VISITOR_ID.test(visitorId)) throw new HttpError(400, 'invalid visitor id');
  const url = String(event.url || '').slice(0, 2000);
  const referrer = String(event.ref || '').slice(0, 2000);

  switch (event.e) {
    case 'pageview': {
      // The snippet flags session starts; mid-session pageviews only count
      // when they carry fresh campaign params.
      const touch = classify({ url, referrer });
      if (!touch) return { stored: null };
      if (!event.s && touch.channel === 'direct') return { stored: null };
      db.prepare(`INSERT INTO touchpoints (visitor_id, ts, channel, source, medium, campaign, click_id, referrer, landing_url)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(visitorId, now, touch.channel, touch.source, touch.medium, touch.campaign, touch.clickId, referrer, url);
      return { stored: 'touchpoint', channel: touch.channel };
    }
    case 'form':
    case 'whatsapp':
    case 'call': {
      // Once per visitor per type per day, so repeated clicks don't inflate leads.
      const key = `${visitorId}:${event.e}:${dayOf(now)}`;
      const res = db.prepare(`INSERT OR IGNORE INTO conversions (visitor_id, ts, type, dedupe_key, url) VALUES (?, ?, ?, ?, ?)`)
        .run(visitorId, now, event.e, key, url);
      return { stored: res.changes ? event.e : null };
    }
    case 'purchase': {
      const orderId = String(event.order_id || '').trim();
      if (!orderId) throw new HttpError(400, 'order_id is required');
      upsertOrder(db, {
        orderId, visitorId, ts: now, value: Number(event.value) || 0,
        currency: event.currency, url, confirmed: false,
      });
      return { stored: 'purchase' };
    }
    default:
      throw new HttpError(400, `unknown event: ${event.e}`);
  }
}

/**
 * Orders arrive twice: from the pixel (knows the visitor) and from the store
 * (knows the real amount and status). Merge both on the order id; the store's
 * confirmed amount always wins over the pixel's.
 */
export function upsertOrder(db, { orderId, altOrderIds = [], visitorId = null, ts, value, currency = null, status = null, url = null, confirmed }) {
  let key = `order:${orderId}`;
  for (const alt of altOrderIds.filter(Boolean)) {
    const altKey = `order:${alt}`;
    if (db.prepare('SELECT 1 FROM conversions WHERE dedupe_key = ?').get(altKey)) key = altKey;
  }
  if (confirmed) {
    db.prepare(`INSERT INTO conversions (visitor_id, ts, type, value, currency, order_id, status, confirmed, dedupe_key, url)
                VALUES (?, ?, 'purchase', ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(dedupe_key) DO UPDATE SET
                  value = excluded.value, currency = excluded.currency, status = excluded.status, confirmed = 1,
                  visitor_id = COALESCE(conversions.visitor_id, excluded.visitor_id)`)
      .run(visitorId, ts, value, currency, orderId, status, key, url);
  } else {
    db.prepare(`INSERT INTO conversions (visitor_id, ts, type, value, currency, order_id, status, confirmed, dedupe_key, url)
                VALUES (?, ?, 'purchase', ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(dedupe_key) DO UPDATE SET
                  visitor_id = COALESCE(conversions.visitor_id, excluded.visitor_id),
                  value = CASE WHEN conversions.confirmed = 1 THEN conversions.value ELSE excluded.value END,
                  url = COALESCE(conversions.url, excluded.url)`)
      .run(visitorId, ts, value, currency, orderId, status, key, url);
  }
}

export function verifySallaSignature(rawBody, signature, secret) {
  if (!secret) return true;
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature).trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Salla order webhooks (order.created / order.updated / order.status.updated). */
export function recordSallaWebhook(db, payload, now = Date.now()) {
  const event = String(payload?.event || '');
  if (!event.startsWith('order.')) return { stored: null, ignored: event };
  const order = payload.data || {};
  if (order.id == null) throw new HttpError(400, 'missing order id');
  const amount = order.amounts?.total?.amount ?? order.total?.amount ?? order.amount ?? 0;
  const created = Date.parse(order.date?.date || order.created_at || '') || now;
  const status = order.status?.slug || order.status?.name || (typeof order.status === 'string' ? order.status : null);
  upsertOrder(db, {
    orderId: String(order.id),
    altOrderIds: [order.reference_id && String(order.reference_id)],
    ts: created,
    value: Number(amount) || 0,
    currency: order.amounts?.total?.currency || order.currency || null,
    status: event === 'order.deleted' ? 'deleted' : status,
    confirmed: true,
  });
  return { stored: 'purchase', orderId: String(order.id) };
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
  campaign: ['campaign', 'الحملة'],
  spend: ['spend', 'cost', 'amount', 'الصرف'],
  platform_conversions: ['platform_conversions', 'conversions', 'purchases', 'التحويلات'],
  platform_revenue: ['platform_revenue', 'revenue', 'conversion_value', 'purchase_value', 'المبيعات'],
};

/**
 * Imports ad spend + what each platform claims, from a CSV with a header row:
 * date,channel,campaign,spend,platform_conversions,platform_revenue
 * Rows with the same (date, channel, campaign) replace earlier imports.
 */
export function importSpendCsv(db, text) {
  const rows = parseCsv(String(text).replace(/^﻿/, ''));
  if (rows.length < 2) throw new HttpError(400, 'CSV needs a header row and at least one data row');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [col, names] of Object.entries(SPEND_COLUMNS)) idx[col] = header.findIndex((h) => names.includes(h));
  for (const col of ['date', 'channel', 'spend']) {
    if (idx[col] < 0) throw new HttpError(400, `missing column: ${col}`);
  }
  const num = (r, col) => (idx[col] < 0 ? 0 : Number(String(r[idx[col]] ?? '').replace(/[^\d.-]/g, '')) || 0);
  const stmt = db.prepare(`INSERT INTO spend (date, channel, campaign, spend, platform_conversions, platform_revenue)
                           VALUES (?, ?, ?, ?, ?, ?)
                           ON CONFLICT(date, channel, campaign) DO UPDATE SET
                             spend = excluded.spend, platform_conversions = excluded.platform_conversions,
                             platform_revenue = excluded.platform_revenue`);
  const errors = [];
  let imported = 0;
  transaction(db, () => {
    rows.slice(1).forEach((r, i) => {
      const date = String(r[idx.date] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`row ${i + 2}: date must be YYYY-MM-DD`); return; }
      stmt.run(date, normalizeChannel(r[idx.channel]), idx.campaign < 0 ? '' : String(r[idx.campaign] || '').trim(),
        num(r, 'spend'), num(r, 'platform_conversions'), num(r, 'platform_revenue'));
      imported++;
    });
  });
  return { imported, errors };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
