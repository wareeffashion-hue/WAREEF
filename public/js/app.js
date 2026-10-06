import { api } from './api.js';
import { h, toast, setCurrency } from './ui.js';
import { authView } from './pages/auth.js';

const PAGES = {
  agency: () => import('./pages/agency.js'),
  overview: () => import('./pages/overview.js'),
  analytics: () => import('./pages/analytics.js'),
  channels: () => import('./pages/channels.js'),
  campaigns: () => import('./pages/campaigns.js'),
  creatives: () => import('./pages/creatives.js'),
  customers: () => import('./pages/customers.js'),
  funnel: () => import('./pages/funnel.js'),
  measurement: () => import('./pages/measurement.js'),
  journeys: () => import('./pages/journeys.js'),
  mmm: () => import('./pages/mmm.js'),
  settings: () => import('./pages/settings.js'),
  team: () => import('./pages/team.js'),
  billing: () => import('./pages/billing.js'),
  platform: () => import('./pages/platform.js'),
};
const GLOBAL_PAGES = ['agency', 'team', 'billing', 'platform'];

const ICONS = {
  agency: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4',
  overview: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  analytics: 'M4 19h16M5 15l4-5 4 3 6-7',
  channels: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M5 5l5 5M19 5l-5 5M5 19l5-5M19 19l-5-5',
  campaigns: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 12h.01',
  creatives: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  customers: 'M9 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M21 20c0-2.6-1.7-4.8-4-5.6',
  funnel: 'M4 5h16l-6 8v5l-4 2v-7z',
  measurement: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  journeys: 'M5 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M19 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 6h7a3 3 0 0 1 0 6H10a3 3 0 0 0 0 6h7',
  mmm: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  settings: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  billing: 'M3 6h18v12H3zM3 10h18M7 15h4',
  platform: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
};

const NAV = [
  { group: null, items: [['agency', 'لوحة الوكالة', true], ['overview', 'نظرة عامة']] },
  { group: 'التحليل', items: [['analytics', 'التحليلات'], ['channels', 'القنوات'], ['campaigns', 'الحملات'], ['creatives', 'الإبداعات'], ['customers', 'العملاء'], ['funnel', 'القُمع']] },
  { group: 'القياس', items: [['measurement', 'القياس الموحّد'], ['journeys', 'الإسناد والرحلات'], ['mmm', 'المزيج التسويقي']] },
  { group: 'الإدارة', items: [['settings', 'الإعدادات والربط'], ['team', 'الفريق', true, 'admin'], ['billing', 'الاشتراك', true, 'customer'], ['platform', 'لوحة المنصة', true, 'super']] },
];

// ----------------------------------------------------------------- state
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`wt:${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`wt:${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const state = {
  user: null, org: null, meta: null, workspaces: [],
  wsId: store.get('ws', null),
  preset: store.get('preset', 30),
  from: null, to: null,
  model: store.get('model', null),
  window: store.get('window', null),
};
function applyPreset(days) {
  const to = new Date();
  state.preset = days;
  state.to = iso(to);
  state.from = iso(new Date(to.getTime() - (days - 1) * 86400000));
}
if (state.preset) applyPreset(state.preset);
else { state.from = store.get('from', null); state.to = store.get('to', null); if (!state.from) applyPreset(30); }

const theme = store.get('theme', null);
if (theme) document.documentElement.dataset.theme = theme;

export const query = (extra = {}) => new URLSearchParams({
  from: state.from, to: state.to, ...(state.model && { model: state.model }), ...(state.window && { window: state.window }), ...extra,
}).toString();

// ---------------------------------------------------------------- routing
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'w' && parts[1]) return { wsId: Number(parts[1]), page: parts[2] || 'overview' };
  if (parts[0] && PAGES[parts[0].split('?')[0]]) return { page: parts[0].split('?')[0] };
  return { page: null };
}
export const navigate = (page, wsId = state.wsId) => {
  const global = GLOBAL_PAGES.includes(page);
  location.hash = global ? `#/${page}` : `#/w/${wsId}/${page}`;
};

let renderToken = 0;
async function render() {
  const root = document.getElementById('root');
  if (!state.user) return;
  let { page, wsId } = parseRoute();
  if (!state.workspaces.length && !GLOBAL_PAGES.includes(page)) page = state.user.role === 'admin' ? 'settings' : 'empty';
  if (wsId && state.workspaces.some((w) => w.id === wsId)) { state.wsId = wsId; store.set('ws', wsId); }
  if (!state.workspaces.some((w) => w.id === state.wsId)) state.wsId = state.workspaces[0]?.id ?? null;
  if (!page) return navigate(state.org?.state !== 'ok' ? 'billing' : state.workspaces.length > 1 ? 'agency' : 'overview');
  if (page === 'team' && state.user.role !== 'admin') return navigate('overview');
  if (page === 'platform' && !state.user.is_superadmin) return navigate('overview');
  const ws = state.workspaces.find((w) => w.id === state.wsId);
  setCurrency(ws?.currency);

  const shell = root.querySelector('.app') || buildShell(root);
  shell.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  shell.querySelector('.sidebar').classList.remove('open');
  syncControls(shell, page);
  const container = shell.querySelector('.page');
  const token = ++renderToken;
  container.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  try {
    if (page === 'empty') {
      container.replaceChildren(h('div', { class: 'empty' }, 'ما عندك عملاء مرتبطين بحسابك. تواصل مع مدير الوكالة.'));
      return;
    }
    const mod = await PAGES[page]();
    const node = await mod.default({ state, api, query, navigate, ws, refresh: render, reloadWorkspaces });
    if (token === renderToken) container.replaceChildren(...[banner(page), node].filter(Boolean));
  } catch (err) {
    if (token !== renderToken) return;
    if (err.status === 402) {
      container.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'paywall' },
        h('h2', {}, 'التقارير مقفلة مؤقتاً'), h('p', { class: 'muted' }, err.message),
        h('a', { class: 'btn primary', href: '#/billing' }, 'اختر باقتك'))));
      return;
    }
    container.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'empty' }, `خطأ: ${err.message}`)));
    console.error(err);
  }
}

/** Trial / expiry / quota notice above every page. */
function banner(page) {
  const org = state.org;
  if (!org || page === 'billing') return null;
  const daysLeft = org.access_ends_at ? Math.ceil((org.access_ends_at - Date.now()) / 86400000) : null;
  const cta = h('a', { class: 'btn sm primary', href: '#/billing' }, 'اختر باقتك');
  if (org.state === 'grace' || org.state === 'locked') return h('div', { class: 'banner bad' }, 'انتهى اشتراكك. بياناتك محفوظة؛ جدّد عشان ترجع التقارير.', cta);
  if (org.status === 'trialing' && daysLeft != null) return h('div', { class: `banner ${daysLeft <= 3 ? 'warn' : ''}` }, `باقي ${daysLeft} يوم من تجربتك المجانية.`, cta);
  if (org.usage.events > org.limits.events) return h('div', { class: 'banner warn' }, 'تجاوزت حد الأحداث الشهري لباقتك. الطلبات والتواصل مستمرة، والزيارات بتتوقف قريباً.', h('a', { class: 'btn sm primary', href: '#/billing' }, 'رقِّ الباقة'));
  if (daysLeft != null && daysLeft <= 5) return h('div', { class: 'banner warn' }, `اشتراكك ينتهي خلال ${daysLeft} يوم.`, h('a', { class: 'btn sm primary', href: '#/billing' }, 'جدّد'));
  return null;
}

async function reloadWorkspaces() {
  state.workspaces = await api.get('/api/workspaces');
  const shell = document.querySelector('.app');
  if (shell) fillWorkspaceSelect(shell.querySelector('#ws-select'));
}

function fillWorkspaceSelect(sel) {
  sel.replaceChildren(...state.workspaces.map((w) => h('option', { value: w.id }, w.name)));
  if (state.wsId) sel.value = state.wsId;
}

function syncControls(shell, page) {
  const noFilters = ['settings', 'team'].includes(page);
  shell.querySelector('.filters').hidden = noFilters || ['billing', 'platform'].includes(page);
  shell.querySelector('#ws-wrap').hidden = GLOBAL_PAGES.includes(page) || state.workspaces.length < 2;
  shell.querySelector('#model-wrap').hidden = ['agency', 'customers', 'funnel', 'mmm'].includes(page);
  shell.querySelector('#ws-select').value = state.wsId ?? '';
  const ws = state.workspaces.find((w) => w.id === state.wsId);
  shell.querySelector('#model').value = state.model || ws?.default_model || state.meta.defaultModel;
  shell.querySelector('#window').value = state.window || '30';
  shell.querySelector('#from').value = state.from;
  shell.querySelector('#to').value = state.to;
  shell.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.days) === state.preset));
}

function buildShell(root) {
  const navLinks = NAV.map(({ group, items }) => [
    group ? h('div', { class: 'nav-group' }, group) : null,
    items.filter(([, , , need]) => !need || (need === 'admin' && state.user.role === 'admin') || (need === 'super' && state.user.is_superadmin) || (need === 'customer' && !state.user.is_superadmin)).map(([page, text, global]) => h('a', {
      class: 'nav-link', 'data-page': page, href: '#',
      onclick: (e) => { e.preventDefault(); navigate(page); },
    }, icon(page), text, global ? null : null)),
  ]);
  const presets = h('div', { class: 'seg' }, [7, 30, 90].map((d) => h('button', {
    'data-days': d, onclick: () => { applyPreset(d); store.set('preset', d); render(); },
  }, d === 7 ? '7 أيام' : `${d} يوم`)));
  const dateInput = (id) => h('input', {
    type: 'date', id, onchange: (e) => {
      state[id] = e.target.value; state.preset = null;
      if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
      store.set('preset', null); store.set('from', state.from); store.set('to', state.to); render();
    },
  });
  const modelSelect = h('select', { id: 'model', onchange: (e) => { state.model = e.target.value; store.set('model', state.model); render(); } },
    Object.entries(state.meta.models).map(([k, v]) => h('option', { value: k }, v)));
  const windowSelect = h('select', { id: 'window', onchange: (e) => { state.window = e.target.value; store.set('window', state.window); render(); } },
    [7, 14, 30, 60, 90].map((d) => h('option', { value: d }, `${d} يوم`)));
  const wsSelect = h('select', { id: 'ws-select', onchange: (e) => navigate(parseRoute().page && !GLOBAL_PAGES.includes(parseRoute().page) ? parseRoute().page : 'overview', Number(e.target.value)) });
  fillWorkspaceSelect(wsSelect);

  const sidebar = h('aside', { class: 'sidebar' },
    h('a', { class: 'brand', href: '/', style: { color: 'inherit', textDecoration: 'none', display: 'block' } },
      h('img', { class: 'brand-logo on-light', src: '/img/logo.svg', alt: state.meta.appName }),
      h('img', { class: 'brand-logo on-dark', src: '/img/logo-dark.svg', alt: state.meta.appName }),
      h('span', { class: 'brand-sub' }, state.org?.name || '')),
    navLinks,
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'user-chip' }, h('span', { class: 'avatar' }, (state.user.name || '?').trim().charAt(0)), h('div', {}, h('div', {}, state.user.name), h('div', { class: 'muted' }, state.user.role === 'admin' ? 'مدير' : 'عضو'))),
      h('a', { class: 'nav-link', href: '#', onclick: async (e) => { e.preventDefault(); await api.post('/api/auth/logout'); location.href = '/'; } }, icon('logout'), 'تسجيل الخروج')));

  const app = h('div', { class: 'app' },
    sidebar,
    h('div', { class: 'main' },
      h('header', { class: 'topbar' },
        h('button', { class: 'icon-btn menu-btn', 'aria-label': 'القائمة', onclick: () => sidebar.classList.toggle('open') }, icon('menu')),
        h('label', { class: 'control', id: 'ws-wrap' }, h('span', { class: 'k' }, 'العميل'), wsSelect),
        h('div', { class: 'filters', style: { display: 'contents' } },
          presets,
          h('label', { class: 'control' }, icon('calendar'), dateInput('from'), h('span', { class: 'k' }, '–'), dateInput('to')),
          h('label', { class: 'control', id: 'model-wrap' }, h('span', { class: 'k' }, 'الإسناد'), modelSelect, h('span', { class: 'k' }, '·'), windowSelect)),
        h('div', { class: 'spacer' }),
        h('button', {
          class: 'icon-btn', title: 'الوضع الداكن', 'aria-label': 'تبديل الوضع',
          onclick: () => {
            const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.dataset.theme = dark ? 'light' : 'dark';
            store.set('theme', document.documentElement.dataset.theme);
            render();
          },
        }, icon('moon'))),
      h('main', { class: 'page' })));
  root.replaceChildren(app);
  return app;
}

async function boot() {
  const root = document.getElementById('root');
  const [auth, config] = await Promise.all([api.get('/api/auth/state'), api.get('/api/public/config')]);
  document.title = `${config.appName} · لوحة التحكم`;
  if (!auth.user) {
    root.replaceChildren(authView({ needsSetup: auth.needsSetup, config, onDone: (hash) => { location.hash = hash; location.reload(); } }));
    return;
  }
  if (/^#\/?(login|signup|forgot|reset)/.test(location.hash)) history.replaceState(null, '', '#/');
  state.user = auth.user;
  state.org = auth.org;
  [state.meta, state.workspaces] = await Promise.all([api.get('/api/meta'), api.get('/api/workspaces')]);
  window.addEventListener('hashchange', render);
  window.addEventListener('auth:expired', () => { toast('انتهت الجلسة، سجّل دخولك من جديد', 'bad'); setTimeout(() => location.reload(), 1200); });
  render();
}

boot().catch((err) => {
  document.getElementById('root').replaceChildren(h('div', { class: 'empty' }, `تعذر التحميل: ${err.message}`));
});
