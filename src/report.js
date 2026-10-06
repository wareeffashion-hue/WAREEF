import { attribute, eligiblePath, MODELS, DEFAULT_MODEL } from './attribution.js';
import { DAY, dayStart } from './config.js';
import { CANCELLED_STATUSES, LEAD_TYPES } from './ingest.js';

const CANCELLED_SQL = CANCELLED_STATUSES.map((s) => `'${s}'`).join(',');

function loadData(db, { from, to, windowDays }) {
  const start = dayStart(from);
  const end = dayStart(to) + DAY;
  const conversions = db.prepare(`SELECT * FROM conversions
      WHERE ts >= ? AND ts < ? AND (status IS NULL OR lower(status) NOT IN (${CANCELLED_SQL}))
      ORDER BY ts`).all(start, end);
  const byVisitor = new Map();
  const tps = db.prepare('SELECT visitor_id, ts, channel, source, campaign FROM touchpoints WHERE ts >= ? AND ts < ? ORDER BY ts')
    .all(start - windowDays * DAY, end);
  for (const tp of tps) {
    if (!byVisitor.has(tp.visitor_id)) byVisitor.set(tp.visitor_id, []);
    byVisitor.get(tp.visitor_id).push(tp);
  }
  return { conversions, byVisitor };
}

function emptyRow(channel) {
  return {
    channel, orders: 0, revenue: 0, form: 0, whatsapp: 0, call: 0,
    spend: 0, platform_conversions: 0, platform_revenue: 0,
  };
}

export function parseReportParams(q) {
  const today = new Date().toISOString().slice(0, 10);
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const to = isDay(q.get('to')) ? q.get('to') : today;
  const from = isDay(q.get('from')) ? q.get('from') : new Date(dayStart(to) - 6 * DAY).toISOString().slice(0, 10);
  const model = MODELS[q.get('model')] ? q.get('model') : DEFAULT_MODEL;
  const windowDays = Math.min(Math.max(Number(q.get('window')) || 30, 1), 90);
  return { from, to, model, windowDays };
}

export function buildReport(db, params) {
  const { from, to, model, windowDays } = params;
  const { conversions, byVisitor } = loadData(db, params);
  const rows = new Map();
  const row = (ch) => {
    if (!rows.has(ch)) rows.set(ch, emptyRow(ch));
    return rows.get(ch);
  };
  // Revenue + orders per channel under every model, for the comparison view.
  const compare = Object.fromEntries(Object.keys(MODELS).map((m) => [m, {}]));

  const totals = { orders: 0, revenue: 0, form: 0, whatsapp: 0, call: 0, unmatched_orders: 0 };

  for (const c of conversions) {
    const tps = (c.visitor_id && byVisitor.get(c.visitor_id)) || [];
    if (c.type === 'purchase') {
      totals.orders++;
      totals.revenue += c.value;
      if (!c.visitor_id) totals.unmatched_orders++;
    } else if (LEAD_TYPES.includes(c.type)) {
      totals[c.type]++;
    }
    for (const m of Object.keys(MODELS)) {
      const credits = attribute(tps, c.ts, { model: m, windowDays });
      for (const [ch, credit] of credits) {
        if (m === model) {
          const r = row(ch);
          if (c.type === 'purchase') {
            r.orders += credit;
            r.revenue += credit * c.value;
          } else if (LEAD_TYPES.includes(c.type)) {
            r[c.type] += credit;
          }
        }
        if (c.type === 'purchase') {
          const cm = (compare[m][ch] ||= { orders: 0, revenue: 0 });
          cm.orders += credit;
          cm.revenue += credit * c.value;
        }
      }
    }
  }

  const spendRows = db.prepare(`SELECT channel, SUM(spend) spend, SUM(platform_conversions) pc, SUM(platform_revenue) pr
      FROM spend WHERE date >= ? AND date <= ? GROUP BY channel`).all(from, to);
  for (const s of spendRows) {
    const r = row(s.channel);
    r.spend = s.spend;
    r.platform_conversions = s.pc;
    r.platform_revenue = s.pr;
  }

  const result = [...rows.values()].map((r) => {
    const leads = r.form + r.whatsapp + r.call;
    return {
      ...r,
      leads,
      roas: r.spend ? r.revenue / r.spend : null,
      platform_roas: r.spend && r.platform_revenue ? r.platform_revenue / r.spend : null,
      cost_per_order: r.spend && r.orders ? r.spend / r.orders : null,
      cost_per_lead: r.spend && leads ? r.spend / leads : null,
      overclaim: r.platform_revenue ? r.platform_revenue - r.revenue : null,
    };
  }).sort((a, b) => (b.revenue - a.revenue) || (b.leads - a.leads) || (b.spend - a.spend));

  const spend = result.reduce((a, r) => a + r.spend, 0);
  const claimed = result.reduce((a, r) => a + r.platform_revenue, 0);
  const leads = totals.form + totals.whatsapp + totals.call;
  return {
    params: { from, to, model, windowDays },
    totals: {
      ...totals,
      leads,
      spend,
      platform_revenue: claimed,
      claim_gap: claimed ? claimed - totals.revenue : null,
      roas: spend ? totals.revenue / spend : null,
      cost_per_order: spend && totals.orders ? spend / totals.orders : null,
      cost_per_lead: spend && leads ? spend / leads : null,
    },
    rows: result,
    compare,
  };
}

/** Most recent conversions with the path that led to them. */
export function buildJourneys(db, params, limit = 50) {
  const { conversions, byVisitor } = loadData(db, params);
  return conversions.slice(-limit).reverse().map((c) => {
    const tps = (c.visitor_id && byVisitor.get(c.visitor_id)) || [];
    const credits = attribute(tps, c.ts, { model: params.model, windowDays: params.windowDays });
    return {
      ts: c.ts,
      type: c.type,
      value: c.value,
      order_id: c.order_id,
      path: eligiblePath(tps, c.ts, params.windowDays).map((tp) => ({ ts: tp.ts, channel: tp.channel, campaign: tp.campaign })),
      credits: Object.fromEntries(credits),
    };
  });
}
