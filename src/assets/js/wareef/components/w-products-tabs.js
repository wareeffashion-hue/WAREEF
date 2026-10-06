// Wareef — products tabs: animated underline that follows the active tab, ARIA state and arrow-key navigation.
// Panel switching itself is done by core's data-w-tabs.
import { Wareef } from '../core.js';

Wareef.register('w-products-tabs', (root) => {
  const list = root.querySelector('[role="tablist"]');
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const ink = list.querySelector('.w-products-tabs__ink');
  const sync = () => {
    const active = tabs.find((t) => t.classList.contains('is-active')) || tabs[0];
    tabs.forEach((t) => { const on = t === active; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
    if (ink && active) { ink.style.setProperty('--l', `${active.offsetLeft}px`); ink.style.setProperty('--w', `${active.offsetWidth}px`); }
  };
  tabs.forEach((t) => t.addEventListener('click', () => {
    requestAnimationFrame(sync);
    t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: Wareef.reduced() ? 'auto' : 'smooth' });
  }));
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const rtl = getComputedStyle(list).direction === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    let n = step === undefined ? (e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1) : (i + step + tabs.length) % tabs.length;
    if (n < 0) return;
    e.preventDefault(); tabs[n].focus(); tabs[n].click();
  });
  sync();
  // Fonts and lazy content can change widths after first paint.
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(list);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
});
