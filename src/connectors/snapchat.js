// Snapchat Marketing API: ad-level daily stats. Money fields are in micro-currency.
import { config } from '../config.js';
import { getJson, ConnectorError } from './http.js';

const API = 'https://adsapi.snapchat.com/v1';
const MICRO = 1_000_000;

async function refresh(credentials, fetch) {
  if (!credentials.refresh_token) return credentials;
  if (!config.snapchat.clientId) throw new ConnectorError('SNAPCHAT_CLIENT_ID و SNAPCHAT_CLIENT_SECRET مطلوبة لتجديد التوكن');
  const body = await getJson(fetch, 'https://accounts.snapchat.com/login/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: credentials.refresh_token,
      client_id: config.snapchat.clientId, client_secret: config.snapchat.clientSecret,
    }),
  });
  return { ...credentials, access_token: body.access_token, refresh_token: body.refresh_token || credentials.refresh_token };
}

async function listAll(fetch, url, key, token) {
  const out = [];
  while (url) {
    const body = await getJson(fetch, url, { headers: { Authorization: `Bearer ${token}` } });
    for (const item of body[key] || []) out.push(item[key.slice(0, -1)] || item);
    url = body.paging?.next_link || null;
  }
  return out;
}

export const snapchat = {
  channel: 'snapchat',
  label: 'سناب شات',
  accountLabel: 'Ad Account ID',
  fields: [
    { key: 'refresh_token', label: 'Refresh Token', secret: true },
    { key: 'timezone_offset', label: 'منطقة الحساب الزمنية (مثل +03:00)', secret: false },
  ],
  urlTemplate: 'utm_source=snapchat&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}',

  async fetchRange({ credentials, accountId, from, to, fetch }) {
    const creds = await refresh(credentials, fetch);
    if (!creds.access_token) throw new ConnectorError('refresh_token مطلوب');
    const token = creds.access_token;
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    // Names for ids: ads -> ad squads -> campaigns.
    const [campaigns, squads, ads] = await Promise.all([
      listAll(fetch, `${API}/adaccounts/${accountId}/campaigns`, 'campaigns', token),
      listAll(fetch, `${API}/adaccounts/${accountId}/adsquads`, 'adsquads', token),
      listAll(fetch, `${API}/adaccounts/${accountId}/ads`, 'ads', token),
    ]);
    const campaignName = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
    const squadCampaign = Object.fromEntries(squads.map((s) => [s.id, s.campaign_id]));
    const adInfo = Object.fromEntries(ads.map((a) => [a.id, { name: a.name, campaign_id: squadCampaign[a.ad_squad_id] }]));

    // DAY granularity needs start/end at midnight in the account's timezone.
    const tz = /^[+-]\d{2}:\d{2}$/.test(creds.timezone_offset || '') ? creds.timezone_offset : '+03:00';
    const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      granularity: 'DAY', breakdown: 'ad',
      fields: 'spend,impressions,swipes,conversion_purchases,conversion_purchases_value',
      start_time: `${from}T00:00:00.000${tz}`, end_time: `${end}T00:00:00.000${tz}`,
    });
    const body = await getJson(fetch, `${API}/adaccounts/${accountId}/stats?${params}`, auth);
    const rows = [];
    for (const wrapper of body.timeseries_stats || []) {
      const stat = wrapper.timeseries_stat || wrapper;
      for (const ad of stat.breakdown_stats?.ad || []) {
        const info = adInfo[ad.id] || {};
        for (const day of ad.timeseries || []) {
          const s = day.stats || {};
          rows.push({
            date: String(day.start_time).slice(0, 10),
            campaign: campaignName[info.campaign_id] || '',
            campaign_id: info.campaign_id || '',
            ad: info.name || ad.id,
            ad_id: ad.id,
            spend: (Number(s.spend) || 0) / MICRO,
            impressions: Number(s.impressions) || 0,
            clicks: Number(s.swipes) || 0,
            platform_conversions: Number(s.conversion_purchases) || 0,
            platform_revenue: (Number(s.conversion_purchases_value) || 0) / MICRO,
          });
        }
      }
    }
    return { rows, credentials: creds };
  },
};
