// Demo data: 3 client workspaces x 90 days. Multi-touch journeys with campaigns
// and creatives, repeat customers who come back on another device, funnel
// events, leads, ad-level spend, and platform-reported revenue that counts
// every order a platform touched (plus view-through), which is exactly the
// double counting this system exposes.
import { rmSync } from 'node:fs';
import { config, DAY, dayOf } from '../src/config.js';
import { openDb, transaction } from '../src/db.js';
import { createUser } from '../src/auth.js';
import { createWorkspace } from '../src/workspaces.js';

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (weights) => {
  let r = rand() * Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(weights)) if ((r -= w) <= 0) return k;
  return Object.keys(weights)[0];
};
const choice = (arr) => arr[Math.floor(rand() * arr.length)];

const PAID = ['snapchat', 'tiktok', 'google', 'meta'];
const ADS = {
  snapchat: [['c-snap-1', 'عروض الخريف', ['فيديو المؤثرة', 'كاروسيل المنتجات']], ['c-snap-2', 'مجموعة جديدة', ['ستوري 15ث', 'صورة ثابتة']]],
  tiktok: [['c-tt-1', 'ترند العبايات', ['UGC تجربة', 'ترند صوتي']], ['c-tt-2', 'Spark Ads', ['مقطع المؤثر']]],
  google: [['c-g-1', 'Brand Search', ['RSA براند']], ['c-g-2', 'Shopping', ['Shopping فيد']], ['c-g-3', 'PMax', ['PMax أصول']]],
  meta: [['c-m-1', 'Retargeting', ['كاروسيل DPA', 'فيديو قصير']], ['c-m-2', 'Advantage+', ['ريلز 9:16', 'صورة عرض']]],
};
const CITIES = ['الرياض', 'جدة', 'الدمام', 'مكة', 'المدينة', 'الخبر', 'أبها'];
const NAMES = ['نورة', 'سارة', 'ريم', 'هند', 'لمى', 'العنود', 'منيرة', 'جود', 'أمل', 'شهد', 'فهد', 'عبدالله', 'خالد', 'ريان'];

const CLIENTS = [
  { name: 'متجر وريف للأزياء', visitors: 70000, aov: [180, 900], spend: { snapchat: 4800, tiktok: 3500, google: 3000, meta: 2500 },
    first: { snapchat: 30, tiktok: 26, google: 14, meta: 16, organic_search: 6, organic_social: 5, direct: 3 } },
  { name: 'عطور الشرق', visitors: 14000, aov: [250, 1400], spend: { snapchat: 1300, tiktok: 600, google: 1500, meta: 900 },
    first: { snapchat: 24, tiktok: 12, google: 26, meta: 18, organic_search: 10, organic_social: 6, direct: 4 } },
  { name: 'عيادات لمسة', visitors: 10000, aov: [400, 2500], spend: { snapchat: 900, tiktok: 300, google: 1600, meta: 1100 },
    first: { snapchat: 22, tiktok: 6, google: 34, meta: 22, organic_search: 10, organic_social: 4, direct: 2 }, leadHeavy: true },
];
const LATER = { google: 30, direct: 22, snapchat: 12, tiktok: 8, meta: 12, organic_search: 12, email: 4 };
const BUY = { google: 0.13, meta: 0.09, snapchat: 0.07, tiktok: 0.05, organic_search: 0.1, organic_social: 0.05, direct: 0.12, email: 0.15 };

if (config.dbPath !== ':memory:') rmSync(config.dbPath, { force: true });
const db = openDb(config.dbPath);
const now = Date.now();
const DAYS = 90;

createUser(db, { email: 'admin@example.com', name: 'مدير الوكالة', password: 'admin12345', role: 'admin' });

for (const client of CLIENTS) {
  const ws = createWorkspace(db, { name: client.name });
  const insTp = db.prepare(`INSERT INTO touchpoints (workspace_id, visitor_id, ts, channel, source, medium, campaign, content, click_id, landing_url, device)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insEv = db.prepare('INSERT INTO events (workspace_id, visitor_id, ts, type) VALUES (?, ?, ?, ?)');
  const insConv = db.prepare(`INSERT OR IGNORE INTO conversions (workspace_id, visitor_id, customer_id, ts, type, value, currency, order_id, status, confirmed, dedupe_key)
                              VALUES (?, ?, ?, ?, ?, ?, 'SAR', ?, ?, ?, ?)`);
  const insCust = db.prepare('INSERT INTO customers (workspace_id, external_id, name, city) VALUES (?, ?, ?, ?)');
  const insLink = db.prepare('INSERT OR IGNORE INTO visitor_customers (workspace_id, visitor_id, customer_id) VALUES (?, ?, ?)');
  const insSpend = db.prepare(`INSERT OR REPLACE INTO spend (workspace_id, date, channel, campaign, ad, campaign_id, ad_id, spend, impressions, clicks, platform_conversions, platform_revenue, source)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const claims = new Map(); // day|channel|campaignId|ad -> {conv, rev}
  const claim = (ts, ch, adKey, value) => {
    const k = `${dayOf(ts)}|${ch}|${adKey}`;
    const c = claims.get(k) || { conv: 0, rev: 0 };
    c.conv++; c.rev += value;
    claims.set(k, c);
  };
  const adKeys = Object.fromEntries(PAID.map((ch) => [ch, ADS[ch].flatMap(([cid, , ads]) => ads.map((ad, i) => ({ cid, ad, adId: `${cid}-a${i}` })))]));
  let orderNo = 100000 + ws.id * 100000;
  let customerNo = 0;
  const customers = [];

  // One visit: returns the touchpoint written.
  const visit = (vid, ts, ch, device) => {
    const ad = PAID.includes(ch) ? choice(adKeys[ch]) : null;
    // Most paid links carry ids from URL templates; a few carry names.
    insTp.run(ws.id, vid, Math.round(ts), ch, ch, ad ? 'paid' : '', ad ? ad.cid : '', ad ? ad.adId : '', ad ? 'click' : null, 'https://store.example/', device);
    return { ch, ad };
  };

  // Daily spend per ad first (weekly rhythm + monthly pushes); paid visits
  // then arrive in proportion to each channel's (adstocked) spend, so spend
  // really drives sales, as in real data.
  const spendPlan = [];
  const channelDaily = Object.fromEntries(PAID.map((ch) => [ch, new Array(DAYS).fill(0)]));
  for (let d = 0; d < DAYS; d++) {
    const dayTs = now - d * DAY;
    const weekday = new Date(dayTs).getUTCDay();
    for (const ch of PAID) {
      const push = (d + PAID.indexOf(ch) * 7) % 30 < 7 ? 2.1 : (d + PAID.indexOf(ch) * 11) % 23 < 5 ? 0.35 : 1;
      for (const a of adKeys[ch]) {
        const daily = (client.spend[ch] / adKeys[ch].length) * (0.75 + rand() * 0.5) * (weekday === 4 || weekday === 5 ? 1.15 : 1) * push;
        spendPlan.push({ d, ch, a, daily });
        channelDaily[ch][d] += daily;
      }
    }
  }
  const arrival = {};
  for (const ch of PAID) {
    // d = days ago; adstock runs forward in time (from d = DAYS-1 down to 0), with diminishing returns.
    const w = new Array(DAYS).fill(0);
    let carry = 0;
    for (let d = DAYS - 1; d >= 0; d--) { carry = channelDaily[ch][d] + 0.4 * carry; w[d] = carry ** 0.85; }
    const cum = [];
    w.reduce((acc, v, i) => (cum[i] = acc + v), 0);
    arrival[ch] = cum;
  }
  const dayFor = (ch) => {
    const cum = arrival[ch];
    if (!cum) return rand() * DAYS;
    const r = rand() * cum[cum.length - 1];
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    return lo + rand();
  };

  transaction(db, () => {
    for (let i = 0; i < client.visitors; i++) {
      let vid = `w${ws.id}v${i.toString(36)}`;
      let device = rand() < 0.78 ? 'mobile' : 'desktop';
      const firstChannel = pick(client.first);
      let ts = now - dayFor(firstChannel) * DAY;
      const sessions = 1 + Math.floor(rand() ** 2 * 4);
      const path = [];
      for (let s = 0; s < sessions; s++) {
        if (s) ts += rand() * 2 * DAY;
        if (ts > now) break;
        path.push(visit(vid, ts, s ? pick(LATER) : firstChannel, device));
      }
      if (!path.length) continue;
      const last = path[path.length - 1].ch;
      const convTs = Math.round(Math.min(ts + rand() * 3_600_000, now - rand() * 3_600_000));
      const buyP = BUY[last] * (1 + 0.25 * (path.length - 1)) * (client.leadHeavy ? 0.5 : 1);
      // Funnel events.
      if (rand() < 0.62) insEv.run(ws.id, vid, convTs - 900_000, 'view_item');
      const buys = rand() < buyP;
      if (buys || rand() < 0.12) insEv.run(ws.id, vid, convTs - 600_000, 'add_to_cart');
      if (buys || rand() < 0.04) insEv.run(ws.id, vid, convTs - 300_000, 'begin_checkout');

      if (buys) {
        const value = Math.round(client.aov[0] + rand() * (client.aov[1] - client.aov[0]));
        const status = rand() < 0.06 ? 'canceled' : 'completed';
        const ext = `C${++customerNo}`;
        const cid = Number(insCust.run(ws.id, ext, `${choice(NAMES)} ${choice(['ع.', 'م.', 'س.', 'ف.'])}`, choice(CITIES)).lastInsertRowid);
        const id = String(orderNo++);
        insConv.run(ws.id, vid, cid, convTs, 'purchase', value, id, status, 1, `order:${id}`);
        insLink.run(ws.id, vid, cid);
        customers.push({ cid, vid, ts: convTs, value });
        for (const ch of PAID) {
          const touched = path.filter((p) => p.ch === ch);
          if (touched.length) claim(convTs, ch, touched[touched.length - 1].ad.adId, value);
          else if (rand() < 0.16) claim(convTs, ch, choice(adKeys[ch]).adId, value); // view-through
        }
      } else {
        const lead = pick(client.leadHeavy ? { none: 62, whatsapp: 20, form: 13, call: 5 } : { none: 82, whatsapp: 12, form: 4, call: 2 });
        if (lead !== 'none') insConv.run(ws.id, vid, null, convTs, lead, 0, null, null, 0, `${vid}:${lead}:${dayOf(convTs)}`);
      }
    }

    // Repeat purchases, a third of them from a new device (cross-device journeys).
    for (const c of customers) {
      if (rand() > 0.28) continue;
      let ts = c.ts + (3 + rand() * 40) * DAY;
      if (ts > now) continue;
      const newDevice = rand() < 0.35;
      const vid = newDevice ? `${c.vid}x` : c.vid;
      visit(vid, ts - rand() * DAY, pick({ email: 25, meta: 25, direct: 25, google: 15, snapchat: 10 }), newDevice ? 'desktop' : 'mobile');
      if (newDevice) insLink.run(ws.id, vid, c.cid);
      const id = String(orderNo++);
      const value = Math.round(client.aov[0] + rand() * (client.aov[1] - client.aov[0]));
      insConv.run(ws.id, vid, c.cid, Math.round(ts), 'purchase', value, id, 'completed', 1, `order:${id}`);
    }
    // Orders without any tracked visit (blocked tracker, phone orders).
    for (let i = 0; i < client.visitors / 80; i++) {
      const id = String(orderNo++);
      insConv.run(ws.id, null, null, Math.round(now - rand() * DAYS * DAY), 'purchase',
        Math.round(client.aov[0] + rand() * (client.aov[1] - client.aov[0])), id, 'completed', 1, `order:${id}`);
    }
    for (const { d, ch, a, daily } of spendPlan) {
      const day = dayOf(now - d * DAY);
      const c = claims.get(`${day}|${ch}|${a.adId}`) || { conv: 0, rev: 0 };
      const [, campaignName] = ADS[ch].find(([cid]) => cid === a.cid);
      const imp = Math.round(daily * (60 + rand() * 40));
      insSpend.run(ws.id, day, ch, campaignName, a.ad, a.cid, a.adId, Math.round(daily), imp, Math.round(imp * (0.008 + rand() * 0.012)), c.conv, Math.round(c.rev), 'csv');
    }
  });
  const stats = db.prepare('SELECT type, COUNT(*) n FROM conversions WHERE workspace_id = ? GROUP BY type').all(ws.id);
  console.log(`${client.name}: ${stats.map((s) => `${s.type}=${s.n}`).join(' ')}`);
}
console.log('\nLogin: admin@example.com / admin12345');
