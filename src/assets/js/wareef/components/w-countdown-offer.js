// Wareef — countdown offer: hide the timer when the end date is missing, invalid or already passed.
// Ticking and the flip (.w-tick) are handled by core's data-w-countdown.
import { Wareef } from '../core.js';

Wareef.register('w-countdown-offer', (root) => {
  const timer = root.querySelector('[data-w-countdown]');
  if (!timer) return;
  const end = Date.parse(timer.dataset.wCountdown);
  if (!end || end <= Date.now()) timer.classList.add('is-over');
});
