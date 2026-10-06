// Wareef — shoppable lookbook: hotspots open a product card (anchored popover on desktop,
// bottom sheet on small screens). Keyboard: Enter/Space opens, Esc closes and returns focus.
import { Wareef } from '../core.js';

Wareef.register('w-lookbook', (root) => {
  const stage = root.querySelector('.w-lookbook__stage');
  const scrim = root.querySelector('.w-lookbook__scrim');
  const dots = [...root.querySelectorAll('.w-lookbook__dot')];
  const cards = [...root.querySelectorAll('.w-lookbook__card')];
  const rows = [...root.querySelectorAll('[data-spot-link]')];
  const mobile = matchMedia('(max-width: 767px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let open = -1, hoverTimer = 0, hideTimer = 0;

  // Reveal the markers once the photo is on screen.
  const live = () => root.classList.add('is-live');
  if (Wareef.reduced() || !('IntersectionObserver' in window)) live();
  else {
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { live(); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(stage);
  }

  const place = (i) => {
    const card = cards[i], dot = dots[i];
    card.style.left = card.style.top = '';
    if (mobile.matches) return;
    const sw = stage.clientWidth, sh = stage.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight;
    const dx = dot.offsetLeft, dy = dot.offsetTop, gap = 28, pad = 10;
    // Prefer the side with more room; clamp inside the stage, then nudge to stay inside the viewport.
    let x = dx > sw / 2 ? dx - gap - cw : dx + gap;
    if (x + cw > sw - pad) x = sw - pad - cw;
    if (x < pad) x = pad;
    let y = Math.min(Math.max(dy - ch / 2, pad), sh - ch - pad);
    const r = stage.getBoundingClientRect();
    const top = r.top + y, vh = innerHeight;
    if (top + ch > vh - pad) y -= top + ch - (vh - pad);
    if (r.top + y < pad) y += pad - (r.top + y);
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  };

  const close = (focusBack = false) => {
    if (open < 0) return;
    const i = open, card = cards[i];
    open = -1;
    dots[i].setAttribute('aria-expanded', 'false');
    rows.forEach((r) => r.classList.remove('is-active'));
    card.classList.remove('is-open');
    scrim.classList.remove('is-open');
    const done = () => { if (open !== i) { card.hidden = true; card.classList.remove('is-sheet'); } if (open < 0) scrim.hidden = true; };
    if (Wareef.reduced()) done(); else setTimeout(done, 380);
    if (focusBack) dots[i].focus({ preventScroll: true });
  };

  const show = (i, { focus = false } = {}) => {
    clearTimeout(hideTimer);
    if (open === i) return;
    if (open > -1) close();
    const card = cards[i];
    open = i;
    const sheet = mobile.matches;
    card.classList.toggle('is-sheet', sheet);
    card.hidden = false;
    dots[i].setAttribute('aria-expanded', 'true');
    rows.forEach((r) => r.classList.toggle('is-active', +r.dataset.spotLink === i));
    place(i);
    if (sheet) { scrim.hidden = false; }
    requestAnimationFrame(() => requestAnimationFrame(() => { card.classList.add('is-open'); if (sheet) scrim.classList.add('is-open'); }));
    if (focus || sheet) {
      const target = card.querySelector('a, [data-close]');
      if (target) setTimeout(() => target.focus({ preventScroll: true }), sheet ? 60 : 0);
    }
  };

  dots.forEach((dot, i) => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open === i && !finePointer.matches) close(); else show(i, { focus: e.detail === 0 });
    });
    dot.addEventListener('pointerenter', () => { if (!finePointer.matches || mobile.matches) return; clearTimeout(hideTimer); hoverTimer = setTimeout(() => show(i), 60); });
    dot.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); if (finePointer.matches && !mobile.matches) hideTimer = setTimeout(() => close(), 260); });
  });
  cards.forEach((card) => {
    card.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    card.addEventListener('pointerleave', () => { if (finePointer.matches && !mobile.matches) hideTimer = setTimeout(() => close(), 260); });
    card.addEventListener('click', (e) => e.stopPropagation());
  });
  rows.forEach((row) => {
    const i = +row.dataset.spotLink;
    row.addEventListener('click', () => (open === i ? close() : show(i, { focus: true })));
    row.addEventListener('pointerenter', () => { if (finePointer.matches && !mobile.matches) dots[i].classList.add('is-hint'); });
    row.addEventListener('pointerleave', () => dots[i].classList.remove('is-hint'));
  });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); close(true); }));

  document.addEventListener('click', () => close());
  document.addEventListener('keydown', (e) => {
    if (open < 0) return;
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    // Keep Tab inside the bottom sheet while it is modal.
    if (e.key === 'Tab' && cards[open].classList.contains('is-sheet')) {
      const f = [...cards[open].querySelectorAll('a, button')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  addEventListener('resize', () => { if (open > -1) { if (mobile.matches !== cards[open].classList.contains('is-sheet')) close(); else place(open); } }, { passive: true });
  addEventListener('scroll', () => { if (open > -1 && !mobile.matches && !stage.matches(':hover')) close(); }, { passive: true });
});
