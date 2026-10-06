import { api } from '../api.js';
import { h } from '../ui.js';

export function authView({ needsSetup, onDone }) {
  const err = h('div', { class: 'error' });
  const field = (label, attrs) => h('label', { class: 'field' }, label, h('input', attrs));
  const fields = needsSetup ? [
    field('اسمك', { name: 'name', required: true, autocomplete: 'name' }),
    field('البريد الإلكتروني', { name: 'email', type: 'email', required: true, autocomplete: 'email' }),
    field('كلمة المرور (8 أحرف على الأقل)', { name: 'password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }),
    field('اسم أول عميل / متجر', { name: 'workspace', required: true, placeholder: 'مثال: متجر وريف' }),
  ] : [
    field('البريد الإلكتروني', { name: 'email', type: 'email', required: true, autocomplete: 'username' }),
    field('كلمة المرور', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' }),
  ];
  const btn = h('button', { class: 'btn primary', type: 'submit' }, needsSetup ? 'إنشاء الحساب' : 'دخول');
  const form = h('form', {
    class: 'auth-card',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form));
        await api.post(needsSetup ? '/api/auth/setup' : '/api/auth/login', data);
        onDone();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    },
  },
  h('div', { class: 'brand', style: { padding: 0 } },
    h('span', { class: 'logo' }, h('span', { style: { fontWeight: 700 } }, 'T')),
    h('div', {}, h('strong', {}, 'TRACKING'), h('small', {}, 'الإسناد الموحّد'))),
  h('h1', {}, needsSetup ? 'إعداد الوكالة' : 'تسجيل الدخول'),
  h('p', {}, needsSetup ? 'أول حساب يصير مدير النظام. تقدر تضيف عملاء وأعضاء فريق بعدين.' : 'كل منصة تقول إنها جابت البيعة. هنا تعرف الحقيقة.'),
  fields, err, btn);
  return h('div', { class: 'auth' }, form);
}
