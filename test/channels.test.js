import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, normalizeChannel } from '../src/channels.js';

const ch = (url, referrer = '') => classify({ url, referrer })?.channel ?? null;

test('ad click ids win', () => {
  assert.equal(ch('https://s.com/?gclid=abc'), 'google');
  assert.equal(ch('https://s.com/?ScCid=abc'), 'snapchat');
  assert.equal(ch('https://s.com/?ttclid=abc'), 'tiktok');
  assert.equal(ch('https://s.com/?fbclid=abc'), 'meta');
  assert.equal(ch('https://s.com/?utm_source=newsletter&gclid=x'), 'google');
});

test('utm source mapping', () => {
  assert.equal(ch('https://s.com/?utm_source=snap&utm_medium=paid'), 'snapchat');
  assert.equal(ch('https://s.com/?utm_source=Instagram&utm_medium=cpc'), 'meta');
  assert.equal(ch('https://s.com/?utm_source=instagram&utm_medium=bio'), 'organic_social');
  assert.equal(ch('https://s.com/?utm_source=klaviyo'), 'email');
  assert.equal(ch('https://s.com/?utm_source=unknownsite'), 'other');
});

test('referrer based', () => {
  assert.equal(ch('https://s.com/', 'https://www.google.com/'), 'organic_search');
  assert.equal(ch('https://s.com/', 'https://l.facebook.com/'), 'organic_social');
  assert.equal(ch('https://s.com/', 'https://t.co/xyz'), 'organic_social');
  assert.equal(ch('https://s.com/', 'https://blog.example.org/post'), 'referral');
  assert.equal(ch('https://s.com/'), 'direct');
});

test('internal navigation is not a touchpoint', () => {
  assert.equal(ch('https://www.s.com/cart', 'https://s.com/product'), null);
});

test('normalizeChannel for CSV platform names', () => {
  assert.equal(normalizeChannel('Snapchat'), 'snapchat');
  assert.equal(normalizeChannel('Facebook'), 'meta');
  assert.equal(normalizeChannel('google'), 'google');
  assert.equal(normalizeChannel('TikTok'), 'tiktok');
});
