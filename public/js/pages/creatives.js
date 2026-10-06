import { h, card, table, exportButton, channelCell, label } from '../ui.js';
import { attributionColumns, pageHead, sumRows, modelName } from './common.js';

export default async function creatives(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/creatives?${ctx.query()}`);
  const rows = r.rows.filter((x) => x.creative || x.spend);
  const tbl = table({
    exportName: 'creatives', sortKey: 'revenue', rows,
    columns: attributionColumns({
      first: [
        { key: 'creative', label: 'الإعلان / الإبداع', value: (x) => x.creative || '', render: (x) => x.creative || h('span', { class: 'muted' }, '(غير معروف)') },
        { key: 'campaign', label: 'الحملة', total: false, render: (x) => x.campaign || '—' },
        { key: 'channel', label: 'المنصة', total: false, value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
      ],
      leads: false,
      delivery: true,
    }),
    totals: sumRows(rows),
  });
  return h('div', { class: 'view' },
    pageHead('الإبداعات', 'أي فيديو أو صورة حقق مبيعات فعلية؟ تعتمد النتائج على utm_content في روابط إعلاناتك'),
    card({ title: 'أداء الإعلانات الإبداعية', sub: `${modelName(ctx, r.params)} · مرتّبة حسب المبيعات المنسوبة`, actions: exportButton(tbl) }, tbl));
}
