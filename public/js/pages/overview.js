import { h, fmt, kpi, card, table, label, channelCell, shareBar } from '../ui.js';
import { lineChart, pairedBars } from '../charts.js';
import { pageHead, modelName } from './common.js';

/** First-run checklist, shown until the store sends data. */
async function onboarding(ctx) {
  const conns = await ctx.api.get(`/api/w/${ctx.state.wsId}/connections`).catch(() => []);
  const ever = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/overview?${ctx.query({ from: '2000-01-01' })}`).catch(() => null);
  const t = ever?.current || {};
  const steps = [
    [t.sessions > 0, 'ركّب كود التتبع في متجرك', 'سطر واحد في <head> يسجل مصدر كل زيارة.', 'tracking'],
    [t.orders > 0, 'اربط طلبات المتجر', 'Webhook سلة أو الـ API، عشان المبيعات الحقيقية توصل.', 'store'],
    [conns.length > 0 || t.spend > 0, 'اربط منصاتك الإعلانية', 'سناب وتيك توك وميتا وجوجل، أو ارفع ملف CSV.', 'platforms'],
    [false, 'أضف قوالب روابط الإعلانات', 'عشان كل بيعة تنربط بحملتها وإعلانها.', 'tracking'],
  ];
  const done = steps.filter((x) => x[0]).length;
  return h('div', { class: 'view' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, `أهلاً بك في ${ctx.state.meta.appName} 👋`), h('p', {}, `${ctx.ws.name} · خلّنا نجهز حسابك، أول البيانات تبدأ توصل خلال دقائق من التركيب.`))),
    card({ title: `خطوات البداية (${done} من ${steps.length})` },
      h('ol', { class: 'checklist' }, steps.map(([ok, title, sub, tab]) => h('li', { class: ok ? 'done' : '' },
        h('span', { class: 'check' }, ok ? '✓' : ''),
        h('div', {}, h('strong', {}, title), h('div', { class: 'muted' }, sub)),
        ok ? h('span', { class: 'tag good' }, 'تم') : h('a', { class: 'btn sm primary', href: `#/w/${ctx.state.wsId}/settings`, onclick: () => { try { sessionStorage.setItem('wt:settings-tab', tab); } catch { /* ignore */ } } }, 'ابدأ'))))),
    h('div', { class: 'note' }, 'التقارير تظهر هنا تلقائياً أول ما تبدأ الزيارات والطلبات توصل. تقدر ترجع لهذي الخطوات من "الإعدادات والربط" في أي وقت.'));
}

export default async function overview(ctx) {
  const r = await ctx.api.get(`/api/w/${ctx.state.wsId}/report/overview?${ctx.query()}`);
  const c = r.current;
  if (!c.sessions && !c.orders && !c.spend && !r.previous.sessions && !r.previous.orders) return onboarding(ctx);
  const ch = r.change;
  const gapPct = c.claim_gap != null && c.revenue ? c.claim_gap / c.revenue : null;

  const trend = lineChart({
    labels: r.series.map((d) => d.date),
    series: [
      { key: 'revenue', label: 'المبيعات', color: 'var(--series-a)', values: r.series.map((d) => d.revenue) },
      { key: 'spend', label: 'الصرف', color: 'var(--series-b)', values: r.series.map((d) => d.spend) },
    ],
    tooltipFormat: fmt.money,
  });

  const claimRows = r.channels.filter((x) => x.platform_revenue > 0).map((x) => ({
    label: h('span', { class: 'ch' }, channelCell(x.channel)), a: x.revenue, b: x.platform_revenue,
    note: x.platform_revenue > x.revenue ? h('span', { class: 'over-note' }, `+${fmt.money(x.platform_revenue - x.revenue)}`) : null,
  }));

  const maxRev = Math.max(1, ...r.channels.map((x) => x.revenue));
  const channels = table({
    sortKey: 'revenue',
    columns: [
      { key: 'channel', label: 'المصدر', value: (x) => label(x.channel), render: (x) => channelCell(x.channel) },
      { key: 'revenue', label: 'المبيعات المنسوبة', num: true, strong: true, render: (x) => fmt.money(x.revenue) },
      { key: 'share', label: 'الحصة', value: (x) => x.revenue, render: (x) => shareBar(x.revenue, maxRev, x.channel) },
      { key: 'roas', label: 'ROAS', num: true, render: (x) => fmt.ratio(x.roas) },
    ],
    rows: r.channels.filter((x) => x.revenue > 0 || x.spend > 0),
  });
  const campaigns = table({
    columns: [
      { key: 'campaign', label: 'الحملة', render: (x) => h('span', { class: 'ch' }, channelCell(x.channel), h('span', { class: 'muted' }, '·'), x.campaign) },
      { key: 'revenue', label: 'المبيعات', num: true, strong: true, render: (x) => fmt.money(x.revenue) },
      { key: 'roas', label: 'ROAS', num: true, render: (x) => fmt.ratio(x.roas) },
    ],
    rows: r.campaigns,
    emptyText: 'أضف utm_campaign لروابط إعلاناتك',
  });

  return h('div', { class: 'view' },
    pageHead('نظرة عامة', `${ctx.ws.name} · ${modelName(ctx, r.params)} · مقارنة بالفترة السابقة`),
    h('div', { class: 'kpis' },
      kpi({ label: 'المبيعات الفعلية (المتجر)', value: fmt.money(c.revenue), change: ch.revenue, sub: `${fmt.int(c.orders)} طلب · متوسط ${fmt.money(c.aov)}` }),
      kpi({ label: 'ما تدّعيه المنصات', value: c.platform_revenue ? fmt.money(c.platform_revenue) : '—', sub: gapPct != null ? `مبالغة ${fmt.pct(gapPct)} (${fmt.money(c.claim_gap)})` : 'اربط المنصات أو ارفع ملف الصرف', tone: c.claim_gap > 0 ? 'alert' : '' }),
      kpi({ label: 'الصرف الإعلاني', value: fmt.money(c.spend), change: ch.spend, invert: true }),
      kpi({ label: 'ROAS الحقيقي', value: fmt.ratio(c.roas), change: ch.roas, tone: c.roas >= 3 ? 'good' : '' }),
      kpi({ label: 'التواصل', value: fmt.int(c.leads), change: ch.leads, sub: `${fmt.int(c.whatsapp)} واتساب · ${fmt.int(c.form)} نموذج · ${fmt.int(c.call)} اتصال` }),
      kpi({ label: 'عملاء جدد', value: fmt.int(c.new_customers), change: ch.new_customers, sub: `تكلفة الطلب ${fmt.money2(c.cpa)}` })),
    card({ title: 'المبيعات والصرف يومياً', sub: 'نفس العملة على محور واحد' }, trend),
    h('div', { class: 'grid-2' },
      card({ title: 'الحقيقة مقابل ادعاءات المنصات', sub: 'كل بيعة محسوبة مرة وحدة ومنسوبة لمصدرها' },
        claimRows.length ? pairedBars({ rows: claimRows, a: 'منسوب فعلياً', b: 'تدّعيه المنصة' }) : h('div', { class: 'empty' }, 'لا توجد بيانات منصات في هذه الفترة')),
      card({ title: 'المبيعات حسب المصدر' }, channels)),
    card({ title: 'أفضل الحملات', sub: 'حسب المبيعات المنسوبة' }, campaigns));
}
