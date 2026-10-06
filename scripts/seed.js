// Fills the database with 60 days of realistic demo data: multi-touch journeys,
// orders, leads, ad spend, and inflated platform-reported revenue (each platform
// claims every order it touched, plus view-through), which is exactly the
// double-counting problem this tool exposes.
import { rmSync } from 'node:fs';
import { config, DAY, dayOf } from '../src/config.js';
import { openDb, transaction } from '../src/db.js';

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (weights) => {
  let r = rand() * Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(weights)) if ((r -= w) <= 0) return k;
  return Object.keys(weights)[0];
};

const PAID = ['snapchat', 'tiktok', 'google', 'meta'];
const FIRST_TOUCH = { snapchat: 30, tiktok: 26, google: 14, meta: 16, organic_search: 6, organic_social: 5, direct: 3 };
const LATER_TOUCH = { google: 30, direct: 22, snapchat: 12, tiktok: 8, meta: 12, organic_search: 12, email: 4 };
const BUY_RATE = { google: 0.14, meta: 0.09, snapchat: 0.07, tiktok: 0.05, organic_search: 0.1, organic_social: 0.05, direct: 0.12, email: 0.15 };
const CAMPAIGNS = { snapchat: ['عروض الخريف', 'مجموعة جديدة'], tiktok: ['ترند العبايات', 'UGC'], google: ['Brand', 'Shopping'], meta: ['Retargeting', 'Advantage+'] };
const DAILY_SPEND = { snapchat: 1700, tiktok: 1300, google: 1150, meta: 950 };

if (config.dbPath !== ':memory:') rmSync(config.dbPath, { force: true });
const db = openDb(config.dbPath);
const now = Date.now();
const DAYS = 60;

const insTp = db.prepare(`INSERT INTO touchpoints (visitor_id, ts, channel, source, medium, campaign, click_id, landing_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const insConv = db.prepare(`INSERT OR IGNORE INTO conversions (visitor_id, ts, type, value, currency, order_id, status, confirmed, dedupe_key) VALUES (?, ?, ?, ?, 'SAR', ?, ?, ?, ?)`);
const insSpend = db.prepare(`INSERT OR REPLACE INTO spend (date, channel, campaign, spend, platform_conversions, platform_revenue) VALUES (?, ?, ?, ?, ?, ?)`);

const claims = new Map(); // "day|channel" -> {conv, rev}
const claim = (ts, ch, value) => {
  const k = `${dayOf(ts)}|${ch}`;
  const c = claims.get(k) || { conv: 0, rev: 0 };
  c.conv++; c.rev += value;
  claims.set(k, c);
};

let orderNo = 100000;
transaction(db, () => {
  for (let i = 0; i < 9000; i++) {
    const vid = `demo${i.toString(36).padStart(6, '0')}`;
    let ts = now - rand() * DAYS * DAY;
    const sessions = 1 + Math.floor(rand() ** 2 * 4);
    const path = [];
    for (let s = 0; s < sessions; s++) {
      if (s) ts += rand() * 6 * DAY;
      if (ts > now) break;
      const ch = pick(s ? LATER_TOUCH : FIRST_TOUCH);
      const campaign = CAMPAIGNS[ch] ? CAMPAIGNS[ch][Math.floor(rand() * 2)] : '';
      insTp.run(vid, Math.round(ts), ch, ch, PAID.includes(ch) ? 'cpc' : '', campaign, PAID.includes(ch) ? 'demo' : null, 'https://store.example/');
      path.push(ch);
    }
    const last = path[path.length - 1];
    const convTs = Math.round(Math.min(ts + rand() * 3_600_000, now - rand() * 3_600_000));
    if (rand() < BUY_RATE[last] * (1 + 0.25 * (path.length - 1))) {
      const value = Math.round(180 + rand() * 720);
      const status = rand() < 0.06 ? 'canceled' : 'completed';
      const id = String(orderNo++);
      insConv.run(vid, convTs, 'purchase', value, id, status, 1, `order:${id}`);
      // Platforms count every order they touched (click), plus random view-through.
      for (const ch of PAID) {
        if (path.includes(ch) || rand() < 0.18) claim(convTs, ch, value);
      }
    } else {
      const lead = pick({ none: 80, whatsapp: 13, form: 5, call: 2 });
      if (lead !== 'none') insConv.run(vid, convTs, lead, 0, null, null, 0, `${vid}:${lead}:${dayOf(convTs)}`);
    }
  }
  // Orders with no matching pixel visit (tracking blocked / other device).
  for (let i = 0; i < 120; i++) {
    const ts = Math.round(now - rand() * DAYS * DAY);
    const id = String(orderNo++);
    insConv.run(null, ts, 'purchase', Math.round(180 + rand() * 600), id, 'completed', 1, `order:${id}`);
  }
  for (let d = 0; d < DAYS; d++) {
    const day = dayOf(now - d * DAY);
    for (const ch of PAID) {
      const c = claims.get(`${day}|${ch}`) || { conv: 0, rev: 0 };
      const spend = Math.round(DAILY_SPEND[ch] * (0.8 + rand() * 0.4));
      insSpend.run(day, ch, '', spend, c.conv, Math.round(c.rev));
    }
  }
});

const stats = db.prepare(`SELECT type, COUNT(*) n, SUM(value) v FROM conversions GROUP BY type`).all();
console.log(`Seeded ${config.dbPath}:`, stats.map((s) => `${s.type}=${s.n}`).join(' '));
