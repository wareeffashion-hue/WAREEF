import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GOOGLE_CLIENT_ID = 'gid';
process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev';
process.env.SNAPCHAT_CLIENT_ID = 'sid';
process.env.SNAPCHAT_CLIENT_SECRET = 'ssecret';
const { PLATFORMS, saveConnection, syncConnection, listConnections } = await import('../src/connectors/index.js');
const { openDb } = await import('../src/db.js');
const { createWorkspace } = await import('../src/workspaces.js');
const { createOrganization } = await import('../src/orgs.js');

/** Fake fetch: routes by URL substring, records calls. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const hit = Object.entries(routes).find(([k]) => String(url).includes(k));
    if (!hit) return new Response('{"error":{"message":"no route"}}', { status: 404 });
    const body = typeof hit[1] === 'function' ? hit[1](String(url), init) : hit[1];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

test('meta: paginates and picks one purchase action type', async () => {
  const fetch = fakeFetch({
    'after=2': { data: [{ date_start: '2026-10-02', campaign_name: 'B', campaign_id: '2', ad_name: 'b', ad_id: '20', spend: '50' }] },
    '/insights': { data: [{
      date_start: '2026-10-01', campaign_name: 'A', campaign_id: '1', ad_name: 'a', ad_id: '10', spend: '100.5', impressions: '1000', clicks: '20',
      actions: [{ action_type: 'omni_purchase', value: '3' }, { action_type: 'purchase', value: '3' }],
      action_values: [{ action_type: 'omni_purchase', value: '900' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '900' }],
    }], paging: { next: 'https://graph.facebook.com/x/insights?after=2' } },
  });
  const { rows } = await PLATFORMS.meta.fetchRange({ credentials: { access_token: 't' }, accountId: '123', from: '2026-10-01', to: '2026-10-02', fetch });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: '2026-10-01', campaign: 'A', campaign_id: '1', ad: 'a', ad_id: '10', spend: 100.5, impressions: 1000, clicks: 20, platform_conversions: 3, platform_revenue: 900 });
  assert.match(fetch.calls[0].url, /act_123\/insights/);
});

test('snapchat: refreshes token, converts micro-currency, maps names', async () => {
  const fetch = fakeFetch({
    'oauth2/access_token': { access_token: 'fresh', refresh_token: 'r2' },
    'acc/campaigns': { campaigns: [{ campaign: { id: 'c1', name: 'Fall' } }] },
    'acc/adsquads': { adsquads: [{ adsquad: { id: 's1', campaign_id: 'c1' } }] },
    'acc/stats': { timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [{ id: 'a1', timeseries: [
      { start_time: '2026-10-01T00:00:00.000+03:00', stats: { spend: 25_000_000, impressions: 900, swipes: 12, conversion_purchases: 2, conversion_purchases_value: 700_000_000 } },
    ] }] } } }] },
    'acc/ads': { ads: [{ ad: { id: 'a1', name: 'Story', ad_squad_id: 's1' } }] },
  });
  const res = await PLATFORMS.snapchat.fetchRange({ credentials: { refresh_token: 'r1' }, accountId: 'acc', from: '2026-10-01', to: '2026-10-01', fetch });
  assert.equal(res.credentials.refresh_token, 'r2');
  assert.deepEqual(res.rows[0], { date: '2026-10-01', campaign: 'Fall', campaign_id: 'c1', ad: 'Story', ad_id: 'a1', spend: 25, impressions: 900, clicks: 12, platform_conversions: 2, platform_revenue: 700 });
  const stats = fetch.calls.find((c) => c.url.includes('/stats'));
  assert.equal(stats.init.headers.Authorization, 'Bearer fresh');
  assert.match(stats.url, /end_time=2026-10-02T00%3A00%3A00.000%2B03%3A00/);
});

test('tiktok: pages through results and reads purchase value', async () => {
  const fetch = fakeFetch({
    'page=2': { code: 0, data: { list: [{ dimensions: { ad_id: '2', stat_time_day: '2026-10-02 00:00:00' }, metrics: { spend: '10', complete_payment_roas: '3' } }], page_info: { total_page: 2 } } },
    'page=1': { code: 0, data: { list: [{ dimensions: { ad_id: '1', stat_time_day: '2026-10-01 00:00:00' }, metrics: { campaign_name: 'T', campaign_id: '9', ad_name: 'ugc', spend: '40', complete_payment: '2', total_complete_payment_rate: '300' } }], page_info: { total_page: 2 } } },
  });
  const { rows } = await PLATFORMS.tiktok.fetchRange({ credentials: { access_token: 't' }, accountId: 'adv', from: '2026-10-01', to: '2026-10-02', fetch });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].platform_revenue, 300);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[1].platform_revenue, 30);
});

test('tiktok: API error codes surface', async () => {
  const fetch = fakeFetch({ report: { code: 40105, message: 'Access token is invalid' } });
  await assert.rejects(PLATFORMS.tiktok.fetchRange({ credentials: { access_token: 't' }, accountId: 'a', from: '2026-10-01', to: '2026-10-01', fetch }), /40105/);
});

test('google: exchanges refresh token and parses searchStream', async () => {
  const fetch = fakeFetch({
    'oauth2.googleapis.com': { access_token: 'g-token' },
    searchStream: [{ results: [{
      segments: { date: '2026-10-01' }, campaign: { id: '77', name: 'Brand' }, adGroup: { name: 'AG' },
      adGroupAd: { ad: { id: '88' } }, metrics: { costMicros: '12500000', impressions: '100', clicks: '9', conversions: 1.5, conversionsValue: 600 },
    }] }],
  });
  const { rows } = await PLATFORMS.google.fetchRange({ credentials: { refresh_token: 'r', login_customer_id: '111-222-3333' }, accountId: '123-456-7890', from: '2026-10-01', to: '2026-10-01', fetch });
  assert.deepEqual(rows[0], { date: '2026-10-01', campaign: 'Brand', campaign_id: '77', ad: 'AG · 88', ad_id: '88', spend: 12.5, impressions: 100, clicks: 9, platform_conversions: 1.5, platform_revenue: 600 });
  const call = fetch.calls.find((c) => c.url.includes('searchStream'));
  assert.match(call.url, /customers\/1234567890\//);
  assert.equal(call.init.headers['login-customer-id'], '1112223333');
  assert.equal(call.init.headers['developer-token'], 'dev');
});

test('sync writes spend, replaces stale rows, records errors', async () => {
  const db = openDb(':memory:');
  const ws = createWorkspace(db, { name: 't', orgId: createOrganization(db, { name: 'o' }) });
  const id = saveConnection(db, ws.id, { platform: 'meta', account_id: '1', credentials: { access_token: 'secret-token' } });
  assert.doesNotMatch(db.prepare('SELECT credentials FROM connections').get().credentials, /secret-token/);

  const ok = await syncConnection(db, id, { from: '2026-10-01', to: '2026-10-01', fetchImpl: fakeFetch({ '/insights': { data: [
    { date_start: '2026-10-01', campaign_name: 'A', ad_name: 'old', spend: '10' },
  ] } }) });
  assert.equal(ok.ok, true);
  await syncConnection(db, id, { from: '2026-10-01', to: '2026-10-01', fetchImpl: fakeFetch({ '/insights': { data: [
    { date_start: '2026-10-01', campaign_name: 'A', ad_name: 'renamed', spend: '12' },
  ] } }) });
  const rows = db.prepare('SELECT ad, spend, source FROM spend').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ ad: 'renamed', spend: 12, source: 'meta' }]);

  const bad = await syncConnection(db, id, { fetchImpl: fakeFetch({}) });
  assert.equal(bad.ok, false);
  const [conn] = listConnections(db, ws.id);
  assert.equal(conn.status, 'error');
  assert.match(conn.last_error, /404/);
  assert.equal(conn.credentials, undefined);
});
