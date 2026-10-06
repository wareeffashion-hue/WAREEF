import { h, fmt, kpi, card, table, delta, exportButton, setCurrency } from '../ui.js';
import { pageHead } from './common.js';

export default async function agency(ctx) {
  const list = await ctx.api.get(`/api/agency?${ctx.query()}`);
  setCurrency(list[0]?.currency);
  const sum = (k, which = 'current') => list.reduce((a, w) => a + (w[which][k] || 0), 0);
  const revenue = sum('revenue');
  const prevRevenue = sum('revenue', 'previous');
  const spend = sum('spend');
  const prevSpend = sum('spend', 'previous');
  const claimed = sum('platform_revenue');
  const ch = (a, b) => (b ? (a - b) / b : null);

  const rows = list.map((w) => ({ ...w.current, id: w.id, name: w.name, change: w.change }));
  const tbl = table({
    exportName: 'agency',
    sortKey: 'revenue',
    columns: [
      { key: 'name', label: 'العميل', render: (r) => h('a', { href: `#/w/${r.id}/overview` }, r.name) },
      { key: 'revenue', label: 'المبيعات الفعلية', num: true, strong: true, render: (r) => h('span', {}, fmt.money(r.revenue), ' ', delta(r.change.revenue)) },
      { key: 'orders', label: 'الطلبات', num: true, render: (r) => fmt.int(r.orders) },
      { key: 'leads', label: 'التواصل', num: true, render: (r) => fmt.int(r.leads) },
      { key: 'spend', label: 'الإنفاق', num: true, render: (r) => h('span', {}, fmt.money(r.spend), ' ', delta(r.change.spend, true)) },
      { key: 'roas', label: 'ROAS الحقيقي', num: true, strong: true, render: (r) => h('span', {}, fmt.ratio(r.roas), ' ', delta(r.change.roas)) },
      { key: 'platform_revenue', label: 'تدّعيه المنصات', num: true, render: (r) => (r.platform_revenue ? fmt.money(r.platform_revenue) : '—') },
      { key: 'claim_gap', label: 'الفجوة', num: true, cls: (r) => (r.claim_gap > 0 ? 'over' : ''), render: (r) => (r.claim_gap == null ? '—' : fmt.money(r.claim_gap)) },
      { key: 'cpa', label: 'تكلفة الطلب', num: true, render: (r) => fmt.money2(r.cpa) },
      { key: 'conversion_rate', label: 'معدل التحويل', num: true, render: (r) => fmt.pct(r.conversion_rate) },
    ],
    rows,
  });

  return h('div', { class: 'view' },
    pageHead('لوحة الوكالة', `أداء جميع عملائك في مكان واحد · ${list.length} عميل · مقارنة بالفترة السابقة المماثلة`),
    h('div', { class: 'kpis' },
      kpi({ label: 'المبيعات الفعلية (جميع العملاء)', value: fmt.money(revenue), change: ch(revenue, prevRevenue), sub: `${fmt.int(sum('orders'))} طلب` }),
      kpi({ label: 'الإنفاق الإعلاني', value: fmt.money(spend), change: ch(spend, prevSpend), invert: true }),
      kpi({ label: 'ROAS الحقيقي', value: fmt.ratio(spend ? revenue / spend : null), change: ch(spend ? revenue / spend : 0, prevSpend ? prevRevenue / prevSpend : 0) }),
      kpi({ label: 'ما تدّعيه المنصات', value: claimed ? fmt.money(claimed) : '—', sub: claimed ? `تضخيم بنسبة ${fmt.pct((claimed - revenue) / revenue)} فوق المبيعات الفعلية` : 'اربط المنصات لعرض ادعاءاتها', tone: claimed > revenue ? 'alert' : '' }),
      kpi({ label: 'التواصل', value: fmt.int(sum('leads')), sub: `${fmt.int(sum('whatsapp'))} واتساب · ${fmt.int(sum('form'))} نموذج · ${fmt.int(sum('call'))} اتصال` })),
    card({ title: 'العملاء', sub: 'انقر اسم أي عميل لفتح لوحته', actions: exportButton(tbl) }, tbl));
}
