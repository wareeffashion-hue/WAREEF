import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

process.env.SALLA_WEBHOOK_SECRET = 'shh';
process.env.ADMIN_PASSWORD = 'admin';
const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');
const { dayOf } = await import('../src/config.js');

const db = openDb(':memory:');
const server = createServer(createApp(db)).listen(0);
const base = `http://localhost:${server.address().port}`;
const auth = { Authorization: `Basic ${Buffer.from('x:admin').toString('base64')}` };
test.after(() => server.close());

const collect = (body) => fetch(`${base}/collect`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const salla = (payload, secret = 'shh') => {
  const raw = JSON.stringify(payload);
  return fetch(`${base}/webhooks/salla`, {
    method: 'POST', body: raw,
    headers: { 'x-salla-signature': createHmac('sha256', secret).update(raw).digest('hex') },
  });
};
const today = dayOf(Date.now());

test('tracker script is served with the endpoint baked in', async () => {
  const js = await fetch(`${base}/t.js`).then((r) => r.text());
  assert.match(js, new RegExp(`${base}/collect`));
});

test('dashboard API requires the admin password', async () => {
  assert.equal((await fetch(`${base}/api/report`)).status, 401);
  assert.equal((await fetch(`${base}/api/report`, { headers: auth })).status, 200);
});

test('end to end: journey, leads, order merge, spend, report', async () => {
  const v = 'visitor_abc12345';
  assert.equal((await collect({ v, e: 'pageview', s: 1, url: 'https://shop.sa/?ScCid=1' })).channel, 'snapchat');
  assert.equal((await collect({ v, e: 'pageview', s: 0, url: 'https://shop.sa/p', ref: 'https://shop.sa/' })).stored, null);
  assert.equal((await collect({ v, e: 'pageview', s: 1, url: 'https://shop.sa/?gclid=2' })).channel, 'google');

  // WhatsApp clicks are counted once per visitor per day.
  assert.equal((await collect({ v, e: 'whatsapp', url: 'https://shop.sa/' })).stored, 'whatsapp');
  assert.equal((await collect({ v, e: 'whatsapp', url: 'https://shop.sa/' })).stored, null);

  // Pixel reports 500, store confirms 450: store wins, visitor link kept.
  await collect({ v, e: 'purchase', order_id: '9001', value: 500 });
  const ok = await salla({ event: 'order.created', data: { id: 9001, amounts: { total: { amount: 450, currency: 'SAR' } }, status: { slug: 'completed' } } });
  assert.equal(ok.status, 200);
  // An order the pixel never saw, and a cancelled one.
  await salla({ event: 'order.created', data: { id: 9002, amounts: { total: { amount: 300 } }, status: { slug: 'completed' } } });
  await salla({ event: 'order.created', data: { id: 9003, amounts: { total: { amount: 999 } }, status: { slug: 'canceled' } } });

  const bad = await salla({ event: 'order.created', data: { id: 1 } }, 'wrong');
  assert.equal(bad.status, 401);

  const csv = `date,channel,campaign,spend,platform_conversions,platform_revenue\n${today},Snapchat,x,100,1,450\n${today},google,,50,1,450\n`;
  const imp = await fetch(`${base}/api/spend`, { method: 'POST', body: csv, headers: auth }).then((r) => r.json());
  assert.deepEqual(imp, { imported: 2, errors: [] });

  const rep = await fetch(`${base}/api/report?from=${today}&to=${today}&model=last_non_direct`, { headers: auth }).then((r) => r.json());
  assert.equal(rep.totals.orders, 2);
  assert.equal(rep.totals.revenue, 750);
  assert.equal(rep.totals.whatsapp, 1);
  assert.equal(rep.totals.unmatched_orders, 1);
  assert.equal(rep.totals.platform_revenue, 900);
  assert.equal(rep.totals.claim_gap, 150);
  const google = rep.rows.find((r) => r.channel === 'google');
  assert.equal(google.revenue, 450);
  assert.equal(google.whatsapp, 1);
  assert.equal(google.roas, 9);
  const snap = rep.rows.find((r) => r.channel === 'snapchat');
  assert.equal(snap.revenue, 0);
  assert.equal(snap.overclaim, 450);
  assert.equal(rep.rows.find((r) => r.channel === 'direct').revenue, 300);
  // Under first click the same order belongs to Snapchat.
  assert.equal(rep.compare.first_click.snapchat.revenue, 450);
  assert.equal(rep.compare.linear.snapchat.revenue, 225);

  const journeys = await fetch(`${base}/api/journeys?from=${today}&to=${today}`, { headers: auth }).then((r) => r.json());
  const j = journeys.find((x) => x.order_id === '9001');
  assert.deepEqual(j.path.map((p) => p.channel), ['snapchat', 'google']);
});

test('rejects bad events', async () => {
  const r = await fetch(`${base}/collect`, { method: 'POST', body: JSON.stringify({ v: 'x', e: 'pageview' }) });
  assert.equal(r.status, 400);
  const r2 = await fetch(`${base}/collect`, { method: 'POST', body: JSON.stringify({ v: 'visitor_abc12345', e: 'hack' }) });
  assert.equal(r2.status, 400);
});
