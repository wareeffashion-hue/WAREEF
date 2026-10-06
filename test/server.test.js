import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');
const { dayOf } = await import('../src/config.js');

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

test('first run: setup creates the admin and first workspace, then locks', async () => {
  assert.deepEqual((await admin.get('/api/auth/state')).body, { needsSetup: true, user: null });
  const r = await admin.post('/api/auth/setup', { email: 'boss@agency.sa', name: 'Boss', password: 'longpassword', workspace: 'متجر' });
  assert.equal(r.status, 200);
  assert.equal((await admin.get('/api/auth/state')).body.user.role, 'admin');
  assert.equal((await client().post('/api/auth/setup', { email: 'x@y.z', password: 'longpassword' })).status, 403);
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
  assert.deepEqual((await member.get(`/api/agency?${q}`)).body.map((w) => w.id), [other.id]);
});

test('rejects bad events', async () => {
  assert.equal((await fetch(`${base}/collect?k=${shop.site_key}`, { method: 'POST', body: '{"v":"x","e":"pageview"}', headers: { 'User-Agent': 'Mozilla' } })).status, 400);
  assert.equal((await fetch(`${base}/collect?k=${shop.site_key}`, { method: 'POST', body: '{"v":"visitor_abc12345","e":"hack"}', headers: { 'User-Agent': 'Mozilla' } })).status, 400);
  assert.equal((await fetch(`${base}/collect?k=missing`, { method: 'POST', body: '{}' })).status, 404);
});
