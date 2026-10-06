export const config = {
  appName: process.env.APP_NAME || 'Tracking',
  supportEmail: process.env.SUPPORT_EMAIL || '',
  signupEnabled: process.env.SIGNUP_ENABLED !== '0',
  // Transactional email via Resend (https://resend.com). Without a key, emails are logged.
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'Tracking <no-reply@example.com>',
  // Moyasar payments (https://moyasar.com). Without a key, checkout is disabled.
  moyasarSecretKey: process.env.MOYASAR_SECRET_KEY || '',
  moyasarWebhookSecret: process.env.MOYASAR_WEBHOOK_SECRET || '',
  backupDays: Number(process.env.BACKUP_KEEP_DAYS || 14),
  retentionDays: Number(process.env.RETENTION_DAYS || 400),
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || 'data/tracking.db',
  // Public URL of this server, baked into the tracking snippet and webhook URLs.
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  // Optional first admin, created on boot when the users table is empty.
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Encrypts ad-platform tokens at rest. Required in production.
  secretKey: process.env.SECRET_KEY || '',
  // Business timezone used for day boundaries (default: Riyadh).
  tzOffset: process.env.TZ_OFFSET || '+03:00',
  secureCookies: process.env.SECURE_COOKIES === '1',
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES || 60),
  // OAuth app credentials, used to refresh platform access tokens.
  snapchat: { clientId: process.env.SNAPCHAT_CLIENT_ID || '', clientSecret: process.env.SNAPCHAT_CLIENT_SECRET || '' },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
  },
};

export const DAY = 86_400_000;

export function tzOffsetMs(offset = config.tzOffset) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m) return 0;
  const ms = (Number(m[2]) * 60 + Number(m[3])) * 60_000;
  return m[1] === '-' ? -ms : ms;
}

/** Start of a YYYY-MM-DD day in the business timezone, as epoch ms. */
export function dayStart(day) {
  return Date.parse(`${day}T00:00:00${config.tzOffset}`);
}

/** YYYY-MM-DD of an epoch ms timestamp in the business timezone. */
export function dayOf(ts) {
  return new Date(ts + tzOffsetMs()).toISOString().slice(0, 10);
}

/** YYYY-MM-DD shifted by n days. */
export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Inclusive list of days between from and to. */
export function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
