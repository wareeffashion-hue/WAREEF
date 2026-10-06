// TikTok Business API: integrated report, ad level, by day.
import { getJson, ConnectorError } from './http.js';

const API = 'https://business-api.tiktok.com/open_api/v1.3';

export const tiktok = {
  channel: 'tiktok',
  label: 'تيك توك',
  accountLabel: 'Advertiser ID',
  fields: [{ key: 'access_token', label: 'Access Token', secret: true }],
  urlTemplate: 'utm_source=tiktok&utm_medium=paid&utm_campaign=__CID__&utm_content=__CREATIVE_ID__',

  async fetchRange({ credentials, accountId, from, to, fetch }) {
    if (!credentials.access_token) throw new ConnectorError('access_token مطلوب');
    const rows = [];
    let page = 1;
    for (;;) {
      const params = new URLSearchParams({
        advertiser_id: accountId,
        report_type: 'BASIC',
        data_level: 'AUCTION_AD',
        dimensions: JSON.stringify(['ad_id', 'stat_time_day']),
        metrics: JSON.stringify(['campaign_id', 'campaign_name', 'ad_name', 'spend', 'impressions', 'clicks',
          'complete_payment', 'total_complete_payment_rate', 'complete_payment_roas']),
        start_date: from,
        end_date: to,
        page: String(page),
        page_size: '1000',
      });
      const body = await getJson(fetch, `${API}/report/integrated/get/?${params}`, { headers: { 'Access-Token': credentials.access_token } });
      if (body.code !== 0) throw new ConnectorError(`TikTok ${body.code}: ${body.message}`);
      for (const r of body.data?.list || []) {
        const m = r.metrics || {};
        const spend = Number(m.spend) || 0;
        // Purchase value: total_complete_payment_rate, else ROAS x spend.
        const value = Number(m.total_complete_payment_rate) || (Number(m.complete_payment_roas) || 0) * spend;
        rows.push({
          date: String(r.dimensions?.stat_time_day || '').slice(0, 10),
          campaign: m.campaign_name || '',
          campaign_id: m.campaign_id || '',
          ad: m.ad_name || '',
          ad_id: r.dimensions?.ad_id || '',
          spend,
          impressions: Number(m.impressions) || 0,
          clicks: Number(m.clicks) || 0,
          platform_conversions: Number(m.complete_payment) || 0,
          platform_revenue: value,
        });
      }
      const info = body.data?.page_info || {};
      if (!info.total_page || page >= info.total_page) break;
      page++;
    }
    return { rows };
  },
};
