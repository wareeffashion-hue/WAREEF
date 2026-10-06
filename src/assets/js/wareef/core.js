// Wareef motion & behaviour runtime. Everything is driven by data attributes so
// Twig components stay declarative; component-specific code registers itself with
// Wareef.register(name, init) and runs for each [data-w="name"] element.
const registry = new Map();
const reduced = () => document.body.classList.contains('w-anim-none') || matchMedia('(prefers-reduced-motion: reduce)').matches;

export const Wareef = {
  register(name, init) {
    registry.set(name, init);
    // Component modules may load after the first mount; mount their elements now.
    if (document.readyState !== 'loading') Wareef.mount();
  },
  reduced,
  mount(root = document) {
    root.querySelectorAll('[data-w]').forEach((el) => {
      if (el.__wMounted) return;
      const init = registry.get(el.dataset.w);
      if (!init) return;
      el.__wMounted = true;
      try { init(el); } catch (e) { console.error('[wareef]', el.dataset.w, e); }
    });
    stagger(root); split(root); reveal(root); marquee(root); counters(root); countdowns(root); tabs(root); parallax(root);
  },
};
window.Wareef = Wareef;

function stagger(root) {
  root.querySelectorAll('[data-w-stagger]').forEach((p) => [...p.children].forEach((c, i) => c.style.setProperty('--i', i)));
}

function split(root) {
  root.querySelectorAll('[data-w-split]:not([data-w-split-done])').forEach((el) => {
    el.setAttribute('data-w-split-done', '');
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span'); w.className = 'w-word';
            const s = document.createElement('span'); s.textContent = part; s.style.setProperty('--wi', i++);
            w.appendChild(s); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
  });
}

let io;
function reveal(root) {
  const els = root.querySelectorAll('[data-w-reveal]:not(.is-in), [data-w-split]:not(.is-in)');
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  io = io || new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((e) => io.observe(e));
}

function marquee(root) {
  root.querySelectorAll('[data-w-marquee]:not([data-w-marquee-done])').forEach((el) => {
    el.setAttribute('data-w-marquee-done', '');
    el.classList.add('w-marquee');
    if (el.dataset.wMarquee) el.style.setProperty('--w-marquee-speed', `${el.dataset.wMarquee}s`);
    const track = el.querySelector('.w-marquee__track');
    if (!track) return;
    // Repeat until the track overflows twice the viewport, then clone once for a seamless loop.
    let guard = 0;
    while (track.scrollWidth < el.clientWidth * 1.2 && guard++ < 8) track.innerHTML += track.innerHTML;
    const clone = track.cloneNode(true); clone.setAttribute('aria-hidden', 'true'); el.appendChild(clone);
  });
}

function onView(el, fn) {
  if (!('IntersectionObserver' in window)) return fn();
  const o = new IntersectionObserver(([en]) => { if (en.isIntersecting) { fn(); o.disconnect(); } }, { threshold: 0.4 });
  o.observe(el);
}

function counters(root) {
  root.querySelectorAll('[data-w-count]:not([data-w-count-done])').forEach((el) => {
    el.setAttribute('data-w-count-done', '');
    const to = parseFloat(el.dataset.wCount) || 0, dec = (String(el.dataset.wCount).split('.')[1] || '').length;
    const fmt = (v) => v.toLocaleString(document.documentElement.lang === 'ar' ? 'ar-SA' : 'en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduced()) { el.textContent = fmt(to); return; }
    el.textContent = fmt(0);
    onView(el, () => {
      const t0 = performance.now(), dur = 1600;
      const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  });
}

function countdowns(root) {
  root.querySelectorAll('[data-w-countdown]:not([data-w-countdown-done])').forEach((el) => {
    el.setAttribute('data-w-countdown-done', '');
    const end = Date.parse(el.dataset.wCountdown);
    if (!end) return;
    const get = (k) => el.querySelector(`[data-w-unit="${k}"]`);
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      const v = { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
      Object.entries(v).forEach(([k, n]) => { const u = get(k); if (u && u.textContent !== pad(n)) { u.textContent = pad(n); u.classList.remove('w-tick'); void u.offsetWidth; u.classList.add('w-tick'); } });
      if (s <= 0) { el.classList.add('is-over'); clearInterval(timer); }
    };
    const timer = setInterval(tick, 1000); tick();
  });
}

function tabs(root) {
  root.querySelectorAll('[data-w-tabs]:not([data-w-tabs-done])').forEach((el) => {
    el.setAttribute('data-w-tabs-done', '');
    const btns = el.querySelectorAll('[data-w-tab]'), panels = el.querySelectorAll('[data-w-panel]');
    const show = (id) => {
      btns.forEach((b) => b.classList.toggle('is-active', b.dataset.wTab === id));
      panels.forEach((p) => { const on = p.dataset.wPanel === id; p.hidden = !on; if (on) Wareef.mount(p); });
    };
    btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.wTab)));
    if (btns[0]) show(btns[0].dataset.wTab);
  });
}

const para = new Set();
function parallax(root) {
  if (reduced()) return;
  root.querySelectorAll('[data-w-parallax]').forEach((el) => para.add(el));
}
let ticking = false;
function onScroll() {
  document.body.classList.toggle('w-scrolled', scrollY > 40);
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const vh = innerHeight;
    para.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const k = parseFloat(el.dataset.wParallax) || 0.15;
      el.style.transform = `translate3d(0, ${((r.top + r.height / 2 - vh / 2) * -k).toFixed(1)}px, 0)`;
    });
    ticking = false;
  });
}
addEventListener('scroll', onScroll, { passive: true });

// Dark mode: the head script already applied the saved choice before paint.
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-w-theme-toggle]');
  if (t) {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('w-theme', dark ? 'dark' : 'light'); } catch (err) { /* private mode */ }
  }
  if (e.target.closest('[data-w-top]')) scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
});

// Magnetic hover for [data-w-magnetic] on fine pointers.
if (matchMedia('(pointer: fine)').matches) {
  document.addEventListener('pointermove', (e) => {
    const m = e.target.closest('[data-w-magnetic]');
    document.querySelectorAll('[data-w-magnetic].is-mag').forEach((x) => { if (x !== m) { x.classList.remove('is-mag'); x.style.transform = ''; } });
    if (!m || reduced()) return;
    const r = m.getBoundingClientRect();
    m.classList.add('is-mag');
    m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.25}px)`;
  });
}

const start = () => { Wareef.mount(); onScroll(); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
document.addEventListener('theme::ready', () => Wareef.mount());
