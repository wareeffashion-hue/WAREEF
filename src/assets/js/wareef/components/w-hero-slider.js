// Wareef — editorial hero slider: crossfade + scale, per-slide progress bars that drive autoplay,
// swipe, keyboard arrows (RTL-aware), pause on hover / hidden tab / off-screen.
import { Wareef } from '../core.js';

Wareef.register('w-hero-slider', (root) => {
  const slides = [...root.querySelectorAll('.w-hero-slider__slide')];
  const bars = [...root.querySelectorAll('.w-hero-slider__bar')];
  const counter = root.querySelector('[data-current]');
  if (slides.length < 2) return;
  const rtl = (root.closest('[dir]') || document.documentElement).getAttribute('dir') === 'rtl';
  const auto = root.dataset.autoplay !== '0' && !Wareef.reduced();
  const ms = (parseFloat(root.dataset.interval) || 6) * 1000;
  let idx = 0, timer = 0, left = ms, startedAt = 0;
  const holds = new Set();
  const pad = (n) => String(n).padStart(2, '0');

  const go = (n) => {
    const next = (n + slides.length) % slides.length;
    if (next === idx) return;
    slides[idx].classList.remove('is-active');
    slides[idx].classList.add('is-leaving');
    const prev = slides[idx];
    setTimeout(() => prev.classList.remove('is-leaving'), 1400);
    idx = next;
    slides.forEach((s, i) => {
      const on = i === idx;
      s.classList.toggle('is-active', on);
      s.toggleAttribute('aria-hidden', !on);
      s.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', on ? '0' : '-1'));
      const img = s.querySelector('img[loading="lazy"]');
      if (on && img) img.loading = 'eager';
    });
    // Warm up the following slide's image.
    const after = slides[(idx + 1) % slides.length].querySelector('img[loading="lazy"]');
    if (after) after.loading = 'eager';
    bars.forEach((b, i) => {
      b.classList.toggle('is-done', i < idx);
      b.classList.remove('is-active');
      b.toggleAttribute('aria-current', i === idx);
    });
    void root.offsetWidth; // restart the fill animation
    bars[idx] && bars[idx].classList.add('is-active');
    if (counter) counter.textContent = pad(idx + 1);
    left = ms; schedule();
  };

  const schedule = () => {
    clearTimeout(timer);
    if (!auto || holds.size) return;
    startedAt = performance.now();
    timer = setTimeout(() => go(idx + 1), left);
  };
  const hold = (why) => {
    if (holds.has(why)) return;
    if (!holds.size && auto) { clearTimeout(timer); left = Math.max(0, left - (performance.now() - startedAt)); }
    holds.add(why); root.classList.add('is-paused');
  };
  const release = (why) => {
    if (!holds.delete(why) || holds.size) return;
    root.classList.remove('is-paused'); schedule();
  };

  if (!auto) root.classList.add('is-static');
  bars.forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));
  const prevBtn = root.querySelector('[data-prev]'), nextBtn = root.querySelector('[data-next]');
  prevBtn && prevBtn.addEventListener('click', () => go(idx - 1));
  nextBtn && nextBtn.addEventListener('click', () => go(idx + 1));

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const forward = (e.key === 'ArrowLeft') === rtl;
    e.preventDefault(); go(idx + (forward ? 1 : -1));
  });

  if (matchMedia('(hover: hover)').matches) {
    root.addEventListener('mouseenter', () => hold('hover'));
    root.addEventListener('mouseleave', () => release('hover'));
  }
  root.addEventListener('focusin', () => hold('focus'));
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) release('focus'); });
  document.addEventListener('visibilitychange', () => (document.hidden ? hold('tab') : release('tab')));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => (en.isIntersecting ? release('view') : hold('view')), { threshold: 0.2 }).observe(root);
  }

  // Swipe (touch / pen); a mostly-horizontal drag over 50px changes slide.
  let sx = 0, sy = 0, tracking = false;
  root.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; tracking = true; sx = e.clientX; sy = e.clientY; }, { passive: true });
  root.addEventListener('pointerup', (e) => {
    if (!tracking) return; tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    // Content flows in reading direction: in RTL a swipe to the right brings the next slide.
    go(idx + ((dx < 0) !== rtl ? 1 : -1));
  }, { passive: true });
  root.addEventListener('pointercancel', () => { tracking = false; }, { passive: true });

  root.classList.add('is-ready');
  schedule();
});

// Mount now if the core already ran before this module registered.
if (document.readyState !== 'loading') Wareef.mount();
