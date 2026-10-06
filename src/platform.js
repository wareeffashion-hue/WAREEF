// Platform owner (super admin): every subscribing organization at a glance.
import { DAY } from './config.js';
import { HttpError } from './http.js';
import { counts, getOrg, invalidateOrg, orgState, accessEndsAt } from './orgs.js';
import { PLANS } from './plans.js';

/** Monthly-equivalent revenue of an active paid org. */
function mrrOf(org) {
  const p = PLANS[org.plan];
  if (!p || org.plan === 'trial' || orgState(org) !== 'ok' || org.status !== 'active') return 0;
  return org.billing_cycle === 'yearly' ? p.price.yearly / 12 : p.price.monthly;
}

export function platformOverview(db, now = Date.now()) {
  const orgs = db.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all().map((o) => ({ ...o }));
  const owners = db.prepare(`SELECT org_id, email, name, is_superadmin FROM users WHERE role = 'admin' ORDER BY id`).all();
  const ownerOf = new Map();
  for (const o of owners) if (!ownerOf.has(o.org_id)) ownerOf.set(o.org_id, o);
  const paid = Object.fromEntries(db.prepare(`SELECT org_id, SUM(amount) s FROM payments WHERE status = 'paid' GROUP BY org_id`).all().map((r) => [r.org_id, r.s / 100]));
  const rows = orgs.map((o) => {
    const owner = ownerOf.get(o.id) || {};
    return {
      id: o.id, name: o.name, owner_email: owner.email || '', owner_name: owner.name || '', is_platform: !!owner.is_superadmin,
      plan: o.plan, plan_name: PLANS[o.plan]?.name || o.plan, status: o.status, state: orgState(o, now), billing_cycle: o.billing_cycle,
      access_ends_at: accessEndsAt(o), created_at: o.created_at, ...counts(db, o.id), revenue: paid[o.id] || 0, mrr: owner.is_superadmin ? 0 : mrrOf(o),
    };
  });
  const customers = rows.filter((r) => !r.is_platform);
  const revenue30 = db.prepare(`SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE status = 'paid' AND paid_at > ?`).get(now - 30 * DAY).s / 100;
  return {
    summary: {
      organizations: customers.length,
      paying: customers.filter((r) => r.status === 'active' && r.state === 'ok' && r.plan !== 'trial').length,
      trialing: customers.filter((r) => r.status === 'trialing' && r.state === 'ok').length,
      lapsed: customers.filter((r) => r.state !== 'ok').length,
      mrr: customers.reduce((a, r) => a + r.mrr, 0),
      revenue_30d: revenue30,
      signups_30d: customers.filter((r) => r.created_at > now - 30 * DAY).length,
      events_month: customers.reduce((a, r) => a + r.events, 0),
    },
    organizations: rows,
    recent_payments: db.prepare(`SELECT p.amount, p.plan, p.cycle, p.status, p.created_at, p.paid_at, o.name org FROM payments p
        JOIN organizations o ON o.id = p.org_id ORDER BY p.created_at DESC LIMIT 20`).all().map((r) => ({ ...r })),
  };
}

/** Manual adjustments: change plan, extend access, suspend / reactivate. */
export function updateOrgAdmin(db, id, { plan, extend_days: extendDays, status } = {}) {
  const org = getOrg(db, id);
  if (plan != null) {
    if (!PLANS[plan]) throw new HttpError(400, 'invalid plan');
    db.prepare('UPDATE organizations SET plan = ? WHERE id = ?').run(plan, id);
  }
  if (extendDays != null) {
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) throw new HttpError(400, 'invalid days');
    const base = Math.max(Date.now(), accessEndsAt(org) || 0);
    if (org.status === 'trialing' && (plan == null || plan === 'trial')) {
      db.prepare('UPDATE organizations SET trial_ends_at = ? WHERE id = ?').run(base + days * 86_400_000, id);
    } else {
      db.prepare(`UPDATE organizations SET current_period_end = ?, status = 'active' WHERE id = ?`).run(base + days * 86_400_000, id);
    }
  }
  if (status != null) {
    if (!['active', 'suspended', 'trialing'].includes(status)) throw new HttpError(400, 'invalid status');
    db.prepare('UPDATE organizations SET status = ? WHERE id = ?').run(status, id);
  }
  db.prepare(`UPDATE organizations SET reminder_sent = NULL WHERE id = ?`).run(id);
  invalidateOrg(id);
  return { ok: true };
}
