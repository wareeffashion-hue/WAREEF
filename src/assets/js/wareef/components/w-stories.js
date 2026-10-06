// Wareef Stories viewer: fullscreen, auto-advancing story player built on demand and appended to <body>.
import { Wareef } from '../core.js';

const IMAGE_MS = 5000;
const HOLD_MS = 180;
const SEEN_KEY = 'w-stories-seen';

const icon = {
  close: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  muted: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  sound: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8.5a5 5 0 010 7M19.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } };
const markSeen = (src) => {
  try { const s = new Set(readSeen()); s.add(src); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-60))); } catch (e) { /* private mode */ }
};

Wareef.register('w-stories', (root) => {
  const thumbs = [...root.querySelectorAll('[data-story]')];
  if (!thumbs.length) return;
  const stories = thumbs.map((b) => ({ ...b.dataset }));
  const seen = readSeen();
  thumbs.forEach((b, i) => {
    if (seen.includes(stories[i].src)) b.classList.add('is-seen');
    b.addEventListener('click', () => open(i, b));
  });
  // Warm the first story so the first tap feels instant.
  root.addEventListener('pointerenter', () => { const im = new Image(); im.src = stories[0].src; }, { once: true, passive: true });

  const L = root.dataset;
  let viewer, els, index = 0, elapsed = 0, duration = IMAGE_MS, last = 0, raf = 0, paused = false, opener = null, muted = true;
  let restore = null, holdTimer = 0, held = false, start = null;

  function build() {
    const rtl = (document.documentElement.dir || getComputedStyle(document.documentElement).direction) === 'rtl';
    viewer = document.createElement('div');
    viewer.className = 'w-stories-viewer';
    viewer.dir = rtl ? 'rtl' : 'ltr';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.innerHTML = `
      <div class="w-stories-viewer__stage">
        <div class="w-stories-viewer__bars">${stories.map(() => '<span class="w-stories-viewer__bar"><i></i></span>').join('')}</div>
        <div class="w-stories-viewer__top">
          <span class="w-stories-viewer__who"><img alt="" width="36" height="36"><b></b></span>
          <span class="w-stories-viewer__tools">
            <button type="button" class="w-stories-viewer__btn" data-act="mute" hidden></button>
            <button type="button" class="w-stories-viewer__btn" data-act="pause" aria-label="${L.labelPause}">${icon.pause}</button>
            <button type="button" class="w-stories-viewer__btn" data-act="close" aria-label="${L.labelClose}">${icon.close}</button>
          </span>
        </div>
        <div class="w-stories-viewer__media" aria-live="polite"></div>
        <button type="button" class="w-stories-viewer__nav w-stories-viewer__nav--prev" data-act="prev" aria-label="${L.labelPrev}"></button>
        <button type="button" class="w-stories-viewer__nav w-stories-viewer__nav--next" data-act="next" aria-label="${L.labelNext}"></button>
        <div class="w-stories-viewer__foot"><a class="w-stories-viewer__cta" hidden><span></span>${icon.arrow}</a></div>
      </div>`;
    const q = (s) => viewer.querySelector(s);
    els = {
      stage: q('.w-stories-viewer__stage'), media: q('.w-stories-viewer__media'), bars: [...viewer.querySelectorAll('.w-stories-viewer__bar i')],
      who: q('.w-stories-viewer__who img'), name: q('.w-stories-viewer__who b'), cta: q('.w-stories-viewer__cta'),
      pause: q('[data-act="pause"]'), mute: q('[data-act="mute"]'), close: q('[data-act="close"]'),
    };
    viewer.addEventListener('click', onClick);
    els.stage.addEventListener('pointerdown', onDown);
    els.stage.addEventListener('pointerup', onUp);
    els.stage.addEventListener('pointercancel', onUp);
    els.stage.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(viewer);
  }

  function open(i, from) {
    if (!viewer) build();
    opener = from || document.activeElement;
    restore = { html: document.documentElement.style.overflow, body: document.body.style.overflow, pad: document.body.style.paddingInlineEnd };
    const sb = innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (sb > 0) document.body.style.paddingInlineEnd = `${sb}px`;
    viewer.classList.toggle('is-static', Wareef.reduced());
    viewer.hidden = false;
    requestAnimationFrame(() => viewer.classList.add('is-open'));
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    paused = false;
    show(i);
    els.close.focus({ preventScroll: true });
  }

  function close() {
    if (!viewer || viewer.hidden) return;
    cancelAnimationFrame(raf);
    const v = els.media.querySelector('video'); if (v) v.pause();
    viewer.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    const done = () => { viewer.hidden = true; els.media.innerHTML = ''; };
    if (Wareef.reduced()) done(); else setTimeout(done, 320);
    document.documentElement.style.overflow = restore.html;
    document.body.style.overflow = restore.body;
    document.body.style.paddingInlineEnd = restore.pad;
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  function show(i) {
    if (i < 0) i = 0;
    if (i >= stories.length) { close(); return; }
    index = i;
    const s = stories[i];
    viewer.setAttribute('aria-label', s.title || L.labelPlay);
    els.bars.forEach((b, k) => { b.style.transform = `scaleX(${k < i ? 1 : 0})`; });
    els.who.src = s.thumb || s.src;
    els.name.textContent = s.title || '';
    if (s.href) { els.cta.hidden = false; els.cta.href = s.href; els.cta.querySelector('span').textContent = s.cta; } else els.cta.hidden = true;

    els.media.innerHTML = '';
    elapsed = 0; duration = IMAGE_MS;
    let node;
    if (s.video) {
      node = document.createElement('video');
      Object.assign(node, { src: s.video, muted, playsInline: true, autoplay: true, preload: 'auto', poster: s.src });
      node.setAttribute('playsinline', '');
      node.addEventListener('loadedmetadata', () => { if (isFinite(node.duration) && node.duration > 0) duration = node.duration * 1000; });
      node.addEventListener('waiting', () => { node.dataset.buffering = '1'; });
      node.addEventListener('playing', () => { delete node.dataset.buffering; });
      node.addEventListener('ended', () => show(index + 1));
      node.addEventListener('error', () => { node.replaceWith(img(s.src)); });
      els.mute.hidden = false;
      setMuteIcon();
    } else {
      node = img(s.src);
      els.mute.hidden = true;
    }
    els.media.appendChild(node);
    if (!paused && s.video) node.play().catch(() => {});
    thumbs[i].classList.add('is-seen');
    markSeen(s.src);
    preload(i + 1);
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function img(src) {
    const im = document.createElement('img');
    im.src = src; im.alt = ''; im.decoding = 'async';
    return im;
  }

  function preload(i) {
    const s = stories[i];
    if (!s) return;
    if (s.video) { const v = document.createElement('video'); v.preload = 'metadata'; v.src = s.video; }
    const im = new Image(); im.src = s.src;
  }

  function tick(now) {
    const dt = now - last; last = now;
    const video = els.media.querySelector('video');
    if (!paused) {
      if (video) { if (!video.dataset.buffering && duration) elapsed = video.currentTime * 1000; }
      else elapsed += dt;
    }
    const k = Math.min(1, elapsed / duration);
    if (els.bars[index]) els.bars[index].style.transform = `scaleX(${k})`;
    if (!video && k >= 1) { show(index + 1); return; }
    raf = requestAnimationFrame(tick);
  }

  function setPaused(p) {
    paused = p;
    viewer.classList.toggle('is-paused', p);
    els.pause.innerHTML = p ? icon.play : icon.pause;
    els.pause.setAttribute('aria-label', p ? L.labelPlay : L.labelPause);
    const v = els.media.querySelector('video');
    if (v) { if (p) v.pause(); else v.play().catch(() => {}); }
  }

  function setMuteIcon() {
    els.mute.innerHTML = muted ? icon.muted : icon.sound;
    els.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    els.mute.setAttribute('aria-pressed', String(!muted));
  }

  const isRTL = () => viewer.dir === 'rtl';
  // "Forward" follows reading direction: in RTL the left side advances.
  const step = (forward) => show(index + (forward ? 1 : -1));

  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (!act) { if (e.target === viewer) close(); return; }
    const a = act.dataset.act;
    if (a === 'close') close();
    else if (a === 'pause') setPaused(!paused);
    else if (a === 'mute') { muted = !muted; const v = els.media.querySelector('video'); if (v) v.muted = muted; setMuteIcon(); }
    else if (a === 'next' || a === 'prev') {
      // Pointer taps are handled in onUp; this branch serves keyboard activation (Enter/Space on the zones).
      if (e.detail === 0) step(a === 'next');
    }
  }

  function onDown(e) {
    if (e.target.closest('a, [data-act="close"], [data-act="pause"], [data-act="mute"]')) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now() };
    held = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { held = true; setPaused(true); }, HOLD_MS);
  }

  function onUp(e) {
    if (!start) return;
    clearTimeout(holdTimer);
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const s = start; start = null;
    if (e.type === 'pointercancel') { if (held) setPaused(false); return; }
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
    if (held) { setPaused(false); if (Math.abs(dx) < 40) return; }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      // Swiping toward the reading direction's start goes forward (like turning a page).
      step(isRTL() ? dx > 0 : dx < 0);
      return;
    }
    if (performance.now() - s.t > 600) return;
    const r = els.stage.getBoundingClientRect();
    const leftHalf = e.clientX - r.left < r.width * 0.4;
    const rightHalf = e.clientX - r.left > r.width * 0.6;
    if (!leftHalf && !rightHalf) { step(true); return; }
    step(isRTL() ? leftHalf : rightHalf);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step((e.key === 'ArrowLeft') === isRTL()); }
    else if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); setPaused(!paused); }
    else if (e.key === 'Tab') {
      const f = [...viewer.querySelectorAll('button:not([hidden]), a[href]:not([hidden])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      else if (!viewer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  }

  function onVisibility() { if (document.hidden && !paused) setPaused(true); }
});
