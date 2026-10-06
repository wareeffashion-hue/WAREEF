import { h, fmt, card, copy, toast, table } from '../ui.js';
import { pageHead } from './common.js';

const field = (labelText, input) => h('label', { class: 'field' }, labelText, input);

export default async function settings(ctx) {
  const isAdmin = ctx.state.user.role === 'admin';
  const view = h('div', { class: 'view' });
  if (!ctx.state.wsId) {
    view.append(pageHead('ابدأ بإضافة أول عميل'), newWorkspaceCard(ctx));
    return view;
  }
  const ws = await ctx.api.get(`/api/workspaces/${ctx.state.wsId}`);
  let tab = sessionStorage.getItem('wt:settings-tab') || 'tracking';
  const body = h('div', { class: 'view' });
  const tabs = h('div', { class: 'tabs' });
  const TABS = [
    ['tracking', 'كود التتبّع'],
    ['store', 'ربط المتجر'],
    ['platforms', 'المنصات الإعلانية'],
    ...(isAdmin ? [['data', 'رفع البيانات'], ['general', 'إعدادات العميل']] : []),
    ['account', 'حسابي'],
  ];
  async function draw() {
    try { sessionStorage.setItem('wt:settings-tab', tab); } catch { /* ignore */ }
    tabs.replaceChildren(...TABS.map(([k, n]) => h('button', { class: k === tab ? 'active' : '', onclick: () => { tab = k; draw(); } }, n)));
    const render = { tracking, store, platforms, data, general, account }[tab] || tracking;
    body.replaceChildren(await render(ctx, ws, draw));
  }
  view.append(
    pageHead(`الإعدادات والربط · ${ws.name}`, 'كل شي تحتاجه عشان تبدأ البيانات توصل', isAdmin ? h('button', { class: 'btn', onclick: () => { tab = 'new'; body.replaceChildren(newWorkspaceCard(ctx)); } }, '+ عميل جديد') : null),
    tabs, body);
  await draw();
  return view;
}

function codeBlock(text, extra) {
  const pre = h('pre', { class: 'code' }, text);
  return [pre, h('div', { class: 'code-actions' }, h('button', { class: 'btn sm', onclick: (e) => copy(text, e.target) }, 'نسخ'), extra || null)];
}

async function tracking(ctx, ws) {
  const snippet = `<script async src="${ws.snippet_url}"></script>`;
  const purchase = `<script>
  window.wtrack = window.wtrack || function () { (wtrack.q = wtrack.q || []).push(arguments); };
  wtrack('purchase', { order_id: 'ORDER_ID', value: ORDER_TOTAL, customer_id: 'CUSTOMER_ID' });
</script>`;
  const platforms = ctx.state.meta.platforms;
  return h('div', { class: 'view' },
    card({ title: '١. كود التتبّع', sub: 'حطه في <head> كل صفحات المتجر. في سلة: لوحة التحكم ← الإعدادات ← الأكواد المخصصة. يسجل مصدر كل زيارة، ونقرات واتساب والاتصال والنماذج، ومشاهدة المنتجات والإضافة للسلة تلقائياً.' }, ...codeBlock(snippet)),
    card({ title: '٢. صفحة إتمام الطلب', sub: 'يربط الطلب بالمتصفح. customer_id اختياري، بس يخلي رحلة العميل تنربط عبر كل أجهزته.' }, ...codeBlock(purchase)),
    card({ title: '٣. قوالب روابط الإعلانات', sub: 'أضف هذي في خانة URL Parameters بكل منصة عشان تنربط كل بيعة بحملتها وإعلانها' },
      h('div', { class: 'kv' }, Object.entries(platforms).flatMap(([, p]) => [
        h('strong', {}, p.label), h('code', {}, p.urlTemplate),
        h('button', { class: 'btn sm', onclick: (e) => copy(p.urlTemplate, e.target) }, 'نسخ'),
      ]))));
}

async function store(ctx, ws, redraw) {
  const isAdmin = ctx.state.user.role === 'admin';
  const rotate = (which) => async () => {
    if (!confirm('المفتاح القديم بيتوقف فوراً. متأكد؟')) return;
    await ctx.api.post(`/api/workspaces/${ws.id}/rotate`, { which });
    toast('تم تغيير المفتاح');
    ctx.refresh();
  };
  const orderExample = `curl -X POST ${ws.orders_api_url} \\
  -H "X-Api-Key: ${isAdmin ? ws.api_key : 'API_KEY'}" -H "Content-Type: application/json" \\
  -d '[{"order_id":"1001","value":450,"status":"completed","customer_id":"77","ts":"2026-10-01T12:00:00+03:00"}]'`;
  return h('div', { class: 'view' },
    card({ title: 'سلة (Salla)', sub: 'المبالغ والحالات الحقيقية تجي من المتجر. الطلبات الملغاة والمستردة تنحذف من الحساب تلقائياً.' },
      h('div', { class: 'kv' },
        h('span', {}, 'رابط الـ Webhook'), h('code', {}, ws.salla_webhook_url), h('button', { class: 'btn sm', onclick: (e) => copy(ws.salla_webhook_url, e.target) }, 'نسخ'),
        ...(isAdmin ? [h('span', {}, 'المفتاح السري (Signature)'), h('code', {}, ws.webhook_secret), h('div', { style: { display: 'flex', gap: '6px' } },
          h('button', { class: 'btn sm', onclick: (e) => copy(ws.webhook_secret, e.target) }, 'نسخ'), h('button', { class: 'btn sm danger', onclick: rotate('webhook_secret') }, 'تغيير'))] : [])),
      h('div', { class: 'note' }, 'في لوحة شركاء سلة: أضف الرابط للأحداث ', h('code', {}, 'order.created'), ' و ', h('code', {}, 'order.updated'), ' و ', h('code', {}, 'order.status.updated'), '، واختر طريقة التحقق Signature بنفس المفتاح السري.')),
    card({ title: 'أي متجر آخر (API)', sub: 'زد، شوبيفاي، ووكومرس أو نظامك الخاص: أرسل الطلبات لهذا الرابط' },
      isAdmin ? h('div', { class: 'kv' }, h('span', {}, 'API Key'), h('code', {}, ws.api_key), h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', { class: 'btn sm', onclick: (e) => copy(ws.api_key, e.target) }, 'نسخ'), h('button', { class: 'btn sm danger', onclick: rotate('api_key') }, 'تغيير'))) : null,
      ...codeBlock(orderExample)));
}

async function platforms(ctx, ws, redraw) {
  const isAdmin = ctx.state.user.role === 'admin';
  const conns = await ctx.api.get(`/api/w/${ws.id}/connections`);
  const info = ctx.state.meta.platforms;
  const STATUS = { ok: 'متصل', error: 'خطأ', pending: 'بانتظار المزامنة' };
  const list = table({
    rows: conns,
    emptyText: 'ما في منصات مربوطة. اربط من الأسفل أو ارفع ملف CSV.',
    columns: [
      { key: 'platform', label: 'المنصة', render: (c) => info[c.platform]?.label || c.platform },
      { key: 'account_id', label: 'الحساب', render: (c) => h('code', {}, c.account_id) },
      { key: 'status', label: 'الحالة', render: (c) => h('div', {}, h('span', { class: `status ${c.status}` }, STATUS[c.status] || c.status), c.last_error ? h('div', { class: 'muted', style: { whiteSpace: 'normal', maxWidth: '360px', fontSize: '12px' } }, c.last_error) : null) },
      { key: 'last_sync_at', label: 'آخر مزامنة', render: (c) => (c.last_sync_at ? fmt.datetime(c.last_sync_at) : '—') },
      { key: 'actions', label: '', render: (c) => h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', { class: 'btn sm', onclick: async (e) => {
          e.target.disabled = true; e.target.textContent = 'جاري…';
          const r = await ctx.api.post(`/api/w/${ws.id}/connections/${c.id}/sync`);
          toast(r.ok ? `تمت المزامنة: ${r.rows} صف` : `فشلت: ${r.error}`, r.ok ? '' : 'bad');
          redraw();
        } }, 'مزامنة الآن'),
        isAdmin ? h('button', { class: 'btn sm danger', onclick: async () => { if (confirm('حذف الربط؟ البيانات المسحوبة تبقى.')) { await ctx.api.del(`/api/w/${ws.id}/connections/${c.id}`); redraw(); } } }, 'حذف') : null) },
    ],
  });

  let platform = 'meta';
  const formBox = h('div');
  function drawForm() {
    const p = info[platform];
    const form = h('form', {
      class: 'form',
      onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'جاري الربط والمزامنة…';
        try {
          const r = await ctx.api.post(`/api/w/${ws.id}/connections`, {
            platform, account_id: data.account_id,
            credentials: Object.fromEntries(p.fields.map((f) => [f.key, data[f.key]])),
          });
          toast(r.sync.ok ? `تم الربط وسحب ${r.sync.rows} صف` : `تم الحفظ لكن المزامنة فشلت: ${r.sync.error}`, r.sync.ok ? '' : 'bad');
          redraw();
        } catch (err) {
          toast(err.message, 'bad');
          btn.disabled = false; btn.textContent = 'ربط';
        }
      },
    },
    h('div', { class: 'seg', style: { width: 'fit-content' } }, Object.entries(info).map(([k, v]) => h('button', { type: 'button', class: k === platform ? 'active' : '', onclick: () => { platform = k; drawForm(); } }, v.label))),
    h('div', { class: 'form-row' },
      field(p.accountLabel, h('input', { name: 'account_id', required: true, dir: 'ltr' })),
      p.fields.map((f) => field(f.label, h('input', { name: f.key, type: f.secret ? 'password' : 'text', dir: 'ltr', autocomplete: 'off' })))),
    h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'ربط')));
    formBox.replaceChildren(form);
  }
  drawForm();

  return h('div', { class: 'view' },
    card({ title: 'المنصات المربوطة', sub: 'تُسحب البيانات تلقائياً كل ساعة: الصرف والظهور والنقرات وما تدّعيه المنصة من مبيعات، على مستوى الإعلان يومياً' }, list),
    isAdmin ? card({ title: 'ربط منصة جديدة', sub: 'التوكنات تُحفظ مشفرة. أول مزامنة تسحب آخر 90 يوم.' }, formBox,
      h('div', { class: 'note' }, h('strong', {}, 'من وين أجيب التوكن؟ '),
        'ميتا: Business Settings ← System Users ← Generate Token (صلاحية ads_read). سناب وجوجل: Refresh Token من تطبيق OAuth الخاص بك (يحتاج متغيرات البيئة للتطبيق). تيك توك: Access Token من TikTok for Business Developers.')) : null);
}

async function data(ctx, ws) {
  const result = h('p', { class: 'muted', style: { padding: '0 18px' } });
  const input = h('input', { type: 'file', accept: '.csv,text/csv' });
  const template = 'date,channel,campaign,ad,spend,impressions,clicks,platform_conversions,platform_revenue\n2026-10-01,snapchat,عروض الخريف,فيديو المؤثرة,1200,90000,850,14,9800\n2026-10-01,tiktok,UGC,تجربة,900,120000,1100,9,6100';
  return card({ title: 'رفع الصرف وما تدّعيه المنصات (CSV)', sub: 'للمنصات غير المربوطة. الأعمدة المطلوبة: date و channel و spend، والباقي اختياري. إعادة رفع نفس اليوم والحملة والإعلان تستبدل القيم.' },
    ...codeBlock(template, h('button', { class: 'btn sm', onclick: () => {
      const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + template], { type: 'text/csv' })), download: 'spend-template.csv' });
      document.body.append(a); a.click(); a.remove();
    } }, 'تحميل القالب')),
    h('div', { class: 'code-actions' }, input, h('button', { class: 'btn primary', onclick: async () => {
      const file = input.files[0];
      if (!file) { result.textContent = 'اختر ملف CSV أولاً'; return; }
      try {
        const r = await ctx.api.csv(`/api/w/${ws.id}/spend`, await file.text());
        result.textContent = `تم استيراد ${r.imported} صف${r.errors.length ? ` · ${r.errors.length} صف فيه خطأ: ${r.errors.slice(0, 3).join('، ')}` : ''}`;
      } catch (err) { result.textContent = `فشل الرفع: ${err.message}`; }
    } }, 'رفع الملف')),
    result);
}

async function general(ctx, ws) {
  const models = ctx.state.meta.models;
  const form = h('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      await ctx.api.put(`/api/workspaces/${ws.id}`, { ...d, default_window: Number(d.default_window) });
      toast('تم الحفظ');
      await ctx.reloadWorkspaces();
    },
  },
  h('div', { class: 'form-row' },
    field('اسم العميل', h('input', { name: 'name', value: ws.name, required: true })),
    field('العملة', h('select', { name: 'currency' }, ['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'USD'].map((c) => h('option', { value: c, selected: c === ws.currency }, c))))),
  h('div', { class: 'form-row' },
    field('نموذج الإسناد الافتراضي', h('select', { name: 'default_model' }, Object.entries(models).map(([k, v]) => h('option', { value: k, selected: k === ws.default_model }, v)))),
    field('نافذة الإسناد الافتراضية', h('select', { name: 'default_window' }, [7, 14, 30, 60, 90].map((d) => h('option', { value: d, selected: d === ws.default_window }, `${d} يوم`))))),
  h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'حفظ')));
  return h('div', { class: 'view' },
    card({ title: 'إعدادات العميل' }, form),
    card({ title: 'حذف العميل', sub: 'يحذف كل البيانات نهائياً: الزيارات والطلبات والصرف والربط' },
      h('div', { class: 'code-actions' }, h('button', { class: 'btn danger', onclick: async () => {
        if (prompt(`اكتب اسم العميل للتأكيد: ${ws.name}`) !== ws.name) return;
        await ctx.api.del(`/api/workspaces/${ws.id}`);
        await ctx.reloadWorkspaces();
        location.hash = '#/agency';
      } }, 'حذف العميل نهائياً'))));
}

async function account(ctx) {
  const form = h('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await ctx.api.post('/api/auth/password', Object.fromEntries(new FormData(form)));
        toast('تم تغيير كلمة المرور');
        form.reset();
      } catch (err) { toast(err.message, 'bad'); }
    },
  },
  h('div', { class: 'form-row' },
    field('كلمة المرور الحالية', h('input', { name: 'current', type: 'password', required: true, autocomplete: 'current-password' })),
    field('كلمة المرور الجديدة', h('input', { name: 'next', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }))),
  h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'تغيير كلمة المرور')));
  return card({ title: 'حسابي', sub: `${ctx.state.user.name} · ${ctx.state.user.email}` }, form);
}

function newWorkspaceCard(ctx) {
  const form = h('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      const ws = await ctx.api.post('/api/workspaces', Object.fromEntries(new FormData(form)));
      await ctx.reloadWorkspaces();
      toast('تمت إضافة العميل');
      location.hash = `#/w/${ws.id}/settings`;
    },
  },
  h('div', { class: 'form-row' },
    field('اسم العميل / المتجر', h('input', { name: 'name', required: true })),
    field('العملة', h('select', { name: 'currency' }, ['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'USD'].map((c) => h('option', { value: c }, c))))),
  h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'إضافة')));
  return card({ title: 'عميل جديد', sub: 'كل عميل له كود تتبع ومفاتيح وبيانات منفصلة تماماً' }, form);
}
