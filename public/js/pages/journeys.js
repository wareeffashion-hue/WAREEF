import { h, fmt, card, table, label, channelCell, dot, TYPE_LABELS, DEVICE_LABELS } from '../ui.js';
import { barList } from '../charts.js';
import { pageHead } from './common.js';

export default async function journeys(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/journeys?${ctx.query()}`);
  const models = ctx.state.meta.models;
  const keys = Object.keys(models);
  const channels = [...new Set(keys.flatMap((m) => Object.keys(r.compare[m])))]
    .sort((a, b) => (r.compare[r.params.model][b]?.revenue || 0) - (r.compare[r.params.model][a]?.revenue || 0));
  const compareRows = channels.map((ch) => ({ channel: ch, ...Object.fromEntries(keys.map((m) => [m, r.compare[m][ch]?.revenue || 0])) }));
  const compare = table({
    exportName: 'model-comparison', sortKey: r.params.model, rows: compareRows,
    columns: [
      { key: 'channel', label: 'المصدر', value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
      ...keys.map((m) => ({
        key: m, label: models[m], num: true,
        render: (x) => {
          const best = Math.max(...keys.map((k) => x[k]));
          return x[m] === best && best > 0 ? h('span', { class: 'best' }, fmt.money(x[m])) : fmt.money(x[m]);
        },
      })),
    ],
  });

  const chip = (p) => h('span', { class: 'chip' }, dot(p), label(p));
  const paths = table({
    exportName: 'top-paths', sortKey: 'orders', rows: r.paths,
    columns: [
      { key: 'path', label: 'المسار', value: (x) => x.path.join(' > '), cls: () => 'wrap', render: (x) => h('div', { class: 'path-cell' }, x.path.flatMap((p, i) => [i ? h('span', { class: 'arrow' }, '←') : null, p === '…' ? '…' : chip(p)])) },
      { key: 'orders', label: 'الطلبات', num: true },
      { key: 'revenue', label: 'المبيعات', num: true, strong: true, render: (x) => fmt.money(x.revenue) },
      { key: 'avg_days', label: 'متوسط المدة', num: true, render: (x) => `${fmt.num(x.avg_days)} يوم` },
    ],
  });

  const totalTouches = Object.values(r.touches).reduce((a, b) => a + b, 0) || 1;
  const totalLag = Object.values(r.lag).reduce((a, b) => a + b, 0) || 1;

  const journeyItem = (j) => h('li', {},
    h('div', { class: 'j-head' },
      h('strong', {}, TYPE_LABELS[j.type] || j.type),
      j.type === 'purchase' ? h('strong', {}, fmt.money(j.value)) : null,
      j.order_id ? h('span', { class: 'muted' }, `#${j.order_id}`) : null,
      j.cross_device ? h('span', { class: 'tag accent' }, 'عبر أكثر من جهاز') : null,
      h('span', { class: 'muted' }, fmt.datetime(j.ts))),
    h('div', { class: 'j-path' },
      j.path.length ? j.path.flatMap((p, i) => [
        i ? h('span', { class: 'arrow' }, '←') : null,
        h('span', { class: 'chip', title: [p.campaign, DEVICE_LABELS[p.device]].filter(Boolean).join(' · ') }, dot(p.channel), label(p.channel), p.device ? h('span', { class: 'muted' }, DEVICE_LABELS[p.device]) : null),
      ]) : h('span', { class: 'muted' }, 'مسار غير معروف'),
      h('span', { class: 'arrow' }, '·'),
      Object.entries(j.credits).map(([ch, c]) => h('span', { class: 'chip' }, label(ch), h('span', { class: 'pct' }, fmt.pct(c))))));
  const recent = h('ol', { class: 'journeys' }, r.recent.length ? r.recent.slice(0, 20).map(journeyItem) : [h('li', { class: 'empty' }, 'لا توجد تحويلات في هذه الفترة')]);
  const more = r.recent.length > 20 ? h('div', { class: 'code-actions', style: { paddingTop: '12px' } }, h('button', {
    class: 'btn sm', onclick: (e) => { recent.replaceChildren(...r.recent.map(journeyItem)); e.target.remove(); },
  }, `عرض الكل (${r.recent.length})`)) : null;

  return h('div', { class: 'view' },
    pageHead('الإسناد والرحلات', 'كيف يصل العميل إلى الشراء، وكيف تتوزع المبيعات نفسها في كل نموذج إسناد'),
    card({ title: 'مقارنة نماذج الإسناد', sub: 'المبيعات الفعلية ثابتة، وما يتغير هو طريقة توزيعها. القناة القوية في "أول نقرة" تجلب عملاء جدداً، والقوية في "آخر نقرة" تُتمّ عملية البيع' }, compare),
    h('div', { class: 'grid-2' },
      card({ title: 'عدد نقاط التواصل قبل الشراء' }, barList({ items: Object.entries(r.touches).map(([k, v]) => ({ label: k === '1' ? 'زيارة واحدة' : `${k} زيارات`, value: v, sub: fmt.pct(v / totalTouches) })) })),
      card({ title: 'المدة من أول زيارة حتى الشراء' }, barList({ items: Object.entries(r.lag).map(([k, v]) => ({ label: k === '0' ? 'اليوم نفسه' : `${k} يوم`, value: v, sub: fmt.pct(v / totalLag) })) }))),
    card({ title: 'أكثر المسارات تكراراً', sub: 'تسلسل القنوات قبل الطلب (تُدمج القناة المتكررة على التوالي)' }, paths),
    card({ title: 'أحدث التحويلات ورحلاتها', sub: 'المسار الكامل عبر جميع أجهزة العميل، والحصة التي نالتها كل منصة' }, recent, more));
}
