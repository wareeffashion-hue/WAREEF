import { h, fmt, kpi, card, table, channelCell, label } from '../ui.js';
import { lineChart } from '../charts.js';
import { pageHead } from './common.js';

export default async function mmm(ctx) {
  let days = 90;
  const box = h('div', { class: 'view' });
  async function draw() {
    const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/mmm?${ctx.query({ days })}`);
    const seg = h('div', { class: 'seg' }, [60, 90, 180, 365].map((d) => h('button', { class: d === days ? 'active' : '', onclick: () => { days = d; draw(); } }, `${d} يوم`)));
    const head = pageHead('المزيج التسويقي (MMM)', 'نموذج إحصائي يربط مبيعاتك اليومية بإنفاق كل قناة، دون الاعتماد على النقرات أو ملفات تعريف الارتباط، ليقدّم رأياً ثانياً مستقلاً عن الإسناد', seg);
    if (!r.ready) {
      box.replaceChildren(head, card({ title: 'البيانات غير كافية' }, h('div', { class: 'empty' }, r.reason)));
      return;
    }
    const b = r.budget;
    const rows = r.channels;
    const tbl = table({
      sortKey: 'roi', rows,
      columns: [
        { key: 'channel', label: 'القناة', value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
        { key: 'spend', label: 'الإنفاق', num: true, render: (x) => fmt.money(x.spend) },
        { key: 'contribution', label: 'المبيعات الناتجة', num: true, strong: true, render: (x) => (x.significant ? fmt.money(x.contribution) : h('span', { class: 'muted' }, 'غير مؤكد')) },
        { key: 'roi', label: 'العائد (ROI)', num: true, strong: true, render: (x) => (x.significant ? fmt.ratio(x.roi) : '—') },
        { key: 'marginal_roas', label: 'عائد آخر ريال', num: true, render: (x) => (x.significant ? h('span', { class: x.marginal_roas < 1 ? 'tag bad' : 'tag good' }, fmt.ratio(x.marginal_roas)) : '—') },
        { key: 'decay', label: 'الأثر الممتد', num: true, render: (x) => (x.decay ? `${Math.round(x.decay * 100)}% يومياً` : 'في اليوم نفسه') },
        { key: 'avg_daily_spend', label: 'الإنفاق اليومي الحالي', num: true, render: (x) => fmt.money(x.avg_daily_spend) },
        { key: 'recommended_daily_spend', label: 'المقترح', num: true, strong: true, render: (x) => {
          const diff = x.recommended_daily_spend - x.avg_daily_spend;
          return h('span', {}, fmt.money(x.recommended_daily_spend), ' ', Math.abs(diff) > x.avg_daily_spend * 0.03 ? h('span', { class: diff > 0 ? 'tag good' : 'tag bad' }, `${diff > 0 ? '+' : ''}${fmt.pct(diff / x.avg_daily_spend)}`) : null);
        } },
      ],
    });
    const fit = lineChart({
      labels: r.fit.map((d) => d.date),
      series: [
        { key: 'actual', label: 'المبيعات الفعلية', color: 'var(--series-a)', values: r.fit.map((d) => d.actual) },
        { key: 'pred', label: 'توقع النموذج', color: 'var(--series-b)', values: r.fit.map((d) => d.predicted) },
        { key: 'base', label: 'الأساس العضوي', color: 'var(--muted)', dashed: true, values: r.fit.map((d) => Math.max(0, d.baseline)) },
      ],
      tooltipFormat: fmt.money,
    });
    box.replaceChildren(...[head,
      r.reliable ? null : h('div', { class: 'note warn' }, h('strong', {}, `دقة النموذج منخفضة (R² = ${r.r2.toFixed(2)}). `),
        r.baseline < 0 ? 'ينسب النموذج إلى الإعلانات أكثر من إجمالي المبيعات (أساس سالب)، لذا لا تعتمد على توصياته حالياً. ' : 'تتذبذب المبيعات اليومية أكثر مما تفسّره تغيرات الإنفاق، لذا لا تعتمد على توصياته حالياً. ',
        ' تتحسن الدقة مع فترة بيانات أطول، أو عند تغيير ميزانية القنوات تغييراً واضحاً لفترة كافية (مثل رفع ميزانية قناة واحدة 50% لمدة أسبوعين).'),
      h('div', { class: 'kpis' },
        kpi({ label: 'دقة النموذج (R²)', value: r.r2.toFixed(2), sub: `متوسط الخطأ اليومي ${fmt.pct(r.mape)}`, tone: r.reliable ? 'good' : 'alert' }),
        kpi({ label: 'الأساس العضوي', value: fmt.pct(r.baseline / r.revenue), sub: 'نسبة المبيعات المتوقعة حتى دون إعلانات' }),
        kpi({ label: 'الإنفاق اليومي الحالي', value: fmt.money(b.daily_total) }),
        kpi({ label: 'الزيادة المتوقعة بإعادة التوزيع', value: r.reliable && b.lift != null ? fmt.pct(b.lift) : '—', sub: r.reliable ? `بالميزانية نفسها: +${fmt.money(b.optimized_daily_media_revenue - b.current_daily_media_revenue)} يومياً` : 'يتطلب دقة أعلى', tone: r.reliable && b.lift > 0.02 ? 'good' : '' })),
      card({ title: 'هل يفسّر النموذج مبيعاتك؟', sub: 'كلما تقارب الخطّان، زادت موثوقية النتائج' }, fit),
      card({ title: 'أثر كل قناة وتوزيع الميزانية المقترح', sub: 'تبقى التوصيات بين نصف الإنفاق الحالي وضعفه لكل قناة، حتى لا يتنبأ النموذج خارج نطاق البيانات التي رآها' }, tbl),
      h('div', { class: 'note' }, h('strong', {}, 'عائد آخر ريال: '), 'مقدار المبيعات الذي يحققه كل ريال إضافي تنفقه الآن. إذا كان أقل من 1x فالقناة مشبعة، والريال الإضافي فيها خسارة حتى لو كان متوسط عائدها مرتفعاً.')].filter(Boolean));
  }
  await draw();
  return box;
}
