// Meta (Facebook / Instagram) Marketing API: ad-level daily insights.
import { getJson, ConnectorError } from './http.js';

const VERSION = process.env.META_API_VERSION || 'v25.0';
// Meta returns the same purchase under several action types; take the first present.
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

const pickAction = (list = []) => {
  for (const type of PURCHASE_TYPES) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
};

export const meta = {
  channel: 'meta',
  label: 'ميتا (فيسبوك وإنستقرام)',
  accountLabel: 'رقم الحساب الإعلاني (act_…)',
  fields: [{ key: 'access_token', label: 'Access Token (System User طويل المدى)', secret: true }],
  urlTemplate: 'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}',

  async fetchRange({ credentials, accountId, from, to, fetch }) {
    if (!credentials.access_token) throw new ConnectorError('access_token مطلوب');
    const act = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const params = new URLSearchParams({
      level: 'ad',
      fields: 'campaign_id,campaign_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
      time_increment: '1',
      time_range: JSON.stringify({ since: from, until: to }),
      limit: '500',
      access_token: credentials.access_token,
    });
    let url = `https://graph.facebook.com/${VERSION}/${act}/insights?${params}`;
    const rows = [];
    while (url) {
      const body = await getJson(fetch, url);
      for (const r of body.data || []) {
        rows.push({
          date: r.date_start,
          campaign: r.campaign_name || '',
          campaign_id: r.campaign_id || '',
          ad: r.ad_name || '',
          ad_id: r.ad_id || '',
          spend: Number(r.spend) || 0,
          impressions: Number(r.impressions) || 0,
          clicks: Number(r.clicks) || 0,
          platform_conversions: pickAction(r.actions),
          platform_revenue: pickAction(r.action_values),
        });
      }
      url = body.paging?.next || null;
    }
    return { rows };
  },
};
