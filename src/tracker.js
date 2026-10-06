// Source of the snippet served at /t.js. __ENDPOINT__ is replaced at runtime.
export const TRACKER_SOURCE = `(function (w, d) {
  if (w.__wtLoaded) return; w.__wtLoaded = true;
  var E = '__ENDPOINT__/collect', SESSION_MS = 30 * 60 * 1000;
  var CAMPAIGN = /[?&](utm_source|gclid|gbraid|wbraid|fbclid|ttclid|ScCid|sccid|twclid)=/;

  function rid() {
    var a = new Uint8Array(16); (w.crypto || w.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function getCookie(n) { var m = d.cookie.match('(?:^|; )' + n + '=([^;]*)'); return m ? m[1] : null; }
  function store(k, v) { try { if (v === undefined) return w.localStorage.getItem(k); w.localStorage.setItem(k, v); } catch (e) { return null; } }

  var vid = getCookie('wt_vid') || store('wt_vid') || rid();
  d.cookie = 'wt_vid=' + vid + '; path=/; max-age=63072000; SameSite=Lax';
  store('wt_vid', vid);

  function send(e, extra) {
    var body = { v: vid, e: e, url: location.href, ref: d.referrer };
    for (var k in extra || {}) body[k] = extra[k];
    var json = JSON.stringify(body);
    if (navigator.sendBeacon && navigator.sendBeacon(E, json)) return;
    try { fetch(E, { method: 'POST', body: json, keepalive: true, mode: 'no-cors' }); } catch (err) {}
  }

  var last = Number(store('wt_last') || 0), now = Date.now();
  var newSession = !last || now - last > SESSION_MS || CAMPAIGN.test(location.search);
  store('wt_last', String(now));
  send('pageview', { s: newSession ? 1 : 0 });

  d.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/^tel:/i.test(h)) send('call');
    else if (/wa\\.me\\/|api\\.whatsapp\\.com|web\\.whatsapp\\.com|^whatsapp:/i.test(h)) send('whatsapp');
  }, true);
  d.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f && !(f.getAttribute('data-wt') === 'ignore') && !/search/i.test(f.getAttribute('role') || f.action || '')) send('form');
  }, true);

  // Manual API: wtrack('purchase', {order_id: '123', value: 450, currency: 'SAR'})
  var queue = (w.wtrack && w.wtrack.q) || [];
  w.wtrack = function (e, data) { send(e, data); };
  for (var i = 0; i < queue.length; i++) w.wtrack.apply(null, queue[i]);
})(window, document);
`;
