import { h, fmt, kpi, card, table, toast, exportButton } from '../ui.js';
import { pageHead } from './common.js';

const STATE = { ok: ['فعّال', 'good'], grace: ['سماح', 'bad'], locked: ['منتهي', 'bad'], suspended: ['موقوف', 'bad'] };
const sar = (n) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)} ر.س`;

export default async function platform(ctx) {
  const p = await ctx.api.get('/api/platform/overview');
  const s = p.summary;
  const act = (org, body, msg) => async () => {
    try { await ctx.api.put(`/api/platform/orgs/${org.id}`, body); toast(msg); ctx.refresh(); } catch (err) { toast(err.message, 'bad'); }
  };
  const tbl = table({
    exportName: 'subscribers', sortKey: 'created_at', rows: p.organizations,
    columns: [
      { key: 'name', label: 'الحساب', render: (o) => h('div', {}, h('strong', {}, o.name), o.is_platform ? h('span', { class: 'tag accent', style: { marginInlineStart: '6px' } }, 'المنصة') : null, h('div', { class: 'muted', dir: 'ltr', style: { textAlign: 'right' } }, o.owner_email)) },
      { key: 'plan', label: 'الباقة', render: (o) => `${o.plan_name}${o.plan !== 'trial' ? ` · ${o.billing_cycle === 'yearly' ? 'سنوي' : 'شهري'}` : ''}` },
      { key: 'state', label: 'الحالة', render: (o) => { const [t, c] = STATE[o.state] || [o.state, '']; return h('span', { class: `tag ${c}` }, o.status === 'trialing' && o.state === 'ok' ? 'تجربة' : t); } },
      { key: 'access_ends_at', label: 'ينتهي', num: true, render: (o) => (o.access_ends_at ? fmt.date(o.access_ends_at) : '—') },
      { key: 'stores', label: 'متاجر', num: true },
      { key: 'members', label: 'أعضاء', num: true },
      { key: 'events', label: 'أحداث الشهر', num: true, render: (o) => fmt.compact(o.events) },
      { key: 'revenue', label: 'إجمالي المدفوع', num: true, render: (o) => sar(o.revenue) },
      { key: 'mrr', label: 'MRR', num: true, strong: true, render: (o) => (o.mrr ? sar(o.mrr) : '—') },
      { key: 'created_at', label: 'سجّل', num: true, render: (o) => fmt.date(o.created_at) },
      { key: 'actions', label: '', render: (o) => (o.is_platform ? null : h('div', { style: { display: 'flex', gap: '4px' } },
        h('button', { class: 'btn sm', title: 'تمديد 14 يوم', onclick: act(o, { extend_days: 14 }, 'تم التمديد') }, '+14 يوم'),
        h('select', { class: 'btn sm', onchange: (e) => { if (e.target.value) act(o, { plan: e.target.value, extend_days: 30 }, 'تم تفعيل الباقة لـ 30 يوم')(); } },
          h('option', { value: '' }, 'تفعيل باقة…'), ['starter', 'growth', 'agency'].map((k) => h('option', { value: k }, k))),
        o.status === 'suspended'
          ? h('button', { class: 'btn sm', onclick: act(o, { status: 'active' }, 'تم التفعيل') }, 'تفعيل')
          : h('button', { class: 'btn sm danger', onclick: () => { if (confirm(`إيقاف ${o.name}؟`)) act(o, { status: 'suspended' }, 'تم الإيقاف')(); } }, 'إيقاف'))) },
    ],
  });
  return h('div', { class: 'view' },
    pageHead('لوحة المنصة', 'كل المشتركين والإيرادات. تظهر لمالك المنصة فقط.',
      h('a', { class: 'btn', href: '/api/platform/backup' }, 'تحميل نسخة احتياطية')),
    h('div', { class: 'kpis' },
      kpi({ label: 'الإيراد الشهري المتكرر (MRR)', value: sar(s.mrr), sub: `${s.paying} مشترك يدفع` }),
      kpi({ label: 'إيراد آخر 30 يوم', value: sar(s.revenue_30d) }),
      kpi({ label: 'الحسابات', value: fmt.int(s.organizations), sub: `${s.trialing} تجربة · ${s.lapsed} منتهي` }),
      kpi({ label: 'تسجيلات آخر 30 يوم', value: fmt.int(s.signups_30d) }),
      kpi({ label: 'أحداث هذا الشهر', value: fmt.compact(s.events_month) })),
    card({ title: 'المشتركين', actions: exportButton(tbl) }, tbl),
    card({ title: 'آخر المدفوعات' }, table({
      rows: p.recent_payments,
      emptyText: 'لا توجد مدفوعات بعد',
      columns: [
        { key: 'created_at', label: 'التاريخ', render: (x) => fmt.datetime(x.created_at) },
        { key: 'org', label: 'الحساب' },
        { key: 'plan', label: 'الباقة', render: (x) => `${x.plan} · ${x.cycle}` },
        { key: 'amount', label: 'المبلغ', num: true, render: (x) => sar(x.amount / 100) },
        { key: 'status', label: 'الحالة', render: (x) => h('span', { class: `tag ${x.status === 'paid' ? 'good' : ''}` }, x.status) },
      ],
    })));
}
