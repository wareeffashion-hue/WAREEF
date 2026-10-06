import { h, fmt, kpi, card, table, exportButton, channelCell, label } from '../ui.js';
import { pairedBars } from '../charts.js';
import { pageHead, modelName } from './common.js';

export default async function measurement(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/measurement?${ctx.query()}`);
  const t = r.totals;
  const tbl = table({
    exportName: 'unified-measurement', sortKey: 'spend', rows: r.channels,
    columns: [
      { key: 'channel', label: 'المنصة', value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
      { key: 'spend', label: 'الصرف', num: true, render: (x) => fmt.money(x.spend) },
      { key: 'platform_conversions', label: 'طلبات حسب المنصة', num: true, render: (x) => fmt.num(x.platform_conversions) },
      { key: 'orders', label: 'طلبات فعلية منسوبة', num: true, render: (x) => fmt.num(x.orders) },
      { key: 'platform_revenue', label: 'مبيعات حسب المنصة', num: true, render: (x) => fmt.money(x.platform_revenue) },
      { key: 'revenue', label: 'مبيعات فعلية منسوبة', num: true, strong: true, render: (x) => fmt.money(x.revenue) },
      { key: 'range', label: 'المدى عبر كل النماذج', value: (x) => x.revenue_max - x.revenue_min, render: (x) => h('span', { class: 'muted' }, `${fmt.compact(x.revenue_min)} – ${fmt.compact(x.revenue_max)}`) },
      { key: 'platform_roas', label: 'ROAS المنصة', num: true, cls: () => 'muted', render: (x) => fmt.ratio(x.platform_roas) },
      { key: 'roas', label: 'ROAS الحقيقي', num: true, strong: true, render: (x) => fmt.ratio(x.roas) },
      { key: 'correction', label: 'معامل التصحيح', num: true, render: (x) => (x.correction == null ? '—' : h('span', { class: x.correction < 0.8 ? 'tag bad' : x.correction > 1.1 ? 'tag good' : 'tag' }, `×${x.correction.toFixed(2)}`)) },
    ],
  });
  const paired = r.channels.filter((x) => x.platform_revenue || x.revenue).map((x) => ({
    label: channelCell(x.channel), a: x.revenue, b: x.platform_revenue,
    note: x.platform_revenue > x.revenue ? h('span', { class: 'over-note' }, `+${fmt.pct((x.platform_revenue - x.revenue) / Math.max(x.revenue, 1))}`) : null,
  }));
  return h('div', { class: 'view' },
    pageHead('القياس الموحّد', 'رقم واحد للحقيقة: مبيعات المتجر الفعلية، موزعة على المنصات بدون تكرار، جنب ما تدّعيه كل منصة'),
    h('div', { class: 'kpis' },
      kpi({ label: 'المبيعات الفعلية', value: fmt.money(t.revenue), sub: `${fmt.int(t.orders)} طلب` }),
      kpi({ label: 'مجموع ادعاءات المنصات', value: fmt.money(t.platform_revenue), tone: t.claim_gap > 0 ? 'alert' : '', sub: t.claim_gap != null ? `فرق ${fmt.money(t.claim_gap)}` : '' }),
      kpi({ label: 'معامل التكرار', value: t.dedup_ratio ? `×${t.dedup_ratio.toFixed(2)}` : '—', sub: 'طلبات تدّعيها المنصات ÷ الطلبات الفعلية', hint: 'لو 1.6 يعني كل طلب حقيقي تدّعيه المنصات 1.6 مرة' }),
      kpi({ label: 'MER (المبيعات ÷ كل الصرف)', value: fmt.ratio(t.mer), sub: 'أصدق مقياس ما يتأثر بأي نموذج إسناد' }),
      kpi({ label: 'طلبات عبر أكثر من جهاز', value: fmt.int(t.cross_device_orders), sub: `${fmt.int(t.unmatched_orders)} طلب بدون زيارة متتبعة` })),
    card({ title: 'منسوب فعلياً مقابل ما تدّعيه المنصة', sub: modelName(ctx, r.params) },
      paired.length ? pairedBars({ rows: paired, a: 'منسوب فعلياً', b: 'تدّعيه المنصة' }) : h('div', { class: 'empty' }, 'لا توجد بيانات منصات')),
    card({ title: 'جدول القياس الموحد', sub: 'معامل التصحيح: اضرب أي رقم تعطيك إياه المنصة فيه عشان تقرّبه للحقيقة', actions: exportButton(tbl) }, tbl),
    h('div', { class: 'note' }, h('strong', {}, 'كيف تقرأ هذي الصفحة: '),
      'إذا الـ ROAS الحقيقي للمنصة أعلى من هدفك في كل النماذج (شوف عمود المدى)، زِد ميزانيتها بثقة. إذا يتغير كثير بين النماذج، المنصة غالباً تساعد في بداية الرحلة أو نهايتها فقط. قارن مع صفحة المزيج التسويقي لرأي ثاني ما يعتمد على النقرات.'));
}
