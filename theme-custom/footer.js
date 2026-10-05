/*
 * Wareef — custom footer for the Selia theme (Salla)
 * Paste into: Salla dashboard → Design → customize the theme version → Custom JS
 * Builds the footer from the store's own data (logo, description, footer menu,
 * contacts, tax / CR / Saudi Business Center numbers) and hides the default one.
 */
(function () {
  var CSS = `
.store-footer.wf-ready > *:not(#wf-footer){display:none!important}
#wf-footer{--wf-text:#3b2a26;--wf-muted:#5b4a45;--wf-line:rgba(59,42,38,.14);--wf-card:rgba(255,255,255,.28);
  background:var(--footer-bg,#eee2d4);color:var(--wf-text);padding:56px 0 18px;font-family:inherit}
#wf-footer a{color:inherit;text-decoration:none}
#wf-footer .wf-wrap{max-width:1400px;margin:0 auto;padding:0 16px}
#wf-footer .wf-top{display:flex;align-items:center;gap:28px;padding-bottom:36px;border-bottom:1px solid var(--wf-line)}
#wf-footer .wf-logo img{height:72px;width:auto;max-width:180px;object-fit:contain;display:block}
#wf-footer .wf-desc{border-inline-start:1px solid var(--wf-line);padding-inline-start:28px;line-height:1.9;font-size:15px;color:var(--wf-text)}
#wf-footer .wf-desc p{margin:0}
#wf-footer .wf-cols{display:grid;grid-template-columns:repeat(2,minmax(0,235px)) minmax(0,1fr);gap:28px;padding:36px 0 32px}
#wf-footer .wf-title{font-size:18px;font-weight:700;margin:0 0 18px;color:var(--wf-text)}
#wf-footer .wf-links{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
#wf-footer .wf-link{display:flex;align-items:center;gap:10px;padding:9px 14px;border:1px solid var(--wf-line);border-radius:8px;
  background:var(--wf-card);font-size:13px;transition:border-color .2s,background .2s}
#wf-footer .wf-link:hover{border-color:var(--color-primary,#9d3d38);background:rgba(255,255,255,.5)}
#wf-footer .wf-link svg{width:18px;height:18px;flex:none;color:var(--wf-muted)}
#wf-footer .wf-link.wf-accent svg{color:#e0a43a}
#wf-footer .wf-social{display:flex;flex-wrap:wrap;gap:22px;align-items:center;margin-bottom:22px}
#wf-footer .wf-social a{display:flex;color:var(--wf-text);transition:color .2s}
#wf-footer .wf-social a:hover{color:var(--color-primary,#9d3d38)}
#wf-footer .wf-social svg{width:21px;height:21px}
#wf-footer .wf-social i{font-size:21px;line-height:1}
#wf-footer .wf-btns{display:flex;gap:14px;flex-wrap:wrap}
#wf-footer .wf-btn{display:inline-flex;align-items:center;gap:8px;background:var(--color-primary,#9d3d38);color:#fff;border:0;
  border-radius:6px;padding:9px 16px;font-size:14px;font-family:inherit;cursor:pointer;transition:filter .2s}
#wf-footer .wf-btn:hover{filter:brightness(1.1)}
#wf-footer .wf-btn svg{width:17px;height:17px}
#wf-footer .wf-badges{display:flex;flex-wrap:wrap;gap:12px;padding-bottom:40px}
#wf-footer .wf-badge{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;
  width:120px;min-height:128px;padding:12px 8px;border:1px solid var(--wf-line);border-radius:8px;background:rgba(255,255,255,.55);
  font-size:11px;line-height:1.4;color:var(--wf-text)}
#wf-footer .wf-badge b{font-size:11px}
#wf-footer .wf-badge span{font-size:12px}
#wf-footer .wf-badge svg,#wf-footer .wf-badge img{width:44px;height:44px;object-fit:contain}
#wf-footer .wf-badge--sbc{flex-direction:row;width:370px;max-width:100%;gap:18px;justify-content:center}
#wf-footer .wf-badge--sbc img{width:64px;height:52px}
#wf-footer .wf-badge--sbc .wf-sbc-text{border-inline-start:2px solid #c9a227;padding-inline-start:14px;text-align:start;font-size:11px}
#wf-footer .wf-bottom{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
  border-top:1px solid var(--wf-line);padding-top:16px;font-size:12px;color:var(--wf-muted)}
#wf-footer .wf-bottom salla-payments{opacity:.75}
@media (max-width:1023px){
  #wf-footer .wf-cols{grid-template-columns:1fr 1fr}
  #wf-footer .wf-follow{grid-column:1 / -1}
}
@media (max-width:640px){
  #wf-footer{padding-top:40px}
  #wf-footer .wf-top{flex-direction:column;text-align:center;gap:16px}
  #wf-footer .wf-desc{border:0;padding:0}
  #wf-footer .wf-cols{grid-template-columns:1fr;gap:26px}
  #wf-footer .wf-social{justify-content:center}
  #wf-footer .wf-follow .wf-title{text-align:center}
  #wf-footer .wf-btns{justify-content:center}
  #wf-footer .wf-badges{justify-content:center}
  #wf-footer .wf-badge{width:calc(33.333% - 8px);min-width:96px}
  #wf-footer .wf-badge--sbc{width:100%}
  #wf-footer .wf-bottom{flex-direction:column-reverse;text-align:center}
}`;

  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICONS = {
    box: svg('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'),
    file: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    truck: svg('<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
    layers: svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/>'),
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
    percent: svg('<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
    award: svg('<circle cx="12" cy="8" r="6"/><path d="M8.2 13.2L7 22l5-3 5 3-1.2-8.8"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    mobile: svg('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    coins: svg('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/>'),
    receipt: svg('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    building: svg('<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6M3 21h18M8 11h.01M12 11h.01M16 11h.01"/>')
  };
  // Pick an icon from the link text
  var RULES = [
    [/طلب.*(استبدال|استرجاع)|ارجاع|إرجاع/, 'repeat', true],
    [/استبدال|استرجاع/, 'box'],
    [/خصوصية|أمان|امان/, 'shield'],
    [/استخدام|شروط|أحكام|احكام/, 'file'],
    [/شحن|توصيل/, 'truck'],
    [/من نحن|عن /, 'info'],
    [/جملة/, 'layers'],
    [/اتصل|تواصل/, 'phone'],
    [/عمولة|تسويق/, 'percent'],
    [/علامة|شهادة|توثيق/, 'award']
  ];
  function iconFor(text) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(text)) return { name: RULES[i][1], accent: !!RULES[i][2] };
    return { name: 'link', accent: false };
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function get(key) {
    try { return window.salla && salla.config ? salla.config.get(key) : null; } catch (e) { return null; }
  }

  function build() {
    var footer = document.querySelector('.store-footer');
    if (!footer || document.getElementById('wf-footer')) return;

    var style = document.createElement('style');
    style.id = 'wf-footer-css';
    style.textContent = CSS;
    document.head.appendChild(style);

    var store = get('store') || {};
    var settings = store.settings || {};
    var contacts = store.contacts || {};
    var social = store.social || {};

    var logoImg = footer.querySelector('.store-footer__logo-link img');
    var logo = (logoImg && (logoImg.getAttribute('data-src') || logoImg.getAttribute('src'))) || store.logo || '';
    var home = (footer.querySelector('.store-footer__logo-link') || {}).href || store.url || '/';
    var name = store.name || '';
    var desc = store.description || '';
    if (!desc) {
      var d = footer.querySelector('.footer-description');
      desc = d ? d.innerHTML : '';
    }

    // Footer menu links (from Salla's footer menu)
    var links = [];
    footer.querySelectorAll('.store-footer__menu a, .footer-list a').forEach(function (a) {
      var t = (a.textContent || '').trim();
      if (t && !links.some(function (l) { return l.href === a.href && l.text === t; })) links.push({ text: t, href: a.href, target: a.target });
    });
    var half = Math.ceil(links.length / 2);
    function list(items) {
      return '<ul class="wf-links">' + items.map(function (l) {
        var ic = iconFor(l.text);
        return '<li><a class="wf-link' + (ic.accent ? ' wf-accent' : '') + '" href="' + esc(l.href) + '"' +
          (l.target === '_blank' ? ' target="_blank" rel="noopener"' : '') + '>' + ICONS[ic.name] + '<span>' + esc(l.text) + '</span></a></li>';
      }).join('') + '</ul>';
    }

    // Contacts and social icons
    var wa = contacts.whatsapp;
    if (!wa) {
      var waBtn = document.querySelector('#wa-selia a[href*="wa.me"]');
      if (waBtn) { var m = waBtn.href.match(/wa\.me\/(\d+)/); if (m) wa = m[1]; }
    }
    var soc = [];
    if (contacts.email) soc.push(['mailto:' + contacts.email, ICONS.mail, 'Email']);
    if (contacts.mobile) soc.push(['tel:' + contacts.mobile, ICONS.mobile, 'Phone']);
    if (wa) soc.push(['https://wa.me/' + String(wa).replace(/\D/g, ''), '<i class="sicon-whatsapp2"></i>', 'WhatsApp']);
    [['instagram', 'sicon-instagram'], ['snapchat', 'sicon-snapchat'], ['tiktok', 'sicon-tiktok'], ['twitter', 'sicon-twitter'],
     ['youtube', 'sicon-youtube'], ['facebook', 'sicon-facebook']].forEach(function (s) {
      if (social[s[0]]) soc.push([social[s[0]], '<i class="' + s[1] + '"></i>', s[0]]);
    });
    var socHtml = soc.map(function (s) {
      var ext = /^https?:/.test(s[0]);
      return '<a href="' + esc(s[0]) + '" aria-label="' + esc(s[2]) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + s[1] + '</a>';
    }).join('');

    var multiLang = settings.is_multilingual !== false;
    var multiCur = settings.currencies_enabled !== false;
    var btns = (multiLang ? '<button type="button" class="wf-btn" data-wf-locale>' + ICONS.globe + '<span>اللغة</span></button>' : '') +
               (multiCur ? '<button type="button" class="wf-btn" data-wf-locale>' + ICONS.coins + '<span>العملة</span></button>' : '');

    // Trust badges
    var badges = [];
    var sbcId = settings.certificate && settings.certificate.id;
    if (sbcId) {
      badges.push('<a class="wf-badge wf-badge--sbc" target="_blank" rel="noopener" href="https://eauthenticate.saudibusiness.gov.sa/certificate-details/' + esc(sbcId) + '">' +
        '<img src="https://cdn.salla.network/images/sbc.png" alt="Saudi Business Center">' +
        '<div class="wf-sbc-text"><b>موثق لدى منصة الأعمال</b><br>مركز الأعمال (التوثيق)<br>' + esc(sbcId) + '</div></a>');
    }
    var tm = links.filter(function (l) { return /علامة/.test(l.text); })[0];
    if (tm) badges.push('<a class="wf-badge" href="' + esc(tm.href) + '">' + ICONS.award + '<b>شهادة العلامة التجارية</b><span>عرض الشهادة</span></a>');
    var tax = settings.tax || {};
    if (tax.number || tax.certificate) {
      var taxInner = ICONS.receipt + '<b>الرقم الضريبي</b>' + (tax.number ? '<span>' + esc(tax.number) + '</span>' : '<span>عرض الشهادة</span>');
      badges.push(tax.certificate ? '<a class="wf-badge" target="_blank" rel="noopener" href="' + esc(tax.certificate) + '">' + taxInner + '</a>'
                                  : '<div class="wf-badge">' + taxInner + '</div>');
    }
    if (settings.commercial_number) {
      badges.push('<div class="wf-badge">' + ICONS.building + '<b>رقم السجل التجاري</b><span>' + esc(settings.commercial_number) + '</span></div>');
    }

    var wrap = document.createElement('div');
    wrap.id = 'wf-footer';
    wrap.innerHTML =
      '<div class="wf-wrap">' +
        '<div class="wf-top">' +
          (logo ? '<a class="wf-logo" href="' + esc(home) + '"><img src="' + esc(logo) + '" alt="' + esc(name) + '"></a>' : '') +
          (desc ? '<div class="wf-desc">' + desc + '</div>' : '') +
        '</div>' +
        '<div class="wf-cols">' +
          (links.length ? '<div><h3 class="wf-title">روابط مهمة</h3>' + list(links.slice(0, half)) + '</div>' : '') +
          (links.length > 1 ? '<div><h3 class="wf-title">روابط سريعة</h3>' + list(links.slice(half)) + '</div>' : '') +
          '<div class="wf-follow"><h3 class="wf-title">تابعنا</h3><div class="wf-social">' + socHtml + '</div><div class="wf-btns">' + btns + '</div></div>' +
        '</div>' +
        (badges.length ? '<div class="wf-badges">' + badges.join('') + '</div>' : '') +
        '<div class="wf-bottom"><span>© جميع الحقوق محفوظة لعلامة "' + esc(name) + '" التجارية.</span><span class="wf-pay"></span></div>' +
      '</div>';

    // Keep Salla's live components working: move them out of the hidden default footer
    var pay = footer.querySelector('salla-payments');
    if (pay) wrap.querySelector('.wf-pay').appendChild(pay);
    footer.querySelectorAll('salla-localization-modal').forEach(function (m) { document.body.appendChild(m); });

    footer.appendChild(wrap);
    footer.classList.add('wf-ready');

    wrap.querySelectorAll('[data-wf-locale]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.salla && salla.event) salla.event.dispatch('localization::open');
      });
    });
  }

  function start() {
    if (window.Salla && typeof Salla.onReady === 'function') Salla.onReady(build); else build();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
