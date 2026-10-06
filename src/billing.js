// Subscriptions paid through Moyasar invoices (hosted payment page: mada,
// Visa/Mastercard, Apple Pay, STC Pay). Each payment buys one period; renewals
// are a new invoice. Moyasar callbacks aren't signed, so every notification is
// confirmed by fetching the invoice from Moyasar's API with our secret key.
import { config, DAY } from './config.js';
import { transaction } from './db.js';
import { esc, layout, sendEmail } from './email.js';
import { HttpError } from './http.js';
import { getOrg, invalidateOrg } from './orgs.js';
import { PLANS } from './plans.js';

const API = 'https://api.moyasar.com/v1';
const PERIOD_DAYS = { monthly: 30, yearly: 365 };

const authHeader = () => `Basic ${Buffer.from(`${config.moyasarSecretKey}:`).toString('base64')}`;

async function moyasar(fetchImpl, method, path, body) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Moyasar: ${data.message || res.status}`);
  return data;
}

export const billingEnabled = () => !!config.moyasarSecretKey;

export function priceOf(plan, cycle) {
  const p = PLANS[plan];
  if (!p || !p.public) throw new HttpError(400, 'باقة غير صحيحة');
  if (!PERIOD_DAYS[cycle]) throw new HttpError(400, 'مدة غير صحيحة');
  return p.price[cycle];
}

export async function createCheckout(db, org, { plan, cycle }, base, { fetchImpl = fetch } = {}) {
  if (!billingEnabled()) throw new HttpError(503, 'الدفع الإلكتروني غير متاح بعد. تواصل معنا وسنفعّل اشتراكك.');
  const sar = priceOf(plan, cycle);
  const invoice = await moyasar(fetchImpl, 'POST', '/invoices', {
    amount: Math.round(sar * 100),
    currency: 'SAR',
    description: `${config.appName} · باقة ${PLANS[plan].name} · ${cycle === 'yearly' ? 'سنوي' : 'شهري'}`,
    callback_url: `${base}/webhooks/moyasar`,
    success_url: `${base}/app#/billing?paid=1`,
    back_url: `${base}/app#/billing`,
    metadata: { org_id: String(org.id), plan, cycle },
  });
  db.prepare(`INSERT INTO payments (org_id, provider, provider_id, plan, cycle, amount, currency, status, url, created_at)
              VALUES (?, 'moyasar', ?, ?, ?, ?, 'SAR', ?, ?, ?)`)
    .run(org.id, invoice.id, plan, cycle, Math.round(sar * 100), invoice.status || 'initiated', invoice.url, Date.now());
  return { url: invoice.url, id: invoice.id };
}

/**
 * Applies a paid invoice once: the new period starts when the current one
 * ends (so renewing early never loses days) or now, whichever is later.
 */
function applyPaid(db, payment, now = Date.now()) {
  return transaction(db, () => {
    const fresh = db.prepare('SELECT status FROM payments WHERE id = ?').get(payment.id);
    if (fresh.status === 'paid') return false;
    const org = getOrg(db, payment.org_id);
    const start = Math.max(now, org.current_period_end || 0);
    const end = start + PERIOD_DAYS[payment.cycle] * DAY;
    db.prepare(`UPDATE payments SET status = 'paid', paid_at = ?, period_end = ? WHERE id = ?`).run(now, end, payment.id);
    db.prepare(`UPDATE organizations SET plan = ?, billing_cycle = ?, status = 'active', current_period_end = ?, reminder_sent = NULL
                WHERE id = ? AND status != 'suspended'`).run(payment.plan, payment.cycle, end, org.id);
    invalidateOrg(org.id);
    return true;
  });
}

/** Re-fetches an invoice from Moyasar and applies it if paid with the expected amount. */
export async function verifyInvoice(db, invoiceId, { fetchImpl = fetch } = {}) {
  const payment = db.prepare(`SELECT * FROM payments WHERE provider = 'moyasar' AND provider_id = ?`).get(String(invoiceId || ''));
  if (!payment) return { ok: false, reason: 'unknown invoice' };
  if (payment.status === 'paid') return { ok: true, already: true };
  const invoice = await moyasar(fetchImpl, 'GET', `/invoices/${encodeURIComponent(payment.provider_id)}`);
  if (invoice.status !== 'paid') {
    db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(String(invoice.status || payment.status).slice(0, 20), payment.id);
    return { ok: false, status: invoice.status };
  }
  if (Number(invoice.amount) !== payment.amount || (invoice.currency || 'SAR') !== payment.currency) {
    console.error(`[billing] amount mismatch on invoice ${payment.provider_id}`);
    return { ok: false, reason: 'amount mismatch' };
  }
  const applied = applyPaid(db, payment);
  if (applied) await receiptEmail(db, payment);
  return { ok: true, applied };
}

/**
 * Body is either an invoice object (invoice callback_url) or a webhook event
 * ({type, secret_token, data: payment}). Either way we only extract the
 * invoice id and verify against the API.
 */
export async function handleMoyasarNotification(db, body, opts) {
  if (body?.secret_token !== undefined && config.moyasarWebhookSecret && body.secret_token !== config.moyasarWebhookSecret) {
    throw new HttpError(401, 'invalid secret');
  }
  const invoiceId = body?.data?.invoice_id || body?.id;
  if (!invoiceId) return { ok: false, reason: 'no invoice id' };
  return verifyInvoice(db, invoiceId, opts);
}

/** After the customer returns from the payment page: check the org's recent open invoices. */
export async function verifyRecent(db, orgId, opts) {
  const open = db.prepare(`SELECT provider_id FROM payments WHERE org_id = ? AND status NOT IN ('paid') AND created_at > ?`)
    .all(orgId, Date.now() - 2 * DAY);
  let applied = false;
  for (const p of open) {
    const r = await verifyInvoice(db, p.provider_id, opts);
    applied ||= !!r.applied;
  }
  return { applied };
}

async function receiptEmail(db, payment) {
  const owner = db.prepare(`SELECT name, email FROM users WHERE org_id = ? AND role = 'admin' ORDER BY id LIMIT 1`).get(payment.org_id);
  const row = db.prepare('SELECT period_end FROM payments WHERE id = ?').get(payment.id);
  if (!owner) return;
  await sendEmail({
    to: owner.email,
    subject: 'شكراً لك، تم استلام الدفع',
    html: layout('تم تفعيل اشتراكك ✓',
      `<p>مرحباً ${esc(owner.name)}، استلمنا ${(payment.amount / 100).toFixed(2)} ر.س لباقة <strong>${esc(PLANS[payment.plan]?.name || payment.plan)}</strong>.</p>
       <p>اشتراكك فعّال حتى ${new Date(row.period_end).toISOString().slice(0, 10)}.</p>`),
  });
}

export function paymentsOf(db, orgId) {
  return db.prepare(`SELECT id, plan, cycle, amount, currency, status, created_at, paid_at, period_end FROM payments
                     WHERE org_id = ? ORDER BY created_at DESC LIMIT 50`).all(orgId).map((r) => ({ ...r }));
}
