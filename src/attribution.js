// Attribution models: split credit for one conversion across the touchpoints
// that preceded it. Every model returns credits that sum to 1.

import { DAY } from './config.js';

export const MODELS = {
  last_non_direct: 'آخر نقرة (غير مباشرة)',
  last_click: 'آخر نقرة',
  first_click: 'أول نقرة',
  linear: 'خطي (بالتساوي)',
  time_decay: 'تناقص زمني',
  position_based: 'حسب الموقع (40/20/40)',
};

export const DEFAULT_MODEL = 'last_non_direct';
export const UNATTRIBUTED = 'direct';

function weights(path, convTs, model, halfLifeDays) {
  const n = path.length;
  switch (model) {
    case 'first_click':
      return path.map((_, i) => (i === 0 ? 1 : 0));
    case 'linear':
      return path.map(() => 1 / n);
    case 'time_decay': {
      const raw = path.map((tp) => 2 ** (-(convTs - tp.ts) / (halfLifeDays * DAY)));
      const sum = raw.reduce((a, b) => a + b, 0);
      return raw.map((w) => w / sum);
    }
    case 'position_based':
      if (n === 1) return [1];
      if (n === 2) return [0.5, 0.5];
      return path.map((_, i) => (i === 0 || i === n - 1 ? 0.4 : 0.2 / (n - 2)));
    case 'last_click':
    default:
      return path.map((_, i) => (i === n - 1 ? 1 : 0));
  }
}

/** Touchpoints inside the lookback window, oldest first. */
export function eligiblePath(touchpoints, convTs, windowDays) {
  const from = convTs - windowDays * DAY;
  return touchpoints
    .filter((tp) => tp.ts <= convTs && tp.ts >= from)
    .sort((a, b) => a.ts - b.ts);
}

const UNATTRIBUTED_TP = Object.freeze({ channel: UNATTRIBUTED, campaign: '', content: '' });

/**
 * Credit per touchpoint, so campaigns and creatives can be attributed too.
 * @param touchpoints [{ts, channel, ...}] for the converting customer
 * @returns [{tp, credit}] with credits summing to 1
 */
export function attributeTouchpoints(touchpoints, convTs, { model = DEFAULT_MODEL, windowDays = 30, halfLifeDays = 7 } = {}) {
  let path = eligiblePath(touchpoints, convTs, windowDays);
  if (model === 'last_non_direct') {
    const nonDirect = path.filter((tp) => tp.channel !== 'direct');
    path = nonDirect.length ? nonDirect : path;
  }
  if (!path.length) return [{ tp: UNATTRIBUTED_TP, credit: 1 }];
  const w = weights(path, convTs, model, halfLifeDays);
  return path.map((tp, i) => ({ tp, credit: w[i] })).filter((x) => x.credit > 0);
}

/** @returns Map<channel, credit> */
export function attribute(touchpoints, convTs, opts) {
  const credits = new Map();
  for (const { tp, credit } of attributeTouchpoints(touchpoints, convTs, opts)) {
    credits.set(tp.channel, (credits.get(tp.channel) || 0) + credit);
  }
  return credits;
}
