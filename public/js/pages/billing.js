import { h, fmt, card, table, toast } from '../ui.js';
import { pageHead } from './common.js';

const STATE_TEXT = {
  ok: ['فعّال', 'good'], grace: ['منتهي (فترة سماح)', 'bad'], locked: ['منتهي', 'bad'], suspended: ['موقوف', 'bad'],
};
const STATUS_TEXT = { paid: 'مدفوع', initiated: 'بانتظار الدفع', failed: 'فشل', expired: 'منتهي', canceled: 'ملغي' };
const sar = (n) => `${new Intl.NumberFormat('en-US').format(n)} ر.س`;

function meter(label, used, limit) {
  const pct = limit ? Math.min(used / limit, 1) : 0;
  return h('div', { class: 'meter' },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } }, h('span', {}, label), h('strong', {}, `${fmt.int(used)} من ${fmt.int(limit)}`)),
    h('div', { class: 'meter-track' }, h('div', { class: `meter-fill ${pct > 0.9 ? 'high' : ''}`, style: { width: `${pct * 100}%` } })));
}

export default async function billing(ctx) {
  if (/paid=1/.test(location.hash)) {
    const r = await ctx.api.post('/api/billing/verify').catch(() => ({}));
    if (r.applied) toast('تم تفعيل اشتراكك، شكراً لك ✓');
    history.replaceState(null, '', '#/billing');
  }
  const b = await ctx.api.get('/api/billing');
  const org = b.org;
  ctx.state.org = org;
  const isAdmin = ctx.state.user.role === 'admin';
  let cycle = org.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
  const [stateText, stateTone] = STATE_TEXT[org.state] || [org.state, ''];
  const trial = org.plan === 'trial';

  const plansBox = h('div');
  function drawPlans() {
    const seg = h('div', { class: 'seg' }, [['monthly', 'شهري'], ['yearly', 'سنوي (شهرين مجاناً)']].map(([k, n]) =>
      h('button', { class: k === cycle ? 'active' : '', onclick: () => { cycle = k; drawPlans(); } }, n)));
    plansBox.replaceChildren(card({ title: trial || org.state !== 'ok' ? 'اختر باقتك' : 'تغيير أو تجديد الباقة', sub: 'الدفع عبر مدى، فيزا/ماستركارد، Apple Pay أو STC Pay. الأسعار شاملة الضريبة. التجديد المبكر يُضاف بعد نهاية فترتك الحالية.', actions: seg },
      h('div', { class: 'plans-grid' }, b.plans.map((p) => {
        const current = p.id === org.plan;
        return h('div', { class: `plan-card ${current ? 'current' : ''}` },
          h('h3', {}, p.name, current ? h('span', { class: 'tag accent', style: { marginInlineStart: '8px' } }, 'باقتك') : null),
          h('div', { class: 'price' }, sar(cycle === 'yearly' ? p.price.yearly : p.price.monthly), h('small', {}, cycle === 'yearly' ? ' / سنة' : ' / شهر')),
          h('ul', {}, (p.features || []).map((f) => h('li', {}, f))),
          isAdmin ? h('button', {
            class: `btn ${p.popular || current ? 'primary' : ''}`,
            disabled: !b.enabled,
            onclick: async (e) => {
              e.target.disabled = true; e.target.textContent = 'جاري التحويل للدفع…';
              try {
                const r = await ctx.api.post('/api/billing/checkout', { plan: p.id, cycle });
                location.href = r.url;
              } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; e.target.textContent = 'اشترك'; }
            },
          }, current && !trial ? 'جدّد' : 'اشترك') : null);
      })),
      b.enabled ? null : h('div', { class: 'note warn' }, 'الدفع الإلكتروني غير مفعّل بعد. تواصل معنا لتفعيل اشتراكك.')));
  }
  drawPlans();

  const payments = b.payments.length ? table({
    rows: b.payments,
    columns: [
      { key: 'created_at', label: 'التاريخ', render: (p) => fmt.date(p.created_at) },
      { key: 'plan', label: 'الباقة', render: (p) => `${b.plans.find((x) => x.id === p.plan)?.name || p.plan} · ${p.cycle === 'yearly' ? 'سنوي' : 'شهري'}` },
      { key: 'amount', label: 'المبلغ', num: true, render: (p) => sar(p.amount / 100) },
      { key: 'status', label: 'الحالة', render: (p) => h('span', { class: `tag ${p.status === 'paid' ? 'good' : ''}` }, STATUS_TEXT[p.status] || p.status) },
      { key: 'period_end', label: 'حتى', render: (p) => (p.period_end ? fmt.date(p.period_end) : '—') },
    ],
  }) : h('div', { class: 'empty' }, 'لا توجد مدفوعات بعد');

  return h('div', { class: 'view' },
    pageHead('الاشتراك والفوترة', org.name),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'الباقة'), h('div', { class: 'kpi-value' }, org.plan_name), h('div', { class: 'kpi-sub' }, h('span', { class: `tag ${stateTone}` }, stateText))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, trial ? 'التجربة تنتهي' : 'الاشتراك ينتهي'), h('div', { class: 'kpi-value' }, org.access_ends_at ? fmt.date(org.access_ends_at) : '—'),
        h('div', { class: 'kpi-sub' }, org.access_ends_at ? (org.access_ends_at > Date.now() ? `باقي ${Math.ceil((org.access_ends_at - Date.now()) / 86400000)} يوم` : 'منتهي') : '')),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'الاستخدام هذا الشهر'),
        h('div', { style: { display: 'grid', gap: '10px', marginTop: '8px' } },
          meter('الأحداث', org.usage.events, org.limits.events),
          meter('المتاجر', org.usage.stores, org.limits.stores),
          meter('الأعضاء', org.usage.members, org.limits.members)))),
    org.state === 'grace' ? h('div', { class: 'banner bad' }, `انتهى اشتراكك. التتبع مستمر ${org.grace_days} أيام بعد الانتهاء عشان ما تضيع بياناتك، والتقارير مقفلة حتى التجديد.`) : null,
    plansBox,
    isAdmin ? card({ title: 'سجل المدفوعات' }, payments) : null);
}
