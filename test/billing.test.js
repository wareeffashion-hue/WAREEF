import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MOYASAR_SECRET_KEY = 'sk_test_x';
process.env.MOYASAR_WEBHOOK_SECRET = 'whsec';
const { openDb } = await import('../src/db.js');
const { createOrganization, getOrg, orgState } = await import('../src/orgs.js');
const { createCheckout, handleMoyasarNotification, verifyRecent } = await import('../src/billing.js');

const DAY = 86_400_000;

function fakeMoyasar() {
  const invoices = new Map();
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    if (init.method === 'POST') {
      const body = JSON.parse(init.body);
      const inv = { id: `inv_${invoices.size + 1}`, status: 'initiated', amount: body.amount, currency: body.currency, url: 'https://pay.moyasar.com/x', metadata: body.metadata };
      invoices.set(inv.id, inv);
      return new Response(JSON.stringify(inv), { status: 201 });
    }
    const id = url.split('/').pop();
    const inv = invoices.get(id);
    return inv ? new Response(JSON.stringify(inv)) : new Response('{"message":"not found"}', { status: 404 });
  };
  return { fn, invoices, calls };
}

test('checkout -> paid callback (verified via API) activates the plan once', async () => {
  const db = openDb(':memory:');
  const orgId = createOrganization(db, { name: 'A' });
  const m = fakeMoyasar();
  const checkout = await createCheckout(db, getOrg(db, orgId), { plan: 'growth', cycle: 'monthly' }, 'https://app.test', { fetchImpl: m.fn });
  assert.equal(checkout.url, 'https://pay.moyasar.com/x');
  const sentBody = JSON.parse(m.calls[0].init.body);
  assert.equal(sentBody.amount, 49900, 'halalas');
  assert.equal(sentBody.callback_url, 'https://app.test/webhooks/moyasar');
  assert.match(m.calls[0].init.headers.Authorization, /^Basic /);

  // A forged "paid" notification is ignored: the API still says initiated.
  const forged = await handleMoyasarNotification(db, { id: checkout.id, status: 'paid' }, { fetchImpl: m.fn });
  assert.equal(forged.ok, false);
  assert.equal(getOrg(db, orgId).plan, 'trial');

  m.invoices.get(checkout.id).status = 'paid';
  const ok = await handleMoyasarNotification(db, { id: checkout.id }, { fetchImpl: m.fn });
  assert.equal(ok.applied, true);
  const org = getOrg(db, orgId);
  assert.equal(org.plan, 'growth');
  assert.equal(org.status, 'active');
  assert.equal(orgState(org), 'ok');
  assert.ok(org.current_period_end > Date.now() + 29 * DAY);

  // Duplicate notification (webhook + callback + return page) applies only once.
  const again = await handleMoyasarNotification(db, { type: 'payment_paid', secret_token: 'whsec', data: { invoice_id: checkout.id } }, { fetchImpl: m.fn });
  assert.equal(again.already, true);
  assert.equal(getOrg(db, orgId).current_period_end, org.current_period_end);
});

test('renewing early stacks the new period after the current one', async () => {
  const db = openDb(':memory:');
  const orgId = createOrganization(db, { name: 'B' });
  db.prepare(`UPDATE organizations SET status = 'active', plan = 'starter', current_period_end = ? WHERE id = ?`).run(Date.now() + 10 * DAY, orgId);
  const m = fakeMoyasar();
  const c = await createCheckout(db, getOrg(db, orgId), { plan: 'starter', cycle: 'yearly' }, 'https://app.test', { fetchImpl: m.fn });
  m.invoices.get(c.id).status = 'paid';
  await verifyRecent(db, orgId, { fetchImpl: m.fn });
  const end = getOrg(db, orgId).current_period_end;
  assert.ok(end > Date.now() + 374 * DAY && end < Date.now() + 376 * DAY);
});

test('rejects wrong amounts, bad secrets and unknown plans', async () => {
  const db = openDb(':memory:');
  const orgId = createOrganization(db, { name: 'C' });
  const m = fakeMoyasar();
  const c = await createCheckout(db, getOrg(db, orgId), { plan: 'starter', cycle: 'monthly' }, 'https://app.test', { fetchImpl: m.fn });
  Object.assign(m.invoices.get(c.id), { status: 'paid', amount: 100 });
  assert.equal((await handleMoyasarNotification(db, { id: c.id }, { fetchImpl: m.fn })).reason, 'amount mismatch');
  assert.equal(getOrg(db, orgId).plan, 'trial');
  await assert.rejects(handleMoyasarNotification(db, { secret_token: 'nope', data: { invoice_id: c.id } }, { fetchImpl: m.fn }), /invalid secret/);
  await assert.rejects(createCheckout(db, getOrg(db, orgId), { plan: 'trial', cycle: 'monthly' }, 'x', { fetchImpl: m.fn }), /باقة/);
});
