import { h, fmt, card, table, exportButton, channelCell, label } from '../ui.js';
import { pageHead } from './common.js';

const STEPS = [['visitors', 'زوار'], ['view_item', 'شاهدوا منتجاً'], ['add_to_cart', 'أضافوا إلى السلة'], ['begin_checkout', 'بدأوا الدفع'], ['purchase', 'اشتروا']];

export default async function funnel(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/funnel?${ctx.query()}`);
  const t = r.total;
  const steps = h('div', { class: 'funnel' }, STEPS.map(([k, name], i) => {
    const prev = i ? t[STEPS[i - 1][0]] : null;
    return h('div', { class: 'funnel-step' },
      h('div', { class: 'fill', style: { height: `${t.visitors ? (t[k] / t.visitors) * 100 : 0}%` } }),
      h('div', { class: 'l' }, name),
      h('div', { class: 'n' }, fmt.int(t[k])),
      h('div', { class: 'r' }, i ? `${fmt.pct(prev ? t[k] / prev : null)} من الخطوة السابقة` : '100%'));
  }));
  const rate = (a, b) => (r2) => (r2[b] ? r2[a] / r2[b] : null);
  const tbl = table({
    exportName: 'funnel', sortKey: 'visitors', rows: r.rows,
    columns: [
      { key: 'channel', label: 'القناة', value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
      { key: 'visitors', label: 'زوار', num: true, render: (x) => fmt.int(x.visitors) },
      { key: 'view_item', label: 'شاهدوا منتجاً', num: true, render: (x) => h('span', {}, fmt.int(x.view_item), h('span', { class: 'muted' }, ` ${fmt.pct(rate('view_item', 'visitors')(x))}`)) },
      { key: 'add_to_cart', label: 'أضافوا إلى السلة', num: true, render: (x) => h('span', {}, fmt.int(x.add_to_cart), h('span', { class: 'muted' }, ` ${fmt.pct(rate('add_to_cart', 'view_item')(x))}`)) },
      { key: 'begin_checkout', label: 'بدأوا الدفع', num: true, render: (x) => h('span', {}, fmt.int(x.begin_checkout), h('span', { class: 'muted' }, ` ${fmt.pct(rate('begin_checkout', 'add_to_cart')(x))}`)) },
      { key: 'purchase', label: 'اشتروا', num: true, render: (x) => fmt.int(x.purchase) },
      { key: 'conversion_rate', label: 'معدل التحويل', num: true, strong: true, render: (x) => fmt.pct(x.conversion_rate) },
    ],
    totals: { ...t, channel: '' },
  });
  const drop = STEPS.slice(1).map(([k], i) => ({ k, rate: t[STEPS[i][0]] ? t[k] / t[STEPS[i][0]] : 1 })).sort((a, b) => a.rate - b.rate)[0];
  const dropName = Object.fromEntries(STEPS)[drop?.k];
  return h('div', { class: 'view' },
    pageHead('قمع التحويل', 'أين يتوقف الزوار قبل الشراء؟ يُحسب كل زائر على أول قناة وصل منها خلال الفترة'),
    card({ title: 'رحلة الشراء', sub: drop ? `أكبر تسرّب: قبل خطوة "${dropName}" (يغادر ${fmt.pct(1 - drop.rate)})` : '' }, steps),
    card({ title: 'القمع حسب القناة', sub: 'النسبة الرمادية: معدل التحويل من الخطوة السابقة', actions: exportButton(tbl) }, tbl),
    t.view_item === 0 ? h('div', { class: 'note' }, 'لم تصل بعد أحداث مشاهدة المنتج أو الإضافة إلى السلة. يلتقطها كود التتبع تلقائياً في متاجر سلة، أو يمكنك استدعاء wtrack(\'add_to_cart\') من متجرك.') : null);
}
