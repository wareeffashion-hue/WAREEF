// Organizations (subscribing accounts): subscription state, plan limits, usage.
import { DAY } from './config.js';
import { HttpError } from './http.js';
import { GRACE_DAYS, OVERAGE, PLANS, TRIAL_DAYS } from './plans.js';

export function createOrganization(db, { name, now = Date.now() }) {
  name = String(name || '').trim().slice(0, 100);
  if (!name) throw new HttpError(400, 'يرجى إدخال اسم الشركة');
  const res = db.prepare(`INSERT INTO organizations (name, plan, status, trial_ends_at, created_at) VALUES (?, 'trial', 'trialing', ?, ?)`)
    .run(name, now + TRIAL_DAYS * DAY, now);
  return Number(res.lastInsertRowid);
}

export function getOrg(db, id) {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id);
  if (!org) throw new HttpError(404, 'الحساب غير موجود');
  return { ...org };
}

/** When the paid (or trial) access ends. */
export function accessEndsAt(org) {
  return Math.max(org.trial_ends_at || 0, org.current_period_end || 0) || null;
}

/**
 * Effective state:
 *  ok       - trial or paid period running
 *  grace    - lapsed less than GRACE_DAYS ago: tracking continues, dashboard locked
 *  locked   - lapsed longer: tracking stops too
 *  suspended- disabled by the platform owner
 */
export function orgState(org, now = Date.now()) {
  if (org.status === 'suspended') return 'suspended';
  const ends = accessEndsAt(org);
  if (ends && ends > now) return 'ok';
  if (ends && ends + GRACE_DAYS * DAY > now) return 'grace';
  return 'locked';
}

export const planOf = (org) => PLANS[org.plan] || PLANS.trial;

export function monthKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 7);
}

export function usage(db, orgId, month = monthKey()) {
  const row = db.prepare('SELECT events FROM usage_monthly WHERE org_id = ? AND month = ?').get(orgId, month);
  return (row?.events || 0) + (pending.get(`${orgId}|${month}`) || 0);
}

export function counts(db, orgId) {
  return {
    stores: db.prepare('SELECT COUNT(*) n FROM workspaces WHERE org_id = ?').get(orgId).n,
    members: db.prepare('SELECT COUNT(*) n FROM users WHERE org_id = ?').get(orgId).n,
    events: usage(db, orgId),
  };
}

export function assertCanAdd(db, org, what) {
  const plan = planOf(org);
  const c = counts(db, org.id);
  if (what === 'store' && c.stores >= plan.stores) throw new HttpError(402, `وصلت إلى حد باقتك (${plan.stores} متاجر). رقِّ باقتك لإضافة المزيد.`);
  if (what === 'member' && c.members >= plan.members) throw new HttpError(402, `وصلت إلى حد باقتك (${plan.members} أعضاء). رقِّ باقتك لإضافة المزيد.`);
}

export function assertDashboardAccess(org) {
  const state = orgState(org);
  if (state === 'suspended') throw new HttpError(403, 'الحساب موقوف مؤقتاً. تواصل مع الدعم.');
  if (state !== 'ok') throw new HttpError(402, 'انتهى اشتراكك، وبياناتك محفوظة. جدّد من صفحة الاشتراك لاستعادة تقاريرك.');
}

// ------------------------------------------------------------- metering
// Counting every /collect hit with its own write would be the hottest query in
// the system, so counts are batched in memory and flushed every few seconds.
const pending = new Map();
const orgCache = new Map(); // org id -> {org, at}

export function cachedOrg(db, id) {
  const hit = orgCache.get(id);
  if (hit && Date.now() - hit.at < 30_000) return hit.org;
  const org = getOrg(db, id);
  orgCache.set(id, { org, at: Date.now() });
  return org;
}
export const invalidateOrg = (id) => orgCache.delete(id);

/**
 * Decides whether a tracking event may be stored, and meters it.
 * Conversions (orders, leads) are always kept while tracking is allowed;
 * page views and funnel steps stop once the monthly quota (+ overage) is used.
 */
export function admitEvent(db, orgId, type) {
  const org = cachedOrg(db, orgId);
  const state = orgState(org);
  if (state === 'locked' || state === 'suspended') return { ok: false, reason: 'subscription' };
  const month = monthKey();
  const used = usage(db, orgId, month);
  const isConversion = ['purchase', 'form', 'whatsapp', 'call'].includes(type);
  if (!isConversion && used >= planOf(org).events * (1 + OVERAGE)) return { ok: false, reason: 'quota' };
  const key = `${orgId}|${month}`;
  pending.set(key, (pending.get(key) || 0) + 1);
  return { ok: true };
}

export function flushUsage(db) {
  if (!pending.size) return;
  const stmt = db.prepare(`INSERT INTO usage_monthly (org_id, month, events) VALUES (?, ?, ?)
                           ON CONFLICT(org_id, month) DO UPDATE SET events = events + excluded.events`);
  const batch = [...pending.entries()];
  pending.clear();
  for (const [key, n] of batch) {
    const [org, month] = key.split('|');
    stmt.run(Number(org), month, n);
  }
}

/** Marks subscriptions whose access ended as expired (status bookkeeping only; access is computed). */
export function expireLapsed(db, now = Date.now()) {
  db.prepare(`UPDATE organizations SET status = 'expired'
              WHERE status = 'trialing' AND trial_ends_at < ? OR status = 'active' AND current_period_end < ?`).run(now, now);
  orgCache.clear();
}
