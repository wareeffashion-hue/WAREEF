import { h, fmt, kpi, card, table, label } from '../ui.js';
import { lineChart } from '../charts.js';
import { pageHead } from './common.js';

const METRICS = {
  revenue: ['المبيعات', fmt.money],
  orders: ['الطلبات', fmt.int],
  spend: ['الإنفاق', fmt.money],
  roas: ['ROAS', fmt.ratio],
  leads: ['التواصل', fmt.int],
  sessions: ['الزيارات', fmt.int],
  new_customers: ['عملاء جدد', fmt.int],
};
const PAID = ['google', 'tiktok', 'meta', 'snapchat'];

export default async function analytics(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/analytics?${ctx.query()}`);
  let metric = 'revenue';
  const chartBox = h('div');
  const tabs = h('div', { class: 'seg' });

  function drawMetric() {
    const [name, format] = METRICS[metric];
    tabs.replaceChildren(...Object.entries(METRICS).map(([k, [n]]) => h('button', { class: k === metric ? 'active' : '', onclick: () => { metric = k; drawMetric(); } }, n)));
    chartBox.replaceChildren(lineChart({
      labels: r.series.map((d) => d.date),
      series: [
        { key: 'cur', label: `${name} (الفترة الحالية)`, color: 'var(--series-a)', values: r.series.map((d) => d[metric]) },
        { key: 'prev', label: 'الفترة السابقة', color: 'var(--muted)', dashed: true, values: r.previous_series.map((d) => d[metric]).slice(0, r.series.length) },
      ],
      format: metric === 'roas' ? (v) => fmt.ratio(v) : fmt.compact,
      tooltipFormat: format,
    }));
  }
  drawMetric();

  // Attributed revenue per paid channel per day (other channels folded).
  const days = r.series.map((d) => d.date);
  const channelSeries = PAID.filter((c) => r.byChannel[c]).map((c) => ({
    key: c, label: label(c), color: `var(--ch-${c})`, values: days.map((d) => r.byChannel[c][d] || 0),
  }));

  const c = r.current;
  const tbl = table({
    exportName: 'daily',
    columns: [
      { key: 'date', label: 'اليوم', render: (d) => fmt.day(d.date) },
      { key: 'revenue', label: 'المبيعات', num: true, strong: true, render: (d) => fmt.money(d.revenue) },
      { key: 'orders', label: 'الطلبات', num: true },
      { key: 'leads', label: 'التواصل', num: true },
      { key: 'sessions', label: 'الزيارات', num: true },
      { key: 'spend', label: 'الإنفاق', num: true, render: (d) => fmt.money(d.spend) },
      { key: 'roas', label: 'ROAS', num: true, render: (d) => fmt.ratio(d.roas) },
      { key: 'platform_revenue', label: 'تدّعيه المنصات', num: true, render: (d) => fmt.money(d.platform_revenue) },
      { key: 'new_customers', label: 'عملاء جدد', num: true },
    ],
    rows: [...r.series].reverse(),
  });

  return h('div', { class: 'view' },
    pageHead('التحليلات', 'تطوّر كل مقياس يوماً بيوم، مقارنةً بفترة سابقة مساوية في الطول'),
    h('div', { class: 'kpis' },
      kpi({ label: 'الزيارات', value: fmt.int(c.sessions), change: r.change.sessions, sub: `${fmt.int(c.visitors)} زائر فريد` }),
      kpi({ label: 'معدل التحويل', value: fmt.pct(c.conversion_rate), change: r.change.conversion_rate }),
      kpi({ label: 'متوسط الطلب', value: fmt.money(c.aov), change: r.change.aov }),
      kpi({ label: 'مرات الظهور', value: fmt.compact(c.impressions), change: r.change.impressions, sub: `${fmt.compact(c.clicks)} نقرة` }),
      kpi({ label: 'تكلفة التواصل', value: fmt.money2(c.cpl), change: r.change.cpl, invert: true })),
    card({ title: 'الاتجاه اليومي', actions: tabs }, chartBox),
    card({ title: 'المبيعات المنسوبة لكل منصة يومياً', sub: 'حسب نموذج الإسناد المختار' },
      channelSeries.length ? lineChart({ labels: days, series: channelSeries, tooltipFormat: fmt.money }) : h('div', { class: 'empty' }, 'لا توجد مبيعات منسوبة إلى المنصات المدفوعة في هذه الفترة')),
    card({ title: 'الجدول اليومي', actions: h('button', { class: 'btn ghost sm', onclick: () => tbl.exportCsv() }, 'تصدير CSV') }, tbl));
}
