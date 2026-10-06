import { h, fmt, channelCell, label } from '../ui.js';

export const modelName = (ctx, params) => ctx.state.meta.models[params.model];

const diffClass = (r) => (r.overclaim == null ? 'muted' : r.overclaim > 0 ? 'over' : 'under');

/** Columns shared by channel / campaign / creative tables. */
export function attributionColumns({ first, leads = true, platform = true, delivery = false }) {
  const cols = [...first,
    { key: 'orders', label: 'الطلبات', num: true, render: (r) => fmt.num(r.orders) },
    { key: 'revenue', label: 'المبيعات المنسوبة', num: true, strong: true, render: (r) => fmt.money(r.revenue) },
  ];
  if (platform) {
    cols.push(
      { key: 'platform_revenue', label: 'تدّعيه المنصة', num: true, render: (r) => (r.platform_revenue ? fmt.money(r.platform_revenue) : '—') },
      { key: 'overclaim', label: 'الفرق', num: true, cls: diffClass, render: (r) => (r.overclaim == null ? '—' : `${r.overclaim > 0 ? '+' : ''}${fmt.money(r.overclaim)}`) },
    );
  }
  if (leads) {
    cols.push(
      { key: 'form', label: 'نماذج', num: true, render: (r) => fmt.num(r.form) },
      { key: 'whatsapp', label: 'واتساب', num: true, render: (r) => fmt.num(r.whatsapp) },
      { key: 'call', label: 'اتصال', num: true, render: (r) => fmt.num(r.call) },
    );
  }
  if (delivery) {
    cols.push(
      { key: 'impressions', label: 'الظهور', num: true, render: (r) => (r.impressions ? fmt.compact(r.impressions) : '—') },
      { key: 'ctr', label: 'CTR', num: true, render: (r) => fmt.pct(r.ctr) },
    );
  }
  cols.push(
    { key: 'spend', label: 'الصرف', num: true, render: (r) => (r.spend ? fmt.money(r.spend) : '—') },
    { key: 'roas', label: 'ROAS الحقيقي', num: true, strong: true, render: (r) => fmt.ratio(r.roas) },
  );
  if (platform) cols.push({ key: 'platform_roas', label: 'ROAS المنصة', num: true, cls: () => 'muted', render: (r) => fmt.ratio(r.platform_roas) });
  cols.push(
    { key: 'cpa', label: 'تكلفة الطلب', num: true, render: (r) => fmt.money2(r.cpa) },
    { key: 'cpl', label: 'تكلفة التواصل', num: true, render: (r) => fmt.money2(r.cpl) },
  );
  return cols;
}

export const channelColumn = { key: 'channel', label: 'المصدر', value: (r) => label(r.channel), render: (r) => channelCell(r.channel), csv: (r) => label(r.channel) };

/** Totals row computed from rows (sums + derived ratios). */
export function sumRows(rows) {
  const t = { orders: 0, revenue: 0, platform_revenue: 0, form: 0, whatsapp: 0, call: 0, spend: 0, impressions: 0, clicks: 0 };
  for (const r of rows) for (const k of Object.keys(t)) t[k] += r[k] || 0;
  const leads = t.form + t.whatsapp + t.call;
  return {
    ...t, channel: '', leads,
    overclaim: t.platform_revenue ? t.platform_revenue - t.revenue : null,
    roas: t.spend ? t.revenue / t.spend : null,
    platform_roas: t.spend && t.platform_revenue ? t.platform_revenue / t.spend : null,
    cpa: t.spend && t.orders ? t.spend / t.orders : null,
    cpl: t.spend && leads ? t.spend / leads : null,
    ctr: t.impressions ? t.clicks / t.impressions : null,
  };
}

export const pageHead = (title, sub, actions) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), actions || null);
