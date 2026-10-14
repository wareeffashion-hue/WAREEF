const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
$('#year').textContent = new Date().getFullYear();

// Mobile menu: the inline nav links are hidden under 960px, so the toggle must work.
const menuBtn = $('.menu-toggle');
const menu = $('#mobile-menu');
const setMenu = (open) => {
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  menu.hidden = !open;
};
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

// Nav gets a shadow once the page scrolls, so it reads as floating above content.
const nav = $('.nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Scroll reveal for sections. Only enabled when motion is allowed and IntersectionObserver exists;
// otherwise content simply stays visible.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('js-reveal');
  const targets = document.querySelectorAll('.section .wrap > *, .stats-in, .hero-grid > *');
  targets.forEach((t) => t.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  targets.forEach((t) => io.observe(t));
}

let cfg = { plans: [], trialDays: 14, appName: 'عزو' };
let cycle = 'monthly';
const nf = new Intl.NumberFormat('en-US');

function renderPlans() {
  const box = $('#plans');
  box.replaceChildren(...cfg.plans.map((p) => {
    const card = el('div', `plan${p.popular ? ' popular' : ''}`);
    if (p.popular) card.append(el('span', 'badge', 'الأكثر اختياراً'));
    card.append(el('h3', null, p.name));
    const price = el('div', 'price');
    const amount = cycle === 'yearly' ? p.price.yearly / 12 : p.price.monthly;
    price.append(el('strong', null, nf.format(Math.round(amount))), el('span', null, ' ر.س / شهرياً'));
    card.append(price, el('p', 'billed', cycle === 'yearly' ? `${nf.format(p.price.yearly)} ر.س تُدفع سنوياً` : 'يُدفع شهرياً'));
    const ul = el('ul');
    for (const f of p.features || []) ul.append(el('li', null, f));
    card.append(ul);
    const cta = el('a', `btn ${p.popular ? 'primary' : 'ghost'}`, 'ابدأ تجربتك المجانية');
    cta.href = '/app#/signup';
    card.append(cta);
    return card;
  }));
}

document.querySelectorAll('.cycle button').forEach((b) => b.addEventListener('click', () => {
  cycle = b.dataset.cycle;
  document.querySelectorAll('.cycle button').forEach((x) => x.classList.toggle('active', x === b));
  renderPlans();
}));

fetch('/api/public/config').then((r) => r.json()).then((c) => {
  cfg = c;
  document.querySelectorAll('[data-app-name]').forEach((e) => { e.textContent = c.appName; });
  document.querySelectorAll('[data-trial-days]').forEach((e) => { e.textContent = c.trialDays; });
  document.title = `${c.appName} · اعرف من أين يأتي عميلك فعلاً`;
  if (c.supportEmail) { const s = $('#support'); s.hidden = false; s.href = `mailto:${c.supportEmail}`; }
  if (!c.signupEnabled) {
    // Invite-only: the signup buttons turn into login, so drop the separate login button to avoid two of them.
    document.querySelectorAll('.nav-cta a[href="/app#/login"]').forEach((a) => a.remove());
    document.querySelector('.hero .fine')?.remove();
    document.querySelectorAll('a[href="/app#/signup"]').forEach((a) => { a.href = '/app#/login'; a.textContent = 'تسجيل الدخول'; });
  }
  renderPlans();
}).catch(() => renderPlans());
