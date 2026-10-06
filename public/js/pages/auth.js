import { api } from '../api.js';
import { h } from '../ui.js';

/** Login / signup / forgot / reset, chosen by the URL hash. */
export function authView({ needsSetup, config, onDone }) {
  const pane = h('div', { class: 'auth-pane' });
  const root = h('div', { class: 'auth' },
    h('aside', { class: 'auth-art', 'aria-hidden': 'true' },
      h('div', { class: 'geo' }, h('span', { class: 'geo-s1' }), h('span', { class: 'geo-s2' }), h('span', { class: 'geo-s3' }), h('span', { class: 'geo-sq' })),
      h('div', { class: 'auth-art-copy' },
        h('img', { src: '/img/logo-dark.svg', alt: '', class: 'auth-art-logo' }),
        h('p', { class: 'auth-art-title' }, 'كل بيعة تُحتسب ', h('em', {}, 'مرة واحدة'), '.'),
        h('p', { class: 'auth-art-sub' }, 'مبيعات متجرك الحقيقية، منسوبة إلى مصدرها، بجوار ما تدّعيه كل منصة.'))),
    pane);
  function draw() {
    const hash = location.hash.replace(/^#\/?/, '');
    let mode = hash.startsWith('reset/') ? 'reset' : ['signup', 'forgot', 'login'].includes(hash) ? hash : 'login';
    if (needsSetup) mode = 'signup';
    if (mode === 'signup' && !config.signupEnabled) mode = 'login';
    pane.replaceChildren(form(mode, hash.slice(6)));
  }
  window.addEventListener('hashchange', draw);

  const field = (label, attrs) => h('label', { class: 'field' }, label, h('input', attrs));
  function form(mode, token) {
    const err = h('div', { class: 'error', role: 'alert' });
    const ok = h('div', { class: 'success' });
    const FIELDS = {
      login: [
        field('البريد الإلكتروني', { name: 'email', type: 'email', required: true, autocomplete: 'username', dir: 'ltr' }),
        field('كلمة المرور', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' }),
      ],
      signup: [
        field('الاسم', { name: 'name', required: true, autocomplete: 'name' }),
        field('اسم الشركة / الوكالة', { name: 'company', required: true, autocomplete: 'organization' }),
        field('البريد الإلكتروني', { name: 'email', type: 'email', required: true, autocomplete: 'email', dir: 'ltr' }),
        field('كلمة المرور (8 أحرف على الأقل)', { name: 'password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }),
        field('اسم متجرك الأول (اختياري)', { name: 'store', placeholder: 'مثال: متجر وريف' }),
      ],
      forgot: [field('البريد الإلكتروني', { name: 'email', type: 'email', required: true, autocomplete: 'email', dir: 'ltr' })],
      reset: [field('كلمة المرور الجديدة', { name: 'password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' })],
    };
    const TITLES = {
      login: ['مرحباً بعودتك', 'كل منصة تدّعي البيعة لنفسها. هنا تجد الحقيقة.'],
      signup: needsSetup ? ['إعداد المنصة', 'الحساب الأول يصبح مالك المنصة ومديرها.'] : ['أنشئ حسابك', `${config.trialDays} يوماً من التجربة المجانية بكامل المزايا، دون بطاقة ائتمانية.`],
      forgot: ['استعادة كلمة المرور', 'أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.'],
      reset: ['كلمة مرور جديدة', 'اختر كلمة مرور قوية لا تستخدمها في أي موقع آخر.'],
    };
    const BUTTONS = { login: 'تسجيل الدخول', signup: needsSetup ? 'إنشاء الحساب' : 'ابدأ التجربة المجانية', forgot: 'أرسل الرابط', reset: 'حفظ ودخول' };
    const btn = h('button', { class: 'btn primary', type: 'submit' }, BUTTONS[mode]);
    const el = h('form', {
      class: 'auth-card',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = ''; ok.textContent = '';
        btn.disabled = true;
        try {
          const data = Object.fromEntries(new FormData(el));
          if (mode === 'forgot') {
            await api.post('/api/auth/forgot', data);
            ok.textContent = 'إن كان البريد مسجّلاً لدينا، فسيصلك الرابط خلال دقائق. تحقّق من مجلد الرسائل غير المرغوب فيها أيضاً.';
            btn.disabled = false;
            return;
          }
          const path = { login: '/api/auth/login', signup: '/api/auth/signup', reset: '/api/auth/reset' }[mode];
          await api.post(path, mode === 'reset' ? { ...data, token } : data);
          onDone(mode === 'signup' ? '#/settings' : '#/');
        } catch (ex) {
          err.textContent = ex.message;
          btn.disabled = false;
        }
      },
    },
    h('a', { class: 'brand', href: '/', style: { padding: 0 } },
      h('img', { class: 'brand-logo on-light', src: '/img/logo.svg', alt: config.appName, style: { height: '44px' } }),
      h('img', { class: 'brand-logo on-dark', src: '/img/logo-dark.svg', alt: config.appName, style: { height: '44px' } })),
    h('h1', {}, TITLES[mode][0]),
    h('p', {}, TITLES[mode][1]),
    FIELDS[mode], err, ok, btn,
    mode === 'signup' && !needsSetup ? h('p', { class: 'fine' }, 'بإنشاء الحساب، فإنك توافق على ', h('a', { href: '/terms', target: '_blank' }, 'الشروط والأحكام'), ' و', h('a', { href: '/privacy', target: '_blank' }, 'سياسة الخصوصية'), '.') : null,
    needsSetup ? null : h('div', { class: 'auth-links' },
      mode !== 'login' ? h('a', { href: '#/login' }, 'لديك حساب؟ سجّل الدخول') : null,
      mode === 'login' && config.signupEnabled ? h('a', { href: '#/signup' }, 'ليس لديك حساب؟ أنشئ حساباً مجاناً') : null,
      mode === 'login' ? h('a', { href: '#/forgot' }, 'نسيت كلمة المرور؟') : null));
    return el;
  }
  draw();
  return root;
}
