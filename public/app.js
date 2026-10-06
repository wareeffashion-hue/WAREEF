const LABELS = {
  google: 'جوجل', meta: 'ميتا', snapchat: 'سناب شات', tiktok: 'تيك توك', x: 'إكس',
  organic_search: 'بحث عضوي', organic_social: 'سوشال عضوي', email: 'بريد', referral: 'إحالة',
  direct: 'مباشر / غير معروف', other: 'أخرى',
};
const TYPE_LABELS = { purchase: 'طلب', form: 'نموذج', whatsapp: 'واتساب', call: 'اتصال' };
const DAY = 86_400_000;

const $ = (sel) => document.querySelector(sel);
const state = { meta: null, report: null };

/** Tiny DOM builder; all text goes through textContent (campaign names come from URLs). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : String(c));
  return el;
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const money = (v) => (v == null ? '—' : `${nf.format(v)} ر.س`);
const money2 = (v) => (v == null ? '—' : `${nf2.format(v)} ر.س`);
const count = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? nf.format(v) : nf1.format(v));
const ratio = (v) => (v == null ? '—' : `${nf2.format(v)}x`);
const label = (ch) => LABELS[ch] || ch;
const dot = (ch) => h('span', { class: 'dot', style: `background: var(--c-${ch}, var(--c-other))` });
const isoDay = (d) => d.toISOString().slice(0, 10);

function params() {
  return new URLSearchParams({ from: $('#from').value, to: $('#to').value, model: $('#model').value, window: $('#window').value });
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function setRange(days) {
  const to = new Date();
  $('#to').value = isoDay(to);
  $('#from').value = isoDay(new Date(to - (days - 1) * DAY));
}

function renderKpis(r) {
  const t = r.totals;
  const kpi = (lbl, value, sub, cls) => h('div', { class: `kpi ${cls || ''}` },
    h('div', { class: 'label' }, lbl), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
  const gapPct = t.claim_gap != null && t.revenue ? (t.claim_gap / t.revenue) * 100 : null;
  $('#kpis').replaceChildren(
    kpi('المبيعات الفعلية (المتجر)', money(t.revenue), `${nf.format(t.orders)} طلب · بدون الملغي والمسترد`),
    kpi('مجموع ما تدّعيه المنصات', t.platform_revenue ? money(t.platform_revenue) : '—', 'من تقارير المنصات المرفوعة'),
    kpi('الفجوة (مبيعات وهمية)', t.claim_gap != null ? money(t.claim_gap) : '—',
      gapPct != null ? `المنصات تبالغ بـ ${nf.format(gapPct)}% فوق الحقيقة` : 'ارفع تقارير المنصات لحساب الفجوة',
      t.claim_gap > 0 ? 'alert' : ''),
    kpi('التواصل', nf.format(t.leads), `${nf.format(t.form)} نموذج · ${nf.format(t.whatsapp)} واتساب · ${nf.format(t.call)} اتصال`),
    kpi('الصرف الإعلاني', money(t.spend), `العائد الحقيقي ROAS: ${ratio(t.roas)}`, t.roas >= 3 ? 'good' : ''),
    kpi('تكلفة الطلب الحقيقية', money2(t.cost_per_order), `تكلفة التواصل: ${money2(t.cost_per_lead)}`),
  );
}

function renderClaims(r) {
  const rows = r.rows.filter((x) => x.platform_revenue > 0 || (x.spend > 0 && x.revenue > 0));
  if (!rows.length) {
    $('#claims').replaceChildren(h('div', { class: 'empty' }, 'ارفع ملف الصرف وما تدّعيه كل منصة من تبويب "الربط والإعداد" عشان تشوف المقارنة.'));
    return;
  }
  const max = Math.max(...rows.map((x) => Math.max(x.revenue, x.platform_revenue)), 1);
  $('#claims').replaceChildren(...rows.map((x) => {
    const diff = x.platform_revenue - x.revenue;
    return h('div', { class: 'claim-row' },
      h('div', { class: 'name' }, dot(x.channel), label(x.channel)),
      h('div', { class: 'bars' },
        h('div', { class: 'bar-line' }, h('div', { class: 'bar truth', style: `width:${(x.revenue / max) * 85}%` }), money(x.revenue)),
        h('div', { class: 'bar-line' }, h('div', { class: 'bar claim', style: `width:${(x.platform_revenue / max) * 85}%` }), money(x.platform_revenue),
          x.platform_revenue ? h('span', { class: diff > 0 ? 'over' : 'under' }, diff > 0 ? `(+${money(diff)} مبالغة)` : `(${money(diff)})`) : null),
      ));
  }));
}

function renderTable(r) {
  const model = state.meta.models[r.params.model];
  $('#table-sub').textContent = `كل طلب وتواصل منسوب لمصدره — ${model} · نافذة ${r.params.windowDays} يوم · التواصل يُحسب مرة لكل زائر في اليوم`;
  const cols = [
    ['المصدر'], ['الطلبات', 'num'], ['المبيعات المنسوبة', 'num'], ['تدّعيه المنصة', 'num'], ['الفرق', 'num'],
    ['نماذج', 'num'], ['واتساب', 'num'], ['اتصال', 'num'], ['الصرف', 'num'], ['ROAS الحقيقي', 'num'],
    ['ROAS المنصة', 'num'], ['تكلفة الطلب', 'num'], ['تكلفة التواصل', 'num'],
  ];
  const diffCell = (x) => (x.overclaim == null ? h('td', { class: 'num muted' }, '—')
    : h('td', { class: `num ${x.overclaim > 0 ? 'over' : 'under'}` }, `${x.overclaim > 0 ? '+' : ''}${money(x.overclaim)}`));
  const t = r.totals;
  const body = r.rows.map((x) => h('tr', {},
    h('td', {}, dot(x.channel), label(x.channel)),
    h('td', { class: 'num' }, count(x.orders)),
    h('td', { class: 'num strong' }, money(x.revenue)),
    h('td', { class: 'num' }, x.platform_revenue ? money(x.platform_revenue) : '—'),
    diffCell(x),
    h('td', { class: 'num' }, count(x.form)),
    h('td', { class: 'num' }, count(x.whatsapp)),
    h('td', { class: 'num' }, count(x.call)),
    h('td', { class: 'num' }, x.spend ? money(x.spend) : '—'),
    h('td', { class: 'num strong' }, ratio(x.roas)),
    h('td', { class: 'num muted' }, ratio(x.platform_roas)),
    h('td', { class: 'num' }, money2(x.cost_per_order)),
    h('td', { class: 'num' }, money2(x.cost_per_lead)),
  ));
  $('#sources').replaceChildren(
    h('thead', {}, h('tr', {}, cols.map(([c, cls]) => h('th', { class: cls }, c)))),
    h('tbody', {}, body.length ? body : h('tr', {}, h('td', { colspan: cols.length, class: 'empty' }, 'لا توجد بيانات في هذه الفترة'))),
    h('tfoot', {}, h('tr', {},
      h('td', {}, 'الإجمالي'),
      h('td', { class: 'num' }, nf.format(t.orders)),
      h('td', { class: 'num' }, money(t.revenue)),
      h('td', { class: 'num' }, t.platform_revenue ? money(t.platform_revenue) : '—'),
      h('td', { class: `num ${t.claim_gap > 0 ? 'over' : ''}` }, t.claim_gap != null ? money(t.claim_gap) : '—'),
      h('td', { class: 'num' }, nf.format(t.form)),
      h('td', { class: 'num' }, nf.format(t.whatsapp)),
      h('td', { class: 'num' }, nf.format(t.call)),
      h('td', { class: 'num' }, money(t.spend)),
      h('td', { class: 'num' }, ratio(t.roas)),
      h('td', { class: 'num' }, ''),
      h('td', { class: 'num' }, money2(t.cost_per_order)),
      h('td', { class: 'num' }, money2(t.cost_per_lead)),
    )),
  );
}

function renderCompare(r) {
  const models = Object.keys(state.meta.models);
  const channels = [...new Set(models.flatMap((m) => Object.keys(r.compare[m])))];
  channels.sort((a, b) => (r.compare[r.params.model][b]?.revenue || 0) - (r.compare[r.params.model][a]?.revenue || 0));
  const spend = Object.fromEntries(r.rows.map((x) => [x.channel, x.spend]));
  $('#compare').replaceChildren(
    h('thead', {}, h('tr', {}, h('th', {}, 'المصدر'), models.map((m) => h('th', { class: 'num' }, state.meta.models[m])), h('th', { class: 'num' }, 'الصرف'))),
    h('tbody', {}, channels.length ? channels.map((ch) => {
      const vals = models.map((m) => r.compare[m][ch]?.revenue || 0);
      const best = Math.max(...vals);
      return h('tr', {},
        h('td', {}, dot(ch), label(ch)),
        vals.map((v) => h('td', { class: 'num' }, v === best && v > 0 ? h('span', { class: 'best' }, money(v)) : money(v))),
        h('td', { class: 'num muted' }, spend[ch] ? money(spend[ch]) : '—'));
    }) : h('tr', {}, h('td', { colspan: models.length + 2, class: 'empty' }, 'لا توجد طلبات في هذه الفترة'))),
  );
}

async function renderJourneys() {
  const list = await api(`/api/journeys?${params()}`);
  const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
  $('#journeys').replaceChildren(...(list.length ? list.map((j) => h('li', {},
    h('div', { class: 'j-head' },
      h('span', { class: 'j-type' }, TYPE_LABELS[j.type] || j.type),
      j.type === 'purchase' ? h('strong', {}, money(j.value)) : null,
      j.order_id ? h('span', { class: 'muted' }, `#${j.order_id}`) : null,
      h('span', { class: 'muted' }, fmt.format(new Date(j.ts)))),
    h('div', { class: 'j-path' },
      j.path.length ? j.path.flatMap((p, i) => [
        i ? h('span', { class: 'arrow' }, '←') : null,
        h('span', { class: 'chip', title: p.campaign || '' }, dot(p.channel), label(p.channel), p.campaign ? h('span', { class: 'muted' }, p.campaign) : null),
      ]) : h('span', { class: 'muted' }, 'بدون مسار معروف'),
      h('span', { class: 'arrow' }, '·'),
      Object.entries(j.credits).map(([ch, c]) => h('span', { class: 'chip' }, label(ch), h('span', { class: 'pct' }, `${nf.format(c * 100)}%`)))),
  )) : [h('li', { class: 'empty' }, 'لا توجد تحويلات في هذه الفترة')]));
}

async function load() {
  try {
    state.report = await api(`/api/report?${params()}`);
    renderKpis(state.report);
    renderClaims(state.report);
    renderTable(state.report);
    renderCompare(state.report);
    if (!$('#view-journeys').hidden) await renderJourneys();
  } catch (err) {
    $('#kpis').replaceChildren(h('div', { class: 'kpi' }, h('div', { class: 'label' }, 'خطأ في تحميل البيانات'), h('div', { class: 'sub' }, err.message)));
  }
}

function renderSetup() {
  const m = state.meta;
  $('#snippet').textContent = `<script async src="${m.snippetUrl}"></script>`;
  $('#purchase').textContent = `<script>
  window.wtrack = window.wtrack || function () { (wtrack.q = wtrack.q || []).push(arguments); };
  wtrack('purchase', { order_id: '{{ order.id }}', value: {{ order.total }}, currency: 'SAR' });
</script>`;
  $('#webhook').textContent = m.webhookUrl;
}

async function init() {
  state.meta = await api('/api/meta');
  $('#model').replaceChildren(...Object.entries(state.meta.models).map(([k, v]) => h('option', { value: k }, v)));
  $('#model').value = state.meta.defaultModel;
  setRange(7);
  renderSetup();

  document.querySelectorAll('.presets button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.presets button').forEach((x) => x.classList.toggle('active', x === b));
    setRange(Number(b.dataset.days));
    load();
  }));
  ['#from', '#to'].forEach((s) => $(s).addEventListener('change', () => {
    document.querySelectorAll('.presets button').forEach((x) => x.classList.remove('active'));
    load();
  }));
  ['#model', '#window'].forEach((s) => $(s).addEventListener('change', load));

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${t.dataset.view}`; });
    if (t.dataset.view === 'journeys') renderJourneys();
  }));

  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    await navigator.clipboard.writeText($(`#${b.dataset.copy}`).textContent);
    const old = b.textContent; b.textContent = 'تم النسخ ✓'; setTimeout(() => { b.textContent = old; }, 1500);
  }));

  $('#upload').addEventListener('click', async () => {
    const file = $('#csv').files[0];
    if (!file) { $('#upload-result').textContent = 'اختر ملف CSV أولاً'; return; }
    try {
      const res = await api('/api/spend', { method: 'POST', body: await file.text(), headers: { 'Content-Type': 'text/csv' } });
      $('#upload-result').textContent = `تم استيراد ${res.imported} صف${res.errors.length ? ` · ${res.errors.length} صف فيه خطأ: ${res.errors.slice(0, 3).join('، ')}` : ''}`;
      load();
    } catch (err) {
      $('#upload-result').textContent = `فشل الرفع: ${err.message}`;
    }
  });

  load();
}

init();
