// Wareef — brand story: the timeline line fills as the section scrolls through the viewport,
// milestones light up once the fill reaches them.
import { Wareef } from '../core.js';

Wareef.register('w-brand-story', (root) => {
  const list = root.querySelector('.w-brand-story__list');
  const items = [...root.querySelectorAll('.w-brand-story__item')];
  if (!list || !items.length) return;
  if (Wareef.reduced()) { root.style.setProperty('--w-bs-p', 1); items.forEach((i) => i.classList.add('is-on')); return; }
  const vertical = matchMedia('(max-width: 767px)');
  let raf = 0, visible = false;
  const update = () => {
    raf = 0;
    const r = list.getBoundingClientRect(), vh = innerHeight;
    // 0 when the list top reaches 80% of the viewport, 1 when its bottom reaches 55% (vertical) / 45% (horizontal).
    const startY = vh * 0.8, endY = vertical.matches ? vh * 0.55 : vh * 0.45;
    const span = vertical.matches ? r.height + startY - endY : Math.max(1, startY - endY + r.height * 0.6);
    const p = Math.min(1, Math.max(0, (startY - r.top) / span));
    root.style.setProperty('--w-bs-p', p.toFixed(4));
    const n = items.length;
    items.forEach((el, i) => {
      const at = vertical.matches ? (el.offsetTop + 10) / list.offsetHeight : (n === 1 ? 0 : (i + 0.5) / n);
      el.classList.toggle('is-on', p >= at - 0.001);
    });
  };
  const queue = () => { if (visible && !raf) raf = requestAnimationFrame(update); };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; queue(); }, { rootMargin: '10% 0px' }).observe(root);
  } else visible = true;
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  update();
});

if (document.readyState !== 'loading') Wareef.mount();
