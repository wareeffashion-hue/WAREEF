import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');
const { dayOf, config } = await import('../src/config.js');

const db = openDb(':memory:');
const server = createServer(createApp(db)).listen(0);
const base = `http://localhost:${server.address().port}`;
test.after(() => server.close());
const today = dayOf(Date.now());
const q = `from=${today}&to=${today}`;

/** Minimal cookie-keeping client. */
function client() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  return { get: (p) => call('GET', p), post: (p, b, h) => call('POST', p, b, h), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p) };
}

const admin = client();
const member = client();
let shop;
let other;

const collect = (key, body, ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile') =>
  fetch(`${base}/collect?k=${key}`, { method: 'POST', body: JSON.stringify(body), headers: { 'User-Agent': ua } }).then((r) => r.json());
const salla = (ws, payload, secret = ws.webhook_secret) => {
  const raw = JSON.stringify(payload);
  return fetch(`${base}/webhooks/salla/${ws.site_key}`, {
    method: 'POST', body: raw, headers: { 'x-salla-signature': createHmac('sha256', secret).update(raw).digest('hex') },
  });
};

test('first signup owns the platform and gets an active account', async () => {
  assert.equal((await admin.get('/api/auth/state')).body.needsSetup, true);
  const r = await admin.post('/api/auth/signup', { email: 'boss@agency.sa', name: 'Boss', password: 'longpassword', company: 'الوكالة', store: 'متجر' });
  assert.equal(r.status, 200);
  const state = (await admin.get('/api/auth/state')).body;
  assert.equal(state.user.role, 'admin');
  assert.equal(state.user.is_superadmin, 1);
  assert.equal(state.org.state, 'ok');
  shop = (await admin.get('/api/workspaces/1')).body;
  other = (await admin.post('/api/workspaces', { name: 'عميل آخر' })).body;
  assert.ok(shop.site_key && shop.api_key && shop.webhook_secret);
});

test('auth: bad password rejected, API needs a session, writes need the CSRF header', async () => {
  assert.equal((await client().post('/api/auth/login', { email: 'boss@agency.sa', password: 'wrongpassword' })).status, 401);
  assert.equal((await client().get('/api/workspaces')).status, 401);
  const res = await fetch(`${base}/api/workspaces`, { method: 'POST', headers: { Cookie: 'x' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('tracker script is served per workspace', async () => {
  const js = await fetch(`${base}/t.js?k=${shop.site_key}`).then((r) => r.text());
  assert.match(js, new RegExp(`/collect\\?k=${shop.site_key}`));
  assert.equal((await fetch(`${base}/t.js?k=nope`)).status, 404);
});

test('end to end: cross-device journey, leads, order merge, funnel, spend, reports', async () => {
  const phone = 'visitor_phone_0001';
  const laptop = 'visitor_laptop_002';
  // Day 1 on the phone: TikTok ad click, first order.
  await collect(shop.site_key, { v: phone, e: 'pageview', s: 1, url: 'https://shop.sa/?ttclid=1&utm_campaign=Fall&utm_content=ugc' });
  await collect(shop.site_key, { v: phone, e: 'view_item', url: 'https://shop.sa/x/p1' });
  await collect(shop.site_key, { v: phone, e: 'add_to_cart' });
  await collect(shop.site_key, { v: phone, e: 'purchase', order_id: 'A1', value: 999 });
  await salla(shop, { event: 'order.created', data: { id: 'A1', amounts: { total: { amount: 400 } }, status: { slug: 'completed' }, customer: { id: 77, first_name: 'نورة', city: 'جدة' } } });
  // Later on the laptop: Google click, second order by the same customer (pixel saw the laptop).
  await collect(shop.site_key, { v: laptop, e: 'pageview', s: 1, url: 'https://shop.sa/?gclid=2' }, 'Mozilla/5.0 (Windows NT 10.0)');
  await collect(shop.site_key, { v: laptop, e: 'whatsapp' });
  assert.equal((await collect(shop.site_key, { v: laptop, e: 'whatsapp' })).stored, null, 'leads dedupe per day');
  await collect(shop.site_key, { v: laptop, e: 'purchase', order_id: 'A2', value: 600, customer_id: '77' });
  await salla(shop, { event: 'order.created', data: { id: 'A2', amounts: { total: { amount: 600 } }, status: { slug: 'completed' }, customer: { id: 77 } } });
  // Unmatched + cancelled orders; bad signature; bot traffic.
  await salla(shop, { event: 'order.created', data: { id: 'A3', amounts: { total: { amount: 300 } }, status: { slug: 'completed' } } });
  await salla(shop, { event: 'order.created', data: { id: 'A4', amounts: { total: { amount: 5000 } }, status: { slug: 'canceled' } } });
  assert.equal((await salla(shop, { event: 'order.created', data: { id: 'X' } }, 'wrong')).status, 401);
  assert.equal((await collect(shop.site_key, { v: 'bot_visitor_01', e: 'pageview', s: 1, url: 'https://shop.sa/?gclid=9' }, 'Googlebot/2.1')).bot, true);

  const csv = `date,channel,campaign,ad,spend,platform_conversions,platform_revenue\n${today},TikTok,Fall,ugc,100,2,1000\n${today},google,,,50,1,600\n`;
  assert.deepEqual((await admin.post(`/api/w/${shop.id}/spend`, csv)).body, { imported: 2, errors: [] });

  const ch = (await admin.get(`/api/w/${shop.id}/report/channels?${q}&model=last_non_direct`)).body;
  assert.equal(ch.totals.orders, 3, JSON.stringify(ch.totals));
  assert.equal(ch.totals.revenue, 1300);
  assert.equal(ch.totals.whatsapp, 1, JSON.stringify(ch.totals));
  const row = (c) => ch.rows.find((r) => r.channel === c);
  assert.equal(row('tiktok').revenue, 400);
  assert.equal(row('google').revenue, 600);
  assert.equal(row('direct').revenue, 300);
  assert.equal(row('tiktok').overclaim, 600);

  // First click: the laptop order belongs to TikTok thanks to the phone journey (cross-device).
  const fc = (await admin.get(`/api/w/${shop.id}/report/channels?${q}&model=first_click`)).body;
  assert.equal(fc.rows.find((r) => r.channel === 'tiktok').revenue, 1000);

  const camp = (await admin.get(`/api/w/${shop.id}/report/campaigns?${q}&model=first_click`)).body;
  const fall = camp.rows.find((r) => r.campaign === 'Fall');
  assert.equal(fall.revenue, 1000);
  assert.equal(fall.spend, 100);
  const cr = (await admin.get(`/api/w/${shop.id}/report/creatives?${q}`)).body;
  assert.equal(cr.rows.find((r) => r.creative === 'ugc').spend, 100);

  const ms = (await admin.get(`/api/w/${shop.id}/report/measurement?${q}`)).body;
  assert.equal(ms.totals.cross_device_orders, 1);
  assert.equal(ms.totals.unmatched_orders, 1);
  assert.equal(ms.totals.platform_revenue, 1600);

  const cu = (await admin.get(`/api/w/${shop.id}/report/customers?${q}`)).body;
  assert.equal(cu.totals.active, 1);
  assert.equal(cu.top[0].ltv, 1000);
  assert.equal(cu.top[0].channel, 'tiktok');
  assert.equal(cu.top[0].city, 'جدة');

  const fu = (await admin.get(`/api/w/${shop.id}/report/funnel?${q}`)).body;
  assert.deepEqual([fu.total.visitors, fu.total.view_item, fu.total.add_to_cart, fu.total.purchase], [2, 1, 1, 2]);

  const jr = (await admin.get(`/api/w/${shop.id}/report/journeys?${q}`)).body;
  assert.ok(jr.recent.find((j) => j.order_id === 'A2').cross_device);
  for (const name of ['overview', 'analytics', 'mmm']) {
    assert.equal((await admin.get(`/api/w/${shop.id}/report/${name}?${q}`)).status, 200, name);
  }
  const ag = (await admin.get(`/api/agency?${q}`)).body;
  assert.equal(ag.find((w) => w.id === shop.id).current.revenue, 1300);
});


test('logged-in Salla shopper: webhook-only order finds its ad journey via identify', async () => {
  const ws = (await admin.post('/api/workspaces', { name: 'متجر سلة' })).body;
  const v = 'visitor_snap_00001';
  await collect(ws.site_key, { v, e: 'pageview', s: 1, url: 'https://shop.sa/?ScCid=abc&utm_campaign=Promo' });
  assert.equal((await collect(ws.site_key, { v, e: 'identify', customer_id: '501' })).stored, 'identify');
  assert.match((await collect(ws.site_key, { v, e: 'identify' })).error || '', /customer_id/);
  // No pixel purchase event: the order only arrives from Salla, carrying the customer id.
  await salla(ws, { event: 'order.created', data: { id: 'B1', amounts: { total: { amount: 250 } }, status: { slug: 'completed' }, customer: { id: 501 } } });
  const ch = (await admin.get(`/api/w/${ws.id}/report/channels?${q}&model=last_non_direct`)).body;
  assert.equal(ch.totals.orders, 1);
  assert.equal(ch.rows.find((r) => r.channel === 'snapchat')?.revenue, 250, JSON.stringify(ch.rows));
  const js = await fetch(`${base}/t.js?k=${ws.site_key}`).then((r) => r.text());
  assert.match(js, /salla\.config\.get\('user\.id'\)/);
});
test('Salla app: one webhook for all stores, linked by code from the app settings', async () => {
  config.salla.webhookSecret = 'app-secret';
  const id = (await admin.get('/api/workspaces')).body.find((w) => w.name === 'متجر سلة').id;
  const ws = (await admin.get(`/api/workspaces/${id}`)).body;
  assert.match(ws.salla_link_code, /^azwo-[0-9a-f]{24}$/);
  assert.equal(ws.salla.linked, false);
  const app = (payload, headers) => {
    const body = JSON.stringify(payload);
    const sig = createHmac('sha256', 'app-secret').update(body).digest('hex');
    return fetch(`${base}/webhooks/salla/app`, { method: 'POST', body, headers: headers || { 'X-Salla-Signature': sig } })
      .then(async (r) => ({ status: r.status, body: await r.json() }));
  };
  const order = (oid, amount) => ({ event: 'order.created', merchant: 9001, data: { id: oid, amounts: { total: { amount } }, status: { slug: 'completed' }, customer: { id: 501 } } });
  assert.equal((await app({ event: 'app.installed', merchant: 9001 }, { 'X-Salla-Signature': 'bad' })).status, 401);
  assert.equal((await app({ event: 'app.store.authorize', merchant: 9001, data: { access_token: 'tok-123', refresh_token: 'ref-456', expires: 1 } })).status, 200);
  assert.doesNotMatch(db.prepare('SELECT tokens FROM salla_merchants WHERE merchant_id = ?').get('9001').tokens, /tok-123/);
  assert.equal((await app(order('C1', 100))).body.reason, 'store not linked');
  assert.match(await fetch(`${base}/t.js?salla=9001`).then((r) => r.text()), /not linked/);
  // The merchant pastes the link code into the app settings on Salla.
  assert.equal((await app({ event: 'app.settings.updated', merchant: 9001, data: { settings: { link_code: ` ${ws.salla_link_code} ` } } })).body.linked, true);
  assert.deepEqual((await admin.get(`/api/workspaces/${id}`)).body.salla.merchant_id, '9001');
  assert.match(await fetch(`${base}/t.js?salla=9001`).then((r) => r.text()), new RegExp(`collect\\?k=${ws.site_key}`));
  assert.equal((await app(order('C2', 400))).body.stored, 'purchase');
  assert.equal((await app({ event: 'order.shipment.created', merchant: 9001, data: { id: 'SHIP1', amounts: { total: { amount: 77 } } } })).body.ignored, true, 'shipment events are not orders');
  // Token strategy works too.
  assert.equal((await app(order('C3', 50), { Authorization: 'Bearer app-secret' })).body.stored, 'purchase');
  const ch = (await admin.get(`/api/w/${id}/report/channels?${q}&model=last_non_direct`)).body;
  assert.equal(ch.totals.orders, 3);
  assert.equal(ch.rows.find((r) => r.channel === 'snapchat').revenue, 700, 'identified customer: Salla orders join the Snapchat journey');
  // Uninstall stops the flow.
  await app({ event: 'app.uninstalled', merchant: 9001 });
  assert.equal((await app(order('C4', 999))).body.reason, 'store not linked');
  assert.match(await fetch(`${base}/t.js?salla=9001`).then((r) => r.text()), /not linked/);
});

test('server-to-server orders API uses the workspace API key', async () => {
  assert.equal((await client().post('/api/v1/orders', { order_id: 'S1', value: 10 }, { 'X-Api-Key': 'bad' })).status, 401);
  const r = await client().post('/api/v1/orders', [{ order_id: 'S1', value: 10 }], { 'X-Api-Key': other.api_key });
  assert.deepEqual(r.body, { imported: 1 });
});

test('tenant isolation: members only see their assigned workspaces', async () => {
  const created = await admin.post('/api/users', { email: 'client@shop.sa', name: 'Client', password: 'clientpass1', role: 'member', workspaces: [other.id] });
  assert.equal(created.status, 200);
  await member.post('/api/auth/login', { email: 'client@shop.sa', password: 'clientpass1' });
  assert.deepEqual((await member.get('/api/workspaces')).body.map((w) => w.id), [other.id]);
  assert.equal((await member.get(`/api/w/${shop.id}/report/channels?${q}`)).status, 404);
  assert.equal((await member.get(`/api/workspaces/${shop.id}`)).status, 404);
  const own = (await member.get(`/api/workspaces/${other.id}`)).body;
  assert.equal(own.api_key, undefined, 'members do not see secrets');
  assert.equal((await member.post('/api/workspaces', { name: 'x' })).status, 403);
  assert.equal((await member.get('/api/users')).status, 403);
  assert.equal((await member.post(`/api/w/${other.id}/spend`, 'date,channel,spend\n2026-10-01,meta,1')).status, 403);
  assert.deepEqual((await member.get(`/api/agency?${q}`)).body.map((w) => w.id), [other.id]);
});

test('rejects bad events', async () => {
  assert.equal((await fetch(`${base}/collect?k=${shop.site_key}`, { method: 'POST', body: '{"v":"x","e":"pageview"}', headers: { 'User-Agent': 'Mozilla' } })).status, 400);
  assert.equal((await fetch(`${base}/collect?k=${shop.site_key}`, { method: 'POST', body: '{"v":"visitor_abc12345","e":"hack"}', headers: { 'User-Agent': 'Mozilla' } })).status, 400);
  assert.equal((await fetch(`${base}/collect?k=missing`, { method: 'POST', body: '{}' })).status, 404);
});

// ------------------------------------------------------------------ SaaS

const { sent } = await import('../src/email.js');

test('a second signup is a separate account on a trial, isolated from the first', async () => {
  const b = client();
  assert.equal((await b.post('/api/auth/signup', { email: 'b@other.sa', name: 'B', password: 'longpassword', company: 'Other Agency', store: 'B Store' })).status, 200);
  const state = (await b.get('/api/auth/state')).body;
  assert.equal(state.user.is_superadmin, 0);
  assert.equal(state.org.status, 'trialing');
  assert.equal(state.org.state, 'ok');
  assert.ok(sent.some((m) => m.to === 'b@other.sa'), 'welcome email');
  const list = (await b.get('/api/workspaces')).body;
  assert.equal(list.length, 1);
  assert.notEqual(list[0].id, shop.id);
  // Cannot touch the first account's data or users, even as an admin.
  assert.equal((await b.get(`/api/w/${shop.id}/report/channels?${q}`)).status, 404);
  assert.equal((await b.get(`/api/workspaces/${shop.id}`)).status, 404);
  assert.ok((await b.get('/api/users')).body.every((u) => u.email === 'b@other.sa'));
  const firstUser = (await admin.get('/api/users')).body[0];
  assert.equal((await b.put(`/api/users/${firstUser.id}`, { role: 'member' })).status, 404);
  assert.equal((await b.post('/api/users', { email: 'x@x.sa', name: 'x', password: 'longpassword', workspaces: [shop.id] })).status, 200);
  const x = (await b.get('/api/users')).body.find((u) => u.email === 'x@x.sa');
  assert.deepEqual(x.workspaces, [], 'cannot grant access to another account\'s workspace');
  assert.ok((await b.get(`/api/agency?${q}`)).body.every((w) => w.id !== shop.id));
  // Platform panel is for the owner only.
  assert.equal((await b.get('/api/platform/overview')).status, 403);
  const panel = (await admin.get('/api/platform/overview')).body;
  assert.equal(panel.summary.organizations, 1);
  assert.equal(panel.summary.trialing, 1);
});

test('plan limits: trial allows 3 stores and 3 members', async () => {
  const c = client();
  await c.post('/api/auth/signup', { email: 'c@limits.sa', name: 'C', password: 'longpassword', company: 'Limits' });
  for (let i = 0; i < 3; i++) assert.equal((await c.post('/api/workspaces', { name: `s${i}` })).status, 200);
  const r = await c.post('/api/workspaces', { name: 'one too many' });
  assert.equal(r.status, 402);
  assert.match(r.body.error, /3/);
});

test('expired subscription: reports locked, tracking keeps going during grace, then stops', async () => {
  const d = client();
  await d.post('/api/auth/signup', { email: 'd@expired.sa', name: 'D', password: 'longpassword', company: 'Expired', store: 'D' });
  const orgId = (await d.get('/api/auth/state')).body.org.id;
  const w = (await d.get('/api/workspaces')).body[0];
  const full = (await d.get(`/api/workspaces/${w.id}`)).body;
  const { invalidateOrg } = await import('../src/orgs.js');
  const DAYMS = 86_400_000;

  db.prepare('UPDATE organizations SET trial_ends_at = ? WHERE id = ?').run(Date.now() - 2 * DAYMS, orgId);
  invalidateOrg(orgId);
  const rep = await d.get(`/api/w/${w.id}/report/overview?${q}`);
  assert.equal(rep.status, 402);
  assert.equal((await d.get('/api/billing')).status, 200, 'billing stays reachable');
  assert.equal((await collect(full.site_key, { v: 'visitor_grace_001', e: 'pageview', s: 1, url: 'https://d.sa/?gclid=1' })).stored, 'touchpoint');

  db.prepare('UPDATE organizations SET trial_ends_at = ? WHERE id = ?').run(Date.now() - 30 * DAYMS, orgId);
  invalidateOrg(orgId);
  assert.equal((await collect(full.site_key, { v: 'visitor_grace_001', e: 'pageview', s: 1, url: 'https://d.sa/?gclid=1' })).reason, 'subscription');

  // Platform owner extends access: works again.
  assert.equal((await admin.put(`/api/platform/orgs/${orgId}`, { plan: 'starter', extend_days: 30 })).status, 200);
  assert.equal((await d.get(`/api/w/${w.id}/report/overview?${q}`)).status, 200);
  // Suspension blocks everything for that account.
  await admin.put(`/api/platform/orgs/${orgId}`, { status: 'suspended' });
  assert.equal((await d.get('/api/workspaces')).status, 403);
});

test('password reset by email', async () => {
  const anon = client();
  assert.equal((await anon.post('/api/auth/forgot', { email: 'nobody@nowhere.sa' })).status, 200, 'no account enumeration');
  await anon.post('/api/auth/forgot', { email: 'boss@agency.sa' });
  const mail = sent.filter((m) => m.to === 'boss@agency.sa').pop();
  const token = /#\/reset\/([A-Za-z0-9_-]+)/.exec(mail.html)[1];
  assert.equal((await anon.post('/api/auth/reset', { token: 'bad', password: 'newpassword1' })).status, 400);
  assert.equal((await anon.post('/api/auth/reset', { token, password: 'newpassword1' })).status, 200);
  assert.equal((await anon.post('/api/auth/reset', { token, password: 'newpassword2' })).status, 400, 'single use');
  assert.equal((await anon.get('/api/auth/state')).body.user.email, 'boss@agency.sa');
  assert.equal((await client().post('/api/auth/login', { email: 'boss@agency.sa', password: 'newpassword1' })).status, 200);
});

test('public pages and config', async () => {
  const cfg = (await client().get('/api/public/config')).body;
  assert.ok(cfg.plans.length >= 3);
  assert.equal(cfg.needsSetup, false);
  for (const path of ['/', '/app', '/terms', '/privacy']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  }
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});
