// Shared UI helpers: DOM builder, formatters, labels, tables, KPI tiles.

export const CHANNEL_LABELS = {
  google: 'جوجل', meta: 'ميتا', snapchat: 'سناب شات', tiktok: 'تيك توك', x: 'إكس',
  organic_search: 'بحث عضوي', organic_social: 'سوشال عضوي', email: 'بريد', referral: 'إحالة',
  direct: 'مباشر / غير معروف', other: 'أخرى',
};
export const TYPE_LABELS = { purchase: 'طلب', form: 'نموذج', whatsapp: 'واتساب', call: 'اتصال' };
export const DEVICE_LABELS = { mobile: 'جوال', desktop: 'كمبيوتر', tablet: 'تابلت' };
export const label = (ch) => CHANNEL_LABELS[ch] || ch;

/** Tiny DOM builder. All text goes through text nodes (campaign names come from URLs). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// ------------------------------------------------------------ formatting
let currency = 'SAR';
export const setCurrency = (c) => { currency = c || 'SAR'; };
const CURRENCY_SYMBOL = { SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع', USD: '$', EGP: 'ج.م' };
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const fmt = {
  int: (v) => (v == null ? '—' : nf0.format(v)),
  num: (v) => (v == null ? '—' : Math.abs(v - Math.round(v)) < 0.05 ? nf0.format(v) : nf1.format(v)),
  money: (v) => (v == null ? '—' : `${nf0.format(v)} ${CURRENCY_SYMBOL[currency] || currency}`),
  money2: (v) => (v == null ? '—' : `${nf2.format(v)} ${CURRENCY_SYMBOL[currency] || currency}`),
  compact: (v) => {
    if (v == null) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return `${nf1.format(v / 1e6)}M`;
    if (a >= 1e3) return `${nf1.format(v / 1e3)}K`;
    return nf0.format(v);
  },
  ratio: (v) => (v == null ? '—' : `${nf2.format(v)}x`),
  pct: (v) => (v == null ? '—' : `${nf1.format(v * 100)}%`),
  date: (ts) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium' }).format(new Date(ts)),
  datetime: (ts) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts)),
  day: (d) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)),
};

export const dot = (ch) => h('span', { class: 'dot', style: { background: `var(--ch-${ch}, var(--ch-other))` } });
export const channelCell = (ch) => h('span', { class: 'ch' }, dot(ch), label(ch));

/** Change badge: up/down vs previous period. `invert` for costs (down is good). */
export function delta(change, invert = false) {
  if (change == null || !Number.isFinite(change)) return null;
  const good = invert ? change < 0 : change > 0;
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '';
  return h('span', { class: `delta ${Math.abs(change) < 0.005 ? '' : good ? 'up' : 'down'}`, title: 'مقارنة بالفترة السابقة' }, `${arrow} ${fmt.pct(Math.abs(change))}`);
}

export function kpi({ label: lbl, value, sub, change, invert, tone, hint }) {
  return h('div', { class: `kpi ${tone || ''}`, title: hint || null },
    h('div', { class: 'kpi-label' }, lbl),
    h('div', { class: 'kpi-value' }, value, delta(change, invert)),
    sub ? h('div', { class: 'kpi-sub' }, sub) : null);
}

export const card = ({ title, sub, actions, cls }, ...body) => h('section', { class: `card ${cls || ''}` },
  (title || actions) ? h('div', { class: 'card-head' },
    h('div', {}, title ? h('h2', {}, title) : null, sub ? h('p', {}, sub) : null),
    actions ? h('div', { class: 'card-actions' }, actions) : null) : null,
  body);

export const empty = (text) => h('div', { class: 'empty' }, text);

/**
 * Sortable table with optional totals row and CSV export.
 * columns: [{key, label, render?(row), value?(row), num?, strong?, csv?(row)}]
 */
export function table({ columns, rows, totals, sortKey, sortDir = 'desc', exportName, emptyText = 'لا توجد بيانات في هذه الفترة' }) {
  const wrap = h('div', { class: 'table-block' });
  let key = sortKey;
  let dir = sortDir;
  const val = (c, r) => (c.value ? c.value(r) : r[c.key]);
  function draw() {
    const sorted = key ? [...rows].sort((a, b) => {
      const c = columns.find((x) => x.key === key);
      const va = val(c, a); const vb = val(c, b);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va ?? '').localeCompare(String(vb ?? ''), 'ar') : (va ?? -Infinity) - (vb ?? -Infinity);
      return dir === 'asc' ? cmp : -cmp;
    }) : rows;
    const head = h('tr', {}, columns.map((c) => h('th', {
      class: `${c.num ? 'num' : ''} sortable ${key === c.key ? `sorted ${dir}` : ''}`,
      onclick: () => { if (key === c.key) dir = dir === 'asc' ? 'desc' : 'asc'; else { key = c.key; dir = c.num ? 'desc' : 'asc'; } draw(); },
      scope: 'col',
    }, c.label)));
    const body = sorted.length ? sorted.map((r) => h('tr', {}, columns.map((c) => h('td', { class: `${c.num ? 'num' : ''} ${c.strong ? 'strong' : ''} ${c.cls ? c.cls(r) : ''}` },
      c.render ? c.render(r) : (val(c, r) ?? '—'))))) : [h('tr', {}, h('td', { colspan: columns.length, class: 'empty' }, emptyText))];
    const foot = totals ? h('tfoot', {}, h('tr', {}, columns.map((c, i) => h('td', { class: `${c.num ? 'num' : ''} ${c.cls && totals ? c.cls(totals) : ''}` },
      i === 0 ? 'الإجمالي' : c.total === false ? '' : (c.render ? c.render(totals) : (val(c, totals) ?? '')))))) : null;
    wrap.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, head), h('tbody', {}, body), foot)));
  }
  draw();
  if (exportName) {
    wrap.exportCsv = () => {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [columns.map((c) => esc(c.label)).join(',')];
      for (const r of rows) lines.push(columns.map((c) => esc(c.csv ? c.csv(r) : val(c, r))).join(','));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `${exportName}.csv` });
      document.body.append(a); a.click(); a.remove();
    };
  }
  return wrap;
}

export const exportButton = (tbl) => h('button', { class: 'btn ghost sm', onclick: () => tbl.exportCsv() }, 'تصدير CSV');

export function toast(text, tone = '') {
  const el = h('div', { class: `toast ${tone}`, role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

export async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent; btn.textContent = 'تم النسخ ✓'; setTimeout(() => { btn.textContent = old; }, 1500);
  } catch { toast('ما قدرت أنسخ، انسخ يدوياً', 'bad'); }
}

/** Horizontal share bar, used inside table cells. */
export const shareBar = (value, max, ch) => h('div', { class: 'share' },
  h('div', { class: 'share-fill', style: { width: `${max ? Math.max((value / max) * 100, value ? 1.5 : 0) : 0}%`, background: ch ? `var(--ch-${ch}, var(--ch-other))` : 'var(--accent)' } }));
