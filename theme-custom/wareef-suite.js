/*
  ══════════════════════════════════════════════════════════════════════════
  حزمة وريف الموحدة لمتجر سلة — الإصدار 2.0
  تشمل: صفحة تأكيد الطلب · نظام الاستبدال والاسترجاع · دليل المقاسات ·
        كرت تفاصيل المنتج · تحسينات تجربة صفحة المنتج.

  الطريقة: الصقي هذا الملف كاملًا مرة واحدة داخل محرر JavaScript في سلة،
  بدون وسم <script>.

  كل الإعدادات القابلة للتغيير موجودة في كائن WAREEF بالأسفل مباشرة،
  ولا حاجة لتعديل أي سطر آخر.
  ══════════════════════════════════════════════════════════════════════════
*/
(function () {
  'use strict';

  // منع التحميل المزدوج لو لُصق الكود في أكثر من مكان
  if (window.__wareefSuite) return;

  /* ═══════════════════ 0) الإعدادات ═══════════════════ */

  const WAREEF = {
    // أرقام واتساب (بصيغة دولية بدون + وبدون مسافات)
    whatsapp: {
      support: '966539860272',   // خدمة العملاء في صفحة تأكيد الطلب
      returns: '966533769187'    // طلبات الاستبدال والاسترجاع
    },
    urls: {
      shop: 'https://wareefsa.com/',
      policy: 'https://wareefsa.com/سياسة-الاستبدال-والاسترجاع/page-1282006087'
    },
    coupon: { code: 'NEXT5', discount: '5%' },
    shippingTime: '24–72 ساعة',
    returns: {
      requestWindow: '24 ساعة من تاريخ استلام الطلب',
      shippingFee: '50 ريال',
      readAttempts: 7,
      readDelay: 280
    },
    sizeGuide: {
      onlyProductIds: [],        // اتركيها فارغة لعرض الدليل في كل المنتجات
      rememberMeasurements: true // حفظ آخر قياسات أدخلتها العميلة في متصفحها
    },
    // مفاتيح تشغيل/إيقاف كل وحدة على حدة
    features: {
      thankYouPage: true,
      returnsWidget: true,
      sizeGuide: true,
      productDetailsCard: true,
      productUx: true,
      hideNativeProductTitle: true, // إخفاء عنوان المنتج الأصلي (يظهر الاسم داخل كرت التفاصيل بدلًا منه)
      arabicOnly: true              // تشغيل الحزمة في النسخة العربية فقط (نصوصها عربية)
    },
    debug: false // اجعليها true لعرض أي أخطاء في وحدة تحكم المتصفح
  };

  // نصوص الحزمة عربية بالكامل، فلا تعمل في نسخة المتجر الإنجليزية
  if (WAREEF.features.arabicOnly) {
    const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (/^en\b/.test(lang) || /^\/en(?:\/|$)/i.test(window.location.pathname)) return;
  }

  /* ═══════════════════ 1) أدوات مشتركة ═══════════════════ */

  const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' };

  function normalizeDigits(value) {
    return String(value == null ? '' : value)
      .replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS.indexOf(digit))
      .replace(/[۰-۹]/g, (digit) => PERSIAN_DIGITS.indexOf(digit));
  }

  function cleanValue(value) {
    return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function normalizeText(value) {
    return normalizeDigits(cleanValue(value)).toLowerCase()
      .replace(/[إأآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[ـ\u064B-\u065F\u0670]/g, '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (character) => HTML_ESCAPES[character]);
  }

  function warn(scope, error) {
    if (WAREEF.debug && window.console && console.warn) console.warn('[وريف] ' + scope, error);
  }

  // كل وحدة معزولة: خطأ في وحدة لا يوقف بقية الوحدات
  function safeModule(name, factory) {
    try { factory(); } catch (error) { warn(name, error); }
  }

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
      return;
    }
    callback();
  }

  // يكتب النص فقط إذا تغيّر: الكتابة المتكررة لنفس النص تُطلق مراقب الصفحة في حلقة لا تنتهي
  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function readStore(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }

  function writeStore(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* التخزين غير متاح */ }
  }

  /*
    مراقب واحد للصفحة بدل عدة مراقبات:
    - يقلّل استهلاك المعالج بشكل كبير على أجهزة الجوال.
    - يغطي التنقل داخل المتجر (SPA) وزر الرجوع.
    كل دالة مسجّلة يجب أن تبدأ بفحص سريع وترجع فورًا إذا لا عمل لديها.
  */
  const domWatcher = (function () {
    const listeners = new Set();
    let timer = 0;
    let observer = null;
    let flushing = false;

    function flush() {
      timer = 0;
      flushing = true;
      listeners.forEach((listener) => {
        try { listener(); } catch (error) { warn('watcher', error); }
      });
      flushing = false;
    }

    // ننتظر هدوء الصفحة 180ms، وبحد أقصى ثانية واحدة حتى لا تؤجّل السلايدرات والعدادات التنفيذ للأبد
    let firstScheduledAt = 0;

    function schedule() {
      if (flushing) return;
      const now = Date.now();
      if (!timer) firstScheduledAt = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, now - firstScheduledAt >= 1000 ? 0 : 180);
    }

    function start() {
      if (observer) return;
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      ['popstate', 'hashchange', 'pageshow'].forEach((event) => window.addEventListener(event, schedule));
      document.addEventListener('salla::product::loaded', schedule);
      document.addEventListener('salla::cart::updated', schedule);
    }

    return {
      add(listener) {
        listeners.add(listener);
        start();
        try { listener(); } catch (error) { warn('watcher:init', error); }
      },
      schedule
    };
  })();

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /*
    متحكم النوافذ المنبثقة: يمنع تمرير الخلفية، يحبس التركيز داخل النافذة،
    يغلق بمفتاح Escape، ويعيد التركيز لمكانه بعد الإغلاق.
  */
  function createModalController(openClass, dialogSelector) {
    let lastFocusedElement = null;
    let previousBodyOverflow = '';
    let activeModal = null;

    function onKeyDown(event) {
      if (!activeModal) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        controller.close(activeModal);
        return;
      }

      if (event.key !== 'Tab') return;

      const items = Array.from(activeModal.querySelectorAll(FOCUSABLE))
        .filter((element) => element.offsetWidth || element.offsetHeight || element === document.activeElement);
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const controller = {
      open(modal) {
        if (activeModal === modal) return;
        lastFocusedElement = document.activeElement;
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        modal.classList.add(openClass);
        modal.setAttribute('aria-hidden', 'false');
        activeModal = modal;
        document.addEventListener('keydown', onKeyDown, true);
        const dialog = modal.querySelector(dialogSelector);
        if (dialog) window.setTimeout(() => dialog.focus(), 0);
      },
      close(modal) {
        modal.classList.remove(openClass);
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = previousBodyOverflow;
        if (activeModal === modal) {
          activeModal = null;
          document.removeEventListener('keydown', onKeyDown, true);
        }
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
      }
    };

    return controller;
  }

  window.__wareefSuite = { version: '2.0.0', settings: WAREEF, refresh: domWatcher.schedule };

  /* ═══════════════════ 2) صفحة تأكيد الطلب ═══════════════════ */

  safeModule('thank-you', function () {
    if (!WAREEF.features.thankYouPage) return;

    const ROOT_ID = 'wareef-luxury-thankyou';

    function isThankYouPage() {
      const path = decodeURIComponent(window.location.pathname).toLowerCase();
      return Boolean(
        document.querySelector('.thanks-item') ||
        document.querySelector('salla-next-order-coupon') ||
        // زر النسخ وحده موجود في صفحات أخرى (مثل نسخ كود خصم)، لذلك نشترط معه زر تفاصيل الطلب
        (document.querySelector('salla-button[data-content]') && findOrderDetailsButton()) ||
        /thank.?you|شكرا|شكراً|order.?success|checkout.?success/i.test(path)
      );
    }

    function getOrderNumber() {
      // نقبل فقط زر نسخ محتواه رقم طلب، وليس كوبونًا مثل NEXT5
      const copyButtons = document.querySelectorAll('salla-button[data-content]');
      for (let index = 0; index < copyButtons.length; index += 1) {
        const match = normalizeDigits(cleanValue(copyButtons[index].getAttribute('data-content'))).match(/^#?\s*(\d{5,})$/);
        if (match) return match[1];
      }

      const scope = document.querySelector('main') || document.body;
      const candidates = Array.from(scope.querySelectorAll('h1, h2, h3, p, span, strong, b, div'))
        .slice(0, 1200)
        .map((element) => normalizeDigits(element.textContent || ''))
        .filter((text) => text.length < 200 && /رقم\s*الطلب|order\s*(id|number)|#\s*\d/i.test(text));

      for (const text of candidates) {
        const match = text.match(/#\s*(\d{5,})|(?:رقم\s*الطلب|order\s*(?:id|number))\D{0,12}(\d{5,})/i);
        if (match) return match[1] || match[2];
      }

      const pathNumbers = normalizeDigits(window.location.pathname).match(/\d{5,}/g);
      return pathNumbers ? pathNumbers[pathNumbers.length - 1] : '';
    }

    function findOrderDetailsButton() {
      return document.querySelector('salla-button[onclick*="salla.order.show"], button[onclick*="salla.order.show"], a[onclick*="salla.order.show"]');
    }

    function findOriginalContainer() {
      const coupon = document.querySelector('salla-next-order-coupon');
      if (coupon) return coupon.closest('.container') || coupon.parentElement;
      const thanks = document.querySelector('.thanks-item');
      if (thanks) return thanks.closest('.container') || thanks.closest('main > div') || thanks.parentElement;
      const details = findOrderDetailsButton();
      if (details) return details.closest('.container') || details.parentElement;
      return null;
    }


    function template(orderNumber) {
      const shownOrderNumber = orderNumber || '—';
      const whatsappMessage = encodeURIComponent('مرحبًا فريق وريف، أحتاج مساعدتكم بخصوص طلبي رقم ' + shownOrderNumber);
      const whatsappUrl = 'https://wa.me/' + WAREEF.whatsapp.support + '?text=' + whatsappMessage;

      return `
        <div class="wt-shell">
          <section class="wt-hero" aria-labelledby="wt-title">
            <div class="wt-copy">
              <p class="wt-kicker">W A R E E F &nbsp; · &nbsp; Y O U R &nbsp; M O M E N T</p>
              <h1 class="wt-title" id="wt-title">اكتمل طلبكِ… وإطلالتكِ أقرب</h1>
              <p class="wt-subtitle">شكرًا لأنكِ اخترتِ وريف. من هذه اللحظة نعتني بكل تفصيلة في طلبكِ، من الفحص الدقيق حتى التغليف، ليصلكِ كما يليق بكِ.</p>
              <div class="wt-order-pill">
                <span>رقم طلبكِ</span>
                <strong>#${escapeHtml(shownOrderNumber)}</strong>
                <button type="button" class="wt-copy-order" aria-label="نسخ رقم الطلب" data-copy="${escapeHtml(shownOrderNumber)}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
                </button>
              </div>
              <div class="wt-actions">
                <button type="button" class="wt-btn wt-btn-primary wt-details-btn">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>
                  استعرضي تفاصيل طلبكِ
                </button>
                <a class="wt-btn wt-btn-outline" href="${whatsappUrl}" target="_blank" rel="noopener">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.2-4.2a8.5 8.5 0 1 1 15.8-4.3Z"/><path d="M8.5 8.2c.4 2.7 2.6 4.9 5.3 5.3"/></svg>
                  نحن هنا لمساعدتكِ
                </a>
              </div>
            </div>

            <div class="wt-art" aria-hidden="true">
              <div class="wt-box-wrap">
                <svg class="wt-box-svg" viewBox="0 0 280 250">
                  <defs><linearGradient id="wtGold" x1="0" x2="1"><stop offset="0" stop-color="#f0cd65"/><stop offset="1" stop-color="#a7770c"/></linearGradient></defs>
                  <path d="M46 94 140 48l94 46-94 47Z" fill="#1c1c1c" stroke="url(#wtGold)" stroke-width="2"/>
                  <path d="M46 94v94l94 48v-95Z" fill="#111" stroke="url(#wtGold)" stroke-width="2"/>
                  <path d="M234 94v94l-94 48v-95Z" fill="#080808" stroke="url(#wtGold)" stroke-width="2"/>
                  <path d="M140 48v93M91 70l96 48" fill="none" stroke="url(#wtGold)" stroke-width="4"/>
                  <path d="M174 51c0 16-12 27-34 27s-34-11-34-27c0-13 9-23 19-17 7 4 11 13 15 21 4-8 8-17 15-21 10-6 19 4 19 17Z" fill="none" stroke="url(#wtGold)" stroke-width="4"/>
                  <circle cx="49" cy="54" r="3" fill="#e8bd45"/><circle cx="229" cy="53" r="3" fill="#e8bd45"/>
                  <path d="m40 71-8-8m8 0-8 8M238 72l9-9m-9 0 9 9" stroke="#e8bd45" stroke-width="2"/>
                </svg>
              </div>
            </div>
          </section>

          <section class="wt-section">
            <div class="wt-section-head">
              <h2>من اختياركِ… حتى بابكِ</h2>
              <p>رحلة قصيرة، وعناية وريف حاضرة في كل خطوة.</p>
            </div>
            <div class="wt-progress">
              <div class="wt-step wt-step-active">
                <span class="wt-step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg></span>
                <strong>اختياركِ تأكّد</strong><span>وصلنا طلبكِ بنجاح</span>
              </div>
              <div class="wt-step">
                <span class="wt-step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM8 7V4h8v3M9 12h6"/></svg></span>
                <strong>عناية وريف</strong><span>فحص دقيق وتغليف يليق بكِ</span>
              </div>
              <div class="wt-step">
                <span class="wt-step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg></span>
                <strong>إطلالتكِ في الطريق</strong><span>نرسل لكِ التتبع فور الشحن</span>
              </div>
            </div>
          </section>

          <div class="wt-info-grid">
            <article class="wt-info-card">
              <span class="wt-info-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
              <div><small>وقت التجهيز والشحن</small><strong>${escapeHtml(WAREEF.shippingTime)}</strong></div>
            </article>
            <article class="wt-info-card">
              <span class="wt-info-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg></span>
              <div><small>كل تفاصيل طلبكِ</small><strong>بانتظاركِ داخل حسابكِ</strong></div>
            </article>
            <article class="wt-info-card">
              <span class="wt-info-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/></svg></span>
              <div><small>لا يفوتكِ أي تحديث</small><strong>يصلكِ أولًا بأول</strong></div>
            </article>
          </div>

          <div class="wt-bottom-grid">
            <section class="wt-coupon">
              <p class="wt-coupon-label">موعدنا مع إطلالة أخرى</p>
              <h3>هدية أنيقة لإطلالتكِ القادمة — خصم ${escapeHtml(WAREEF.coupon.discount)}</h3>
              <div class="wt-code-row">
                <div class="wt-code">${escapeHtml(WAREEF.coupon.code)}</div>
                <button type="button" class="wt-copy-code" data-copy="${escapeHtml(WAREEF.coupon.code)}">نسخ الكود</button>
              </div>
            </section>
            <section class="wt-care">
              <h3>حتى تكتمل التجربة براحة</h3>
              <p>بعد استلام طلبكِ، احتفظي بالتغليف والبطاقات وملصق الأمان حتى تتأكدي من المقاس والاختيار؛ فهذه التفاصيل تجعل إجراءات الاستبدال أو الاسترجاع أسهل وفق السياسة.</p>
              <a href="${escapeHtml(WAREEF.urls.policy)}" target="_blank" rel="noopener">اطّلعي على السياسة كاملة</a>
            </section>
          </div>

          <div class="wt-shopping"><a class="wt-shop-btn" href="${escapeHtml(WAREEF.urls.shop)}">اكتشفي إطلالتكِ القادمة</a></div>
        </div>
        <div class="wt-toast" role="status" aria-live="polite">تم النسخ بنجاح</div>
      `;
    }

    function copyText(value, root) {
      const text = String(value || '');
      const fallback = () => {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); } catch (error) { /* لا شيء */ }
        area.remove();
      };

      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
      else fallback();

      const toast = root.querySelector('.wt-toast');
      if (!toast) return;
      toast.classList.add('wt-show');
      window.clearTimeout(toast.dataset.timer);
      toast.dataset.timer = String(window.setTimeout(() => toast.classList.remove('wt-show'), 1800));
    }

    function bindEvents(root, originalDetailsButton) {
      root.querySelectorAll('[data-copy]').forEach((button) => {
        button.addEventListener('click', () => copyText(button.getAttribute('data-copy'), root));
      });

      const detailsButton = root.querySelector('.wt-details-btn');
      if (!detailsButton) return;
      detailsButton.addEventListener('click', () => {
        if (originalDetailsButton && originalDetailsButton.isConnected) originalDetailsButton.click();
        else window.location.href = '/customer/orders';
      });
    }

    function teardown() {
      const root = document.getElementById(ROOT_ID);
      if (root) root.remove();
      document.body.classList.remove('wr-thankyou-page');
      document.querySelectorAll('.wr-thankyou-original').forEach((element) => element.classList.remove('wr-thankyou-original'));
    }

    function mount() {
      const originalContainer = findOriginalContainer();
      if (!originalContainer) return;

      const orderNumber = getOrderNumber();
      const originalDetailsButton = findOrderDetailsButton();
      document.body.classList.add('wr-thankyou-page');
      originalContainer.classList.add('wr-thankyou-original');

      const root = document.createElement('section');
      root.id = ROOT_ID;
      root.setAttribute('aria-label', 'تأكيد طلب وريف');
      root.innerHTML = template(orderNumber);
      originalContainer.insertAdjacentElement('beforebegin', root);
      bindEvents(root, originalDetailsButton);
    }

    function tick() {
      const root = document.getElementById(ROOT_ID);

      if (!isThankYouPage()) {
        if (root) teardown();
        return;
      }

      if (root && root.isConnected) return;
      mount();
    }

    onReady(() => domWatcher.add(tick));
  });

  /* ═══════════════════ 3) نظام الاستبدال والاسترجاع ═══════════════════ */

  safeModule('returns', function () {
    if (!WAREEF.features.returnsWidget) return;

    const ROOT_ID = 'wareef-returns-widget';
    const MODAL_ID = 'wareef-returns-modal';
    const VERSION = '4.0.0';
    const modalController = createModalController('wr-open', '.wr-dialog');

    let mountedPath = '';
    let searchRootsCache = [];
    let searchRootsCacheTime = 0;

    function safeRead(object, key) {
      try { return object && object[key] !== undefined ? object[key] : undefined; } catch (error) { return undefined; }
    }

    function firstValue(values) {
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === 0 || value === false) return value;
        if (typeof value === 'string' && cleanValue(value)) return cleanValue(value);
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (value && typeof value === 'object') return value;
      }
      return '';
    }

    function resetSearchCache() {
      searchRootsCache = [];
      searchRootsCacheTime = 0;
    }

    // البحث داخل Shadow DOM مكلف، لذلك يُنفَّذ فقط عند الحاجة ومع ذاكرة مؤقتة
    function getSearchRoots() {
      if (searchRootsCache.length && Date.now() - searchRootsCacheTime < 1500) return searchRootsCache;

      const roots = [document];
      const visited = new Set(roots);

      for (let index = 0; index < roots.length && index < 200; index += 1) {
        let elements = [];
        try { elements = Array.from(roots[index].querySelectorAll('*')); } catch (error) { elements = []; }

        elements.forEach((element) => {
          if (element.shadowRoot && !visited.has(element.shadowRoot)) {
            visited.add(element.shadowRoot);
            roots.push(element.shadowRoot);
          }
        });
      }

      searchRootsCache = roots;
      searchRootsCacheTime = Date.now();
      return roots;
    }

    function queryAllDeep(selector) {
      const results = [];
      const seen = new Set();

      getSearchRoots().forEach((root) => {
        try {
          root.querySelectorAll(selector).forEach((element) => {
            if (seen.has(element)) return;
            seen.add(element);
            results.push(element);
          });
        } catch (error) { /* جذر غير مدعوم */ }
      });

      return results;
    }

    function queryDeep(selector) {
      const light = document.querySelector(selector);
      if (light) return light;
      const results = queryAllDeep(selector);
      return results.length ? results[0] : null;
    }

    function parseJson(value) {
      const text = cleanValue(value);
      if (!text || !/^[\[{]/.test(text)) return null;
      try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (error) { return null; }
    }

    const ORDER_MARKERS = '[data-testid="store-order-status"], [data-testid="store-order-totals"], [data-order-item-id], salla-edit-order-button';

    // فحص سريع أولًا (DOM العادي) ولا نلجأ للبحث العميق إلا عند الحاجة
    function isSingleOrderPage() {
      if (document.querySelector(ORDER_MARKERS)) return true;
      const path = decodeURIComponent(window.location.pathname).toLowerCase();
      if (!/(^|\/)(orders?|الطلبات)\/[^/]+/i.test(path)) return false;
      return Boolean(queryDeep(ORDER_MARKERS));
    }

    function deepFindValue(source, keys, depth, visited) {
      if (!source || typeof source !== 'object' || depth < 0 || visited.has(source)) return '';
      visited.add(source);

      let entries = [];
      try {
        entries = Object.keys(source).map((key) => [key, safeRead(source, key)]);
      } catch (error) { return ''; }

      const normalizedKeys = keys.map((key) => normalizeText(key).replace(/[^a-z0-9؀-ۿ]/g, ''));

      for (let index = 0; index < entries.length; index += 1) {
        const key = entries[index][0];
        const value = entries[index][1];
        const normalizedKey = normalizeText(key).replace(/[^a-z0-9؀-ۿ]/g, '');

        if (normalizedKeys.indexOf(normalizedKey) === -1 || value == null || value === '') continue;
        if (typeof value !== 'object') return value;

        const nestedValue = firstValue([
          safeRead(value, 'reference_id'),
          safeRead(value, 'referenceId'),
          safeRead(value, 'number'),
          safeRead(value, 'value'),
          safeRead(value, 'id')
        ]);

        if (nestedValue !== '') return nestedValue;
      }

      for (let index = 0; index < entries.length; index += 1) {
        const value = entries[index][1];
        if (value && typeof value === 'object') {
          const result = deepFindValue(value, keys, depth - 1, visited);
          if (result !== '') return result;
        }
      }

      return '';
    }

    function getOrderSources() {
      const sources = [];
      const seen = new WeakSet();

      function addSource(source) {
        if (!source || typeof source !== 'object' || seen.has(source)) return;
        seen.add(source);
        sources.push(source);
      }

      queryAllDeep([
        '[data-testid="store-order-totals"]',
        '[data-testid="store-order-status"]',
        'salla-edit-order-button',
        'salla-orders',
        '[data-order-id]',
        '[order-id]'
      ].join(',')).slice(0, 200).forEach((element) => {
        ['order', 'orderData', 'orderDetails', 'data', 'value', 'details', 'props', 'state'].forEach((property) => {
          addSource(safeRead(element, property));
        });

        Array.from(element.attributes || []).forEach((attribute) => {
          if (!/(order|data|value|props|state)/i.test(attribute.name)) return;
          addSource(parseJson(attribute.value));
        });
      });

      return sources;
    }

    function valueNearLabel(labels) {
      const normalizedLabels = labels.map(normalizeText);
      const elements = queryAllDeep('dt, dd, th, td, label, strong, b, span, p');

      for (let index = 0; index < elements.length && index < 5000; index += 1) {
        const element = elements[index];
        const ownText = cleanValue(
          element.childElementCount
            ? Array.from(element.childNodes || [])
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.textContent)
                .join(' ')
            : element.textContent
        );

        if (!ownText || ownText.length > 80) continue;

        const normalizedOwn = normalizeText(ownText).replace(/[:：]/g, '');
        const matched = normalizedLabels.some((label) => normalizedOwn === label || normalizedOwn.startsWith(label + ' '));
        if (!matched) continue;

        const sibling = firstValue([
          element.nextElementSibling && element.nextElementSibling.textContent,
          element.parentElement && element.parentElement.querySelector('dd') && element.parentElement.querySelector('dd').textContent,
          element.parentElement && element.parentElement.querySelector('td:last-child') && element.parentElement.querySelector('td:last-child').textContent
        ]);

        if (sibling && normalizeText(sibling) !== normalizedOwn) return cleanValue(sibling);

        const parentText = cleanValue(element.parentElement && element.parentElement.textContent);
        if (parentText && parentText.length <= 180) {
          const escaped = ownText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const result = cleanValue(parentText.replace(new RegExp(escaped, 'i'), '')).replace(/^[:：\-–—]+/, '');
          if (result) return result;
        }
      }

      return '';
    }

    function findOrderNumber() {
      const sources = getOrderSources();

      for (let index = 0; index < sources.length; index += 1) {
        const value = deepFindValue(
          sources[index],
          ['reference_id', 'referenceId', 'order_number', 'orderNumber', 'order_no', 'orderNo'],
          5,
          new WeakSet()
        );
        const match = normalizeDigits(value).match(/\d{4,}/);
        if (match) return match[0];
      }

      const attributeElement = queryDeep('[data-order-id], [order-id]');
      if (attributeElement) {
        const value = attributeElement.getAttribute('data-order-id') || attributeElement.getAttribute('order-id');
        const match = normalizeDigits(value).match(/\d{4,}/);
        if (match) return match[0];
      }

      const labeledMatch = normalizeDigits(
        valueNearLabel(['رقم الطلب', 'رقم طلبك', 'رقم الطلبية', 'order number', 'order id'])
      ).match(/\d{4,}/);
      if (labeledMatch) return labeledMatch[0];

      const headings = queryAllDeep('h1, h2, h3');
      for (let index = 0; index < headings.length; index += 1) {
        const text = normalizeDigits(cleanValue(headings[index].textContent));
        if (!/طلب|order/i.test(text)) continue;
        const match = text.match(/(?:#|رقم\s*الطلب\s*:?)?\s*(\d{4,})/i);
        if (match) return match[1];
      }

      const bodyText = normalizeDigits(cleanValue((document.body && document.body.innerText) || '').slice(0, 20000));
      const bodyMatch = bodyText.match(/(?:رقم\s*(?:الطلب|الطلبية)|order\s*(?:number|id))\s*[:#\-]?\s*(\d{4,})/i);
      if (bodyMatch) return bodyMatch[1];

      const pathNumbers = normalizeDigits(window.location.pathname).match(/\d{4,}/g);
      return pathNumbers ? pathNumbers[pathNumbers.length - 1] : '';
    }

    function invalidProductName(value) {
      const text = normalizeText(value);
      if (!text || text.length < 2) return true;
      if (/^(?:xs|s|m|l|xl|xxl|xxxl|\d{1,3})$/i.test(text)) return true;

      return ['اللون', 'المقاس', 'الحجم', 'الكمية', 'السعر', 'color', 'colour', 'size', 'quantity', 'price', 'تفاصيل المنتج', 'خيارات المنتج']
        .some((label) => {
          const normalizedLabel = normalizeText(label);
          return text === normalizedLabel || text.startsWith(normalizedLabel + ':') || text.startsWith(normalizedLabel + ' ');
        });
    }

    function getObjectProductDetails(element) {
      const possibleObjects = [safeRead(element, 'orderItem'), safeRead(element, 'item'), safeRead(element, 'data'), safeRead(element, 'value')]
        .filter((value) => value && typeof value === 'object');

      const details = { name: '', sku: '', size: '', color: '', quantity: '', image: '' };

      possibleObjects.forEach((object) => {
        const productValue = safeRead(object, 'product');
        const product = productValue && typeof productValue === 'object' ? productValue : object;

        if (!details.name) details.name = cleanValue(firstValue([safeRead(product, 'name'), safeRead(product, 'title'), safeRead(object, 'product_name'), safeRead(object, 'productName')]));
        if (!details.sku) details.sku = cleanValue(firstValue([safeRead(product, 'sku'), safeRead(object, 'sku'), safeRead(object, 'product_code'), safeRead(object, 'productCode')]));
        if (!details.size) details.size = cleanValue(firstValue([safeRead(object, 'size'), safeRead(object, 'selected_size'), safeRead(object, 'selectedSize')]));
        if (!details.color) details.color = cleanValue(firstValue([safeRead(object, 'color'), safeRead(object, 'colour'), safeRead(object, 'selected_color'), safeRead(object, 'selectedColor')]));
        if (!details.quantity) details.quantity = cleanValue(firstValue([safeRead(object, 'quantity'), safeRead(object, 'qty')]));

        if (!details.image) {
          const imageValue = firstValue([
            safeRead(product, 'image_url'), safeRead(product, 'imageUrl'),
            safeRead(product, 'thumbnail_url'), safeRead(product, 'thumbnailUrl'),
            safeRead(product, 'image'), safeRead(product, 'thumbnail')
          ]);
          if (typeof imageValue === 'string') details.image = cleanValue(imageValue);
          else if (imageValue && typeof imageValue === 'object') details.image = cleanValue(firstValue([safeRead(imageValue, 'url'), safeRead(imageValue, 'src')]));
        }
      });

      if (invalidProductName(details.name)) details.name = '';
      return details;
    }

    function findItemNodes() {
      const preferredSelector = ['.order-item[data-order-item-id]', '[data-order-item-id]', '[data-testid="order-item"]', '[data-testid*="order-item-"]', '[data-testid*="order-product"]'].join(',');
      let candidates = queryAllDeep(preferredSelector);

      if (!candidates.length) {
        candidates = queryAllDeep(['.order-item', '[class*="order-item"]', '[class*="order-product"]'].join(',')).filter((element) => {
          const text = cleanValue(element.innerText || element.textContent);
          const image = element.querySelector('img[src], img[data-src], img[alt]');
          const name = element.querySelector('a[href*="product"], h3, h4, [class*="product-name"], [class*="item-name"]');
          return Boolean(text.length >= 2 && text.length <= 1600 && image && name);
        });
      }

      const uniqueCandidates = [];
      const seen = new Set();

      candidates.forEach((element) => {
        if (seen.has(element) || (element.closest && element.closest('#' + MODAL_ID))) return;
        seen.add(element);

        const parentCandidate = element.parentElement && element.parentElement.closest(preferredSelector);
        if (parentCandidate && parentCandidate !== element) return;

        const nestedItems = element.querySelectorAll('[data-order-item-id]');
        if (!element.hasAttribute('data-order-item-id') && nestedItems.length > 1) return;

        uniqueCandidates.push(element);
      });

      return uniqueCandidates;
    }

    function extractRegex(text, regex) {
      const match = normalizeDigits(String(text || '')).match(regex);
      return match ? cleanValue(match[1]) : '';
    }

    function findVariantPair(rawText) {
      const lines = normalizeDigits(String(rawText || '')).split(/\n+/).map(cleanValue).filter(Boolean);

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.length > 60 || /ريال|sar|السعر|الكمية|price|quantity/i.test(line)) continue;

        const match = line.match(/^(.{2,30}?)\s*[،,·|]\s*(\d{1,3}|xs|s|m|l|xl|xxl|xxxl)$/i);
        if (match) return { color: cleanValue(match[1]), size: cleanValue(match[2]) };
      }

      return { color: '', size: '' };
    }

    function getOrderItems() {
      const items = [];
      const seen = new Set();

      findItemNodes().forEach((element) => {
        const rawText = String(element.innerText || element.textContent || '');
        const text = cleanValue(rawText);
        if (!text || text.length < 2) return;

        const objectDetails = getObjectProductDetails(element);
        const imageElement = element.querySelector('img[src], img[data-src], img[alt]');
        const image = cleanValue(firstValue([
          objectDetails.image,
          imageElement && imageElement.currentSrc,
          imageElement && imageElement.getAttribute('src'),
          imageElement && imageElement.getAttribute('data-src')
        ]));

        const nameElement = element.querySelector([
          '[data-testid*="product-name"]', 'a[href*="/products/"]', 'a[href*="/product/"]', 'a.block',
          'a[class*="font-semibold"]', '[class*="product-name"]', '[class*="item-name"]', 'h3', 'h4'
        ].join(','));

        let name = cleanValue(firstValue([objectDetails.name, nameElement && nameElement.textContent, imageElement && imageElement.alt]));
        if (invalidProductName(name)) name = '';
        if (!name || name.length > 180) return;

        const variantPair = findVariantPair(rawText);

        const size = cleanValue(firstValue([
          objectDetails.size,
          extractRegex(rawText, /(?:المقاس|الحجم|size)\s*[:：\-]?\s*([a-z0-9+./ -]{1,20})/i),
          variantPair.size
        ]));

        const color = cleanValue(firstValue([
          objectDetails.color,
          extractRegex(rawText, /(?:اللون|color|colour)\s*[:：\-]?\s*([^\n|،]{2,30})/i),
          variantPair.color
        ]));

        const quantity = cleanValue(firstValue([
          objectDetails.quantity,
          element.getAttribute('data-quantity'),
          extractRegex(rawText, /(?:الكمية|quantity|qty)\s*[:：x×\-]?\s*(\d{1,3})/i),
          '1'
        ]));

        const sku = cleanValue(firstValue([
          objectDetails.sku,
          extractRegex(rawText, /(?:كود\s*المنتج|رمز\s*المنتج|sku|code)\s*[:：#\-]?\s*([a-z0-9_-]{2,40})/i)
        ]));

        const id = cleanValue(element.getAttribute('data-order-item-id') || element.getAttribute('data-item-id'));
        const productId = cleanValue(element.getAttribute('data-order-item-product-id') || element.getAttribute('data-product-id'));
        if (!id && !image) return;

        const signature = id || [productId, name, size, color, image].map(normalizeText).join('|');
        if (seen.has(signature)) return;
        seen.add(signature);

        items.push({ id, productId, name, image, sku, size, color, quantity });
      });

      return items;
    }

    function collectOrderData() {
      resetSearchCache();
      return { orderNumber: findOrderNumber(), items: getOrderItems() };
    }

    function scoreOrderData(data) {
      return (data.orderNumber ? 100 : 0) + data.items.length * 20 + data.items.filter((item) => Boolean(item.image)).length * 4;
    }

    async function collectBestOrderData() {
      let best = collectOrderData();

      for (let attempt = 1; attempt < WAREEF.returns.readAttempts; attempt += 1) {
        if (best.orderNumber && best.items.length) break;
        await sleep(WAREEF.returns.readDelay);
        const current = collectOrderData();
        if (scoreOrderData(current) > scoreOrderData(best)) best = current;
      }

      return best;
    }


    function rootTemplate() {
      return `
        <div class="wr-card">
          <div class="wr-card-copy">
            <span class="wr-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8.3A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 17.9 15.7"/></svg></span>
            <div>
              <h3 class="wr-card-title">طلب استبدال أو استرجاع</h3>
              <p class="wr-card-text">اختاري القطع المطلوبة وسيجهز النظام التفاصيل تلقائيًا.</p>
            </div>
          </div>
          <button type="button" class="wr-open-btn" aria-haspopup="dialog" aria-controls="${MODAL_ID}">بدء الطلب</button>
        </div>
      `;
    }

    function productCardTemplate(item, index) {
      const image = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async">`
        : '<span aria-hidden="true">◇</span>';

      const metadata = [
        item.size && 'المقاس: ' + item.size,
        item.color && 'اللون: ' + item.color,
        item.quantity && item.quantity !== '1' && 'الكمية: ' + item.quantity
      ].filter(Boolean);

      return `
        <div class="wr-product-card" data-item-index="${index}">
          <label class="wr-product-choice">
            <input class="wr-product-check" type="checkbox" name="wrSelectedItems" value="${index}">
            <span class="wr-product-content">
              <span class="wr-product-image">${image}</span>
              <span class="wr-product-info">
                <span class="wr-product-name">${escapeHtml(item.name)}</span>
                ${metadata.length ? `<span class="wr-product-meta">${metadata.map((value) => '<span>' + escapeHtml(value) + '</span>').join('')}</span>` : ''}
              </span>
            </span>
            <span class="wr-selected-mark" aria-hidden="true">✓</span>
          </label>
          <div class="wr-exchange-box">
            <label for="wr-exchange-${index}">المقاس أو القطعة المطلوبة<span class="wr-required">*</span></label>
            <input class="wr-exchange-input" id="wr-exchange-${index}" data-exchange-index="${index}" type="text" maxlength="120" placeholder="مثال: نفس القطعة مقاس 14">
          </div>
        </div>
      `;
    }

    function productsTemplate(items) {
      if (items.length) {
        return `
          <section class="wr-products-section">
            <span class="wr-section-title">حددي القطع المطلوبة<span class="wr-required">*</span></span>
            <p class="wr-products-hint">يمكنكِ اختيار قطعة واحدة أو عدة قطع من نفس الطلب.</p>
            <div class="wr-products-grid">${items.map(productCardTemplate).join('')}</div>
            <p class="wr-selected-summary" aria-live="polite">لم يتم اختيار أي قطعة بعد.</p>
          </section>
        `;
      }

      return `
        <section class="wr-products-section">
          <span class="wr-section-title">بيانات القطعة<span class="wr-required">*</span></span>
          <div class="wr-manual-products">
            <div class="wr-grid">
              <div class="wr-field">
                <label for="wr-manual-product">اسم القطعة أو كود المنتج<span class="wr-required">*</span></label>
                <input class="wr-input" id="wr-manual-product" type="text" maxlength="160" placeholder="مثال: فستان كود 1521">
              </div>
              <div class="wr-field">
                <label for="wr-manual-size">المقاس الحالي</label>
                <input class="wr-input" id="wr-manual-size" type="text" maxlength="30" placeholder="مثال: 12 أو M">
              </div>
              <div class="wr-field">
                <label for="wr-manual-color">اللون</label>
                <input class="wr-input" id="wr-manual-color" type="text" maxlength="50" placeholder="مثال: موف">
              </div>
            </div>
            <div class="wr-field wr-manual-exchange wr-visible">
              <label for="wr-manual-exchange">المقاس أو القطعة المطلوبة<span class="wr-required">*</span></label>
              <input class="wr-input" id="wr-manual-exchange" type="text" maxlength="120" placeholder="مثال: نفس القطعة مقاس 14">
            </div>
          </div>
        </section>
      `;
    }

    function modalTemplate(orderData) {
      return `
        <div class="wr-backdrop" data-wr-close="true"></div>
        <section class="wr-dialog" role="dialog" aria-modal="true" aria-labelledby="wr-modal-title" tabindex="-1">
          <header class="wr-header">
            <div>
              <div class="wr-brand">W A R E E F</div>
              <h2 class="wr-title" id="wr-modal-title">طلب استبدال أو استرجاع</h2>
            </div>
            <button type="button" class="wr-close" data-wr-close="true" aria-label="إغلاق">&times;</button>
          </header>

          <div class="wr-content">
            <p class="wr-intro">مدة تقديم الطلب <strong>${escapeHtml(WAREEF.returns.requestWindow)}</strong> ورسوم الشحن <strong>${escapeHtml(WAREEF.returns.shippingFee)}</strong> وفق الشروط. <a class="wr-policy-link" href="${escapeHtml(WAREEF.urls.policy)}" target="_blank" rel="noopener">عرض السياسة كاملة</a></p>

            <form class="wr-form" novalidate>
              <span class="wr-type-label">نوع الطلب<span class="wr-required">*</span></span>
              <div class="wr-type-grid">
                <label class="wr-type">
                  <input type="radio" name="requestType" value="استبدال" checked>
                  <span class="wr-type-content">
                    <span class="wr-type-icon" aria-hidden="true">↺</span>
                    <span><strong>طلب استبدال</strong><small>تغيير المقاس أو استبدال القطع المختارة</small></span>
                  </span>
                </label>
                <label class="wr-type">
                  <input type="radio" name="requestType" value="استرجاع">
                  <span class="wr-type-content">
                    <span class="wr-type-icon" aria-hidden="true">↩</span>
                    <span><strong>طلب استرجاع</strong><small>إرجاع بعض القطع أو جميع القطع المختارة</small></span>
                  </span>
                </label>
              </div>

              <div class="wr-grid">
                <div class="wr-field">
                  <label for="wr-order-number">رقم الطلب<span class="wr-required">*</span></label>
                  <input class="wr-input" id="wr-order-number" type="text" inputmode="numeric" maxlength="30" value="${escapeHtml(orderData.orderNumber)}" placeholder="رقم الطلب">
                </div>
                <div class="wr-field">
                  <label for="wr-reason">سبب الطلب<span class="wr-required">*</span></label>
                  <select class="wr-select" id="wr-reason">
                    <option value="">اختاري السبب</option>
                    <option>المقاس غير مناسب</option>
                    <option>القصة غير مناسبة</option>
                    <option>اللون غير مناسب</option>
                    <option>وصلت قطعة مختلفة</option>
                    <option>يوجد عيب أو تلف في القطعة</option>
                    <option>سبب آخر</option>
                  </select>
                </div>
              </div>

              ${productsTemplate(orderData.items)}

              <div class="wr-field wr-full">
                <label for="wr-details">تفاصيل إضافية</label>
                <textarea class="wr-textarea" id="wr-details" maxlength="500" placeholder="اكتبي أي تفاصيل إضافية"></textarea>
              </div>

              <label class="wr-consent">
                <input id="wr-consent" type="checkbox">
                <span>أقرّ بأن القطع المختارة بحالتها الأصلية ولم تُستخدم، وأن الطلب يخضع لسياسة وريف.</span>
              </label>

              <div class="wr-error" role="alert" aria-live="polite"></div>

              <button type="submit" class="wr-submit">
                <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M19.11 17.21c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.09 4.5.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35M16.03 27.5h-.01a11.48 11.48 0 0 1-5.85-1.6l-.42-.25-4.35 1.14 1.16-4.24-.27-.44a11.45 11.45 0 1 1 9.74 5.39m9.77-21.1A13.72 13.72 0 0 0 16.04 2.36C8.45 2.36 2.28 8.53 2.28 16.12c0 2.42.63 4.79 1.83 6.87L2.16 30.1l7.28-1.91a13.75 13.75 0 0 0 6.59 1.68h.01c7.59 0 13.76-6.17 13.76-13.76 0-3.68-1.43-7.13-4-9.71"/></svg>
                إرسال الطلب عبر واتساب
              </button>
              <p class="wr-footer-note">سيتم إرسال رقم الطلب والقطع المختارة فقط.</p>
            </form>
          </div>
        </section>
      `;
    }

    function selectedType(modal) {
      const selected = modal.querySelector('input[name="requestType"]:checked');
      return selected ? selected.value : 'استبدال';
    }

    function fieldValue(modal, selector) {
      const field = modal.querySelector(selector);
      return cleanValue(field && field.value);
    }

    function selectedItems(modal, orderData) {
      if (!orderData.items.length) {
        const product = fieldValue(modal, '#wr-manual-product');
        if (!product) return [];

        return [{
          name: product,
          size: fieldValue(modal, '#wr-manual-size'),
          color: fieldValue(modal, '#wr-manual-color'),
          quantity: '1',
          exchangeTo: fieldValue(modal, '#wr-manual-exchange'),
          exchangeInput: modal.querySelector('#wr-manual-exchange')
        }];
      }

      return Array.from(modal.querySelectorAll('input[name="wrSelectedItems"]:checked')).map((input) => {
        const index = Number(input.value);
        const source = orderData.items[index];
        if (!source) return null;

        const exchangeInput = modal.querySelector('[data-exchange-index="' + index + '"]');

        return {
          name: source.name,
          size: source.size,
          color: source.color,
          quantity: source.quantity,
          exchangeTo: cleanValue(exchangeInput && exchangeInput.value),
          exchangeInput
        };
      }).filter(Boolean);
    }

    function refreshProductCards(modal, orderData) {
      const isExchange = selectedType(modal) === 'استبدال';

      modal.querySelectorAll('.wr-product-card').forEach((card) => {
        const checkbox = card.querySelector('.wr-product-check');
        const exchangeBox = card.querySelector('.wr-exchange-box');
        const selected = Boolean(checkbox && checkbox.checked);

        card.classList.toggle('wr-selected', selected);
        if (exchangeBox) exchangeBox.classList.toggle('wr-visible', isExchange && selected);
      });

      const manualExchange = modal.querySelector('.wr-manual-exchange');
      if (manualExchange) manualExchange.classList.toggle('wr-visible', isExchange);

      const summary = modal.querySelector('.wr-selected-summary');
      if (!summary) return;

      const count = selectedItems(modal, orderData).length;
      summary.textContent = count ? 'تم اختيار ' + count + (count === 1 ? ' قطعة.' : ' قطع.') : 'لم يتم اختيار أي قطعة بعد.';
    }

    function showError(modal, message, field) {
      const error = modal.querySelector('.wr-error');
      if (error) error.textContent = message;

      if (field && typeof field.focus === 'function') {
        field.focus();
        if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function validateRequest(modal, orderData) {
      const type = selectedType(modal);
      const orderNumberField = modal.querySelector('#wr-order-number');
      const reasonField = modal.querySelector('#wr-reason');
      const consentField = modal.querySelector('#wr-consent');

      const orderNumber = cleanValue(orderNumberField && orderNumberField.value);
      const reason = cleanValue(reasonField && reasonField.value);
      const items = selectedItems(modal, orderData);

      if (!orderNumber) {
        showError(modal, 'اكتبي رقم الطلب أولًا (تجدينه أعلى صفحة الطلب).', orderNumberField);
        return null;
      }
      if (!reason) {
        showError(modal, 'اختاري سبب الطلب من القائمة.', reasonField);
        return null;
      }
      if (!items.length) {
        showError(modal, 'حددي قطعة واحدة على الأقل من قطع الطلب.');
        return null;
      }

      if (type === 'استبدال') {
        const missingExchange = items.find((item) => !cleanValue(item.exchangeTo));
        if (missingExchange) {
          showError(modal, 'اكتبي المقاس أو القطعة المطلوبة لكل قطعة مختارة.', missingExchange.exchangeInput);
          return null;
        }
      }

      if (!consentField || !consentField.checked) {
        showError(modal, 'وافقي على الإقرار قبل إرسال الطلب.', consentField);
        return null;
      }

      const error = modal.querySelector('.wr-error');
      if (error) error.textContent = '';

      return {
        type,
        orderNumber,
        reason,
        details: fieldValue(modal, '#wr-details'),
        items
      };
    }

    function buildWhatsAppMessage(request) {
      const lines = [
        'طلب ' + request.type + ' — وريف فاشن',
        '',
        'رقم الطلب: ' + request.orderNumber,
        'السبب: ' + request.reason,
        '',
        'القطع المختارة:'
      ];

      request.items.forEach((item, index) => {
        lines.push('', (index + 1) + '. ' + (item.name || 'قطعة من الطلب'));

        const specifications = [];
        if (item.size) specifications.push('المقاس: ' + item.size);
        if (item.color) specifications.push('اللون: ' + item.color);
        if (item.quantity && item.quantity !== '1') specifications.push('الكمية: ' + item.quantity);
        if (specifications.length) lines.push(specifications.join(' | '));

        if (request.type === 'استبدال') lines.push('المطلوب: ' + item.exchangeTo);
      });

      if (request.details) lines.push('', 'ملاحظات: ' + request.details);

      lines.push('', 'تم الإقرار بحالة القطع والاطلاع على سياسة المتجر.');
      return lines.join('\n');
    }

    function sendWhatsAppRequest(modal, orderData) {
      const submitButton = modal.querySelector('.wr-submit');
      if (submitButton && submitButton.disabled) return;

      const request = validateRequest(modal, orderData);
      if (!request) return;

      if (submitButton) {
        submitButton.disabled = true;
        window.setTimeout(() => { submitButton.disabled = false; }, 2500);
      }

      const url = 'https://wa.me/' + WAREEF.whatsapp.returns + '?text=' + encodeURIComponent(buildWhatsAppMessage(request));
      const openedWindow = window.open(url, '_blank');
      if (!openedWindow) window.location.href = url;
    }

    function bindModalEvents(modal, orderData) {
      modal.addEventListener('click', (event) => {
        if (event.target.closest('[data-wr-close="true"]')) modalController.close(modal);
      });

      modal.addEventListener('change', (event) => {
        if (event.target.matches('input[name="requestType"], input[name="wrSelectedItems"]')) refreshProductCards(modal, orderData);
      });

      modal.querySelector('.wr-form').addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopPropagation();
        sendWhatsAppRequest(modal, orderData);
      });

      refreshProductCards(modal, orderData);
    }

    function createModal(orderData) {
      const previousModal = document.getElementById(MODAL_ID);
      if (previousModal) previousModal.remove();

      const modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.dataset.version = VERSION;
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = modalTemplate(orderData);
      document.body.appendChild(modal);

      bindModalEvents(modal, orderData);
      return modal;
    }

    function bindRootEvents(root) {
      const button = root.querySelector('.wr-open-btn');

      button.addEventListener('click', async function () {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'جاري قراءة الطلب...';

        try {
          const orderData = await collectBestOrderData();
          modalController.open(createModal(orderData));
        } catch (error) {
          warn('returns:open', error);
          modalController.open(createModal({ orderNumber: '', items: [] }));
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
    }

    function lightDomAnchor(element) {
      let current = element;

      while (current) {
        if (document.documentElement.contains(current)) return current;
        const root = typeof current.getRootNode === 'function' ? current.getRootNode() : null;
        current = root && root.host ? root.host : null;
      }

      return null;
    }

    function findMountPoint() {
      const status = queryDeep('[data-testid="store-order-status"]');
      if (status) {
        const anchor = lightDomAnchor(status.closest('table') || status.closest('section') || status.parentElement || status);
        if (anchor) return { element: anchor, position: 'afterend' };
      }

      const totals = queryDeep('[data-testid="store-order-totals"]');
      if (totals) {
        const anchor = lightDomAnchor(totals);
        if (anchor) return { element: anchor, position: 'afterend' };
      }

      const editButton = queryDeep('salla-edit-order-button');
      if (editButton) {
        const anchor = lightDomAnchor(editButton.closest('section') || editButton.parentElement || editButton);
        if (anchor) return { element: anchor, position: 'afterend' };
      }

      const firstItem = queryDeep('.order-item[data-order-item-id], [data-order-item-id]');
      if (firstItem) {
        const anchor = lightDomAnchor(firstItem.closest('section') || firstItem.parentElement || firstItem);
        if (anchor) return { element: anchor, position: 'beforebegin' };
      }

      return null;
    }

    function removeExisting() {
      const root = document.getElementById(ROOT_ID);
      const modal = document.getElementById(MODAL_ID);
      if (root) root.remove();
      if (modal) modal.remove();
      mountedPath = '';
    }

    function tick() {
      const root = document.getElementById(ROOT_ID);
      const currentPath = window.location.pathname;

      // الحالة الشائعة: الودجت موجود ولا تغيير — نخرج فورًا بأقل تكلفة
      if (root && root.isConnected && mountedPath === currentPath) return;

      if (!isSingleOrderPage()) {
        if (root) removeExisting();
        return;
      }

      resetSearchCache();
      const point = findMountPoint();
      if (!point || !point.element || !document.documentElement.contains(point.element)) return;

      if (root || document.getElementById(MODAL_ID)) removeExisting();

      const widget = document.createElement('div');
      widget.id = ROOT_ID;
      widget.dataset.version = VERSION;
      widget.innerHTML = rootTemplate();
      point.element.insertAdjacentElement(point.position, widget);
      bindRootEvents(widget);
      mountedPath = currentPath;
    }

    onReady(() => domWatcher.add(tick));
  });

  /* ═══════════════════ 4) دليل المقاسات ═══════════════════ */

  safeModule('size-guide', function () {
    if (!WAREEF.features.sizeGuide) return;

    const GUIDE = {
      sizes: [
        { en: 6,  ar: 0, uk: 'XS',   us: 36, chest: 32, waist: 26 },
        { en: 8,  ar: 1, uk: 'S',    us: 38, chest: 34, waist: 28 },
        { en: 10, ar: 2, uk: 'M',    us: 40, chest: 36, waist: 30 },
        { en: 12, ar: 3, uk: 'L',    us: 42, chest: 38, waist: 32 },
        { en: 14, ar: 4, uk: 'XL',   us: 44, chest: 40, waist: 34 },
        { en: 16, ar: 5, uk: 'XXL',  us: 46, chest: 42, waist: 36 },
        { en: 18, ar: 6, uk: 'XXXL', us: 48, chest: 44, waist: 38 },
        { en: 20, ar: 7, uk: '4XL',  us: 50, chest: 46, waist: 40 },
        { en: 22, ar: 8, uk: '5XL',  us: 52, chest: 48, waist: 42 },
        { en: 24, ar: 9, uk: '6XL',  us: 54, chest: 50, waist: 44 }
      ],
      shapes: {
        hourglass: { icon: '⌛', name: 'ساعة رملية', title: 'الساعة الرملية', description: 'يتقارب عرض الصدر والوركين مع خصر محدد بوضوح.', tip: 'تليق بكِ معظم القصات، وبالأخص القصات التي تبرز الخصر.' },
        pear: { icon: '▽', name: 'كمثرى', title: 'الجسم الكمثري', description: 'يكون الوركان أعرض من منطقة الصدر والأكتاف.', tip: 'اختاري الفساتين ذات التفاصيل عند الأكتاف أو الصدر لتحقيق توازن أنيق.' },
        inverted: { icon: '△', name: 'مثلث مقلوب', title: 'المثلث المقلوب', description: 'تكون الأكتاف أو منطقة الصدر أعرض من الوركين.', tip: 'قصة A-Line والقصات ذات الحجم الهادئ في الأسفل تمنحكِ توازنًا بصريًا.' },
        rectangle: { icon: '▯', name: 'مستطيل', title: 'الجسم المستطيل', description: 'تتقارب قياسات الصدر والخصر والوركين.', tip: 'اختاري الأحزمة أو الكسرات والقصات التي ترسم الخصر.' },
        apple: { icon: '○', name: 'تفاحة', title: 'الجسم التفاحي', description: 'يتركز الامتلاء في منتصف الجسم مع أطراف أكثر نحافة.', tip: 'تناسبكِ القصات المنسدلة وقصة Empire التي تبدأ من أسفل الصدر.' }
      }
    };

    const ROOT_ID = 'wareef-size-guide';
    const MODAL_ID = 'wareef-size-guide-modal';
    const STORE_KEY = 'wareef:measurements';
    const modalController = createModalController('wg-open', '.wg-dialog');

    function getProductForm() {
      return document.querySelector('form[data-testid="store-product-form"], form.product-form');
    }

    function getProductId(form) {
      const field = form && form.querySelector('input[name="id"]');
      const button = document.querySelector('salla-add-product-button[product-id]');
      return String((field && field.value) || (button && button.getAttribute('product-id')) || '');
    }

    function isAllowedProduct(productId) {
      if (!WAREEF.sizeGuide.onlyProductIds.length) return true;
      return WAREEF.sizeGuide.onlyProductIds.map(String).includes(String(productId));
    }


    function launcherTemplate() {
      return `<button type="button" class="wg-launcher" aria-haspopup="dialog" aria-controls="${MODAL_ID}">
        <span class="wg-launcher-main">
          <span class="wg-ruler" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 16.5 16.5 4a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L7.5 20a2.1 2.1 0 0 1-3 0l-.5-.5a2.1 2.1 0 0 1 0-3Z"/><path d="m14 6.5 3.5 3.5M11.5 9 14 11.5M9 11.5l2.5 2.5M6.5 14l3.5 3.5"/></svg>
          </span>
          <span>
            <span class="wg-launcher-title">دليل المقاسات الذكي</span>
            <span class="wg-launcher-subtitle">احسبي مقاسكِ المناسب قبل الطلب</span>
          </span>
        </span>
        <span class="wg-arrow" aria-hidden="true">›</span>
      </button>`;
    }

    function modalTemplate() {
      const shapeButtons = Object.entries(GUIDE.shapes).map(([key, shape]) =>
        `<button type="button" class="wg-shape" data-shape="${key}" aria-pressed="false">
          <span class="wg-shape-icon" aria-hidden="true">${shape.icon}</span>
          <span>${escapeHtml(shape.name)}</span>
        </button>`
      ).join('');

      return `
        <div class="wg-backdrop" data-wg-close="true"></div>
        <section class="wg-dialog" role="dialog" aria-modal="true" aria-labelledby="wg-modal-title" tabindex="-1">
          <header class="wg-header">
            <div>
              <div class="wg-brand">W A R E E F</div>
              <h2 class="wg-heading" id="wg-modal-title">دليل الأناقة والمقاسات</h2>
            </div>
            <button type="button" class="wg-close" data-wg-close="true" aria-label="إغلاق دليل المقاسات">&times;</button>
          </header>

          <div class="wg-content">
            <section class="wg-section">
              <h3 class="wg-section-title"><span class="wg-number">01</span> احسبي مقاسكِ</h3>
              <p class="wg-section-text">أدخلي قياس الصدر والخصر بالإنش وسنقترح لكِ المقاس الأنسب من جدول وريف.</p>
              <div class="wg-calculator">
                <div>
                  <div class="wg-fields">
                    <div class="wg-field">
                      <label for="wg-chest">محيط الصدر</label>
                      <div class="wg-input-wrap"><input class="wg-input" id="wg-chest" type="text" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="مثال: 36"><span class="wg-unit">إنش</span></div>
                    </div>
                    <div class="wg-field">
                      <label for="wg-waist">محيط الخصر</label>
                      <div class="wg-input-wrap"><input class="wg-input" id="wg-waist" type="text" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="مثال: 30"><span class="wg-unit">إنش</span></div>
                    </div>
                  </div>
                  <button type="button" class="wg-calc-btn">اعرضي المقاس المناسب</button>
                  <div class="wg-error" role="alert" aria-live="polite"></div>
                </div>
                <div class="wg-result" aria-live="polite">
                  <div class="wg-result-empty">ستظهر نتيجة المقاس المقترح هنا بعد إدخال القياسات</div>
                </div>
              </div>
            </section>

            <section class="wg-section">
              <h3 class="wg-section-title"><span class="wg-number">02</span> جدول القياسات</h3>
              <p class="wg-section-text">اختاري مجموعة المقاسات لعرض تفاصيل كل مقاس بوضوح.</p>
              <div class="wg-tabs" role="tablist" aria-label="مجموعات المقاسات">
                <button type="button" class="wg-tab" role="tab" data-group="1" aria-selected="true">المقاسات 6–16</button>
                <button type="button" class="wg-tab" role="tab" data-group="2" aria-selected="false">المقاسات 18–24</button>
              </div>
              <div class="wg-table-wrap"></div>
            </section>

            <section class="wg-section">
              <h3 class="wg-section-title"><span class="wg-number">03</span> اكتشفي قصة الفستان الأنسب لجسمكِ</h3>
              <p class="wg-section-text">اختاري شكل جسمكِ للحصول على نصيحة سريعة تساعدكِ في اختيار القصة.</p>
              <div class="wg-shapes">${shapeButtons}</div>
              <div class="wg-shape-info" aria-live="polite"></div>
            </section>

            <section class="wg-section">
              <div class="wg-notes">
                <div class="wg-note">
                  <h4>طريقة القياس الصحيحة</h4>
                  <p><strong>الصدر:</strong> لفي الشريط حول أعرض منطقة مع إبقائه موازيًا للأرض.</p>
                  <p><strong>الخصر:</strong> لفي الشريط حول أضيق منطقة فوق السرة دون شدّه بقوة.</p>
                </div>
                <div class="wg-note wg-note-light">
                  <h4>لملاءمة أدق</h4>
                  <p>قد تلاحظين فروقًا طفيفة (1–2 إنش) عن جدول القياس بسبب طبيعة الحياكة والقص، وهذا لا يُعد عيبًا تصنيعيًا. يمكنكِ كتابة قياس الصدر والخصر في ملاحظة الطلب ليراجع فريق وريف اختياركِ.</p>
                </div>
              </div>
              <p class="wg-disclaimer">النتيجة إرشادية وتعتمد الملاءمة النهائية على القصة ونوع القماش وتفضيلكِ الشخصي.</p>
            </section>
          </div>
        </section>
      `;
    }

    let highlightedSize = null;

    function renderTable(modal, group) {
      const data = group === 2 ? GUIDE.sizes.slice(6) : GUIDE.sizes.slice(0, 6);
      const matchClass = (size) => (highlightedSize && size.en === highlightedSize ? ' class="wg-match"' : '');
      const cells = (key) => data.map((size) => `<td${matchClass(size) ? ' class="wg-match"' : ''}>${size[key]}</td>`).join('');

      const mobileCards = data.map((size) =>
        `<article class="wg-size-card${highlightedSize && size.en === highlightedSize ? ' wg-match' : ''}">
          <div class="wg-size-card-head"><span>المقاس EN</span><strong>${size.en}</strong></div>
          <div class="wg-size-card-body">
            <div class="wg-size-card-row"><span>AR</span><b>${size.ar}</b></div>
            <div class="wg-size-card-row"><span>UK</span><b>${size.uk}</b></div>
            <div class="wg-size-card-row"><span>US</span><b>${size.us}</b></div>
            <div class="wg-size-card-row"><span>الصدر</span><b>${size.chest} إنش</b></div>
            <div class="wg-size-card-row"><span>الخصر</span><b>${size.waist} إنش</b></div>
          </div>
        </article>`
      ).join('');

      modal.querySelector('.wg-table-wrap').innerHTML =
        `<table class="wg-table">
          <thead><tr><th scope="row">المقاس EN</th>${data.map((size) => `<th scope="col"${matchClass(size)}>${size.en}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><th scope="row">المقاس AR</th>${cells('ar')}</tr>
            <tr><th scope="row">المقاس UK</th>${cells('uk')}</tr>
            <tr><th scope="row">المقاس US</th>${cells('us')}</tr>
            <tr><th scope="row" class="wg-gold">الصدر (إنش)</th>${cells('chest')}</tr>
            <tr><th scope="row" class="wg-gold">الخصر (إنش)</th>${cells('waist')}</tr>
          </tbody>
        </table>
        <div class="wg-mobile-sizes">${mobileCards}</div>`;
    }

    function activeGroup(modal) {
      const tab = modal.querySelector('.wg-tab[aria-selected="true"]');
      return tab ? Number(tab.dataset.group) : 1;
    }

    // يُحسب المقاس على الصدر والخصر معًا، ويُختار الأكبر عند الاختلاف
    function suggestSize(chest, waist) {
      const byChest = GUIDE.sizes.find((size) => chest <= size.chest);
      const byWaist = GUIDE.sizes.find((size) => waist <= size.waist);
      if (!byChest || !byWaist) return null;

      const match = byChest.en >= byWaist.en ? byChest : byWaist;
      const other = match === byChest ? byWaist : byChest;
      return { match, mixed: match.en !== other.en, other, drivenBy: match === byChest ? 'الصدر' : 'الخصر' };
    }

    const EMPTY_RESULT = '<div class="wg-result-empty">ستظهر نتيجة المقاس المقترح هنا بعد إدخال القياسات</div>';

    // يقبل الأرقام العربية والفارسية والفاصلة العربية (٫)
    function readMeasurement(input) {
      const raw = normalizeDigits(input && input.value).replace(/[٫،]/g, '.').replace(/[^\d.]/g, '');
      return raw ? Number(raw) : NaN;
    }

    function calculateSize(modal) {
      const chest = readMeasurement(modal.querySelector('#wg-chest'));
      const waist = readMeasurement(modal.querySelector('#wg-waist'));
      const error = modal.querySelector('.wg-error');
      const result = modal.querySelector('.wg-result');
      error.textContent = '';

      if (!Number.isFinite(chest) || !Number.isFinite(waist) || chest <= 0 || waist <= 0) {
        error.textContent = 'أدخلي قياس الصدر والخصر بالإنش لعرض المقاس المقترح.';
        result.innerHTML = EMPTY_RESULT;
        highlightedSize = null;
        renderTable(modal, activeGroup(modal));
        return;
      }

      const suggestion = suggestSize(chest, waist);

      if (!suggestion) {
        highlightedSize = null;
        renderTable(modal, activeGroup(modal));
        result.innerHTML = `
          <div>
            <div class="wg-result-label">بحسب القياسات المدخلة</div>
            <div class="wg-size-value wg-size-text">تواصلي معنا</div>
            <div class="wg-result-note">قياسكِ أعلى من نطاق الجدول الحالي، ويسعد فريق وريف بمساعدتكِ في اختيار الأنسب.</div>
          </div>`;
        return;
      }

      const match = suggestion.match;
      const mixedNote = suggestion.mixed
        ? 'قياساتكِ بين مقاسين، واخترنا الأكبر (بحسب ' + suggestion.drivenBy + ') لراحة أفضل.'
        : 'إذا وقع أحد القياسين بين مقاسين، فاختيار المقاس الأكبر يمنحكِ راحة أكثر.';

      result.innerHTML = `
        <div>
          <div class="wg-result-label">المقاس المقترح</div>
          <div class="wg-size-value">${match.en}</div>
          <div class="wg-result-meta">
            <span class="wg-pill">AR ${match.ar}</span>
            <span class="wg-pill">UK ${escapeHtml(match.uk)}</span>
            <span class="wg-pill">US ${match.us}</span>
          </div>
          <div class="wg-result-note">${escapeHtml(mixedNote)}</div>
        </div>`;

      highlightedSize = match.en;
      const group = match.en >= 18 ? 2 : 1;
      modal.querySelectorAll('.wg-tab').forEach((tab) => tab.setAttribute('aria-selected', Number(tab.dataset.group) === group ? 'true' : 'false'));
      renderTable(modal, group);

      if (WAREEF.sizeGuide.rememberMeasurements) writeStore(STORE_KEY, JSON.stringify({ chest, waist }));
    }

    function restoreMeasurements(modal) {
      if (!WAREEF.sizeGuide.rememberMeasurements) return;

      try {
        const saved = JSON.parse(readStore(STORE_KEY) || 'null');
        if (!saved) return;
        if (saved.chest) modal.querySelector('#wg-chest').value = saved.chest;
        if (saved.waist) modal.querySelector('#wg-waist').value = saved.waist;
      } catch (error) { /* بيانات غير صالحة */ }
    }

    function bindModal(modal) {
      modal.addEventListener('click', (event) => {
        if (event.target.closest('[data-wg-close="true"]')) modalController.close(modal);
      });

      modal.querySelector('.wg-calc-btn').addEventListener('click', () => calculateSize(modal));

      modal.querySelectorAll('.wg-input').forEach((input) => {
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            calculateSize(modal);
          }
        });
      });

      modal.querySelectorAll('.wg-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          modal.querySelectorAll('.wg-tab').forEach((item) => item.setAttribute('aria-selected', 'false'));
          tab.setAttribute('aria-selected', 'true');
          renderTable(modal, Number(tab.dataset.group));
        });
      });

      modal.querySelectorAll('.wg-shape').forEach((button) => {
        button.addEventListener('click', () => {
          const shape = GUIDE.shapes[button.dataset.shape];
          modal.querySelectorAll('.wg-shape').forEach((item) => item.setAttribute('aria-pressed', 'false'));
          button.setAttribute('aria-pressed', 'true');
          const info = modal.querySelector('.wg-shape-info');
          info.innerHTML = `<h4>${escapeHtml(shape.title)}</h4><p>${escapeHtml(shape.description)}<strong>نصيحة وريف: ${escapeHtml(shape.tip)}</strong></p>`;
          info.classList.add('wg-visible');
        });
      });
    }

    function inlineLauncher(modal) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wg-inline-launcher';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', MODAL_ID);
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5 16.5 4a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L7.5 20a2.1 2.1 0 0 1-3 0l-.5-.5a2.1 2.1 0 0 1 0-3Z"/><path d="m14 6.5 3.5 3.5M11.5 9 14 11.5M9 11.5l2.5 2.5M6.5 14l3.5 3.5"/></svg><span>دليل المقاسات</span>`;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        modalController.open(modal);
      });
      return button;
    }

    // صف عنوان خيار المقاس داخل مكوّن سلة (لدمج الرابط بجانبه)
    function findSizeOptionLabel() {
      const component = document.querySelector('form.product-form salla-product-options, salla-product-options');
      if (!component) return null;

      const labels = Array.from(component.querySelectorAll('.s-product-options-option-label'));

      for (let index = 0; index < labels.length; index += 1) {
        const nameElement = labels[index].querySelector('b') || labels[index];
        const name = normalizeText(nameElement.textContent);
        if (name.includes('مقاس') || name.includes('قياس') || name.includes('size')) return labels[index];
      }

      return null;
    }

    function ensureModal() {
      let modal = document.getElementById(MODAL_ID);
      if (modal && modal.isConnected) return modal;

      modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = modalTemplate();
      document.body.appendChild(modal);
      renderTable(modal, 1);
      bindModal(modal);
      restoreMeasurements(modal);
      return modal;
    }

    function tick() {
      const form = getProductForm();
      if (!form) return;
      if (!isAllowedProduct(getProductId(form))) return;

      const existing = document.getElementById(ROOT_ID);
      const sizeLabel = findSizeOptionLabel();

      // الوضع الافتراضي: الرابط مدمج في صف "المقاس"
      if (sizeLabel) {
        if (!sizeLabel.querySelector('.wg-inline-launcher')) {
          sizeLabel.classList.add('wg-has-guide');
          sizeLabel.appendChild(inlineLauncher(ensureModal()));
        }
        if (existing) existing.remove();
        return;
      }

      // احتياطي: منتج بلا خيار مقاس (أو لم تُحمَّل الخيارات) → الكرت السابق
      if (existing && existing.isConnected) return;

      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.innerHTML = launcherTemplate();

      const hiddenIdField = form.querySelector('input[name="id"]');
      if (hiddenIdField) hiddenIdField.insertAdjacentElement('afterend', root);
      else form.insertAdjacentElement('afterbegin', root);

      root.querySelector('.wg-launcher').addEventListener('click', () => modalController.open(ensureModal()));
    }

    onReady(() => domWatcher.add(tick));
  });

  /* ═══════════════════ 5) كرت تفاصيل المنتج والوصف ═══════════════════ */

  safeModule('product-details-card', function () {
    if (!WAREEF.features.productDetailsCard) return;

    const ROOT_ID = 'wareef-product-details-card';
    const DETAILS_SELECTOR = '.product-single-top-description article, #details_table';
    const VERSION = '2.0.0';

    let priceObserver = null;
    let mountedSource = null;
    let mountedDetails = null;
    let placement = '';

    // نقطة التبديل للكمبيوتر (لا يتأثر الجوال إطلاقًا)
    const DESKTOP_QUERY = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : null;

    function isDesktopView() {
      return DESKTOP_QUERY ? DESKTOP_QUERY.matches : window.innerWidth >= 1024;
    }

    function sectionKey(value) {
      const normalized = normalizeText(value).replace(/[：:]+$/g, '').trim();
      if (!normalized) return '';
      if (normalized.includes('وصف')) return 'description';
      if (normalized === 'اللون' || normalized === 'الالوان') return 'color';
      if (normalized.includes('قماش') || normalized.includes('خامه')) return 'fabric';
      if (normalized.includes('مقاس')) return 'sizes';
      if (normalized.includes('قصه')) return 'cut';
      if (normalized.includes('تصميم')) return 'design';
      if (normalized.includes('مميزات') || normalized.includes('مزايا') || normalized.startsWith('لماذا')) return 'features';
      if (normalized.includes('عنايه') || normalized.includes('تنظيف') || normalized.includes('غسيل')) return 'care';
      return '';
    }

    function splitLabel(value) {
      const text = cleanValue(value);
      const match = text.match(/^([^:：]{1,70})[:：]\s*(.*)$/);
      if (!match) return { key: '', value: text };
      return { key: sectionKey(match[1]), value: cleanValue(match[2]) };
    }

    function descriptionItems(details) {
      const items = [];

      Array.from(details.children).forEach((element) => {
        if (element.matches('ul, ol')) {
          Array.from(element.children).forEach((item) => {
            const text = cleanValue(item.textContent);
            if (text) items.push({ text, tag: 'LI' });
          });
          return;
        }

        const text = cleanValue(element.textContent);
        if (text) items.push({ text, tag: element.tagName });
      });

      return items;
    }

    function parseDescription(details) {
      const groups = { description: [], color: [], fabric: [], sizes: [], cut: [], design: [], features: [], care: [], extra: [] };
      let activeKey = 'description';

      const items = descriptionItems(details);

      items.forEach((item) => {
        const split = splitLabel(item.text);
        const headingKey = split.key || (item.tag && /^H[1-6]$/.test(item.tag) ? sectionKey(item.text) : '');

        if (headingKey) {
          activeKey = headingKey;
          if (split.value) groups[activeKey].push(split.value);
          return;
        }

        if (/^H[1-6]$/.test(item.tag || '') && item.text.length < 100) return;

        groups[activeKey || 'extra'].push(item.text.replace(/^[•·]\s*/, ''));
      });

      if (!groups.description.length) {
        const fallback = items.map((item) => item.text).find((text) => text.length > 45);
        if (fallback) groups.description.push(fallback);
      }

      return groups;
    }

    function getProductOptionsData() {
      const component = document.querySelector('salla-product-options[options]');
      if (!component) return [];

      try {
        const parsed = JSON.parse(component.getAttribute('options') || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) { return []; }
    }

    function optionValuesByName(keywords) {
      const option = getProductOptionsData().find((item) => {
        const name = normalizeText(item && item.name);
        return keywords.some((keyword) => name.includes(keyword));
      });

      if (!option || !Array.isArray(option.details)) return [];

      return option.details
        .map((detail) => cleanValue(detail && detail.name))
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
    }

    function compactValue(values, limit) {
      const text = (values || []).map(cleanValue).filter(Boolean).join(' ');
      if (!text) return '';
      if (text.length <= limit) return text;
      return text.slice(0, limit).replace(/\s+\S*$/, '') + '…';
    }

    function getProductSku() {
      const element = document.querySelector('.product-sku');
      return element ? cleanValue(element.textContent) : '';
    }

    function buildSpecificationRows(groups) {
      const colors = optionValuesByName(['لون', 'color']);
      const sizes = optionValuesByName(['مقاس', 'قياس', 'size']);

      return [
        { label: 'اللون', value: colors.length ? colors.join('، ') : compactValue(groups.color, 180) },
        { label: 'المقاسات', value: sizes.length ? sizes.join(' · ') : compactValue(groups.sizes, 180) },
        { label: 'نوع القماش', value: compactValue(groups.fabric, 230) },
        { label: 'رمز المنتج', value: getProductSku() }
      ].filter((row) => row.value);
    }

    function getProductPriceData() {
      const priceRoot = document.querySelector('form.product-form .product-price');
      if (!priceRoot) return { current: '', before: '' };

      const saleGroup = priceRoot.querySelector('.price_is_on_sale:not(.hidden)');
      const normalGroup = priceRoot.querySelector('.starting-or-normal-price:not(.hidden)');
      const activeGroup = saleGroup || normalGroup || priceRoot;
      const currentElement = activeGroup.querySelector('.total-price');
      const beforeElement = saleGroup ? saleGroup.querySelector('.before-price') : null;

      return {
        current: cleanValue(currentElement && currentElement.textContent),
        before: cleanValue(beforeElement && beforeElement.textContent)
      };
    }

    function priceTemplate(price) {
      const current = (price && price.current) || '';
      const before = (price && price.before) || '';

      return `
        <div class="wrpd-price"${current ? '' : ' hidden'}>
          <span class="wrpd-price-label">السعر</span>
          <div class="wrpd-price-values">
            <strong class="wrpd-price-current">${escapeHtml(current)}</strong>
            <del class="wrpd-price-before"${before ? '' : ' hidden'}>${escapeHtml(before)}</del>
          </div>
        </div>`;
    }

    function specificationTemplate(rows) {
      if (!rows.length) return '';

      return `
        <section class="wrpd-section" aria-labelledby="wrpd-specifications-title">
          <h3 class="wrpd-section-title" id="wrpd-specifications-title">المواصفات</h3>
          <div class="wrpd-specifications">
            ${rows.map((row) => `<div class="wrpd-spec-row"><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.value)}</span></div>`).join('')}
          </div>
        </section>`;
    }

    function careLineTemplate(values) {
      const care = (values || []).map(cleanValue).filter(Boolean).join(' · ');
      if (!care) return '';
      return `<p class="wrpd-care-line"><strong>العناية بالقطعة:</strong> ${escapeHtml(care)}</p>`;
    }

    // عند إخفاء عنوان المنتج الأصلي يظهر الاسم داخل الكرت حتى لا تفقده العميلة
    function getProductName() {
      if (!WAREEF.features.hideNativeProductTitle) return '';
      const heading = document.querySelector('.product-single__info > h1') || document.querySelector('.product-single h1');
      return heading ? cleanValue(heading.textContent) : '';
    }

    function cardTemplate(groups, rows, price) {
      const intro = compactValue(groups.description, 900);
      const name = getProductName();

      return `
        <div class="wrpd-card" data-version="${VERSION}">
          ${name ? `<h2 class="wrpd-name">${escapeHtml(name)}</h2>` : ''}
          ${priceTemplate(price)}
          ${intro ? `<p class="wrpd-intro">${escapeHtml(intro)}</p>` : ''}
          ${careLineTemplate(groups.care)}
          ${specificationTemplate(rows)}
        </div>`;
    }


    function sourceContainerFor(details) {
      return details.closest('.product-single-top-description') || details;
    }

    function hideOriginalDescription(details) {
      const source = sourceContainerFor(details);
      source.setAttribute('data-wrpd-source', VERSION);
      source.setAttribute('data-wrpd-previous-display', source.style.display || '');
      source.style.display = 'none';
      details.setAttribute('data-wrpd-enhanced', VERSION);

      const tabNav = document.querySelector('.more-info-tabs__nav-link[data-id="details_table"]');
      if (!tabNav) return;
      tabNav.setAttribute('data-wrpd-tab-hidden', VERSION);
      tabNav.setAttribute('data-wrpd-previous-display', tabNav.style.display || '');
      tabNav.style.display = 'none';
    }

    function restoreDisplay(element) {
      const previousDisplay = element.getAttribute('data-wrpd-previous-display');
      if (previousDisplay) element.style.display = previousDisplay;
      else element.style.removeProperty('display');
      element.removeAttribute('data-wrpd-previous-display');
    }

    function teardown() {
      if (priceObserver) {
        priceObserver.disconnect();
        priceObserver = null;
      }

      const root = document.getElementById(ROOT_ID);
      if (root) root.remove();
      mountedSource = null;
      mountedDetails = null;
      placement = '';

      document.querySelectorAll('[data-wrpd-source]').forEach((source) => {
        restoreDisplay(source);
        source.removeAttribute('data-wrpd-source');
        const details = source.matches('#details_table') ? source : source.querySelector('article');
        if (details) details.removeAttribute('data-wrpd-enhanced');
      });

      document.querySelectorAll('[data-wrpd-tab-hidden]').forEach((tabNav) => {
        restoreDisplay(tabNav);
        tabNav.removeAttribute('data-wrpd-tab-hidden');
      });

      // إعادة إظهار سعر سلة الأصلي عند إزالة الكرت
      document.body.removeAttribute('data-wareef-price-relocated');
    }

    function insertCardBelowProduct(root, details) {
      const slider = document.querySelector('.product-single__slider');
      const sliderInner = slider && Array.from(slider.children).find((element) => element.classList.contains('product-single__slider__inner'));

      if (slider && sliderInner) {
        sliderInner.insertAdjacentElement('afterend', root);
        return;
      }

      if (slider) {
        slider.insertBefore(root, slider.firstChild);
        return;
      }

      const productContainer = document.querySelector('.container--product-details');
      if (productContainer) {
        const nextSection = productContainer.querySelector('salla-offer, .s-before-reviews, .s-before-related');
        productContainer.insertBefore(root, nextSection || null);
        return;
      }

      const productLayout = details.closest('.product-single');
      if (productLayout) {
        productLayout.insertAdjacentElement('afterend', root);
        return;
      }

      details.insertAdjacentElement('afterend', root);
    }

    // على الكمبيوتر: مباشرة بعد دليل المقاسات داخل عمود الشراء
    function columnAnchor() {
      const form = document.querySelector('form.product-form, form[data-testid="store-product-form"]');
      if (!form) return null;

      // بعد كرت دليل المقاسات إن وُجد، وإلا بعد كتلة خيارات المقاس مباشرة
      const guide = form.querySelector('#wareef-size-guide');
      if (guide && guide.isConnected) return guide;

      const options = form.querySelector('salla-product-options');
      return options && options.isConnected && options.parentElement ? options : null;
    }

    function applyIntroClamp(root) {
      const intro = root.querySelector('.wrpd-intro');
      if (!intro) return;

      let toggle = root.querySelector('.wrpd-more');

      if (placement !== 'column' || cleanValue(intro.textContent).length < 220) {
        intro.classList.remove('wrpd-clamped');
        if (toggle) toggle.remove();
        return;
      }

      if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'wrpd-more';
        toggle.addEventListener('click', () => {
          const clamped = intro.classList.toggle('wrpd-clamped');
          toggle.textContent = clamped ? 'اقرئي التفاصيل كاملة' : 'إخفاء التفاصيل';
        });
        intro.insertAdjacentElement('afterend', toggle);
      }

      intro.classList.add('wrpd-clamped');
      setText(toggle, 'اقرئي التفاصيل كاملة');
    }

    function placeCard(root, details) {
      const anchor = isDesktopView() ? columnAnchor() : null;

      if (anchor) {
        if (root.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', root);
        root.classList.add('wrpd-in-column');
        placement = 'column';
      } else {
        if (placement !== 'below' || !root.isConnected) insertCardBelowProduct(root, details);
        root.classList.remove('wrpd-in-column');
        placement = 'below';
      }

      applyIntroClamp(root);
      updateCardPrice();
    }

    function handleViewportChange() {
      const root = document.getElementById(ROOT_ID);
      if (root && root.isConnected && mountedDetails) placeCard(root, mountedDetails);
    }

    if (DESKTOP_QUERY && DESKTOP_QUERY.addEventListener) DESKTOP_QUERY.addEventListener('change', handleViewportChange);
    else if (DESKTOP_QUERY && DESKTOP_QUERY.addListener) DESKTOP_QUERY.addListener(handleViewportChange);

    function updateCardPrice() {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;

      const price = getProductPriceData();
      const priceBox = root.querySelector('.wrpd-price');
      const current = root.querySelector('.wrpd-price-current');
      const before = root.querySelector('.wrpd-price-before');
      if (!priceBox || !current || !before) return;

      setText(current, price.current);
      setText(before, price.before);
      priceBox.hidden = !price.current;
      before.hidden = !price.before;

      // نُخفي سعر سلة الأصلي فقط حين يعرض الكرت السعر فعليًا أسفل الصورة.
      // داخل عمود الشراء يبقى سعر سلة في مكانه ويُخفى سعر الكرت (تفاديًا للتكرار).
      if (price.current && placement !== 'column') document.body.setAttribute('data-wareef-price-relocated', 'true');
      else document.body.removeAttribute('data-wareef-price-relocated');
    }

    function observeProductPrice() {
      if (priceObserver) priceObserver.disconnect();
      const priceRoot = document.querySelector('form.product-form .product-price');
      if (!priceRoot) return;

      priceObserver = new MutationObserver(updateCardPrice);
      priceObserver.observe(priceRoot, { attributes: true, childList: true, characterData: true, subtree: true });
      updateCardPrice();
    }

    function mount() {
      const details = document.querySelector(DETAILS_SELECTOR);
      if (!details || !cleanValue(details.textContent)) return;

      const groups = parseDescription(details);
      const rows = buildSpecificationRows(groups);
      const price = getProductPriceData();

      const root = document.createElement('section');
      root.id = ROOT_ID;
      root.setAttribute('aria-label', 'تفاصيل المنتج من وريف');
      root.innerHTML = cardTemplate(groups, rows, price);

      mountedDetails = details;
      placement = '';
      placeCard(root, details);
      hideOriginalDescription(details);
      mountedSource = sourceContainerFor(details);
      observeProductPrice();
      updateCardPrice();
    }

    function tick() {
      const root = document.getElementById(ROOT_ID);

      // خرج من صفحة المنتج
      if (!document.querySelector(DETAILS_SELECTOR)) {
        if (root || document.querySelector('[data-wrpd-source]')) teardown();
        return;
      }

      // الكرت سليم: نتأكد فقط أنه في الموضع الصحيح لهذا المقاس
      if (root && root.isConnected && mountedSource && mountedSource.isConnected) {
        const anchor = isDesktopView() ? columnAnchor() : null;
        const misplaced = anchor ? root.previousElementSibling !== anchor : placement === 'column';
        if (misplaced) placeCard(root, mountedDetails);
        return;
      }

      teardown();
      mount();
    }

    onReady(() => domWatcher.add(tick));
  });

  /* ═══════════════════ 6) تحسينات تجربة صفحة المنتج ═══════════════════ */

  safeModule('product-ux', function () {
    if (!WAREEF.features.productUx) return;

    const VERSION = '2.0.0';

    function isProductPage() {
      return document.body.classList.contains('product-single') || /\/p\d+(?:\/|$)/.test(window.location.pathname);
    }

    function getOptionsComponent() {
      return document.querySelector('form.product-form salla-product-options[options], salla-product-options[options]');
    }

    function getOptionsData(component) {
      if (!component) return [];

      try {
        const options = JSON.parse(component.getAttribute('options') || '[]');
        return Array.isArray(options) ? options : [];
      } catch (error) { return []; }
    }

    function getSizeOptionIds(component) {
      return getOptionsData(component)
        .filter((option) => {
          const name = normalizeText(option && option.name);
          return name.includes('مقاس') || name.includes('قياس') || name.includes('size');
        })
        .map((option) => String(option.id));
    }

    function updateSelectedSize(container) {
      if (!container) return;
      const hint = container.querySelector('.s-product-options-option-label small');
      if (!hint) return;

      if (!hint.dataset.wruxDefaultText) hint.dataset.wruxDefaultText = hint.textContent.trim() || 'اختاري';

      const selected = container.querySelector('input[type="radio"]:checked');
      if (!selected) {
        setText(hint, hint.dataset.wruxDefaultText);
        hint.classList.remove('wrux-selection-confirmed');
        return;
      }

      const valueElement = selected.nextElementSibling;
      const selectedValue = valueElement ? valueElement.textContent.trim() : '';
      setText(hint, selectedValue ? 'تم اختيار ' + selectedValue : 'تم اختيار المقاس');
      hint.classList.add('wrux-selection-confirmed');
    }

    function enhanceSizeSelector() {
      const component = getOptionsComponent();
      if (!component) return;

      getSizeOptionIds(component).forEach((optionId) => {
        const container = component.querySelector('[data-option-id="' + optionId + '"]');
        if (!container) return;
        container.classList.add('wrux-size-option');
        updateSelectedSize(container);
      });

      if (component.dataset.wruxSizeBound === 'true') return;
      component.dataset.wruxSizeBound = 'true';

      component.addEventListener('change', (event) => {
        const input = event.target.closest('input[type="radio"][name^="options["]');
        if (!input) return;
        const container = input.closest('.wrux-size-option');
        if (container) updateSelectedSize(container);
      });
    }

    function enhanceGallery() {
      const gallery = document.querySelector('.product-single.thumbnails');
      if (gallery) gallery.classList.add('wrux-native-gallery');
    }

    function isProductCategorySection(element) {
      if (!element || !element.matches('section')) return false;
      return Boolean(element.querySelector('a[href]') && /تصنيف\s*المنتج/i.test(element.textContent || ''));
    }

    function addAttachmentLabel(button, attachments) {
      if (!button || button.querySelector('.wrux-attachment-label')) return;

      const nativeLabel = attachments.querySelector('.form-label b');
      const label = document.createElement('span');
      label.className = 'wrux-attachment-label';

      const icon = document.createElement('i');
      icon.className = 'sicon-chat-conversation-alt';
      icon.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.textContent = cleanValue((nativeLabel && nativeLabel.textContent) || '') || 'المرفقات';

      label.appendChild(icon);
      label.appendChild(text);
      button.insertBefore(label, button.firstChild);
    }

    function buildCompactProductInfoRow(form) {
      const children = Array.from(form.children);
      const meta = children.find((element) => Boolean(
        (element.querySelector && element.querySelector('.product-sku-wrapper')) || isProductCategorySection(element)
      ));
      const attachments = children.find((element) => Boolean(element.querySelector && element.querySelector('.btn--collapse, textarea[name="notes"]')));

      if (!meta) return;
      meta.classList.add('wrux-product-meta', 'wrux-product-info-row');

      Array.from(meta.children).forEach((element) => {
        if (element.matches('div')) element.classList.add('wrux-info-card');
      });

      const skuLabel = meta.querySelector('.product-sku-wrapper b span');
      setText(skuLabel, 'رقم الموديل');

      if (attachments && meta.dataset.wruxInfoRow !== 'true') {
        const button = attachments.querySelector('.btn--collapse');
        const panelId = button && button.getAttribute('data-show');
        const notePanel = panelId ? document.getElementById(panelId) : null;

        if (button) {
          addAttachmentLabel(button, attachments);
          button.classList.add('wrux-info-card', 'wrux-info-attachment');
          meta.appendChild(button);
        }

        if (notePanel) {
          notePanel.classList.add('wrux-product-note-panel');
          meta.appendChild(notePanel);
        }

        attachments.hidden = true;
        attachments.setAttribute('aria-hidden', 'true');
        meta.dataset.wruxInfoRow = 'true';
      }

      const cardsCount = Array.from(meta.children).filter((element) => element.classList.contains('wrux-info-card')).length;
      meta.style.setProperty('--wrux-info-columns', String(Math.max(1, Math.min(cardsCount, 3))));
    }

    function enhancePurchaseArea() {
      const form = document.querySelector('form.product-form');
      if (!form) return;
      form.classList.add('wrux-purchase-panel');

      Array.from(form.children).forEach((element) => {
        if (element.matches('salla-product-options')) {
          element.classList.add('wrux-product-options');
          return;
        }
        if (element.querySelector && element.querySelector('.product-sku-wrapper')) {
          element.classList.add('wrux-product-meta');
          return;
        }
        if (element.querySelector && element.querySelector('.btn--collapse, textarea[name="notes"]')) {
          element.classList.add('wrux-product-attachments');
          return;
        }
        if (element.classList.contains('product-price')) element.classList.add('wrux-product-price');
      });

      buildCompactProductInfoRow(form);
    }

    function syncNativeTabs(root) {
      root.querySelectorAll('.more-info-tabs__nav-link[data-id]').forEach((trigger) => {
        const targetId = trigger.dataset.id;
        const pane = targetId ? document.getElementById(targetId) : null;
        const active = trigger.classList.contains('active');

        trigger.setAttribute('role', 'tab');
        trigger.setAttribute('tabindex', active ? '0' : '-1');
        trigger.setAttribute('aria-selected', active ? 'true' : 'false');
        if (targetId) trigger.setAttribute('aria-controls', targetId);
        if (pane) {
          pane.setAttribute('role', 'tabpanel');
          pane.setAttribute('aria-hidden', active ? 'false' : 'true');
        }
      });
    }

    function enhanceInfoTabs() {
      document.querySelectorAll('.product-more-info').forEach((root) => {
        root.classList.add('wrux-native-tabs');
        const nav = root.querySelector('.more-info-tabs__nav');
        if (nav) nav.setAttribute('role', 'tablist');
        syncNativeTabs(root);

        if (root.dataset.wruxTabsBound === 'true') return;
        root.dataset.wruxTabsBound = 'true';

        root.addEventListener('click', (event) => {
          if (!event.target.closest('.more-info-tabs__nav-link[data-id]')) return;
          window.requestAnimationFrame(() => syncNativeTabs(root));
        });

        root.addEventListener('keydown', (event) => {
          const trigger = event.target.closest('.more-info-tabs__nav-link[data-id]');
          if (!trigger || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          trigger.click();
        });
      });
    }


    function tick() {
      if (!isProductPage()) {
        document.body.removeAttribute('data-wareef-hide-title');
        return;
      }

      enhanceGallery();
      enhancePurchaseArea();
      enhanceSizeSelector();
      enhanceInfoTabs();

      if (WAREEF.features.hideNativeProductTitle) document.body.setAttribute('data-wareef-hide-title', 'true');
      document.body.setAttribute('data-wrux-product-ux', VERSION);
    }

    onReady(() => {
      if (window.salla && typeof window.salla.onReady === 'function') window.salla.onReady(() => domWatcher.add(tick));
      else domWatcher.add(tick);
    });
  });
})();
