// «خطّان… وبداية عالم أرسلان» — 1080×1920 Snapchat story animation.
// Everything is drawn from a single deterministic render(t) so frames can be captured one by one.
'use strict';

const DURATION = 52;
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('v');

// ---------- helpers ----------
function E(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}
function S(e, attrs) { for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eio = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eo = t => 1 - Math.pow(1 - t, 3);
const ei = t => t * t * t;
const back = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const elastic = t => (t === 0 || t === 1) ? t : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
const fade = (t, a, b, c, d) => seg(t, a, b) * (1 - seg(t, c, d)); // in a→b, out c→d
const tr = (x, y, s = 1, r = 0) => `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${r.toFixed(2)}) scale(${(+s).toFixed(4)})`;
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function smooth(pts) { // Catmull-Rom → cubic bezier
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
function starD(r1, r2, n = 5) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI / n;
    d += (i ? 'L' : 'M') + (r * Math.cos(a)).toFixed(1) + ' ' + (r * Math.sin(a)).toFixed(1);
  }
  return d + 'Z';
}
const cloudD = 'M-120 40 C-160 40 -165 -10 -125 -18 C-130 -60 -75 -80 -48 -50 C-35 -95 35 -100 50 -55 C80 -85 135 -60 122 -15 C165 -10 160 40 120 40 Z';

const C = {
  cream: '#FBF6EE', blue: '#6E95BA', blueD: '#4F74A0', blueL: '#BFD4E6', sand: '#E8C39A', sandD: '#D7A878',
  gold: '#F4CF86', rose: '#E9A6B0', skin: '#F5D6BE', skinD: '#E9BDA0', hijab: '#EFD8CF', hijabD: '#DDBDB1',
  dress: '#CFA09A', dressD: '#B9857F', ink: '#5A3E36', night: '#2E3F6B'
};

// ---------- defs ----------
const defs = E('defs', {}, svg);
function lin(id, stops, x2 = 0, y2 = 1, x1 = 0, y1 = 0) {
  const g = E('linearGradient', { id, x1, y1, x2, y2 }, defs);
  stops.forEach(([o, c, op = 1]) => E('stop', { offset: o, 'stop-color': c, 'stop-opacity': op }, g));
  return g;
}
function rad(id, stops, cx = 0.5, cy = 0.5, r = 0.5, fx, fy) {
  const g = E('radialGradient', { id, cx, cy, r, fx: fx ?? cx, fy: fy ?? cy }, defs);
  stops.forEach(([o, c, op = 1]) => E('stop', { offset: o, 'stop-color': c, 'stop-opacity': op }, g));
  return g;
}
rad('bgCream', [[0, '#FFFBF4'], [0.7, '#F8EFE2'], [1, '#EFE2D0']], 0.5, 0.45, 0.75);
lin('night', [[0, '#26345C'], [0.55, '#4A5E96'], [1, '#8FA6D3']]);
rad('pearl', [[0, '#FFFFFF'], [0.55, '#EEEAF4'], [1, '#C8C0DA']], 0.5, 0.5, 0.5, 0.35, 0.3);
rad('pBlue', [[0, '#E3EEF8'], [0.6, '#A9C4E0'], [1, '#7C9FC6']], 0.5, 0.5, 0.5, 0.35, 0.3);
rad('pPink', [[0, '#FFF0F0'], [0.6, '#F3C6CB'], [1, '#DDA0AA']], 0.5, 0.5, 0.5, 0.35, 0.3);
rad('pSand', [[0, '#FFF5E6'], [0.6, '#F1D2A6'], [1, '#D9AF7C']], 0.5, 0.5, 0.5, 0.35, 0.3);
rad('ball', [[0, '#FFFFFF'], [0.35, '#FFF3D6'], [0.7, '#BFD4E6'], [1, '#8FB0D3', 0]], 0.5, 0.5, 0.5);
rad('sonar', [[0, '#35507E'], [0.7, '#1D2E4F'], [1, '#132038']], 0.5, 0.55, 0.6);
lin('wedge', [[0, '#9FC3E8', 0.55], [1, '#9FC3E8', 0]], 0, 1, 0, 0);
lin('silk', [[0, '#F6DDE3'], [0.35, '#FBEFEA'], [0.65, '#E3ECF8'], [1, '#F2E6F2']], 1, 1, 0, 0);
lin('sheen', [[0, '#FFFFFF', 0], [0.5, '#FFFFFF', 0.55], [1, '#FFFFFF', 0]], 1, 0, 0, 0);
rad('burstBg', [[0, '#FFFDF6'], [0.45, '#FFF0CF'], [1, '#F6D9B8']], 0.5, 0.45, 0.8);
rad('bubble', [[0, '#FFFFFF', 0.95], [0.55, '#F7E6EE', 0.95], [0.85, '#DCE8F7', 0.96], [1, '#C9D9F0', 1]], 0.5, 0.5, 0.5, 0.4, 0.35);
rad('glowSpot', [[0, '#FFF6DC', 0.95], [1, '#FFF6DC', 0]]);
rad('bellyGlow', [[0, '#FFE9B8', 0.9], [0.6, '#FFE9B8', 0.25], [1, '#FFE9B8', 0]]);
lin('blanket', [[0, '#A9C4E0'], [1, '#6E95BA']], 1, 1);
rad('bokeh', [[0, '#FFFFFF', 0.8], [1, '#FFFFFF', 0]]);
lin('vign', [[0, '#000', 0], [1, '#000', 0]]);

const glow = E('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
E('feGaussianBlur', { stdDeviation: 7, result: 'b' }, glow);
const gm = E('feMerge', {}, glow); E('feMergeNode', { in: 'b' }, gm); E('feMergeNode', { in: 'b' }, gm); E('feMergeNode', { in: 'SourceGraphic' }, gm);
const soft = E('filter', { id: 'soft', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
E('feDropShadow', { dx: 0, dy: 10, stdDeviation: 14, 'flood-color': '#8A6A55', 'flood-opacity': 0.22 }, soft);
const blur = E('filter', { id: 'blur', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
E('feGaussianBlur', { stdDeviation: 18 }, blur);

// ---------- reusable pieces ----------
const LION = { w: 547, h: 508, eyeL: [170, 262], eyeR: [338, 295], face: '#F7D9B6' };
function makeLion(parent) { // origin at image centre
  const g = E('g', {}, parent);
  const inner = E('g', {}, g);
  E('image', { href: 'assets/lion.png', x: -LION.w / 2, y: -LION.h / 2, width: LION.w, height: LION.h }, inner);
  const lids = E('g', { opacity: 0 }, inner);
  for (const [ex, ey] of [LION.eyeL, LION.eyeR]) {
    const x = ex - LION.w / 2, y = ey - LION.h / 2;
    E('ellipse', { cx: x, cy: y, rx: 37, ry: 38, fill: LION.face }, lids);
    E('path', { d: `M${x - 24} ${y - 2} Q${x} ${y + 20} ${x + 24} ${y - 2}`, fill: 'none', stroke: '#4A3228', 'stroke-width': 7, 'stroke-linecap': 'round' }, lids);
  }
  return { g, inner, lids };
}
function star(parent, r, fill, stitch = true) {
  const g = E('g', {}, parent);
  E('path', { d: starD(r, r * 0.5), fill, stroke: fill, 'stroke-width': r * 0.28, 'stroke-linejoin': 'round' }, g);
  if (stitch) E('path', { d: starD(r * 0.78, r * 0.4), fill: 'none', stroke: '#FFFFFF', 'stroke-width': Math.max(2, r * 0.06), 'stroke-dasharray': `${r * 0.12} ${r * 0.1}`, 'stroke-linejoin': 'round', opacity: 0.8 }, g);
  return g;
}
function planet(parent, r, grad, ring) {
  const g = E('g', {}, parent);
  if (ring) E('ellipse', { cx: 0, cy: 0, rx: r * 1.7, ry: r * 0.42, fill: 'none', stroke: ring, 'stroke-width': r * 0.14, transform: 'rotate(-18)', opacity: 0.9 }, g);
  E('circle', { r, fill: `url(#${grad})` }, g);
  E('circle', { cx: -r * 0.35, cy: -r * 0.35, r: r * 0.18, fill: '#FFFFFF', opacity: 0.7 }, g);
  if (ring) E('path', { d: `M${-r * 1.7} 0 A${r * 1.7} ${r * 0.42} 0 0 0 ${r * 1.7} 0`, fill: 'none', stroke: ring, 'stroke-width': r * 0.14, transform: 'rotate(-18)' }, g);
  return g;
}
function cloud(parent, s, fill = '#FFFFFF') {
  const g0 = E('g', {}, parent);
  const g = E('g', { transform: `scale(${s})` }, g0);
  E('path', { d: cloudD, fill }, g);
  E('path', { d: 'M-100 22 C-60 30 60 30 100 22', fill: 'none', stroke: '#D5DDEB', 'stroke-width': 4, 'stroke-dasharray': '10 8', 'stroke-linecap': 'round' }, g);
  return g0;
}
function crescent(parent, r, fill = '#F4D9A0') {
  const g = E('g', {}, parent);
  E('path', { d: `M0 ${-r} A${r} ${r} 0 1 0 0 ${r} A${r * 0.78} ${r * 0.78} 0 1 1 0 ${-r} Z`, fill, transform: 'rotate(-60)' }, g);
  return g;
}
function balloon(parent, s, fill) {
  const g = E('g', { }, parent);
  const b = E('g', { transform: `scale(${s})` }, g);
  E('path', { d: 'M0 60 Q-6 110 6 160', fill: 'none', stroke: '#B9A99A', 'stroke-width': 3 }, b);
  E('ellipse', { cx: 0, cy: 0, rx: 46, ry: 56, fill }, b);
  E('path', { d: 'M-6 54 L6 54 L0 64 Z', fill }, b);
  E('ellipse', { cx: -16, cy: -20, rx: 9, ry: 15, fill: '#FFFFFF', opacity: 0.55, transform: 'rotate(20 -16 -20)' }, b);
  return g;
}
function ribbon(parent, s, fill) {
  const g = E('g', {}, parent);
  E('path', { d: 'M-60 0 C-30 -40 0 40 30 0 S 80 -30 90 0', fill: 'none', stroke: fill, 'stroke-width': 16 * s, 'stroke-linecap': 'round', transform: `scale(${s})` }, g);
  return g;
}
function pearl(parent, r) { const g = E('g', {}, parent); E('circle', { r, fill: 'url(#pearl)' }, g); E('circle', { cx: -r * 0.3, cy: -r * 0.35, r: r * 0.22, fill: '#fff', opacity: 0.9 }, g); return g; }
function pawPrint(parent, s, fill) {
  const g = E('g', { transform: `scale(${s})` }, parent);
  E('ellipse', { cx: 0, cy: 18, rx: 34, ry: 28, fill }, g);
  [[-34, -18], [-12, -36], [12, -36], [34, -18]].forEach(([x, y]) => E('ellipse', { cx: x, cy: y, rx: 12, ry: 15, fill }, g));
  return g;
}
function hand(parent, fill = C.skin) { // simple mitten hand, origin at palm centre, fingers pointing up
  const g = E('g', {}, parent);
  E('path', { d: 'M-34 30 C-40 0 -38 -34 -26 -44 C-14 -54 18 -54 28 -40 C38 -26 38 10 30 30 C20 44 -24 44 -34 30 Z', fill }, g);
  E('ellipse', { cx: -36, cy: -2, rx: 12, ry: 22, fill, transform: 'rotate(-25 -36 -2)' }, g);
  return g;
}
function thread(parent) { // glowing blue thread: under-glow + core + highlight
  const g = E('g', { filter: 'url(#glow)' }, parent);
  const a = E('path', { fill: 'none', stroke: '#8DB8E6', 'stroke-width': 11, 'stroke-linecap': 'round', opacity: 0.55, pathLength: 1 }, g);
  const b = E('path', { fill: 'none', stroke: C.blue, 'stroke-width': 6, 'stroke-linecap': 'round', pathLength: 1 }, g);
  const c = E('path', { fill: 'none', stroke: '#F2F8FF', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.85, pathLength: 1 }, g);
  return {
    g,
    set(d, from = 0, to = 1) {
      for (const p of [a, b, c]) {
        p.setAttribute('d', d);
        const len = Math.max(0, to - from);
        p.setAttribute('stroke-dasharray', `${len} 2`);
        p.setAttribute('stroke-dashoffset', `${-from}`);
      }
    }
  };
}

// Mother, origin at belly centre. Parts are returned for animation.
function makeMother(parent, holding = false) {
  const g = E('g', {}, parent);
  E('path', { d: 'M-150 -330 C-230 -260 -260 -120 -270 40 C-280 250 -300 420 -330 900 L330 900 C300 420 280 250 270 40 C260 -120 230 -260 150 -330 Z', fill: C.dress }, g);
  E('path', { d: 'M-110 -300 C-60 -260 60 -260 110 -300 L 150 -220 C 60 -170 -60 -170 -150 -220 Z', fill: C.dressD, opacity: 0.35 }, g);
  const belly = E('g', {}, g);
  E('ellipse', { cx: 0, cy: 0, rx: 150, ry: 140, fill: '#D6A8A1' }, belly);
  E('ellipse', { cx: -40, cy: -40, rx: 70, ry: 55, fill: '#E3BDB6', opacity: 0.8 }, belly);
  E('path', { d: 'M-120 70 C-60 130 60 130 120 70', fill: 'none', stroke: C.dressD, 'stroke-width': 5, opacity: 0.45, 'stroke-linecap': 'round' }, belly);
  const bellyFx = E('g', {}, belly);
  // head & hijab
  const head = E('g', { transform: 'translate(0 -420)' }, g);
  E('path', { d: 'M-128 10 C-140 -100 -80 -150 0 -150 C80 -150 140 -100 128 10 C150 90 190 120 210 140 L-210 140 C-190 120 -150 90 -128 10 Z', fill: C.hijab }, head);
  E('path', { d: 'M-120 40 C-110 110 -60 140 0 140 C60 140 110 110 120 40', fill: 'none', stroke: C.hijabD, 'stroke-width': 8, opacity: 0.6 }, head);
  E('ellipse', { cx: 0, cy: 0, rx: 84, ry: 98, fill: C.skin }, head);
  E('path', { d: 'M-92 -20 C-90 -95 -45 -118 0 -118 C45 -118 90 -95 92 -20 C80 -70 40 -92 0 -92 C-40 -92 -80 -70 -92 -20 Z', fill: C.hijabD }, head);
  E('circle', { cx: -48, cy: 30, r: 16, fill: '#F2A9A0', opacity: 0.45 }, head);
  E('circle', { cx: 48, cy: 30, r: 16, fill: '#F2A9A0', opacity: 0.45 }, head);
  const eyesClosed = E('g', {}, head);
  E('path', { d: 'M-50 2 Q-32 16 -14 2', fill: 'none', stroke: C.ink, 'stroke-width': 6, 'stroke-linecap': 'round' }, eyesClosed);
  E('path', { d: 'M14 2 Q32 16 50 2', fill: 'none', stroke: C.ink, 'stroke-width': 6, 'stroke-linecap': 'round' }, eyesClosed);
  const eyesOpen = E('g', { opacity: 0 }, head);
  for (const x of [-32, 32]) {
    E('ellipse', { cx: x, cy: 2, rx: 11, ry: 14, fill: C.ink }, eyesOpen);
    E('circle', { cx: x + 4, cy: -3, r: 4, fill: '#fff' }, eyesOpen);
    E('rect', { x: x - 5, y: 6, width: 3, height: 7, rx: 1.5, fill: '#E58FA0' }, eyesOpen); // tiny reflected line
    E('rect', { x: x + 1, y: 6, width: 3, height: 7, rx: 1.5, fill: '#E58FA0' }, eyesOpen);
  }
  E('path', { d: 'M-20 46 Q0 64 20 46', fill: 'none', stroke: '#C4706B', 'stroke-width': 6, 'stroke-linecap': 'round' }, head);
  // arms
  const armR = E('g', {}, g); // screen-right arm: rests on belly
  const armRPath = E('path', { fill: 'none', stroke: C.dress, 'stroke-width': 76, 'stroke-linecap': 'round' }, armR);
  const handR = E('g', {}, armR); hand(handR);
  const armL = E('g', {}, g); // screen-left arm: holds the test / baby
  const armLPath = E('path', { fill: 'none', stroke: C.dress, 'stroke-width': 76, 'stroke-linecap': 'round' }, armL);
  const handL = E('g', {}, armL); hand(handL);
  return { g, belly, bellyFx, head, eyesClosed, eyesOpen, armRPath, handR, armLPath, handL, armL, armR };
}
function setArm(path, handG, sx, sy, hx, hy, bend, rot = 0, hs = 1) {
  const mx = (sx + hx) / 2 + bend[0], my = (sy + hy) / 2 + bend[1];
  path.setAttribute('d', `M${sx} ${sy} Q${mx} ${my} ${hx} ${hy}`);
  handG.setAttribute('transform', tr(hx, hy, hs, rot));
}
function babyBundle(parent) {
  const g = E('g', {}, parent);
  E('path', { d: 'M-190 20 C-200 -70 -120 -120 -40 -110 C40 -140 170 -90 190 0 C205 80 120 120 0 115 C-110 118 -185 90 -190 20 Z', fill: 'url(#blanket)' }, g);
  E('path', { d: 'M-150 40 C-60 80 60 80 150 30', fill: 'none', stroke: '#DCE8F5', 'stroke-width': 10, 'stroke-linecap': 'round', opacity: 0.8 }, g);
  E('path', { d: 'M-140 70 C-60 100 60 100 130 60', fill: 'none', stroke: '#DCE8F5', 'stroke-width': 4, 'stroke-dasharray': '12 10', opacity: 0.8 }, g);
  const face = E('g', { transform: 'translate(-80 -40)' }, g);
  E('circle', { r: 70, fill: '#8FB0D3' }, face);
  E('circle', { cx: 6, cy: 6, r: 56, fill: C.skin }, face);
  E('path', { d: 'M-12 2 Q-2 10 8 2 M24 2 Q34 10 44 2', fill: 'none', stroke: C.ink, 'stroke-width': 4.5, 'stroke-linecap': 'round' }, face);
  E('circle', { cx: -12, cy: 24, r: 9, fill: '#F2A9A0', opacity: 0.5 }, face);
  E('circle', { cx: 44, cy: 24, r: 9, fill: '#F2A9A0', opacity: 0.5 }, face);
  E('path', { d: 'M10 30 Q16 36 22 30', fill: 'none', stroke: '#C4706B', 'stroke-width': 4, 'stroke-linecap': 'round' }, face);
  E('path', { d: 'M-60 -40 C-30 -80 40 -80 62 -30 C30 -52 -20 -56 -60 -40 Z', fill: C.blueL }, face);
  return g;
}

// ---------- scene graph ----------
const bg = E('rect', { width: 1080, height: 1920, fill: 'url(#bgCream)' }, svg);
const nightBg = E('rect', { width: 1080, height: 1920, fill: 'url(#night)', opacity: 0 }, svg);

// SCENE 1 — test strip close-up
const s1 = E('g', {}, svg);
const close = E('g', {}, s1);
function closeupContent(parent) {
  const g = E('g', {}, parent);
  E('path', { d: 'M-470 420 C-470 250 -420 170 -380 120 L-240 220 C-270 280 -300 360 -300 420 Z', fill: C.dress }, g);
  E('path', { d: 'M470 420 C470 250 420 170 380 120 L240 220 C270 280 300 360 300 420 Z', fill: C.dress }, g);
  E('ellipse', { cx: -330, cy: 90, rx: 150, ry: 118, fill: C.skin }, g);
  E('ellipse', { cx: 330, cy: 90, rx: 150, ry: 118, fill: C.skin }, g);
  const strip = E('g', { filter: 'url(#soft)' }, g);
  E('rect', { x: -380, y: -85, width: 760, height: 170, rx: 50, fill: '#FFFFFF' }, strip);
  E('rect', { x: 120, y: -85, width: 260, height: 170, rx: 50, fill: C.blueL }, strip);
  E('rect', { x: 120, y: -85, width: 60, height: 170, fill: C.blueL }, strip);
  E('rect', { x: -250, y: -48, width: 330, height: 96, rx: 30, fill: '#F7F1EA', stroke: '#E8DDD1', 'stroke-width': 4 }, strip);
  E('circle', { cx: -320, cy: 0, r: 26, fill: '#F7F1EA', stroke: '#E8DDD1', 'stroke-width': 4 }, strip);
  E('rect', { x: 10, y: -34, width: 14, height: 68, rx: 7, fill: '#E58FA0' }, strip);
  E('text', { x: 17, y: 78, 'font-size': 22, 'text-anchor': 'middle', fill: '#B8AA9C', 'font-family': 'sans-serif', text: 'C' }, strip);
  E('text', { x: -103, y: 78, 'font-size': 22, 'text-anchor': 'middle', fill: '#B8AA9C', 'font-family': 'sans-serif', text: 'T' }, strip);
  const tLine = E('rect', { x: -110, y: -34, width: 14, height: 68, rx: 7, fill: '#E58FA0', opacity: 0 }, strip);
  const tGlow = E('rect', { x: -116, y: -40, width: 26, height: 80, rx: 13, fill: '#9CC3EC', opacity: 0, filter: 'url(#glow)' }, strip);
  E('ellipse', { cx: -395, cy: -10, rx: 70, ry: 44, fill: C.skin, transform: 'rotate(-18 -395 -10)' }, g); // thumbs
  E('ellipse', { cx: 395, cy: -10, rx: 70, ry: 44, fill: C.skin, transform: 'rotate(18 395 -10)' }, g);
  E('path', { d: 'M-440 -30 q20 -12 40 -4', fill: 'none', stroke: C.skinD, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
  E('path', { d: 'M440 -30 q-20 -12 -40 -4', fill: 'none', stroke: C.skinD, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
  return { g, tLine, tGlow };
}
const cu = closeupContent(close);
const sparkles1 = E('g', {}, s1);
const sp1 = []; for (let i = 0; i < 7; i++) sp1.push(star(sparkles1, 10 + (i % 3) * 5, '#F4CF86', false));

// Mother (scenes 1-2-3, 5, and holding baby later)
const motherLayer = E('g', {}, svg);
const orbitBack = E('g', {}, motherLayer);
const M = makeMother(motherLayer);
const miniStrip = E('g', {}, M.g); // strip in hand (drawn on top of mother)
const miniStripInner = E('g', {}, miniStrip);
{ const c2 = closeupContent(miniStripInner); c2.tLine.setAttribute('opacity', 1); c2.g.children[0].remove(); c2.g.children[0].remove(); }
const bellyGlow = E('ellipse', { cx: 0, cy: 0, rx: 190, ry: 180, fill: 'url(#bellyGlow)', opacity: 0 }, M.bellyFx);
const bellyPaw = E('g', { opacity: 0 }, M.bellyFx);
pawPrint(bellyPaw, 0.9, '#FFF3DA');
const orbitFront = E('g', {}, motherLayer);
const thread1 = thread(motherLayer);
// Calendar pages
const pages = [];
const arNums = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
for (let i = 0; i < 9; i++) {
  const g = E('g', { opacity: 0 }, orbitFront);
  const card = E('g', { filter: 'url(#soft)' }, g);
  E('rect', { x: -62, y: -74, width: 124, height: 148, rx: 18, fill: '#FFFFFF' }, card);
  E('path', { d: 'M-62 -40 L-62 -56 Q-62 -74 -44 -74 L44 -74 Q62 -74 62 -56 L62 -40 Z', fill: i % 2 ? C.sand : C.blue }, card);
  E('circle', { cx: -30, cy: -74, r: 6, fill: '#FFFFFF', stroke: '#C9BBAE', 'stroke-width': 3 }, card);
  E('circle', { cx: 30, cy: -74, r: 6, fill: '#FFFFFF', stroke: '#C9BBAE', 'stroke-width': 3 }, card);
  E('text', { x: 0, y: 34, 'font-size': 72, 'text-anchor': 'middle', fill: C.blueD, class: 'baloo', 'font-weight': 800, text: arNums[i] }, card);
  E('text', { x: 0, y: -48, 'font-size': 20, 'text-anchor': 'middle', fill: '#FFFFFF', 'font-weight': 700, text: 'الشهر' }, card);
  const st = star(g, 34, '#F4CF86');
  pages.push({ g, card, st });
}

// SCENE 3 — sonar window
const s3 = E('g', { opacity: 0 }, svg);
const winClip = E('clipPath', { id: 'winClip' }, defs);
const winClipC = E('circle', { cx: 0, cy: 0, r: 0 }, winClip);
const win = E('g', {}, s3);
const winInner = E('g', { 'clip-path': 'url(#winClip)' }, win);
E('circle', { r: 460, fill: 'url(#sonar)' }, winInner);
const wedge = E('path', { d: 'M0 380 L-330 -150 A440 440 0 0 1 330 -150 Z', fill: 'url(#wedge)', opacity: 0.35 }, winInner);
for (let r = 120; r <= 420; r += 100) E('circle', { r, fill: 'none', stroke: '#9FC3E8', 'stroke-width': 2, 'stroke-dasharray': '4 10', opacity: 0.35 }, winInner);
const scan = E('line', { x1: 0, y1: 380, x2: 0, y2: -420, stroke: '#CFE3F7', 'stroke-width': 4, opacity: 0.5 }, winInner);
const winStars = E('g', {}, winInner);
{ const R = rng(7); for (let i = 0; i < 26; i++) E('circle', { cx: (R() - 0.5) * 760, cy: (R() - 0.5) * 760, r: 1.5 + R() * 3, fill: '#FFFFFF', opacity: 0.4 + R() * 0.5 }, winStars); }
const moon3 = E('g', {}, winInner);
crescent(moon3, 150, '#F4D9A0');
const lion3 = makeLion(winInner);
const zzz = E('g', {}, winInner);
for (let i = 0; i < 3; i++) E('text', { x: 0, y: 0, 'font-size': 34 + i * 10, fill: '#FFFFFF', 'font-family': 'sans-serif', 'font-weight': 700, opacity: 0.8, text: 'z' }, zzz);
const glass = E('path', { d: 'M-300 -200 A380 380 0 0 1 -60 -365', fill: 'none', stroke: '#FFFFFF', 'stroke-width': 18, 'stroke-linecap': 'round', opacity: 0.35 }, win);
const ring = E('circle', { r: 0, fill: 'none', stroke: C.sand, 'stroke-width': 18 }, win);
const ring2 = E('circle', { r: 0, fill: 'none', stroke: '#FFF3DA', 'stroke-width': 5, opacity: 0.8 }, win);
const flash = E('rect', { width: 1080, height: 1920, fill: '#FFFFFF', opacity: 0 }, svg);

// SCENE 4 — galaxy
const s4 = E('g', { opacity: 0 }, svg);
const galaxy = E('g', {}, s4);
const tinyStars = E('g', {}, galaxy);
const tiny = []; { const R = rng(11); for (let i = 0; i < 70; i++) tiny.push({ e: E('circle', { cx: R() * 1080, cy: R() * 1920, r: 1.5 + R() * 3.5, fill: '#FFF7E0' }, tinyStars), ph: R() * 6 }); }
const gxThread = thread(galaxy);
const gxItems = [];
{
  const add = (e, x, y, s, rot = 0) => gxItems.push({ e, x, y, s, rot, ph: gxItems.length * 1.3 });
  add(planet(galaxy, 78, 'pBlue', '#F4D9A0'), 250, 420, 1);
  add(planet(galaxy, 56, 'pPink'), 850, 360, 1);
  add(planet(galaxy, 92, 'pSand', '#BFD4E6'), 820, 1520, 1);
  add(planet(galaxy, 46, 'pearl'), 190, 1350, 1);
  add(planet(galaxy, 36, 'pBlue'), 560, 260, 1);
  add(cloud(galaxy, 1.1), 230, 820, 1);
  add(cloud(galaxy, 0.9, '#FDF3F4'), 880, 930, 1);
  add(cloud(galaxy, 1.2), 520, 1700, 1);
  add(cloud(galaxy, 0.7, '#F2F6FC'), 330, 1580, 1);
  const moonC = E('g', {}, galaxy); crescent(moonC, 110, '#F4D9A0'); add(moonC, 860, 700, 1);
  const cols = ['#F4CF86', '#F3C6CB', '#FFFFFF', '#BFD4E6', '#F4CF86', '#F3C6CB', '#FFFFFF', '#F4CF86', '#BFD4E6', '#FFFFFF'];
  const R = rng(5);
  const spots = [[120, 600], [420, 520], [700, 540], [980, 520], [120, 1060], [960, 1180], [400, 1200], [680, 1340], [130, 1760], [920, 1800]];
  spots.forEach(([x, y], i) => add(star(galaxy, 26 + R() * 22, cols[i]), x, y, 1, R() * 40));
  for (let i = 0; i < 5; i++) add(pearl(galaxy, 14 + R() * 10), 100 + R() * 880, 300 + R() * 1400, 1);
}
const lion4 = makeLion(galaxy);
const ballG = E('g', { opacity: 0 }, galaxy);
E('circle', { r: 100, fill: 'url(#ball)', filter: 'url(#glow)' }, ballG);
E('circle', { r: 60, fill: 'url(#pearl)', opacity: 0.9 }, ballG);
const puff = E('g', { opacity: 0 }, galaxy);
for (let i = -1; i <= 1; i++) E('path', { d: `M0 0 q20 ${i * 8} 40 ${i * 16}`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 6, 'stroke-linecap': 'round', transform: `translate(0 ${i * 16})` }, puff);

// SCENE 4b/5 — outside: silk bubble, scratches, burst
const s5 = E('g', { opacity: 0 }, svg);
E('rect', { width: 1080, height: 1920, fill: 'url(#burstBg)' }, s5);
const burstLight = E('g', {}, s5);
for (let i = 0; i < 16; i++) E('path', { d: 'M0 0 L-60 -1400 L60 -1400 Z', fill: '#FFF6DC', opacity: 0.55, transform: `rotate(${i * 22.5})` }, burstLight);
const lion5 = makeLion(s5);
const burst = E('g', {}, s5);
const parts = [];
{
  const R = rng(21);
  const cols = ['#F4CF86', '#F3C6CB', '#BFD4E6', '#6E95BA', '#E8C39A', '#FFFFFF'];
  for (let i = 0; i < 64; i++) {
    const k = i % 4, col = cols[Math.floor(R() * cols.length)];
    let e;
    if (k === 0) e = star(burst, 22 + R() * 16, col);
    else if (k === 1) e = pearl(burst, 12 + R() * 12);
    else if (k === 2) e = balloon(burst, 0.55 + R() * 0.3, ['#BFD4E6', '#F3C6CB', '#F4CF86', '#A9C4E0'][i % 4]);
    else e = ribbon(burst, 0.8 + R() * 0.5, ['#6E95BA', '#F3C6CB', '#E8C39A', '#A9C4E0'][i % 4]);
    const a = R() * Math.PI * 2, sp = 0.6 + R() * 0.9;
    parts.push({ e, k, a, sp, rot: (R() - 0.5) * 400, delay: R() * 0.35, z: R() });
  }
}
const silk = E('g', {}, s5);
const silkL = E('g', {}, silk), silkR = E('g', {}, silk);
function silkHalf(g, side) {
  const x = side < 0 ? -200 : 540;
  E('rect', { x, y: -200, width: 740, height: 2320, fill: 'url(#silk)' }, g);
  for (let i = 0; i < 6; i++) E('path', { d: `M${x + 60 + i * 120} -200 C${x + 20 + i * 120} 500 ${x + 110 + i * 120} 1300 ${x + 50 + i * 120} 2120`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 26, opacity: 0.18 }, g);
  for (let i = 0; i < 6; i++) E('path', { d: `M${x + 100 + i * 120} -200 C${x + 70 + i * 120} 600 ${x + 150 + i * 120} 1200 ${x + 90 + i * 120} 2120`, fill: 'none', stroke: '#D9C7D6', 'stroke-width': 12, opacity: 0.18 }, g);
}
silkHalf(silkL, -1); silkHalf(silkR, 1);
const sheen = E('rect', { x: -600, y: 0, width: 500, height: 1920, fill: 'url(#sheen)', opacity: 0.8, transform: 'skewX(-18)' }, silk);
const eyeClip = E('clipPath', { id: 'eyeClip' }, defs);
const eyeClipE = E('ellipse', { cx: 540, cy: 960, rx: 0, ry: 0 }, eyeClip);
const peek = E('g', { 'clip-path': 'url(#eyeClip)' }, s5);
E('rect', { x: 300, y: 600, width: 480, height: 720, fill: '#FFF3D6' }, peek);
const peekLion = E('image', { href: 'assets/lion.png', width: LION.w, height: LION.h }, peek);
const peekLid = E('rect', { x: 400, y: 700, width: 280, height: 0, fill: LION.face }, peek);
const scratches = E('g', {}, s5);
const scr = [];
for (let i = 0; i < 3; i++) {
  const x = 430 + i * 110;
  const d = `M${x - 40} ${740 + i * 10} C${x - 10} 880 ${x + 10} 1000 ${x + 40} ${1180 - i * 10}`;
  const g = E('g', { filter: 'url(#glow)' }, scratches);
  const a = E('path', { d, fill: 'none', stroke: '#FFC76A', 'stroke-width': 26, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '0 2' }, g);
  const b = E('path', { d, fill: 'none', stroke: '#FFFDF3', 'stroke-width': 10, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '0 2' }, g);
  scr.push([a, b]);
}
const paws5 = E('g', { opacity: 0 }, s5);
const pawL = E('g', {}, paws5), pawRt = E('g', {}, paws5);
for (const p of [pawL, pawRt]) {
  E('ellipse', { rx: 56, ry: 44, fill: '#F2D2AA' }, p);
  E('path', { d: 'M-22 -10 v26 M0 -14 v30 M22 -10 v26', stroke: '#C99F78', 'stroke-width': 5, 'stroke-linecap': 'round' }, p);
}
// the outside view (mother with bubble belly) sits in s4b
const s4b = E('g', { opacity: 0 }, svg);
const bubbleMotherG = E('g', {}, s4b);
const bubbleMother = makeMother(bubbleMotherG);
const bubble = E('circle', { cx: 0, cy: 0, r: 150, fill: 'url(#bubble)', stroke: '#FFFFFF', 'stroke-width': 6 }, bubbleMother.g);
const bubbleHi = E('ellipse', { cx: -50, cy: -60, rx: 50, ry: 26, fill: '#FFFFFF', opacity: 0.8, transform: 'rotate(-35)' }, bubbleMother.g);

// SCENE 6-8 — birth, name, phrases, crib, final hand
const s6 = E('g', { opacity: 0 }, svg);
const deco = E('g', {}, s6); // floating edge decorations
const decoItems = [];
{
  const R = rng(33);
  const spots = [[90, 170], [990, 210], [70, 900], [1010, 1000], [110, 1620], [980, 1680], [260, 1840], [820, 1860], [950, 620], [120, 520]];
  spots.forEach(([x, y], i) => {
    let e;
    if (i % 4 === 0) e = balloon(deco, 0.7, ['#BFD4E6', '#F3C6CB', '#F4CF86'][i % 3]);
    else if (i % 4 === 1) e = star(deco, 26, ['#F4CF86', '#BFD4E6', '#F3C6CB'][i % 3]);
    else if (i % 4 === 2) e = pearl(deco, 16);
    else e = planet(deco, 30, ['pBlue', 'pPink', 'pSand'][i % 3]);
    decoItems.push({ e, x, y, ph: R() * 6 });
  });
}
const mother6G = E('g', {}, s6);
const M6 = makeMother(mother6G);
M6.belly.setAttribute('opacity', 0);
const baby6 = E('g', {}, M6.g);
babyBundle(baby6);
// re-order: arms in front of baby
M6.g.appendChild(M6.armL); M6.g.appendChild(M6.armR);
const blanketRibbons = E('g', {}, s6);
const bRib = []; for (let i = 0; i < 8; i++) bRib.push(ribbon(blanketRibbons, 1.1, ['#6E95BA', '#A9C4E0', '#8FB0D3', '#BFD4E6'][i % 4]));

const logo = E('g', {}, s6); // in original logo coordinates (1254 space)
const nameClip = E('clipPath', { id: 'nameClip' }, defs);
const nameClipR = E('rect', { x: 1180, y: 540, width: 0, height: 480 }, nameClip);
E('image', { href: 'assets/name.png', x: 80, y: 560, width: 1100, height: 450, 'clip-path': 'url(#nameClip)' }, logo);
const nameThread = thread(logo);
const dotPearl = E('g', {}, logo); pearl(dotPearl, 30);
const lion6 = makeLion(logo);
const weaveThread = thread(logo);

const texts = E('g', {}, s6);
const lines7 = [
  ['الحمدلله واهب النعم', 'كثير العطايا'],
  ['الحمدلله الذي جعل لنا', 'من زينة الحياة نصيبًا'],
  ['بفضلٍ من الله', 'رُزقنا بصغيرنا']
];
const phraseG = lines7.map((pair, i) => {
  const g = E('g', { opacity: 0 }, texts);
  pair.forEach((l, j) => E('text', { x: 540, y: j * 86, 'font-size': 68, 'font-weight': 700, 'text-anchor': 'middle', direction: 'rtl', fill: C.blueD, text: l }, g));
  if (i < 2) { const s = star(g, 13, C.sand, false); s.setAttribute('transform', 'translate(540 150)'); }
  return g;
});

// crib + mobile (scene 8)
const s8 = E('g', { opacity: 0 }, s6);
const mobile = E('g', {}, s8);
E('path', { d: 'M540 830 L540 900', stroke: '#C9BBAE', 'stroke-width': 6 }, mobile);
const mobileArm = E('g', { transform: 'translate(540 900)' }, mobile);
E('ellipse', { rx: 250, ry: 12, fill: '#E8C39A' }, mobileArm);
const hang = [];
{
  const mk = [g => planet(g, 36, 'pBlue', '#F4D9A0'), g => star(g, 32, '#F4CF86'), g => crescent(g, 38, '#F4D9A0'), g => cloud(g, 0.42), g => planet(g, 28, 'pPink')];
  [-230, -115, 0, 115, 230].forEach((x, i) => {
    const g = E('g', {}, mobileArm);
    const line = E('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#C9BBAE', 'stroke-width': 3 }, g);
    const obj = E('g', {}, g); mk[i](obj);
    hang.push({ g, line, obj, x, len: 110 + (i % 2) * 60 });
  });
}
const crib = E('g', {}, s8);
E('rect', { x: 170, y: 1330, width: 740, height: 360, rx: 40, fill: '#FFFFFF', filter: 'url(#soft)' }, crib);
const cribBaby = E('g', {}, s8);
babyBundle(cribBaby);
const cribFront = E('g', {}, s8);
E('rect', { x: 150, y: 1500, width: 780, height: 60, rx: 30, fill: C.blueL }, cribFront);
for (let i = 0; i < 12; i++) E('rect', { x: 200 + i * 60, y: 1540, width: 22, height: 210, rx: 11, fill: '#FFFFFF', stroke: '#E4D9CC', 'stroke-width': 3 }, cribFront);
E('rect', { x: 150, y: 1730, width: 780, height: 50, rx: 25, fill: C.blueL }, cribFront);
E('rect', { x: 130, y: 1340, width: 50, height: 520, rx: 25, fill: '#B7CDE3' }, cribFront);
E('rect', { x: 900, y: 1340, width: 50, height: 520, rx: 25, fill: '#B7CDE3' }, cribFront);
const placeHands = E('g', {}, s8);
const phL = E('g', {}, placeHands), phR = E('g', {}, placeHands);
E('path', { d: 'M-700 -260 Q-200 -120 -20 -10', fill: 'none', stroke: C.dress, 'stroke-width': 70, 'stroke-linecap': 'round' }, phL); hand(phL).setAttribute('transform', 'rotate(120) scale(1.1)');
E('path', { d: 'M700 -260 Q200 -120 20 -10', fill: 'none', stroke: C.dress, 'stroke-width': 70, 'stroke-linecap': 'round' }, phR); { const h = hand(phR); h.setAttribute('transform', 'rotate(-120) scale(-1.1 1.1)'); }
const dua = E('g', { opacity: 0 }, s6);
['اللهم أنبته النبات الحسن واجعله', 'قرة عين لنا وبارك لنا فيه'].forEach((l, j) =>
  E('text', { x: 540, y: 650 + j * 74, 'font-size': 52, 'font-weight': 700, 'text-anchor': 'middle', direction: 'rtl', fill: C.blueD, text: l }, dua));

// final close-up of the baby's hand holding the thread
const s9 = E('g', { opacity: 0 }, svg);
E('rect', { width: 1080, height: 1920, fill: '#F4EADF' }, s9);
const bokehG = E('g', {}, s9);
const bok = []; { const R = rng(99); for (let i = 0; i < 16; i++) bok.push({ e: E('circle', { cx: R() * 1080, cy: R() * 1920, r: 40 + R() * 90, fill: 'url(#bokeh)', opacity: 0.6 }, bokehG), ph: R() * 6 }); }
E('path', { d: 'M-40 1500 C 200 1400 300 1600 600 1520 S 1000 1450 1120 1560 L1120 1960 L-40 1960 Z', fill: 'url(#blanket)' }, s9);
const fin = E('g', {}, s9);
const finThreadBack = thread(fin);
const fist = E('g', {}, fin);
E('path', { d: 'M-40 520 C-60 380 -150 330 -150 180 C-150 60 -60 -10 60 0 C170 10 210 90 200 190 C190 300 120 380 110 520 Z', fill: C.skin }, fist); // wrist+palm
E('path', { d: 'M-40 520 C-55 420 -110 360 -135 280', fill: 'none', stroke: C.skinD, 'stroke-width': 8, opacity: 0.5, 'stroke-linecap': 'round' }, fist);
const finThreadFront = thread(fin);
const fingers = E('g', {}, fin);
[[-100, 40], [-40, 20], [25, 22], [90, 45]].forEach(([x, y], i) => {
  E('ellipse', { cx: x, cy: y, rx: 40, ry: 56, fill: C.skin, stroke: C.skinD, 'stroke-width': 4 }, fingers);
  E('path', { d: `M${x - 18} ${y + 30} q18 12 36 0`, fill: 'none', stroke: C.skinD, 'stroke-width': 4, 'stroke-linecap': 'round' }, fingers);
});
E('ellipse', { cx: -150, cy: 120, rx: 42, ry: 70, fill: C.skin, stroke: C.skinD, 'stroke-width': 4, transform: 'rotate(-35 -150 120)' }, fingers);
E('path', { d: 'M-40 470 C 20 500 80 500 120 470 L130 560 L-50 560 Z', fill: '#8FB0D3' }, fin);
const finLogo = E('image', { href: 'assets/logo.png', x: 0, y: 0, width: 1081, height: 795, opacity: 0 }, s9);
const vign = E('rect', { width: 1080, height: 1920, fill: 'none', stroke: '#000', 'stroke-width': 0 }, svg);
const fadeRect = E('rect', { width: 1080, height: 1920, fill: C.cream, opacity: 0 }, svg);

// ---------- render ----------
const MOTHER_POS = { x: 540, y: 1180 };
function motherPose(m, t, opts) {
  // arms: left holds strip (or baby), right on belly
  const { holdUp = 1, bellyHand = 1, bellyScale = 1 } = opts;
  const bs = bellyScale;
  // right arm (screen right) — from shoulder to belly or hanging
  const hx = lerp(210, 90 * bs, bellyHand), hy = lerp(160, 10, bellyHand);
  setArm(m.armRPath, m.handR, 190, -250, hx, hy, [lerp(50, 70, bellyHand), 20], lerp(0, -70, bellyHand), 1);
  // left arm (screen left) — raised holding strip, or down
  const lx = lerp(-200, -150, holdUp), ly = lerp(160, -150, holdUp);
  setArm(m.armLPath, m.handL, -190, -250, lx, ly, [lerp(-60, -80, holdUp), lerp(0, 40, holdUp)], lerp(0, 20, holdUp), 1);
  m.belly.setAttribute('transform', `scale(${bs})`);
}

function render(t) {
  // ===== Scene 1 : test strip (0 – 4.4) =====
  const zoomOut = eio(seg(t, 3.0, 4.3));
  const in1 = eo(seg(t, 0, 0.8));
  S(s1, { opacity: 1 - seg(t, 4.1, 4.4) });
  // close-up centre (540,900) → mother's left hand position
  const handPos = { x: MOTHER_POS.x - 150, y: MOTHER_POS.y - 150 };
  const csx = lerp(540, handPos.x - 10, zoomOut), csy = lerp(900, handPos.y - 40, zoomOut);
  const cs = lerp(1.08 - 0.08 * in1 + 0.02 * seg(t, 1, 3), 0.19, zoomOut);
  S(close, { transform: tr(csx, csy, cs, lerp(0, -18, zoomOut)), opacity: in1 });
  const tIn = eio(seg(t, 1.3, 2.5));
  S(cu.tLine, { opacity: tIn });
  const pulse = seg(t, 2.3, 2.7) * (1 - seg(t, 3.0, 3.6));
  S(cu.tGlow, { opacity: pulse * (0.7 + 0.3 * Math.sin(t * 12)) });
  sp1.forEach((s, i) => {
    const a = i / sp1.length * Math.PI * 2 + t * 0.6, r = 240 + 60 * Math.sin(i * 2 + t);
    const p = seg(t, 2.35 + i * 0.05, 2.9) * (1 - seg(t, 3.0, 3.4));
    S(s, { transform: tr(540 - 110 + Math.cos(a) * r * 0.9, 900 + Math.sin(a) * r * 0.55, 0.4 + p, t * 60), opacity: p });
  });

  // ===== Mother (3.2 – 13.5) =====
  const mIn = eo(seg(t, 3.2, 4.1));
  const toS2 = eio(seg(t, 6.0, 7.2));
  const zoomBelly = ei(seg(t, 12.4, 14.0));
  const mScale = lerp(lerp(1, 0.86, toS2), 5.5, zoomBelly);
  // absorbed stars → belly growth
  const pageT0 = i => 6.3 + i * 0.45;
  let absorbed = 0;
  for (let i = 0; i < 9; i++) absorbed += eo(seg(t, pageT0(i) + 1.55, pageT0(i) + 1.9));
  const bellyScale = 1 + 0.42 * absorbed / 9;
  const mx = MOTHER_POS.x, my = lerp(MOTHER_POS.y, 1180, toS2);
  // zoom about the belly: keep belly → (540, 900)
  const bellyScreenY = lerp(my, 900, zoomBelly);
  S(motherLayer, { opacity: mIn * (1 - seg(t, 13.3, 13.9)), transform: tr(mx, bellyScreenY, mScale) });
  motherPose(M, t, {
    holdUp: 1 - eio(seg(t, 6.2, 7.2)),
    bellyHand: eio(seg(t, 4.2, 4.9)),
    bellyScale
  });
  // closeup is in screen space; when zoomed out hide it & show mini strip in hand
  S(miniStrip, { opacity: seg(t, 4.2, 4.4) * (1 - seg(t, 6.4, 6.8)) });
  const hl = M.handL.getAttribute('transform');
  S(miniStrip, { transform: hl });
  S(miniStripInner, { transform: 'translate(0 -40) rotate(-18) scale(0.19)' });
  // eyes: open (seeing the line) then happy closed
  const eOpen = seg(t, 3.6, 3.8) * (1 - seg(t, 4.9, 5.1));
  S(M.eyesOpen, { opacity: eOpen }); S(M.eyesClosed, { opacity: 1 - eOpen });
  S(M.head, { transform: `translate(0 -420) rotate(${lerp(-6, 0, seg(t, 3.6, 5)) + Math.sin(t * 1.2) * 1.5})` });

  // Thread in mother space: from T line on the mini strip → loop around finger → out to orbit
  {
    const h = { x: lerp(-150, -200, eio(seg(t, 6.2, 7.2))), y: lerp(-150, 160, eio(seg(t, 6.2, 7.2))) };
    const lift = eio(seg(t, 4.5, 5.4));
    const T = [h.x - 20, h.y - 45];
    const pts = [T];
    // curl around the finger (small loop)
    for (let k = 1; k <= 10; k++) {
      const a = k / 10 * Math.PI * 2.2;
      pts.push([h.x + Math.cos(a + 2) * 50 * lift, h.y - 20 + Math.sin(a + 2) * 34 * lift - k * 3 * lift]);
    }
    // orbit around mother (ellipse tilted)
    const orbitP = eio(seg(t, 5.5, 7.6));
    const nOrb = 36;
    for (let k = 0; k <= nOrb; k++) {
      const a = Math.PI * 0.9 - k / nOrb * Math.PI * 2.05 - t * 0.25;
      const ox = Math.cos(a) * 420, oy = Math.sin(a) * 150 - 40;
      const free = [h.x + 60 + k * 18, h.y - 80 - Math.sin(k * 0.5 + t * 3) * 30 - k * 6];
      pts.push([lerp(free[0], ox, orbitP), lerp(free[1], oy, orbitP)]);
    }
    const draw = eo(seg(t, 4.5, 6.4));
    thread1.set(smooth(pts), 0, draw);
    S(thread1.g, { opacity: seg(t, 4.5, 4.7) * (1 - seg(t, 11.2, 12.2)) });
  }
  // calendar pages orbiting, each turning into a star that dives into the belly
  pages.forEach((p, i) => {
    const t0 = pageT0(i);
    const a = Math.PI * 0.9 - (i / 9) * Math.PI * 2 - t * 0.25;
    const ox = Math.cos(a) * 420, oy = Math.sin(a) * 150 - 40;
    const depth = (Math.sin(a) + 1) / 2; // 1 = front
    const appear = back(seg(t, t0, t0 + 0.45));
    const toStar = eio(seg(t, t0 + 1.0, t0 + 1.3));
    const dive = ei(seg(t, t0 + 1.35, t0 + 1.9));
    const x = lerp(ox, 0, dive), y = lerp(oy, 0, dive);
    const s = (0.95 + 0.5 * depth) * (1 - 0.8 * dive);
    S(p.g, { transform: tr(x, y, s * Math.max(0.001, appear), Math.sin(t * 2 + i) * 8), opacity: seg(t, t0, t0 + 0.2) * (1 - seg(t, t0 + 1.8, t0 + 1.95)) });
    S(p.card, { opacity: 1 - toStar, transform: `scale(${1 - 0.6 * toStar})` });
    S(p.st, { opacity: toStar, transform: `scale(${toStar}) rotate(${t * 90})` });
    (depth < 0.45 ? orbitBack : orbitFront).appendChild(p.g);
  });
  // belly glow + paw print from inside meeting mother's hand
  S(bellyGlow, { opacity: 0.35 * clamp(absorbed / 3) * (0.8 + 0.2 * Math.sin(t * 4)) + 0.6 * seg(t, 11.0, 11.6) });
  S(bellyPaw, { opacity: seg(t, 11.3, 11.8), transform: tr(40, 20, 0.6 + 0.4 * back(seg(t, 11.3, 11.8)), -15) });

  // ===== Scene 3 : sonar window (12.6 – 18) =====
  const winOpen = eo(seg(t, 13.0, 14.0));
  const pullIn = ei(seg(t, 17.0, 18.0));
  const press = seg(t, 16.0, 16.4) * (1 - seg(t, 16.8, 17.0));
  const winR = 400 * winOpen * (1 + 0.06 * elastic(seg(t, 16.0, 16.9)) * press);
  S(s3, { opacity: seg(t, 12.9, 13.1) * (1 - seg(t, 17.9, 18.1)) });
  S(win, { transform: tr(540, 900, 1 + pullIn * 7) });
  S(winClipC, { r: winR });
  S(ring, { r: winR }); S(ring2, { r: Math.max(0, winR - 16) });
  S(glass, { opacity: 0.35 * winOpen, transform: `scale(${winR / 400 || 0})` });
  S(scan, { transform: `rotate(${Math.sin(t * 1.6) * 38} 0 380)` });
  S(wedge, { opacity: 0.25 + 0.1 * Math.sin(t * 3) });
  {
    const wake = seg(t, 14.8, 15.1);
    const blink = seg(t, 15.5, 15.6) * (1 - seg(t, 15.65, 15.75));
    const approach = eio(seg(t, 15.6, 16.3));
    const breathe = 1 + 0.015 * Math.sin(t * 3);
    const ls = lerp(0.5, 1.25, approach);
    S(lion3.g, { transform: tr(lerp(0, 0, approach), lerp(40, 20, approach), ls * breathe, lerp(-8, 0, approach) + Math.sin(t * 2) * 2 * (1 - approach)) });
    S(lion3.lids, { opacity: Math.max(1 - wake, blink) });
    S(moon3, { transform: tr(0, lerp(170, 420, approach), lerp(1.2, 1.6, approach), -20), opacity: 1 - approach * 0.6 });
    const zp = (1 - wake);
    Array.from(zzz.children).forEach((z, i) => {
      const k = (t * 0.6 + i / 3) % 1;
      S(z, { x: 120 + k * 60 + i * 10, y: -80 - k * 140, opacity: zp * Math.sin(k * Math.PI) });
    });
    S(winStars, { transform: `rotate(${t * 4})` });
  }
  S(flash, { opacity: seg(t, 17.5, 18.0) * (1 - seg(t, 18.0, 18.6)) });

  // ===== Scene 4 : galaxy (18 – 24.3) =====
  S(nightBg, { opacity: seg(t, 17.9, 18.0) * (1 - seg(t, 23.9, 24.3)) });
  S(s4, { opacity: seg(t, 17.9, 18.0) * (1 - seg(t, 23.9, 24.3)) });
  {
    const camS = lerp(1.35, 1, eo(seg(t, 18, 20)));
    S(galaxy, { transform: `translate(540 960) scale(${camS}) translate(-540 -960)` });
    tiny.forEach(s => S(s.e, { opacity: 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + s.ph)) }));
    const pawPt = [540, 1090];
    const grab = eio(seg(t, 21.0, 21.7));
    const collapse = ei(seg(t, 21.6, 22.8));
    const blow = seg(t, 22.9, 23.9);
    gxItems.forEach((it, i) => {
      const fx = it.x + Math.sin(t * 0.8 + it.ph) * 18, fy = it.y + Math.cos(t * 0.7 + it.ph) * 22;
      const sp = collapse * collapse;
      const ang = collapse * 3;
      const dx = fx - pawPt[0], dy = fy - pawPt[1];
      const rx = pawPt[0] + (dx * Math.cos(ang) - dy * Math.sin(ang)) * (1 - collapse);
      const ry = pawPt[1] + (dx * Math.sin(ang) + dy * Math.cos(ang)) * (1 - collapse);
      let rot = it.rot + Math.sin(t + it.ph) * 6;
      if (it.x === 860 && it.y === 700) rot = Math.sin(t * 1.6) * 18; // cradle moon rocks
      S(it.e, { transform: tr(rx, ry, it.s * (1 - 0.9 * sp), rot + collapse * 180), opacity: 1 - seg(t, 22.6, 22.9) });
    });
    // thread winding through the galaxy, then pulled to the paws
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      const wx = -40 + u * 1160, wy = 960 + Math.sin(u * Math.PI * 3 + t * 1.2) * 330 + Math.cos(u * 7 + t) * 60;
      const g1 = lerp(wx, pawPt[0] + (u - 0.5) * 120, grab), g2 = lerp(wy, pawPt[1] + Math.sin(u * 20 + t * 6) * 16, grab);
      const cx = pawPt[0] + (g1 - pawPt[0]) * (1 - collapse), cy = pawPt[1] + (g2 - pawPt[1]) * (1 - collapse);
      pts.push([cx, cy]);
    }
    gxThread.set(smooth(pts), 0, eo(seg(t, 18.2, 19.6)));
    S(gxThread.g, { opacity: 1 - seg(t, 22.4, 22.8) });
    const bob = Math.sin(t * 1.8) * 16;
    const squash = 1 + 0.06 * Math.sin(blow * Math.PI * 4) * (blow > 0 && blow < 1 ? 1 : 0);
    S(lion4.g, { transform: `${tr(540, 900 + bob * (1 - grab), 0.72, Math.sin(t * 1.3) * 4 * (1 - grab))} scale(${squash} ${2 - squash})` });
    const ballR = lerp(0, 0.45, eo(seg(t, 22.0, 22.8))) + 1.3 * eo(blow);
    S(ballG, { opacity: seg(t, 21.9, 22.2), transform: tr(pawPt[0], pawPt[1] + 40 * eo(blow), ballR) });
    S(puff, { opacity: blow > 0 && blow < 1 ? Math.abs(Math.sin(blow * Math.PI * 3)) : 0, transform: tr(600, 980, 1.2, 60) });
  }

  // ===== Scene 4b : outside, belly is a silk bubble (24 – 25.3) =====
  {
    const o = seg(t, 23.9, 24.3) * (1 - seg(t, 25.2, 25.3));
    S(s4b, { opacity: o });
    const grow = ei(seg(t, 24.1, 25.25));
    S(bubbleMotherG, { transform: tr(540, 1350, 0.75) });
    motherPose(bubbleMother, t, { holdUp: 0, bellyHand: 0, bellyScale: 1.42 });
    S(bubble, { r: 150 * 1.42 + grow * 2200, 'stroke-width': 6 * (1 - grow) });
    S(bubbleHi, { opacity: 0.8 * (1 - grow) });
    S(bubbleMother.eyesOpen, { opacity: 1 }); S(bubbleMother.eyesClosed, { opacity: 0 });
    if (grow > 0.55) S(bubble, { fill: 'url(#silk)' }); else S(bubble, { fill: 'url(#bubble)' });
  }

  // ===== Scene 5 : scratches, peek, curtain, burst (25.2 – 31.2) =====
  {
    S(s5, { opacity: seg(t, 25.15, 25.25) * (1 - seg(t, 30.9, 31.25)) });
    const part = eio(seg(t, 28.1, 28.9));
    S(silkL, { transform: `translate(${-620 * part} ${40 * part}) rotate(${-8 * part} 0 960)` });
    S(silkR, { transform: `translate(${620 * part} ${40 * part}) rotate(${8 * part} 1080 960)` });
    S(sheen, { x: -700 + ((t - 25) * 260) % 2200 });
    scr.forEach(([a, b], i) => {
      const d = eo(seg(t, 25.6 + i * 0.45, 25.95 + i * 0.45));
      const o = 1 - seg(t, 28.2, 28.6);
      for (const p of [a, b]) S(p, { 'stroke-dasharray': `${d} 2`, opacity: o });
    });
    // eye peeking through the middle slash
    const peekO = eo(seg(t, 26.9, 27.4)) * (1 - seg(t, 28.2, 28.5));
    S(eyeClipE, { rx: 72 * peekO, ry: 180 * peekO, transform: 'rotate(14 540 960)' });
    const pk = 2.3; // lion image scaled so its right eye sits at the slit
    S(peekLion, { transform: `translate(${540 - LION.eyeR[0] * pk} ${960 - LION.eyeR[1] * pk}) scale(${pk})` });
    const blink = seg(t, 27.55, 27.62) * (1 - seg(t, 27.66, 27.74));
    S(peekLid, { y: 960 - 90, height: 180 * blink, x: 440 });
    S(paws5, { opacity: seg(t, 27.8, 28.0) * (1 - seg(t, 28.5, 28.7)) });
    S(pawL, { transform: tr(470 - 200 * part, 900, 1, -30) });
    S(pawRt, { transform: tr(610 + 200 * part, 1010, 1, 30) });
    // stillness then burst
    const bt = seg(t, 29.1, 30.9);
    const jump = Math.sin(seg(t, 29.1, 29.9) * Math.PI);
    S(lion5.g, { transform: tr(540, 1000 - jump * 160, lerp(0.55, 0.8, eo(seg(t, 29.1, 29.6))), jump * 6), opacity: seg(t, 28.3, 28.7) });
    S(burstLight, { transform: `translate(540 960) rotate(${t * 8}) scale(${0.4 + 0.8 * eo(bt)})`, opacity: 0.35 + 0.65 * seg(t, 29.0, 29.3) });
    parts.forEach(p => {
      const u = eo(clamp((bt - p.delay * 0.4) / (1 - p.delay * 0.4)));
      const dist = u * (500 + 700 * p.sp);
      const x = 540 + Math.cos(p.a) * dist, y = 960 + Math.sin(p.a) * dist * 1.2 - (p.k === 2 ? u * 200 : 0);
      const s = (0.2 + u * (1.2 + p.z * 1.6));
      S(p.e, { transform: tr(x, y, s, p.rot * u), opacity: bt > 0 ? seg(bt, 0, 0.08) * (1 - seg(t, 30.9, 31.4)) : 0 });
    });
  }

  // ===== Scene 6 : birth, blanket, name weaving (30.8 – 36.4) =====
  S(s6, { opacity: seg(t, 30.8, 31.3) });
  {
    decoItems.forEach(d => S(d.e, { transform: tr(d.x + Math.sin(t * 0.7 + d.ph) * 12, d.y + Math.cos(t * 0.9 + d.ph) * 16, 1, Math.sin(t + d.ph) * 8), opacity: seg(t, 31, 32) * (1 - 0.5 * seg(t, 49.3, 50)) }));
    // mother holding baby
    const m6in = eo(seg(t, 31.0, 31.8));
    const m6out = eio(seg(t, 36.4, 37.4));
    S(mother6G, { transform: tr(540, 1400 + 60 * (1 - m6in) + 700 * m6out, 0.8), opacity: m6in * (1 - m6out) });
    setArm(M6.armRPath, M6.handR, 190, -250, 150, 20, [80, 40], -110, 1);
    setArm(M6.armLPath, M6.handL, -190, -250, -170, 60, [-90, 30], 80, 1);
    S(M6.eyesOpen, { opacity: 0 });
    const bundleIn = back(seg(t, 31.5, 32.2));
    S(baby6, { transform: tr(10, -10 + Math.sin(t * 1.5) * 4, bundleIn * 1.0, -6) });
    // ribbons flowing together into the blanket
    bRib.forEach((r, i) => {
      const u = eio(seg(t, 30.9, 31.8));
      const a = i / bRib.length * Math.PI * 2 + t;
      const x = lerp(540 + Math.cos(a) * 480, 540, u), y = lerp(960 + Math.sin(a) * 600, 1390, u);
      S(r, { transform: tr(x, y, 1 - u * 0.8, a * 57 + u * 200), opacity: (1 - seg(t, 31.6, 32.0)) * seg(t, 30.8, 31.0) });
    });
    // logo group: 1254-space → screen
    const lp = eio(seg(t, 36.4, 37.4));
    const lp8 = eio(seg(t, 44.0, 45.0));
    const ls = lerp(lerp(0.8, 0.6, lp), 0.5, lp8);
    const ly = lerp(lerp(620, 430, lp), 300, lp8);
    S(logo, { transform: `translate(540 ${ly}) scale(${ls}) translate(-630 -640)`, opacity: 1 - eio(seg(t, 49.2, 49.8)) });
    // weave the name right→left (Arabic order)
    const w = eio(seg(t, 32.0, 34.3));
    const edge = 1180 - 1100 * w;
    S(nameClipR, { x: edge, width: 1100 * w + 2 });
    const pts = [];
    const lionHold = [930, 280];
    pts.push(lionHold);
    for (let k = 0; k <= 14; k++) {
      const u = k / 14;
      pts.push([lerp(lionHold[0] + 40, edge, u), lerp(lionHold[1] + 40, 780 + Math.sin(t * 22) * 160 * u, u) + Math.sin(u * 8 + t * 4) * 30 * (1 - u)]);
    }
    weaveThread.set(smooth(pts), 0, 1);
    S(weaveThread.g, { opacity: seg(t, 31.8, 32.1) * (1 - seg(t, 34.3, 34.8)) });
    // the thread that remains in the name: a stitched line underneath the letters
    const underline = [];
    for (let k = 0; k <= 30; k++) { const u = k / 30; underline.push([1170 - u * 1100, 1030 + Math.sin(u * 12) * 8]); }
    nameThread.set(smooth(underline), 0, w);
    S(nameThread.g, { opacity: seg(t, 32.0, 32.3) * 0.9 });
    // pearl into the dot of the noon
    const pd = eio(seg(t, 34.2, 34.9));
    const dot = [214, 742];
    S(dotPearl, { transform: tr(lerp(900, dot[0], pd), lerp(380, dot[1], pd) - Math.sin(pd * Math.PI) * 220, lerp(0.6, 1.05, pd) + 0.15 * Math.sin(seg(t, 34.9, 35.3) * Math.PI)), opacity: seg(t, 34.1, 34.3) * (1 - seg(t, 35.5, 35.8)) });
    // lion: pulling thread (top right) → jumps into logo pose
    const land = eio(seg(t, 34.7, 35.6));
    const home = [364 + LION.w / 2, 237 + LION.h / 2];
    const hop = Math.sin(land * Math.PI) * 260;
    const lx = lerp(1000, home[0], land), ly2 = lerp(230 + Math.sin(t * 2) * 12, home[1], land) - hop;
    const settle = 1 + 0.08 * Math.sin(seg(t, 35.6, 36.1) * Math.PI) * (t < 36.1 ? 1 : 0);
    S(lion6.g, { transform: `${tr(lx, ly2, lerp(0.55, 1, land) * settle, lerp(-12 + Math.sin(t * 3) * 4, 0, land))}`, opacity: seg(t, 31.6, 32.0) });
  }

  // ===== Scene 7 : phrases (37 – 44) =====
  phraseG.forEach((g, i) => {
    const a = 37.6 + i * 1.5;
    const p = eo(seg(t, a, a + 0.8));
    S(g, { opacity: p * (1 - seg(t, 43.6, 44.3)), transform: `translate(0 ${780 + i * 270 + 30 * (1 - p)})` });
  });

  // ===== Scene 8 : crib, mobile, dua (44 – 49.8) =====
  {
    const o = seg(t, 44.2, 45.0);
    S(s8, { opacity: o, transform: `translate(540 1400) scale(${lerp(1.12, 1, eo(seg(t, 44.2, 46)))}) translate(-540 -1400)` });
    S(mobileArm, { transform: `translate(540 900) rotate(${Math.sin(t * 0.9) * 3})` });
    hang.forEach((h, i) => {
      const sw = Math.sin(t * 1.4 + i) * 8;
      const x = h.x, y = h.len;
      S(h.line, { x1: x, y1: 0, x2: x + sw, y2: y - 36 });
      S(h.obj, { transform: tr(x + sw, y, 1, Math.sin(t * 1.1 + i) * 12) });
    });
    const lower = eio(seg(t, 44.6, 46.4));
    S(cribBaby, { transform: tr(540, lerp(1230, 1420, lower), 1.05, -4) });
    const away = eio(seg(t, 46.6, 47.6));
    S(phL, { transform: tr(360 - away * 700, lerp(1260, 1450, lower) - away * 200, 1, 0) });
    S(phR, { transform: tr(730 + away * 700, lerp(1260, 1450, lower) - away * 200, 1, 0) });
    S(placeHands, { opacity: 1 - seg(t, 47.2, 47.6) });
    S(dua, { opacity: eo(seg(t, 46.0, 46.8)) * (1 - seg(t, 49.2, 49.8)) });
    S(mobile, { transform: `translate(0 ${lerp(-40, 40, eo(seg(t, 44.2, 46)))})` });
  }

  // ===== Scene 9 : close-up of the hand holding the thread (49.4 – 52) =====
  {
    const o = eio(seg(t, 49.3, 50.0));
    S(s9, { opacity: o });
    bok.forEach(b => S(b.e, { opacity: 0.35 + 0.35 * Math.sin(t * 1.2 + b.ph) }));
    const z = lerp(1.25, 1, eo(seg(t, 49.3, 51.2)));
    S(fin, { transform: tr(560, 1060 + Math.sin(t * 2) * 6, 1.25 * z, -8) });
    const pts = [];
    for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push([-700 + u * 1400, 60 + Math.sin(u * 5 + t * 1.5) * 40 * (Math.abs(u - 0.5) * 2)]); }
    const d = smooth(pts);
    finThreadBack.set(d, 0, 1); finThreadFront.set(d, 0, 1);
    S(finThreadBack.g, { opacity: 0 });
    S(finLogo, { opacity: eo(seg(t, 50.4, 51.2)), transform: 'translate(373 150) scale(0.31)' });
  }
  S(fadeRect, { opacity: seg(t, 0, 0.001) === 0 ? 1 : 0 }); // hard black-frame guard at t=0
  S(fadeRect, { opacity: 1 - seg(t, 0, 0.5) });
}

window.DURATION = DURATION;
window.render = render;
window.ready = Promise.all([
  document.fonts.ready,
  ...Array.from(document.querySelectorAll('image')).map(im => new Promise(r => { const i = new Image(); i.onload = r; i.onerror = r; i.src = im.getAttribute('href'); }))
]).then(() => document.fonts.load('700 60px Tajawal', 'الحمد')).then(() => document.fonts.load('800 60px "Baloo Bhaijaan 2"', '١'));

// live preview when opened directly in a browser
if (!/[?&]capture/.test(location.search)) {
  window.ready.then(() => {
    const start = performance.now();
    const loop = () => { render(((performance.now() - start) / 1000) % DURATION); requestAnimationFrame(loop); };
    loop();
  });
}
