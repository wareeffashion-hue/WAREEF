import { h, fmt, card, table, exportButton } from '../ui.js';
import { attributionColumns, channelColumn, pageHead, sumRows, modelName } from './common.js';

export default async function channels(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/channels?${ctx.query()}`);
  const tbl = table({
    exportName: 'channels', sortKey: 'revenue', rows: r.rows,
    columns: attributionColumns({ first: [channelColumn], delivery: true }),
    totals: sumRows(r.rows),
  });
  return h('div', { class: 'view' },
    pageHead('القنوات', 'من أين جاء العميل: كل طلب وتواصل منسوب لمصدره مرة وحدة، جنب ما تقوله كل منصة عن نفسها'),
    card({
      title: 'من أين جاء العميل',
      sub: `${modelName(ctx, r.params)} · نافذة ${r.params.windowDays} يوم · التواصل يُحسب مرة لكل زائر في اليوم`,
      actions: exportButton(tbl),
    }, tbl),
    r.totals.claim_gap > 0 ? h('div', { class: 'note warn' },
      h('strong', {}, `المنصات مجتمعة تدّعي ${fmt.money(r.totals.platform_revenue)}`),
      ` بينما المتجر باع ${fmt.money(r.totals.revenue)} فقط. الفرق ${fmt.money(r.totals.claim_gap)} مبيعات محسوبة أكثر من مرة أو بالمشاهدة بدون نقر.`) : null);
}
