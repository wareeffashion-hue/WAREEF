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
    pageHead('القنوات', 'من أين يأتي عملاؤك: كل طلب وتواصل يُنسب إلى مصدره مرة واحدة، إلى جانب ما تدّعيه كل منصة لنفسها'),
    card({
      title: 'من أين يأتي العملاء',
      sub: `${modelName(ctx, r.params)} · نافذة إسناد ${r.params.windowDays} يوم · يُحسب التواصل مرة واحدة لكل زائر يومياً`,
      actions: exportButton(tbl),
    }, tbl),
    r.totals.claim_gap > 0 ? h('div', { class: 'note warn' },
      h('strong', {}, `المنصات مجتمعة تدّعي ${fmt.money(r.totals.platform_revenue)}`),
      ` بينما بلغت مبيعات المتجر الفعلية ${fmt.money(r.totals.revenue)} فقط. الفرق (${fmt.money(r.totals.claim_gap)}) مبيعات احتسبتها أكثر من منصة، أو نسبتها المنصات إلى مشاهدة إعلان دون نقر.`) : null);
}
