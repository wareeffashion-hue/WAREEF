// Google Ads API (REST searchStream): ad-level daily metrics.
import { config } from '../config.js';
import { getJson, ConnectorError } from './http.js';

const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v24';

async function accessToken(credentials, fetch) {
  if (!config.google.clientId) throw new ConnectorError('GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET مطلوبة');
  const body = await getJson(fetch, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: credentials.refresh_token,
      client_id: config.google.clientId, client_secret: config.google.clientSecret,
    }),
  });
  return body.access_token;
}

export const google = {
  channel: 'google',
  label: 'جوجل',
  accountLabel: 'Customer ID (بدون شرطات)',
  fields: [
    { key: 'refresh_token', label: 'Refresh Token', secret: true },
    { key: 'login_customer_id', label: 'MCC Customer ID (اختياري)', secret: false },
  ],
  urlTemplate: 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}',

  async fetchRange({ credentials, accountId, from, to, fetch }) {
    if (!credentials.refresh_token) throw new ConnectorError('refresh_token مطلوب');
    if (!config.google.developerToken) throw new ConnectorError('GOOGLE_ADS_DEVELOPER_TOKEN مطلوب');
    const token = await accessToken(credentials, fetch);
    const customer = accountId.replace(/-/g, '');
    const headers = {
      Authorization: `Bearer ${token}`,
      'developer-token': config.google.developerToken,
      'Content-Type': 'application/json',
    };
    if (credentials.login_customer_id) headers['login-customer-id'] = credentials.login_customer_id.replace(/-/g, '');
    const query = `SELECT segments.date, campaign.id, campaign.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group.name,
      metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
      FROM ad_group_ad WHERE segments.date BETWEEN '${from}' AND '${to}'`;
    const chunks = await getJson(fetch, `https://googleads.googleapis.com/${VERSION}/customers/${customer}/googleAds:searchStream`, {
      method: 'POST', headers, body: JSON.stringify({ query }),
    });
    const rows = [];
    for (const chunk of Array.isArray(chunks) ? chunks : [chunks]) {
      for (const r of chunk.results || []) {
        const ad = r.adGroupAd?.ad || {};
        rows.push({
          date: r.segments?.date,
          campaign: r.campaign?.name || '',
          campaign_id: String(r.campaign?.id || ''),
          ad: ad.name || `${r.adGroup?.name || 'Ad'} · ${ad.id}`,
          ad_id: String(ad.id || ''),
          spend: (Number(r.metrics?.costMicros) || 0) / 1_000_000,
          impressions: Number(r.metrics?.impressions) || 0,
          clicks: Number(r.metrics?.clicks) || 0,
          platform_conversions: Number(r.metrics?.conversions) || 0,
          platform_revenue: Number(r.metrics?.conversionsValue) || 0,
        });
      }
    }
    return { rows };
  },
};
