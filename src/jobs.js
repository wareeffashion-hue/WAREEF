// Background jobs: usage flush, subscription bookkeeping, lifecycle emails,
// daily database backup, raw-data retention, ad platform sync.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config, DAY, dayOf } from './config.js';
import { sendLifecycleEmails } from './accounts.js';
import { expireLapsed, flushUsage } from './orgs.js';
import { startScheduler } from './connectors/index.js';

const backupDir = () => join(dirname(config.dbPath), 'backups');

/** Consistent snapshot of the live database (safe while it's being written). */
export function backupTo(db, name) {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.db`);
  rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}

export function dailyBackup(db, today = dayOf(Date.now())) {
  if (config.dbPath === ':memory:') return null;
  const name = `tracking-${today}`;
  if (existsSync(join(backupDir(), `${name}.db`))) return null;
  const file = backupTo(db, name);
  const keep = readdirSync(backupDir()).filter((f) => /^tracking-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse();
  for (const old of keep.slice(config.backupDays)) rmSync(join(backupDir(), old), { force: true });
  return file;
}

/** Raw touchpoints and funnel events older than the retention window are dropped; orders are kept. */
export function applyRetention(db, now = Date.now()) {
  if (!config.retentionDays) return;
  const cutoff = now - config.retentionDays * DAY;
  db.prepare('DELETE FROM touchpoints WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM events WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now);
}

export function startJobs(db) {
  const flush = setInterval(() => flushUsage(db), 5_000);
  const hourly = async () => {
    try {
      flushUsage(db);
      expireLapsed(db);
      if (config.publicUrl) await sendLifecycleEmails(db, config.publicUrl);
      dailyBackup(db);
      applyRetention(db);
    } catch (err) {
      console.error('[jobs]', err);
    }
  };
  const hourlyTimer = setInterval(hourly, 60 * 60_000);
  const first = setTimeout(hourly, 15_000);
  const sync = startScheduler(db);
  return () => {
    clearInterval(flush); clearInterval(hourlyTimer); clearTimeout(first);
    if (sync) clearInterval(sync);
    flushUsage(db);
  };
}
