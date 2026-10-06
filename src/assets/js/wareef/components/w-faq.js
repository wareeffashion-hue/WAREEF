// Wareef FAQ: smooth open/close for native <details>; without JS the accordion still works.
import { Wareef } from '../core.js';

Wareef.register('w-faq', (root) => {
  root.querySelectorAll('details.w-faq__item').forEach((d) => {
    const summary = d.querySelector('summary');
    const panel = d.querySelector('.w-faq__a');
    if (!summary || !panel) return;
    let anim = null;
    summary.addEventListener('click', (e) => {
      if (Wareef.reduced() || !panel.animate) return; // native toggle
      e.preventDefault();
      const opening = !d.open || d.classList.contains('is-closing');
      if (anim) anim.cancel();
      const from = panel.offsetHeight;
      if (opening) {
        d.open = true; d.classList.remove('is-closing'); d.classList.add('is-opening');
        const to = panel.scrollHeight;
        anim = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
        anim.onfinish = () => { d.classList.remove('is-opening'); anim = null; };
      } else {
        d.classList.add('is-closing');
        anim = panel.animate([{ height: `${from}px` }, { height: '0px' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
        anim.onfinish = () => { d.open = false; d.classList.remove('is-closing'); anim = null; };
      }
      summary.setAttribute('aria-expanded', String(opening));
    });
    summary.setAttribute('aria-expanded', String(d.open));
  });
});
