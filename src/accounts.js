// Account lifecycle: signup, first-run bootstrap, and lifecycle emails.
import { config, DAY } from './config.js';
import { createSession, createUser, userCount } from './auth.js';
import { transaction } from './db.js';
import { esc, layout, sendEmail } from './email.js';
import { HttpError } from './http.js';
import { createOrganization, getOrg } from './orgs.js';
import { TRIAL_DAYS } from './plans.js';
import { createWorkspace } from './workspaces.js';

export const appUrl = (base, hash = '') => `${base}/app${hash ? `#${hash}` : ''}`;

/** Creates organization + owner (+ first store). The very first account owns the platform. */
export function signup(db, { name, email, password, company, store }) {
  const first = userCount(db) === 0;
  if (!first && !config.signupEnabled) throw new HttpError(403, 'التسجيل مغلق حالياً');
  if (!String(company || '').trim()) throw new HttpError(400, 'اسم الشركة / الوكالة مطلوب');
  return transaction(db, () => {
    const orgId = createOrganization(db, { name: company });
    if (first) {
      // The platform owner is never billed.
      db.prepare(`UPDATE organizations SET plan = 'agency', status = 'active', current_period_end = ? WHERE id = ?`)
        .run(Date.now() + 3650 * DAY, orgId);
    }
    const userId = createUser(db, { email, name, password, role: 'admin', orgId, superadmin: first });
    if (String(store || '').trim()) createWorkspace(db, { name: store, orgId });
    return { userId, orgId, token: createSession(db, userId), first };
  });
}

export function welcomeEmail(base, { name, email }) {
  return sendEmail({
    to: email,
    subject: `أهلاً بك في ${config.appName}`,
    html: layout(`أهلاً ${name} 👋`, // layout escapes the title
      `<p>حسابك جاهز وعندك <strong>${TRIAL_DAYS} يوم تجربة مجانية</strong> بكل المميزات.</p>
       <p>أول خطوة: أضف كود التتبع في متجرك واربط طلبات سلة، وخلال ساعات تبدأ تشوف من وين يجي عملاؤك فعلاً.</p>`,
      { label: 'افتح لوحة التحكم', url: appUrl(base, '/settings') }),
  });
}

export function resetEmail(base, { name, email }, token) {
  return sendEmail({
    to: email,
    subject: 'إعادة تعيين كلمة المرور',
    html: layout('إعادة تعيين كلمة المرور',
      `<p>مرحباً ${esc(name)}، طلبت إعادة تعيين كلمة المرور. الرابط صالح لمدة ساعة.</p><p style="color:#898781;font-size:13px">إذا ما طلبته، تجاهل هذا الإيميل.</p>`,
      { label: 'تعيين كلمة مرور جديدة', url: appUrl(base, `/reset/${token}`) }),
  });
}

/**
 * Daily: remind owners 3 days before access ends, and on expiry.
 * `reminder_sent` stores which reminder went out for the current end date.
 */
export async function sendLifecycleEmails(db, base, now = Date.now()) {
  const orgs = db.prepare(`SELECT * FROM organizations WHERE status IN ('trialing', 'active', 'expired')`).all();
  for (const org of orgs) {
    const ends = Math.max(org.trial_ends_at || 0, org.current_period_end || 0);
    if (!ends) continue;
    const kind = ends < now ? 'expired' : ends - now < 3 * DAY ? 'soon' : null;
    const marker = kind && `${kind}:${ends}`;
    if (!kind || org.reminder_sent === marker) continue;
    if (kind === 'expired' && now - ends > 2 * DAY) continue; // don't email long-lapsed accounts
    const owner = db.prepare(`SELECT name, email FROM users WHERE org_id = ? AND role = 'admin' ORDER BY id LIMIT 1`).get(org.id);
    if (!owner) continue;
    const trial = org.status === 'trialing' || !org.current_period_end;
    await sendEmail({
      to: owner.email,
      subject: kind === 'soon' ? (trial ? 'تجربتك المجانية تنتهي قريباً' : 'اشتراكك ينتهي قريباً') : (trial ? 'انتهت تجربتك المجانية' : 'انتهى اشتراكك'),
      html: layout(kind === 'soon' ? 'باقي أقل من 3 أيام' : 'انتهت فترة الوصول',
        kind === 'soon'
          ? `<p>مرحباً ${esc(owner.name)}، ${trial ? 'تجربتك المجانية' : 'اشتراكك'} في ${esc(config.appName)} ينتهي خلال أيام. اشترك عشان تستمر التقارير بدون انقطاع.</p>`
          : `<p>مرحباً ${esc(owner.name)}، انتهت فترة الوصول. <strong>بياناتك محفوظة</strong> والتتبع مستمر لمدة أسبوع، جدّد خلالها عشان ما تفقد أي بيانات.</p>`,
        { label: 'اختر باقتك', url: appUrl(base, '/billing') }),
    });
    db.prepare('UPDATE organizations SET reminder_sent = ? WHERE id = ?').run(marker, org.id);
  }
}

export { getOrg };
