import test from 'node:test';
import assert from 'node:assert/strict';
import { adstock, ridge, mmmReport } from '../src/analytics/mmm.js';
import { openDb } from '../src/db.js';
import { addDays, dayStart } from '../src/config.js';
import { createWorkspace } from '../src/workspaces.js';

test('adstock carries spend forward', () => {
  assert.deepEqual(adstock([100, 0, 0], 0.5), [100, 50, 25]);
});

test('ridge recovers a known linear model', () => {
  const X = [];
  const y = [];
  for (let i = 0; i < 50; i++) {
    const a = i % 7;
    const b = (i * 3) % 11;
    X.push([1, a, b]);
    y.push(5 + 2 * a + 3 * b);
  }
  const coef = ridge(X, y, 0);
  [5, 2, 3].forEach((v, i) => assert.ok(Math.abs(coef[i] - v) < 1e-6));
});

test('MMM recovers which channel drives revenue and moves budget toward it', () => {
  const db = openDb(':memory:');
  const ws = createWorkspace(db, { name: 't' });
  const to = '2026-10-06';
  let seed = 1;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const days = 120;
  const ins = db.prepare(`INSERT INTO spend (workspace_id, date, channel, spend) VALUES (?, ?, ?, ?)`);
  const order = db.prepare(`INSERT INTO conversions (workspace_id, ts, type, value, confirmed, dedupe_key) VALUES (?, ?, 'purchase', ?, 1, ?)`);
  let carry = 0;
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(to, -i);
    const strong = 500 + rand() * 1000;   // drives revenue
    const useless = 500 + rand() * 1000;  // does nothing
    ins.run(ws.id, date, 'meta', strong);
    ins.run(ws.id, date, 'tiktok', useless);
    carry = strong + 0.5 * carry;
    const revenue = 3000 + 8000 * (carry / (carry + 1500)) + (rand() - 0.5) * 400;
    order.run(ws.id, dayStart(date) + 3_600_000, revenue, `order:${date}`);
  }
  const m = mmmReport(db, ws, { to, days });
  assert.equal(m.ready, true);
  assert.ok(m.r2 > 0.8, `r2 ${m.r2}`);
  assert.equal(m.reliable, true);
  const meta = m.channels.find((c) => c.channel === 'meta');
  const tiktok = m.channels.find((c) => c.channel === 'tiktok');
  assert.ok(meta.roi > 1, `meta roi ${meta.roi}`);
  assert.ok(tiktok.contribution < meta.contribution * 0.1);
  assert.equal(meta.decay, 0.5);
});

test('MMM refuses to run on too little data', () => {
  const db = openDb(':memory:');
  const ws = createWorkspace(db, { name: 't' });
  const m = mmmReport(db, ws, { to: '2026-10-06', days: 90 });
  assert.equal(m.ready, false);
});
