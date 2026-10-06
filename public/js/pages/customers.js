import { h, fmt, kpi, card, table, exportButton, channelCell, label } from '../ui.js';
import { pageHead } from './common.js';

export default async function customers(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/customers?${ctx.query()}`);
  const t = r.totals;
  const byChannel = table({
    exportName: 'ltv-by-channel', sortKey: 'avg_ltv', rows: r.channels,
    columns: [
      { key: 'channel', label: 'قناة الاكتساب', value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
      { key: 'customers', label: 'العملاء (منذ البداية)', num: true, render: (x) => fmt.int(x.customers) },
      { key: 'new_in_range', label: 'جدد في الفترة', num: true, render: (x) => fmt.int(x.new_in_range) },
      { key: 'avg_ltv', label: 'متوسط القيمة الدائمة (LTV)', num: true, strong: true, render: (x) => fmt.money(x.avg_ltv) },
      { key: 'avg_orders', label: 'متوسط الطلبات', num: true, render: (x) => fmt.num(x.avg_orders) },
      { key: 'repeat_rate', label: 'معدل التكرار', num: true, render: (x) => fmt.pct(x.repeat_rate) },
      { key: 'spend', label: 'الإنفاق في الفترة', num: true, render: (x) => (x.spend ? fmt.money(x.spend) : '—') },
      { key: 'cac', label: 'تكلفة الاكتساب (CAC)', num: true, render: (x) => fmt.money2(x.cac) },
      { key: 'ltv_cac', label: 'LTV ÷ CAC', num: true, value: (x) => (x.cac ? x.avg_ltv / x.cac : null), render: (x) => (x.cac ? fmt.ratio(x.avg_ltv / x.cac) : '—') },
    ],
  });
  const top = table({
    exportName: 'top-customers', sortKey: 'ltv', rows: r.top,
    columns: [
      { key: 'name', label: 'العميل', render: (x) => h('span', {}, x.name, ' ', x.is_new ? h('span', { class: 'tag accent' }, 'جديد') : null) },
      { key: 'city', label: 'المدينة' },
      { key: 'orders', label: 'الطلبات', num: true },
      { key: 'ltv', label: 'القيمة الدائمة', num: true, strong: true, render: (x) => fmt.money(x.ltv) },
      { key: 'channel', label: 'المصدر الأول', value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
      { key: 'first', label: 'أول طلب', num: true, render: (x) => fmt.date(x.first) },
      { key: 'last', label: 'آخر طلب', num: true, render: (x) => fmt.date(x.last) },
    ],
    emptyText: 'لا يوجد عملاء معروفون في هذه الفترة. اربط طلبات المتجر لعرضهم.',
  });
  return h('div', { class: 'view' },
    pageHead('العملاء', 'ما القنوات التي تجلب لك عملاء يعودون للشراء؟ قناة الاكتساب هي أول قناة وصل منها العميل قبل طلبه الأول، عبر جميع أجهزته'),
    h('div', { class: 'kpis' },
      kpi({ label: 'عملاء اشتروا في الفترة', value: fmt.int(t.active), sub: `${fmt.int(t.new)} جديد · ${fmt.int(t.returning)} عائد` }),
      kpi({ label: 'مبيعات العملاء الجدد', value: fmt.money(t.new_revenue) }),
      kpi({ label: 'مبيعات العملاء العائدين', value: fmt.money(t.returning_revenue) }),
      kpi({ label: 'معدل تكرار الشراء', value: fmt.pct(t.repeat_rate), sub: `من إجمالي ${fmt.int(t.all_time)} عميل` }),
      kpi({ label: 'متوسط القيمة الدائمة', value: fmt.money(t.avg_ltv) })),
    card({ title: 'القيمة الدائمة حسب قناة الاكتساب', sub: 'القناة منخفضة التكلفة التي تجلب عملاء لا يعودون قد تكون أعلى كلفة فعلياً من قناة مرتفعة التكلفة تجلب عملاء أوفياء', actions: exportButton(byChannel) }, byChannel),
    card({ title: 'أعلى العملاء قيمة', sub: 'العملاء الذين اشتروا في الفترة المختارة', actions: exportButton(top) }, top));
}
