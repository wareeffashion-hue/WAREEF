import { h, fmt, card, table, exportButton, channelCell, label } from '../ui.js';
import { attributionColumns, pageHead, sumRows, modelName } from './common.js';

export default async function campaigns(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/campaigns?${ctx.query()}`);
  const rows = r.rows.filter((x) => x.campaign || x.spend);
  const untagged = r.rows.filter((x) => !x.campaign && x.revenue > 0 && !['direct', 'organic_search', 'organic_social', 'referral'].includes(x.channel));
  const tbl = table({
    exportName: 'campaigns', sortKey: 'revenue', rows,
    columns: attributionColumns({
      first: [
        { key: 'campaign', label: 'الحملة', value: (x) => x.campaign || '', render: (x) => x.campaign || h('span', { class: 'muted' }, '(دون اسم حملة)') },
        { key: 'channel', label: 'المنصة', value: (x) => label(x.channel), render: (x) => channelCell(x.channel), total: false },
      ],
      delivery: true,
    }),
    totals: sumRows(rows),
  });
  return h('div', { class: 'view' },
    pageHead('الحملات', 'أداء كل حملة بالمبيعات الفعلية. تُربط روابط الإعلانات ببيانات الإنفاق عبر اسم الحملة أو معرّفها'),
    card({ title: 'الحملات', sub: `${modelName(ctx, r.params)} · نافذة إسناد ${r.params.windowDays} يوم`, actions: exportButton(tbl) }, tbl),
    untagged.length ? h('div', { class: 'note' }, h('strong', {}, `${fmt.money(untagged.reduce((a, x) => a + x.revenue, 0))} من المبيعات جاءت من إعلانات دون utm_campaign. `),
      'أضف قوالب الروابط من صفحة الإعدادات لتُربط كل عملية بيع بحملتها.') : null);
}
