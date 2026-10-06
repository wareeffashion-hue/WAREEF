// SVG charts: multi-series line with crosshair tooltip, and labelled bars.
// One y-axis per chart, always. Series colors follow the entity (CSS vars).
import { h, s, fmt } from './ui.js';

function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/**
 * series: [{key, label, color, values: number[], dashed?}] over shared x labels.
 * opts: {labels: string[], format, height, labelFormat}
 */
export function lineChart({ series, labels, format = fmt.compact, tooltipFormat = format, height = 240, labelFormat = fmt.day }) {
  const W = 760;
  const H = height;
  const pad = { t: 14, r: 92, b: 28, l: 52 };
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((x) => x.values.filter((v) => v != null)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': series.map((x) => x.label).join('، ') });
  for (const t of ticks) {
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis' : 'grid' }));
    svg.append(s('text', { x: pad.l - 8, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' }, format(t)));
  }
  const every = Math.max(1, Math.ceil(n / 7));
  labels.forEach((l, i) => {
    if (i % every === 0 || i === n - 1) svg.append(s('text', { x: x(i), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, labelFormat(l)));
  });

  const ends = [];
  for (const ser of series) {
    let d = '';
    ser.values.forEach((v, i) => { if (v != null) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    svg.append(s('path', { d, class: `line ${ser.dashed ? 'dashed' : ''}`, style: `stroke:${ser.color}` }));
    const lastIdx = ser.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
    if (lastIdx != null) ends.push({ ser, yv: y(ser.values[lastIdx]), xv: x(lastIdx) });
  }
  // Direct labels at line ends, nudged apart so they never overlap.
  ends.sort((a, b) => a.yv - b.yv);
  for (let i = 1; i < ends.length; i++) if (ends[i].yv - ends[i - 1].yv < 14) ends[i].yv = ends[i - 1].yv + 14;
  for (const e of ends) {
    svg.append(s('circle', { cx: e.xv, cy: y(e.ser.values[e.ser.values.length - 1] ?? 0), r: 3, style: `fill:${e.ser.color}`, class: 'end-dot' }));
    svg.append(s('text', { x: e.xv + 8, y: e.yv + 4, class: 'end-label' }, e.ser.label));
  }

  // Crosshair + tooltip.
  const cross = s('line', { y1: pad.t, y2: H - pad.b, class: 'crosshair', visibility: 'hidden' });
  const dots = series.map((ser) => s('circle', { r: 4.5, class: 'hover-dot', style: `fill:${ser.color}`, visibility: 'hidden' }));
  svg.append(cross, ...dots);
  const tip = h('div', { class: 'tooltip', hidden: true });
  const hit = s('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, class: 'hit' });
  svg.append(hit);
  const wrap = h('div', { class: 'chart-wrap' }, svg, tip);
  const move = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    series.forEach((ser, k) => {
      const v = ser.values[i];
      dots[k].setAttribute('visibility', v == null ? 'hidden' : 'visible');
      if (v != null) { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); }
    });
    tip.replaceChildren(h('div', { class: 'tip-title' }, labelFormat(labels[i])),
      ...series.map((ser) => h('div', { class: 'tip-row' }, h('span', { class: 'dot', style: { background: ser.color } }), h('span', {}, ser.label), h('strong', {}, tooltipFormat(ser.values[i])))));
    tip.hidden = false;
    const left = (x(i) / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left, 90), rect.width - 90)}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => {
    tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
  });
  return h('div', {}, wrap, series.length > 1 ? legend(series) : null);
}

export const legend = (series) => h('div', { class: 'legend' }, series.map((ser) =>
  h('span', {}, h('i', { class: `sw ${ser.dashed ? 'dashed' : ''}`, style: { background: ser.dashed ? 'transparent' : ser.color, borderColor: ser.color } }), ser.label)));

/**
 * Horizontal bars with labels and values (rank / distribution / funnel).
 * items: [{label, value, color?, sub?}]
 */
export function barList({ items, format = fmt.int, max }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return h('div', { class: 'barlist' }, items.map((it) => h('div', { class: 'barlist-row', title: `${it.label}: ${format(it.value)}` },
    h('div', { class: 'barlist-label' }, it.label),
    h('div', { class: 'barlist-track' }, h('div', { class: 'barlist-fill', style: { width: `${(it.value / top) * 100}%`, background: it.color || 'var(--accent)' } })),
    h('div', { class: 'barlist-value' }, format(it.value), it.sub ? h('span', { class: 'muted' }, ` ${it.sub}`) : null))));
}

/** Two bars per row (e.g. actual vs platform-claimed). */
export function pairedBars({ rows, a, b, format = fmt.money }) {
  const top = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return h('div', { class: 'paired' }, rows.map((r) => h('div', { class: 'paired-row' },
    h('div', { class: 'paired-label' }, r.label),
    h('div', { class: 'paired-bars' },
      h('div', { class: 'paired-line', title: `${a}: ${format(r.a)}` }, h('div', { class: 'bar a', style: { width: `${(r.a / top) * 62}%` } }), h('span', {}, format(r.a))),
      h('div', { class: 'paired-line', title: `${b}: ${format(r.b)}` }, h('div', { class: 'bar b', style: { width: `${(r.b / top) * 62}%` } }), h('span', {}, format(r.b)), r.note || null)))),
  h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'sw', style: { background: 'var(--series-a)' } }), a), h('span', {}, h('i', { class: 'sw', style: { background: 'var(--series-b)' } }), b)));
}
