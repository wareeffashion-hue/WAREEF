// Wareef — video feature: MP4 plays inline (muted, looped) on click or when in view (autoplay switch);
// YouTube opens in a lightbox whose iframe is only created on click.
import { Wareef } from '../core.js';

const ytId = (url) => {
  const m = String(url).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : '';
};

function lightbox(id, label, opener) {
  const box = document.createElement('div');
  box.className = 'w-vf-lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `<button type="button" class="w-vf-lightbox__close" aria-label="${label}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.4" fill="none"/></svg></button>
    <div class="w-vf-lightbox__frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  const close = () => {
    box.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    setTimeout(() => box.remove(), 400);
    opener.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'Tab') { e.preventDefault(); box.querySelector('button').focus(); } };
  box.addEventListener('click', (e) => { if (!e.target.closest('.w-vf-lightbox__frame')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
  document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => box.classList.add('is-open'));
  box.querySelector('button').focus();
}

Wareef.register('w-video-feature', (root) => {
  const src = (root.dataset.src || '').trim();
  const btn = root.querySelector('.w-video-feature__play');
  const stage = root.querySelector('.w-video-feature__stage');
  if (!btn || !stage) return;
  // Fit the ring caption to the circle (2πr ≈ 490 in the SVG's units) without letter-spacing, which breaks Arabic joining.
  const ring = root.querySelector('.w-video-feature__ring text');
  if (ring && ring.getComputedTextLength) {
    const len = ring.getComputedTextLength();
    if (len > 0) ring.style.fontSize = `${Math.min(18, Math.max(8, 13 * 482 / len)).toFixed(2)}px`;
  }
  if (!src) { btn.setAttribute('aria-disabled', 'true'); return; }
  const yt = ytId(src);
  const labels = btn.dataset;

  if (yt) {
    btn.addEventListener('click', () => lightbox(yt, labels.labelClose || 'Close', btn));
    return;
  }

  let video;
  const ensure = () => {
    if (video) return video;
    video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto', src });
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.className = 'w-video-feature__video';
    stage.insertBefore(video, btn);
    return video;
  };
  const set = (playing) => {
    root.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', playing ? labels.labelPause : labels.labelPlay);
  };
  const play = () => { const v = ensure(); const p = v.play(); set(true); if (p && p.catch) p.catch(() => set(false)); };
  const pause = () => { if (video) video.pause(); set(false); };
  let userPaused = false;
  btn.addEventListener('click', () => { if (root.classList.contains('is-playing')) { userPaused = true; pause(); } else { userPaused = false; play(); } });

  if (root.dataset.autoplay === '1' && !Wareef.reduced() && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) { if (!userPaused) play(); } else if (video && !video.paused) { video.pause(); set(false); }
    }, { threshold: 0.35 }).observe(stage);
  }
});

if (document.readyState !== 'loading') Wareef.mount();
