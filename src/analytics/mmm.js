// Lightweight marketing mix model. Daily store revenue is regressed on each
// channel's spend after two transforms:
//   adstock:    a_t = x_t + decay * a_{t-1}   (ads keep working after the day they run)
//   saturation: s = a / (a + K)               (diminishing returns; K = mean adstock)
// plus an intercept and day-of-week effects (the organic baseline). Decays are
// picked per channel by grid search; media coefficients are kept non-negative.
// It needs no click tracking at all, so it is an independent check on the
// attribution numbers.
import { PAID_CHANNELS } from '../channels.js';
import { addDays, DAY, dayStart, daysBetween, tzOffsetMs } from '../config.js';
import { ACTIVE_ORDER } from './dataset.js';

const DECAYS = [0, 0.3, 0.5, 0.7];
const MIN_DAYS = 28;

/**
 * Geometric adstock. The carry starts at the steady state of the first week's
 * average spend, so the series doesn't "warm up" from zero (which the model
 * would otherwise mistake for a sales effect).
 */
export function adstock(xs, decay, { warmStart = true } = {}) {
  const out = new Array(xs.length);
  const head = xs.slice(0, 7);
  let carry = warmStart && head.length && decay ? (head.reduce((a, b) => a + b, 0) / head.length) / (1 - decay) : 0;
  for (let i = 0; i < xs.length; i++) {
    carry = xs[i] + decay * carry;
    out[i] = carry;
  }
  return out;
}

/** Solves (X'X + λI) b = X'y by Gaussian elimination. The intercept (col 0) is not penalised. */
export function ridge(X, y, lambda = 1e-6) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (let r = 0; r < X.length; r++) {
    const row = X[r];
    for (let i = 0; i < p; i++) {
      A[i][p] += row[i] * y[r];
      for (let j = i; j < p; j++) A[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < i; j++) A[i][j] = A[j][i];
    if (i > 0) A[i][i] += lambda * X.length;
  }
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      if (f) for (let c = col; c <= p; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[p] / row[i]));
}

function rSquared(y, yhat) {
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < y.length; i++) {
    ssRes += (y[i] - yhat[i]) ** 2;
    ssTot += (y[i] - mean) ** 2;
  }
  return ssTot ? 1 - ssRes / ssTot : 0;
}

function fit(days, revenue, spendBy, channels, decays) {
  const K = {};
  const sat = {};
  for (const ch of channels) {
    const a = adstock(spendBy[ch], decays[ch]);
    const nonZero = a.filter((v) => v > 0);
    K[ch] = nonZero.length ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 1;
    sat[ch] = a.map((v) => v / (v + K[ch]));
  }
  const dow = days.map((d) => new Date(`${d}T00:00:00Z`).getUTCDay());
  let active = [...channels];
  for (;;) {
    // Scale media columns to revenue units so the ridge penalty is comparable.
    const scale = Math.max(...revenue, 1);
    const X = days.map((_, t) => [1, ...[1, 2, 3, 4, 5, 6].map((k) => (dow[t] === k ? 1 : 0)), ...active.map((ch) => sat[ch][t] * scale)]);
    const b = ridge(X, revenue, 1e-4);
    const media = active.map((ch, i) => ({ ch, beta: b[7 + i] * scale }));
    const negative = media.filter((m) => m.beta < 0).map((m) => m.ch);
    if (negative.length && active.length) {
      active = active.filter((ch) => !negative.includes(ch));
      continue;
    }
    const yhat = X.map((row) => row.reduce((s, v, i) => s + v * b[i], 0));
    return { b, beta: Object.fromEntries(media.map((m) => [m.ch, m.beta])), K, sat, yhat, r2: rSquared(revenue, yhat), active };
  }
}

function* grid(channels) {
  const idx = channels.map(() => 0);
  for (;;) {
    yield Object.fromEntries(channels.map((ch, i) => [ch, DECAYS[idx[i]]]));
    let i = 0;
    while (i < idx.length && ++idx[i] === DECAYS.length) idx[i++] = 0;
    if (i === idx.length) return;
  }
}

/** Expected daily revenue from a channel at a steady daily spend. */
function response(beta, K, decay, dailySpend) {
  const a = dailySpend / (1 - decay);
  return beta * (a / (a + K));
}

export function mmmReport(db, ws, { to, days: lookback = 90 }) {
  const from = addDays(to, -(lookback - 1));
  const days = daysBetween(from, to);
  const revenue = Object.fromEntries(days.map((d) => [d, 0]));
  const off = tzOffsetMs();
  for (const r of db.prepare(`SELECT date((ts + ?) / 1000, 'unixepoch') d, SUM(value) v FROM conversions
      WHERE workspace_id = ? AND type = 'purchase' AND ${ACTIVE_ORDER} AND ts >= ? AND ts < ? GROUP BY d`)
    .all(off, ws.id, dayStart(from), dayStart(to) + DAY)) {
    if (r.d in revenue) revenue[r.d] = r.v;
  }
  const spendBy = {};
  for (const r of db.prepare(`SELECT date, channel, SUM(spend) s FROM spend WHERE workspace_id = ? AND date >= ? AND date <= ? GROUP BY date, channel`)
    .all(ws.id, from, to)) {
    (spendBy[r.channel] ||= Object.fromEntries(days.map((d) => [d, 0])))[r.date] = r.s;
  }
  const y = days.map((d) => revenue[d]);
  const daysWithData = days.filter((d) => revenue[d] > 0).length;
  const channels = Object.keys(spendBy)
    .filter((ch) => PAID_CHANNELS.includes(ch) || ch === 'other')
    .filter((ch) => days.filter((d) => spendBy[ch][d] > 0).length >= days.length * 0.3)
    .slice(0, 6);
  const base = { params: { from, to, days: lookback }, days_with_data: daysWithData, channels: [] };
  if (daysWithData < MIN_DAYS || !channels.length) {
    return { ...base, ready: false, reason: `يحتاج النموذج ${MIN_DAYS} يوم على الأقل من المبيعات والصرف (المتوفر ${daysWithData} يوم)` };
  }
  const series = Object.fromEntries(channels.map((ch) => [ch, days.map((d) => spendBy[ch][d])]));

  let best = null;
  for (const decays of grid(channels)) {
    const f = fit(days, y, series, channels, decays);
    if (!best || f.r2 > best.r2) best = { ...f, decays };
  }

  const n = days.length;
  const baselineDaily = best.yhat.map((v, t) => v - best.active.reduce((s, ch) => s + best.beta[ch] * best.sat[ch][t], 0));
  const rows = channels.map((ch) => {
    const spend = series[ch].reduce((a, b) => a + b, 0);
    const beta = best.beta[ch] || 0;
    const contribution = beta ? best.sat[ch].reduce((s, v) => s + beta * v, 0) : 0;
    const avgDaily = spend / n;
    const eps = Math.max(avgDaily * 0.01, 1);
    const marginal = beta
      ? (response(beta, best.K[ch], best.decays[ch], avgDaily + eps) - response(beta, best.K[ch], best.decays[ch], avgDaily)) / eps
      : 0;
    return {
      channel: ch, spend, avg_daily_spend: avgDaily, contribution, roi: spend ? contribution / spend : null,
      marginal_roas: marginal, decay: best.decays[ch], saturation_point: best.K[ch] * (1 - best.decays[ch]),
      significant: beta > 0,
    };
  });

  // Budget optimizer: the budget of channels with a measurable effect is
  // moved in small steps to the best marginal return, within 0.5x-2x of each
  // channel's current spend (beyond that the model would be extrapolating).
  // Channels without a measurable effect keep their spend: the model can't
  // say anything about them, which is not the same as "they do nothing".
  const total = rows.reduce((a, r) => a + r.avg_daily_spend, 0);
  const movable = rows.filter((r) => r.significant);
  const alloc = Object.fromEntries(rows.map((r) => [r.channel, r.significant ? r.avg_daily_spend * 0.5 : r.avg_daily_spend]));
  const cap = Object.fromEntries(rows.map((r) => [r.channel, r.avg_daily_spend * 2]));
  const resp = (ch, x) => response(best.beta[ch] || 0, best.K[ch], best.decays[ch], x);
  let remaining = movable.reduce((a, r) => a + r.avg_daily_spend * 0.5, 0);
  const step = Math.max(total / 400, 0.01);
  while (remaining > 1e-9) {
    const s = Math.min(step, remaining);
    let bestCh = null;
    let bestGain = -Infinity;
    for (const r of movable) {
      if (alloc[r.channel] + s > cap[r.channel] + 1e-9) continue;
      const gain = resp(r.channel, alloc[r.channel] + s) - resp(r.channel, alloc[r.channel]);
      if (gain > bestGain) { bestGain = gain; bestCh = r.channel; }
    }
    if (!bestCh) break;
    alloc[bestCh] += s;
    remaining -= s;
  }
  const currentRevenue = rows.reduce((a, r) => a + resp(r.channel, r.avg_daily_spend), 0);
  const optimizedRevenue = rows.reduce((a, r) => a + resp(r.channel, alloc[r.channel]), 0);

  return {
    ...base,
    ready: true,
    // Below this the model explains too little of daily revenue to act on.
    reliable: best.r2 >= 0.5 && movable.length > 0 && baselineDaily.reduce((a, b) => a + b, 0) >= 0,
    r2: best.r2,
    mape: y.reduce((a, v, i) => a + (v ? Math.abs(v - best.yhat[i]) / v : 0), 0) / Math.max(daysWithData, 1),
    baseline: baselineDaily.reduce((a, b) => a + b, 0),
    revenue: y.reduce((a, b) => a + b, 0),
    channels: rows.map((r) => ({ ...r, recommended_daily_spend: alloc[r.channel] })),
    budget: {
      daily_total: total,
      current_daily_media_revenue: currentRevenue,
      optimized_daily_media_revenue: optimizedRevenue,
      lift: currentRevenue ? (optimizedRevenue - currentRevenue) / currentRevenue : null,
    },
    fit: days.map((d, i) => ({ date: d, actual: y[i], predicted: best.yhat[i], baseline: baselineDaily[i] })),
  };
}
