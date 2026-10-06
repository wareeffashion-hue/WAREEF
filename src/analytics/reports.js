import { MODELS } from '../attribution.js';
import { PAID_CHANNELS } from '../channels.js';
import { DAY, dayOf, daysBetween, dayStart, tzOffsetMs } from '../config.js';
import { LEAD_TYPES } from '../ingest.js';
import { ACTIVE_ORDER, loadDataset, loadSpend, previousPeriod } from './dataset.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const div = (a, b) => (b ? a / b : null);

// ---------------------------------------------------------------- summaries

/** Store-side totals for a range, straight from SQL (no attribution needed). */
export function summary(db, ws, { from, to }) {
  const start = dayStart(from);
  const end = dayStart(to) + DAY;
  const conv = db.prepare(`SELECT type, COUNT(*) n, COALESCE(SUM(value), 0) v FROM conversions
      WHERE workspace_id = ? AND ts >= ? AND ts < ? AND ${ACTIVE_ORDER} GROUP BY type`).all(ws.id, start, end);
  const by = Object.fromEntries(conv.map((r) => [r.type, r]));
  const sp = db.prepare(`SELECT COALESCE(SUM(spend), 0) spend, COALESCE(SUM(platform_revenue), 0) pr,
      COALESCE(SUM(platform_conversions), 0) pc, COALESCE(SUM(impressions), 0) imp, COALESCE(SUM(clicks), 0) clk
      FROM spend WHERE workspace_id = ? AND date >= ? AND date <= ?`).get(ws.id, from, to);
  const sessions = db.prepare('SELECT COUNT(*) n, COUNT(DISTINCT visitor_id) v FROM touchpoints WHERE workspace_id = ? AND ts >= ? AND ts < ?')
    .get(ws.id, start, end);
  const newCustomers = db.prepare(`SELECT COUNT(*) n FROM (
      SELECT customer_id, MIN(ts) first FROM conversions WHERE workspace_id = ? AND type = 'purchase' AND customer_id IS NOT NULL AND ${ACTIVE_ORDER}
      GROUP BY customer_id) WHERE first >= ? AND first < ?`).get(ws.id, start, end).n;
  const revenue = by.purchase?.v || 0;
  const orders = by.purchase?.n || 0;
  const leads = LEAD_TYPES.reduce((a, t) => a + (by[t]?.n || 0), 0);
  return {
    revenue, orders, aov: div(revenue, orders),
    form: by.form?.n || 0, whatsapp: by.whatsapp?.n || 0, call: by.call?.n || 0, leads,
    spend: sp.spend, platform_revenue: sp.pr, platform_conversions: sp.pc, impressions: sp.imp, clicks: sp.clk,
    sessions: sessions.n, visitors: sessions.v, new_customers: newCustomers,
    roas: div(revenue, sp.spend), cpa: div(sp.spend, orders), cpl: div(sp.spend, leads),
    claim_gap: sp.pr ? sp.pr - revenue : null,
    conversion_rate: div(orders, sessions.v),
  };
}

function withPrevious(db, ws, params) {
  const current = summary(db, ws, params);
  const prev = summary(db, ws, previousPeriod(params));
  const change = {};
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === 'number' && typeof prev[k] === 'number' && prev[k]) change[k] = (v - prev[k]) / Math.abs(prev[k]);
  }
  return { current, previous: prev, change };
}

export function agencyReport(db, workspaces, params) {
  return workspaces.map((ws) => ({ id: ws.id, name: ws.name, currency: ws.currency, ...withPrevious(db, ws, params) }));
}

// ---------------------------------------------------------- attribution tables

/**
 * Attributed results grouped by any key (channel / campaign / creative),
 * joined with spend rows grouped by the same key.
 */
function attributionTable(ds, spendRows, model, grouping) {
  const { keyOf, spendKeyOf, describe } = grouping.bind ? grouping.bind(aliases(spendRows)) : grouping;
  const rows = new Map();
  const row = (key, tp) => {
    if (!rows.has(key)) {
      rows.set(key, {
        key, ...describe(tp), orders: 0, revenue: 0, form: 0, whatsapp: 0, call: 0,
        spend: 0, impressions: 0, clicks: 0, platform_conversions: 0, platform_revenue: 0,
      });
    }
    return rows.get(key);
  };
  for (const { conversion: c, credits } of ds.attributed(model)) {
    for (const { tp, credit } of credits) {
      const r = row(keyOf(tp), tp);
      if (c.type === 'purchase') {
        r.orders += credit;
        r.revenue += credit * c.value;
      } else if (LEAD_TYPES.includes(c.type)) {
        r[c.type] += credit;
      }
    }
  }
  for (const s of spendRows) {
    const r = row(spendKeyOf(s), { channel: s.channel, campaign: s.campaign, content: s.ad });
    r.spend += s.spend;
    r.impressions += s.impressions;
    r.clicks += s.clicks;
    r.platform_conversions += s.platform_conversions;
    r.platform_revenue += s.platform_revenue;
  }
  return [...rows.values()].map((r) => {
    const leads = r.form + r.whatsapp + r.call;
    return {
      ...r, leads,
      roas: div(r.revenue, r.spend),
      platform_roas: r.platform_revenue ? div(r.platform_revenue, r.spend) : null,
      cpa: r.orders ? div(r.spend, r.orders) : null,
      cpl: leads ? div(r.spend, leads) : null,
      ctr: div(r.clicks, r.impressions),
      overclaim: r.platform_revenue ? r.platform_revenue - r.revenue : null,
    };
  }).sort((a, b) => (b.revenue - a.revenue) || (b.leads - a.leads) || (b.spend - a.spend));
}

/**
 * Ad links can carry either names or ids (Google's ValueTrack only offers
 * {campaignid}/{creative}). Map ids from synced spend back to names so both
 * spellings land in the same row.
 */
function aliases(spendRows) {
  const campaign = new Map();
  const ad = new Map();
  for (const s of spendRows) {
    if (s.campaign_id && s.campaign) campaign.set(`${s.channel}|${norm(s.campaign_id)}`, s.campaign);
    if (s.ad_id && s.ad) ad.set(`${s.channel}|${norm(s.ad_id)}`, s.ad);
  }
  return {
    campaign: (ch, v) => campaign.get(`${ch}|${norm(v)}`) || v || '',
    ad: (ch, v) => ad.get(`${ch}|${norm(v)}`) || v || '',
  };
}

const GROUPINGS = {
  channel: {
    keyOf: (tp) => tp.channel,
    spendKeyOf: (s) => s.channel,
    describe: (tp) => ({ channel: tp.channel }),
  },
  campaign: {
    bind: (a) => ({
      keyOf: (tp) => `${tp.channel}|${norm(a.campaign(tp.channel, tp.campaign))}`,
      spendKeyOf: (s) => `${s.channel}|${norm(s.campaign)}`,
      describe: (tp) => ({ channel: tp.channel, campaign: a.campaign(tp.channel, tp.campaign) }),
    }),
  },
  creative: {
    bind: (a) => ({
      keyOf: (tp) => `${tp.channel}|${norm(a.campaign(tp.channel, tp.campaign))}|${norm(a.ad(tp.channel, tp.content))}`,
      spendKeyOf: (s) => `${s.channel}|${norm(s.campaign)}|${norm(s.ad)}`,
      describe: (tp) => ({ channel: tp.channel, campaign: a.campaign(tp.channel, tp.campaign), creative: a.ad(tp.channel, tp.content) }),
    }),
  },
};

export function attributionReport(db, ws, params, grouping = 'channel') {
  const ds = loadDataset(db, ws, params);
  const spend = loadSpend(db, ws, params);
  const rows = attributionTable(ds, spend, params.model, GROUPINGS[grouping]);
  return { params, totals: summary(db, ws, params), rows };
}

// --------------------------------------------------------------- overview

export function overviewReport(db, ws, params) {
  const ds = loadDataset(db, ws, params);
  const spend = loadSpend(db, ws, params);
  const channels = attributionTable(ds, spend, params.model, GROUPINGS.channel);
  const campaigns = attributionTable(ds, spend, params.model, GROUPINGS.campaign).filter((r) => r.campaign).slice(0, 5);
  return { params, ...withPrevious(db, ws, params), series: timeseries(db, ws, params), channels, campaigns };
}

// ------------------------------------------------------------- time series

export function timeseries(db, ws, { from, to }) {
  const start = dayStart(from);
  const end = dayStart(to) + DAY;
  const off = tzOffsetMs();
  const dayExpr = `date((ts + ${off}) / 1000, 'unixepoch')`;
  const days = Object.fromEntries(daysBetween(from, to).map((d) => [d, {
    date: d, revenue: 0, orders: 0, leads: 0, spend: 0, platform_revenue: 0, sessions: 0, new_customers: 0,
  }]));
  for (const r of db.prepare(`SELECT ${dayExpr} d, type, COUNT(*) n, SUM(value) v FROM conversions
      WHERE workspace_id = ? AND ts >= ? AND ts < ? AND ${ACTIVE_ORDER} GROUP BY d, type`).all(ws.id, start, end)) {
    if (!days[r.d]) continue;
    if (r.type === 'purchase') { days[r.d].revenue += r.v; days[r.d].orders += r.n; } else days[r.d].leads += r.n;
  }
  for (const r of db.prepare(`SELECT date d, SUM(spend) s, SUM(platform_revenue) pr FROM spend
      WHERE workspace_id = ? AND date >= ? AND date <= ? GROUP BY date`).all(ws.id, from, to)) {
    if (days[r.d]) { days[r.d].spend = r.s; days[r.d].platform_revenue = r.pr; }
  }
  for (const r of db.prepare(`SELECT ${dayExpr} d, COUNT(*) n FROM touchpoints WHERE workspace_id = ? AND ts >= ? AND ts < ? GROUP BY d`)
    .all(ws.id, start, end)) {
    if (days[r.d]) days[r.d].sessions = r.n;
  }
  for (const r of db.prepare(`SELECT date((first + ${off}) / 1000, 'unixepoch') d, COUNT(*) n FROM (
      SELECT MIN(ts) first FROM conversions WHERE workspace_id = ? AND type = 'purchase' AND customer_id IS NOT NULL AND ${ACTIVE_ORDER}
      GROUP BY customer_id) WHERE first >= ? AND first < ? GROUP BY d`).all(ws.id, start, end)) {
    if (days[r.d]) days[r.d].new_customers = r.n;
  }
  return Object.values(days).map((d) => ({ ...d, roas: div(d.revenue, d.spend) }));
}

/** Daily series for the analytics page, plus attributed revenue per channel per day. */
export function analyticsReport(db, ws, params) {
  const ds = loadDataset(db, ws, params);
  const byChannel = {};
  for (const { conversion: c, credits } of ds.attributed(params.model)) {
    if (c.type !== 'purchase') continue;
    const d = dayOf(c.ts);
    for (const { tp, credit } of credits) {
      const ch = (byChannel[tp.channel] ||= {});
      ch[d] = (ch[d] || 0) + credit * c.value;
    }
  }
  const prev = previousPeriod(params);
  return {
    params,
    series: timeseries(db, ws, params),
    previous: timeseries(db, ws, prev),
    byChannel,
    ...withPrevious(db, ws, params),
  };
}

/** The journey before this conversion spans more than one browser/device. */
function isCrossDevice(ds, c) {
  const from = c.ts - ds.windowDays * DAY;
  return new Set(ds.pathFor(c).filter((tp) => tp.ts <= c.ts && tp.ts >= from).map((tp) => tp.visitor_id)).size > 1;
}

// ------------------------------------------------------ unified measurement

/**
 * Puts the three views of each paid channel side by side: what the platform
 * reports, what the store data attributes to it (and its range across all
 * models), and the correction factor to apply to the platform's numbers.
 */
export function measurementReport(db, ws, params) {
  const ds = loadDataset(db, ws, params);
  const spend = loadSpend(db, ws, params);
  const byModel = {};
  for (const m of Object.keys(MODELS)) {
    byModel[m] = Object.fromEntries(attributionTable(ds, spend, m, GROUPINGS.channel).map((r) => [r.channel, r]));
  }
  const selected = byModel[params.model];
  const channels = Object.keys(selected)
    .filter((ch) => PAID_CHANNELS.includes(ch) || selected[ch].spend > 0)
    .map((ch) => {
      const r = selected[ch];
      const revenues = Object.keys(MODELS).map((m) => byModel[m][ch]?.revenue || 0);
      return {
        channel: ch,
        spend: r.spend,
        platform_conversions: r.platform_conversions,
        platform_revenue: r.platform_revenue,
        orders: r.orders,
        revenue: r.revenue,
        revenue_min: Math.min(...revenues),
        revenue_max: Math.max(...revenues),
        roas: r.roas,
        platform_roas: r.platform_roas,
        correction: r.platform_revenue ? r.revenue / r.platform_revenue : null,
        overclaim: r.overclaim,
      };
    })
    .sort((a, b) => b.spend - a.spend);
  const totals = summary(db, ws, params);
  return {
    params,
    totals: {
      ...totals,
      mer: div(totals.revenue, totals.spend),
      dedup_ratio: div(totals.platform_conversions, totals.orders),
      unmatched_orders: ds.conversions.filter((c) => c.type === 'purchase' && !c.visitor_id && !c.customer_id).length,
      cross_device_orders: ds.conversions.filter((c) => c.type === 'purchase' && c.customer_id && isCrossDevice(ds, c)).length,
    },
    channels,
  };
}

// ------------------------------------------------------------- journeys

const TOUCH_BUCKETS = ['1', '2', '3', '4', '5+'];
const DAY_BUCKETS = [['0', 1], ['1', 2], ['2-3', 4], ['4-7', 8], ['8-14', 15], ['15-30', 31], ['30+', Infinity]];

export function journeysReport(db, ws, params) {
  const ds = loadDataset(db, ws, params);
  const spend = loadSpend(db, ws, params);
  const compare = {};
  for (const m of Object.keys(MODELS)) {
    compare[m] = Object.fromEntries(attributionTable(ds, spend, m, GROUPINGS.channel).map((r) => [r.channel, { orders: r.orders, revenue: r.revenue }]));
  }
  const paths = new Map();
  const touches = Object.fromEntries(TOUCH_BUCKETS.map((b) => [b, 0]));
  const lag = Object.fromEntries(DAY_BUCKETS.map(([b]) => [b, 0]));
  const recent = [];
  const attributed = ds.attributed(params.model);
  for (const { conversion: c, credits } of attributed) {
    if (c.type !== 'purchase') continue;
    const path = ds.pathFor(c).filter((tp) => tp.ts <= c.ts && tp.ts >= c.ts - ds.windowDays * DAY);
    const seq = [];
    for (const tp of path) if (seq[seq.length - 1] !== tp.channel) seq.push(tp.channel);
    const key = (seq.length > 5 ? [...seq.slice(0, 2), '…', ...seq.slice(-2)] : seq).join(' > ') || '(غير معروف)';
    const p = paths.get(key) || { path: key.split(' > '), orders: 0, revenue: 0, days: 0 };
    p.orders++;
    p.revenue += c.value;
    p.days += path.length ? (c.ts - path[0].ts) / DAY : 0;
    paths.set(key, p);
    if (path.length) {
      touches[path.length >= 5 ? '5+' : String(path.length)]++;
      const days = (c.ts - path[0].ts) / DAY;
      lag[DAY_BUCKETS.find(([, max]) => days < max)[0]]++;
    }
  }
  for (const { conversion: c, credits } of attributed.slice(-60).reverse()) {
    recent.push({
      ts: c.ts, type: c.type, value: c.value, order_id: c.order_id,
      cross_device: isCrossDevice(ds, c),
      path: ds.pathFor(c).filter((tp) => tp.ts <= c.ts && tp.ts >= c.ts - ds.windowDays * DAY)
        .map((tp) => ({ ts: tp.ts, channel: tp.channel, campaign: tp.campaign, device: tp.device })),
      credits: credits.reduce((acc, { tp, credit }) => ({ ...acc, [tp.channel]: (acc[tp.channel] || 0) + credit }), {}),
    });
  }
  return {
    params,
    compare,
    paths: [...paths.values()].map((p) => ({ ...p, avg_days: p.days / p.orders })).sort((a, b) => b.orders - a.orders).slice(0, 15),
    touches,
    lag,
    recent,
  };
}

// --------------------------------------------------------------- customers

export function customersReport(db, ws, params) {
  const start = dayStart(params.from);
  const end = dayStart(params.to) + DAY;
  const orders = db.prepare(`SELECT customer_id, ts, value FROM conversions
      WHERE workspace_id = ? AND type = 'purchase' AND customer_id IS NOT NULL AND ${ACTIVE_ORDER} AND ts < ? ORDER BY ts`).all(ws.id, end);
  const customers = new Map();
  for (const o of orders) {
    const c = customers.get(o.customer_id) || { id: o.customer_id, orders: 0, ltv: 0, first: o.ts, last: o.ts, inRange: 0, rangeRevenue: 0 };
    c.orders++;
    c.ltv += o.value;
    c.last = o.ts;
    if (o.ts >= start) { c.inRange++; c.rangeRevenue += o.value; }
    customers.set(o.customer_id, c);
  }

  // Acquisition channel: earliest non-direct touchpoint across all of the
  // customer's browsers, before their first order (falls back to direct).
  const acq = new Map();
  const tpStmt = db.prepare(`SELECT tp.channel, tp.ts FROM visitor_customers vc
      JOIN touchpoints tp ON tp.workspace_id = vc.workspace_id AND tp.visitor_id = vc.visitor_id
      WHERE vc.customer_id = ? AND tp.ts <= ? ORDER BY (tp.channel = 'direct'), tp.ts LIMIT 1`);
  for (const c of customers.values()) acq.set(c.id, tpStmt.get(c.id, c.first)?.channel || 'direct');

  const active = [...customers.values()].filter((c) => c.inRange > 0);
  const newOnes = active.filter((c) => c.first >= start);
  const byChannel = {};
  for (const c of customers.values()) {
    const ch = acq.get(c.id);
    const r = (byChannel[ch] ||= { channel: ch, customers: 0, ltv: 0, orders: 0, repeat: 0, new_in_range: 0 });
    r.customers++;
    r.ltv += c.ltv;
    r.orders += c.orders;
    if (c.orders > 1) r.repeat++;
    if (c.first >= start) r.new_in_range++;
  }
  const spendByChannel = Object.fromEntries(db.prepare(`SELECT channel, SUM(spend) s FROM spend
      WHERE workspace_id = ? AND date >= ? AND date <= ? GROUP BY channel`).all(ws.id, params.from, params.to).map((r) => [r.channel, r.s]));

  const names = db.prepare('SELECT name, city, external_id FROM customers WHERE id = ?');
  const top = active.sort((a, b) => b.ltv - a.ltv).slice(0, 50).map((c) => {
    const info = names.get(c.id) || {};
    return {
      name: info.name || `عميل #${info.external_id || c.id}`, city: info.city || '', orders: c.orders, ltv: c.ltv,
      first: c.first, last: c.last, channel: acq.get(c.id), is_new: c.first >= start,
    };
  });
  const rangeRevenue = (list) => list.reduce((a, c) => a + c.rangeRevenue, 0);
  return {
    params,
    totals: {
      active: active.length,
      new: newOnes.length,
      returning: active.length - newOnes.length,
      new_revenue: rangeRevenue(newOnes),
      returning_revenue: rangeRevenue(active.filter((c) => c.first < start)),
      repeat_rate: div([...customers.values()].filter((c) => c.orders > 1).length, customers.size),
      avg_ltv: div([...customers.values()].reduce((a, c) => a + c.ltv, 0), customers.size),
      all_time: customers.size,
    },
    channels: Object.values(byChannel).map((r) => ({
      ...r,
      avg_ltv: div(r.ltv, r.customers),
      avg_orders: div(r.orders, r.customers),
      repeat_rate: div(r.repeat, r.customers),
      spend: spendByChannel[r.channel] || 0,
      cac: spendByChannel[r.channel] && r.new_in_range ? spendByChannel[r.channel] / r.new_in_range : null,
    })).sort((a, b) => b.ltv - a.ltv),
    top,
  };
}

// ------------------------------------------------------------------ funnel

export const FUNNEL_STEPS = ['visitors', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'];

export function funnelReport(db, ws, params) {
  const start = dayStart(params.from);
  const end = dayStart(params.to) + DAY;
  // Each visitor belongs to the channel of their first touchpoint in the range.
  const channelOf = new Map();
  for (const tp of db.prepare(`SELECT visitor_id, channel FROM touchpoints WHERE workspace_id = ? AND ts >= ? AND ts < ? ORDER BY ts`)
    .iterate(ws.id, start, end)) {
    if (!channelOf.has(tp.visitor_id) || (channelOf.get(tp.visitor_id) === 'direct' && tp.channel !== 'direct')) {
      channelOf.set(tp.visitor_id, tp.channel);
    }
  }
  const reached = { view_item: new Set(), add_to_cart: new Set(), begin_checkout: new Set(), purchase: new Set() };
  for (const e of db.prepare('SELECT DISTINCT visitor_id, type FROM events WHERE workspace_id = ? AND ts >= ? AND ts < ?').iterate(ws.id, start, end)) {
    reached[e.type]?.add(e.visitor_id);
  }
  for (const c of db.prepare(`SELECT DISTINCT visitor_id FROM conversions WHERE workspace_id = ? AND type = 'purchase'
      AND visitor_id IS NOT NULL AND ts >= ? AND ts < ? AND ${ACTIVE_ORDER}`).iterate(ws.id, start, end)) {
    reached.purchase.add(c.visitor_id);
  }
  const rows = new Map();
  const total = { channel: 'all', visitors: 0, view_item: 0, add_to_cart: 0, begin_checkout: 0, purchase: 0 };
  for (const [visitor, ch] of channelOf) {
    const r = rows.get(ch) || { channel: ch, visitors: 0, view_item: 0, add_to_cart: 0, begin_checkout: 0, purchase: 0 };
    r.visitors++;
    total.visitors++;
    for (const step of ['view_item', 'add_to_cart', 'begin_checkout', 'purchase']) {
      if (reached[step].has(visitor)) { r[step]++; total[step]++; }
    }
    rows.set(ch, r);
  }
  const rate = (r) => ({ ...r, conversion_rate: div(r.purchase, r.visitors), cart_rate: div(r.add_to_cart, r.visitors) });
  return { params, total: rate(total), rows: [...rows.values()].map(rate).sort((a, b) => b.visitors - a.visitors) };
}
