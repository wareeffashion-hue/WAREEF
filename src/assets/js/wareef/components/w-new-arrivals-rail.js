// Wareef — new arrivals rail: our round prev/next buttons drive the Salla products slider (Swiper),
// falling back to scrolling whatever horizontal container the slider renders.
import { Wareef } from '../core.js';

Wareef.register('w-new-arrivals-rail', (root) => {
  const rail = root.querySelector('.w-new-arrivals-rail__rail');
  const swiper = () => { const el = rail.querySelector('.swiper'); return el && el.swiper; };
  const scroller = () => [rail, ...rail.querySelectorAll('*')].find((el) => el.scrollWidth > el.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowX));
  const go = (dir) => {
    const s = swiper();
    if (s) { dir > 0 ? s.slideNext() : s.slidePrev(); return; }
    const sc = scroller();
    if (!sc) return;
    const rtl = getComputedStyle(sc).direction === 'rtl';
    sc.scrollBy({ left: dir * (rtl ? -1 : 1) * sc.clientWidth * 0.8, behavior: Wareef.reduced() ? 'auto' : 'smooth' });
  };
  root.querySelector('[data-rail="prev"]')?.addEventListener('click', () => go(-1));
  root.querySelector('[data-rail="next"]')?.addEventListener('click', () => go(1));
});
