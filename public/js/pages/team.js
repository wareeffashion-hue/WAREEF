import { h, fmt, card, table, toast } from '../ui.js';
import { pageHead } from './common.js';

export default async function team(ctx) {
  const [users, workspaces] = await Promise.all([ctx.api.get('/api/users'), ctx.api.get('/api/workspaces')]);
  const wsName = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  const wsChecks = (selected = []) => h('div', { class: 'checks' }, workspaces.map((w) =>
    h('label', {}, h('input', { type: 'checkbox', name: 'ws', value: w.id, checked: selected.includes(w.id) }), w.name)));

  const edit = (u) => {
    const checks = wsChecks(u.workspaces);
    const role = h('select', {}, h('option', { value: 'member', selected: u.role === 'member' }, 'عضو (يرى عملاءه فقط)'), h('option', { value: 'admin', selected: u.role === 'admin' }, 'مدير (صلاحيات كاملة)'));
    const pw = h('input', { type: 'password', placeholder: 'اتركه فارغاً للإبقاء عليها', minlength: 8 });
    const box = card({ title: `تعديل: ${u.name}`, sub: u.email },
      h('div', { class: 'form' },
        h('div', { class: 'form-row' }, h('label', { class: 'field' }, 'الصلاحية', role), h('label', { class: 'field' }, 'كلمة مرور جديدة', pw)),
        h('div', { class: 'field' }, 'العملاء المتاحون (للأعضاء)', checks),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('button', { class: 'btn primary', onclick: async () => {
            try {
              await ctx.api.put(`/api/users/${u.id}`, {
                role: role.value, password: pw.value || undefined,
                workspaces: [...checks.querySelectorAll('input:checked')].map((i) => Number(i.value)),
              });
              toast('تم حفظ التغييرات'); ctx.refresh();
            } catch (err) { toast(err.message, 'bad'); }
          } }, 'احفظ'),
          h('button', { class: 'btn', onclick: () => box.remove() }, 'إلغاء'))));
    list.after(box);
  };

  const list = card({ title: 'أعضاء الفريق', sub: 'يرى المدير جميع العملاء ويعدّل الإعدادات، بينما يرى العضو تقارير العملاء المرتبطين به فقط، وهو الخيار الأنسب لمنح العميل نفسه حق الدخول.' }, table({
    rows: users,
    columns: [
      { key: 'name', label: 'الاسم' },
      { key: 'email', label: 'البريد', render: (u) => h('span', { dir: 'ltr' }, u.email) },
      { key: 'role', label: 'الصلاحية', render: (u) => h('span', { class: u.role === 'admin' ? 'tag accent' : 'tag' }, u.role === 'admin' ? 'مدير' : 'عضو') },
      { key: 'workspaces', label: 'العملاء', value: (u) => u.workspaces.length, render: (u) => (u.role === 'admin' ? h('span', { class: 'muted' }, 'الكل') : u.workspaces.map((id) => wsName[id]).filter(Boolean).join('، ') || '—') },
      { key: 'created_at', label: 'تاريخ الإضافة', render: (u) => fmt.date(u.created_at) },
      { key: 'actions', label: '', render: (u) => h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', { class: 'btn sm', onclick: () => edit(u) }, 'تعديل'),
        u.id !== ctx.state.user.id ? h('button', { class: 'btn sm danger', onclick: async () => { if (confirm(`هل تريد حذف ${u.name} من الفريق؟`)) { await ctx.api.del(`/api/users/${u.id}`); ctx.refresh(); } } }, 'حذف') : null) },
    ],
  }));

  const checks = wsChecks();
  const form = h('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      try {
        await ctx.api.post('/api/users', { ...d, workspaces: [...checks.querySelectorAll('input:checked')].map((i) => Number(i.value)) });
        toast('تمت إضافة العضو'); ctx.refresh();
      } catch (err) { toast(err.message, 'bad'); }
    },
  },
  h('div', { class: 'form-row' },
    h('label', { class: 'field' }, 'الاسم', h('input', { name: 'name', required: true })),
    h('label', { class: 'field' }, 'البريد', h('input', { name: 'email', type: 'email', required: true, dir: 'ltr' })),
    h('label', { class: 'field' }, 'كلمة المرور المبدئية', h('input', { name: 'password', type: 'password', required: true, minlength: 8 })),
    h('label', { class: 'field' }, 'الصلاحية', h('select', { name: 'role' }, h('option', { value: 'member' }, 'عضو'), h('option', { value: 'admin' }, 'مدير')))),
  h('div', { class: 'field' }, 'العملاء المتاحون', checks),
  h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'أضف العضو')));

  return h('div', { class: 'view' },
    pageHead('الفريق والصلاحيات', 'أضف موظفي وكالتك، أو امنح كل عميل حساباً يرى فيه بياناته فقط.'),
    list,
    card({ title: 'إضافة عضو' }, form));
}
