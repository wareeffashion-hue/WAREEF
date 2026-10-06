export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || 'data/tracking.db',
  // Public URL of this server, baked into the tracking snippet.
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  // Protects the dashboard and /api/* with HTTP basic auth when set.
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Verifies Salla webhooks (HMAC-SHA256 of the raw body) when set.
  sallaWebhookSecret: process.env.SALLA_WEBHOOK_SECRET || '',
  // Business timezone used for day boundaries (default: Riyadh).
  tzOffset: process.env.TZ_OFFSET || '+03:00',
  currency: process.env.CURRENCY || 'SAR',
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
