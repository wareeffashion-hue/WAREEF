// Turns a landing URL + referrer into a marketing channel.

export const CHANNELS = [
  'google', 'meta', 'snapchat', 'tiktok', 'x',
  'organic_search', 'organic_social', 'email', 'referral', 'direct', 'other',
];

// Ad-platform click ids: the strongest signal that a visit came from a paid click.
const CLICK_IDS = [
  ['gclid', 'google'], ['gbraid', 'google'], ['wbraid', 'google'],
  ['ScCid', 'snapchat'], ['sccid', 'snapchat'],
  ['ttclid', 'tiktok'],
  ['twclid', 'x'],
  ['fbclid', 'meta'],
];

const SOURCE_ALIASES = {
  google: 'google', 'google ads': 'google', adwords: 'google', youtube: 'google',
  facebook: 'meta', fb: 'meta', instagram: 'meta', ig: 'meta', meta: 'meta',
  snapchat: 'snapchat', snap: 'snapchat',
  tiktok: 'tiktok', 'tik tok': 'tiktok',
  twitter: 'x', x: 'x',
  email: 'email', newsletter: 'email', mailchimp: 'email', klaviyo: 'email',
};

const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia)\./;
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|snapchat|tiktok|twitter|x|youtube|linkedin|pinterest|reddit|threads)\.(com|net)$|^t\.co$|^l\.facebook\.com$|^lm\.facebook\.com$/;

/** Maps a free-form platform name (utm_source, CSV column) to a channel key. */
export function normalizeChannel(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return 'other';
  if (CHANNELS.includes(key)) return key;
  return SOURCE_ALIASES[key] || 'other';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Classifies a visit. Returns null for internal navigation (referrer is the
 * store itself and no campaign params), which should not create a touchpoint.
 */
export function classify({ url, referrer }) {
  let params = new URLSearchParams();
  try {
    params = new URL(url).searchParams;
  } catch { /* keep empty params */ }

  const utm = {
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
    content: params.get('utm_content') || params.get('utm_ad') || '',
  };

  for (const [param, channel] of CLICK_IDS) {
    if (params.get(param)) {
      return { channel, ...utm, source: utm.source || channel, medium: utm.medium || 'cpc', clickId: param };
    }
  }

  if (utm.source) {
    const channel = normalizeChannel(utm.source);
    const organicMedium = /^(organic|social|referral|bio|post|story)$/i.test(utm.medium);
    // A platform link tagged as organic (e.g. bio link) is not paid traffic.
    if (organicMedium && ['meta', 'snapchat', 'tiktok', 'x'].includes(channel)) {
      return { channel: 'organic_social', ...utm, clickId: null };
    }
    return { channel, ...utm, clickId: null };
  }

  const refHost = hostOf(referrer);
  const ownHost = hostOf(url);
  if (refHost && refHost === ownHost) return null;
  if (!refHost) return { channel: 'direct', source: '(direct)', medium: '(none)', campaign: '', content: '', clickId: null };
  if (SEARCH_HOSTS.test(refHost)) return { channel: 'organic_search', source: refHost, medium: 'organic', campaign: '', content: '', clickId: null };
  if (SOCIAL_HOSTS.test(refHost)) return { channel: 'organic_social', source: refHost, medium: 'social', campaign: '', content: '', clickId: null };
  return { channel: 'referral', source: refHost, medium: 'referral', campaign: '', content: '', clickId: null };
}

export const PAID_CHANNELS = ['google', 'meta', 'snapchat', 'tiktok', 'x'];

export function deviceOf(userAgent = '') {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor/i;
export function isBot(userAgent = '') {
  return !userAgent || BOTS.test(userAgent);
}
