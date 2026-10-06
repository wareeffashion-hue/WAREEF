import test from 'node:test';
import assert from 'node:assert/strict';
import { attribute } from '../src/attribution.js';
import { DAY } from '../src/config.js';

const T = Date.parse('2026-10-01T12:00:00Z');
const path = [
  { ts: T - 10 * DAY, channel: 'tiktok' },
  { ts: T - 5 * DAY, channel: 'snapchat' },
  { ts: T - 2 * DAY, channel: 'google' },
  { ts: T - 1 * DAY, channel: 'direct' },
];
const obj = (m) => Object.fromEntries([...m].map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);

test('last click gives everything to the final touch, even direct', () => {
  assert.deepEqual(obj(attribute(path, T, { model: 'last_click' })), { direct: 1 });
});

test('last non-direct skips direct visits', () => {
  assert.deepEqual(obj(attribute(path, T, { model: 'last_non_direct' })), { google: 1 });
});

test('last non-direct falls back to direct when that is all there is', () => {
  assert.deepEqual(obj(attribute([{ ts: T - DAY, channel: 'direct' }], T, { model: 'last_non_direct' })), { direct: 1 });
});

test('first click credits the opener', () => {
  assert.deepEqual(obj(attribute(path, T, { model: 'first_click' })), { tiktok: 1 });
});

test('linear splits evenly', () => {
  assert.deepEqual(obj(attribute(path, T, { model: 'linear' })), { tiktok: 0.25, snapchat: 0.25, google: 0.25, direct: 0.25 });
});

test('position based is 40/20/40', () => {
  assert.deepEqual(obj(attribute(path, T, { model: 'position_based' })), { tiktok: 0.4, snapchat: 0.1, google: 0.1, direct: 0.4 });
  assert.deepEqual(obj(attribute(path.slice(0, 2), T, { model: 'position_based' })), { tiktok: 0.5, snapchat: 0.5 });
});

test('time decay favours recent touches and sums to 1', () => {
  const c = attribute(path, T, { model: 'time_decay', halfLifeDays: 7 });
  assert.ok(c.get('direct') > c.get('google') && c.get('google') > c.get('snapchat') && c.get('snapchat') > c.get('tiktok'));
  assert.ok(Math.abs(sum(c) - 1) < 1e-9);
});

test('lookback window drops old touches and ignores future ones', () => {
  const withFuture = [...path, { ts: T + DAY, channel: 'meta' }];
  assert.deepEqual(obj(attribute(withFuture, T, { model: 'first_click', windowDays: 7 })), { snapchat: 1 });
});

test('no touchpoints -> unattributed (direct)', () => {
  assert.deepEqual(obj(attribute([], T)), { direct: 1 });
});

test('same channel appearing twice accumulates credit', () => {
  const p = [{ ts: T - 3 * DAY, channel: 'meta' }, { ts: T - 2 * DAY, channel: 'google' }, { ts: T - DAY, channel: 'meta' }];
  assert.deepEqual(obj(attribute(p, T, { model: 'linear' })), { meta: 0.667, google: 0.333 });
});
