// Loads everything one report needs for a workspace + date range, and builds
// each conversion's cross-device path once.
import { attributeTouchpoints, MODELS, DEFAULT_MODEL } from '../attribution.js';
import { addDays, DAY, dayOf, dayStart } from '../config.js';
import { CANCELLED_STATUSES } from '../ingest.js';

export const CANCELLED_SQL = CANCELLED_STATUSES.map((s) => `'${s}'`).join(',');
export const ACTIVE_ORDER = `(status IS NULL OR lower(status) NOT IN (${CANCELLED_SQL}))`;

export function parseParams(q, ws) {
  const today = dayOf(Date.now());
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const to = isDay(q.get('to')) ? q.get('to') : today;
  let from = isDay(q.get('from')) ? q.get('from') : addDays(to, -6);
  if (from > to) from = to;
  const model = MODELS[q.get('model')] ? q.get('model') : (ws?.default_model || DEFAULT_MODEL);
  const windowDays = Math.min(Math.max(Number(q.get('window')) || ws?.default_window || 30, 1), 90);
  return { from, to, model, windowDays };
}

/** The same-length period right before [from, to]. */
export function previousPeriod({ from, to }) {
  const len = Math.round((dayStart(to) - dayStart(from)) / DAY) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export function loadDataset(db, ws, { from, to, windowDays }) {
  const start = dayStart(from);
  const end = dayStart(to) + DAY;
  const conversions = db.prepare(`SELECT id, visitor_id, customer_id, ts, type, value, order_id FROM conversions
      WHERE workspace_id = ? AND ts >= ? AND ts < ? AND ${ACTIVE_ORDER} ORDER BY ts`).all(ws.id, start, end);

  const byVisitor = new Map();
  for (const tp of db.prepare(`SELECT visitor_id, ts, channel, campaign, content, device FROM touchpoints
      WHERE workspace_id = ? AND ts >= ? AND ts < ? ORDER BY ts`).iterate(ws.id, start - windowDays * DAY, end)) {
    let list = byVisitor.get(tp.visitor_id);
    if (!list) byVisitor.set(tp.visitor_id, (list = []));
    list.push(tp);
  }

  const customerVisitors = new Map();
  const customerIds = [...new Set(conversions.map((c) => c.customer_id).filter(Boolean))];
  if (customerIds.length) {
    const stmt = db.prepare('SELECT visitor_id FROM visitor_customers WHERE customer_id = ?');
    for (const id of customerIds) customerVisitors.set(id, stmt.all(id).map((r) => r.visitor_id));
  }

  const pathCache = new Map();
  function pathFor(c) {
    const key = c.customer_id ? `c${c.customer_id}|${c.visitor_id || ''}` : `v${c.visitor_id || ''}`;
    if (pathCache.has(key)) return pathCache.get(key);
    const visitors = new Set(c.customer_id ? customerVisitors.get(c.customer_id) || [] : []);
    if (c.visitor_id) visitors.add(c.visitor_id);
    let path = [];
    for (const v of visitors) path = path.concat(byVisitor.get(v) || []);
    if (visitors.size > 1) path.sort((a, b) => a.ts - b.ts);
    pathCache.set(key, path);
    return path;
  }

  const creditCache = new Map();
  /** [{conversion, credits: [{tp, credit}]}] under a model. */
  function attributed(model) {
    if (!creditCache.has(model)) {
      creditCache.set(model, conversions.map((c) => ({
        conversion: c,
        credits: attributeTouchpoints(pathFor(c), c.ts, { model, windowDays }),
      })));
    }
    return creditCache.get(model);
  }

  return { ws, from, to, start, end, windowDays, conversions, byVisitor, pathFor, attributed };
}

export function loadSpend(db, ws, { from, to }) {
  return db.prepare(`SELECT date, channel, campaign, ad, campaign_id, ad_id, spend, impressions, clicks, platform_conversions, platform_revenue
      FROM spend WHERE workspace_id = ? AND date >= ? AND date <= ?`).all(ws.id, from, to);
}
