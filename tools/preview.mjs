// Local visual preview for home components (not the Salla engine): renders a component's Twig with its
// schema defaults via twig.js, stubs Salla web components, and screenshots it with Playwright.
// Usage: node tools/preview.mjs w-NAME [w-OTHER …] [--dark] [--out dir]
import Twig from 'twig';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
// Serve the repo over HTTP so ES modules load (file:// blocks them).
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const args = process.argv.slice(2);
const dark = args.includes('--dark');
const outIdx = args.indexOf('--out');
const out = resolve(root, outIdx > -1 ? args[outIdx + 1] : 'tools/.preview');
const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
mkdirSync(out, { recursive: true });
const ar = JSON.parse(readFileSync(join(root, 'src/locales/ar.json'), 'utf8'));
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

Twig.extend((T) => {
  T.exports.extendFilter('asset', (v) => `${base}public/${v}`);
  T.exports.extendFilter('cdn', (v) => v);
  T.exports.extendFilter('money', (v) => `${Number(v || 0).toLocaleString('ar-SA')} ر.س`);
  T.exports.extendFunction('trans', (k) => get(ar, k) ?? k);
  T.exports.extendFunction('is_page', () => false);
});

function defaults(schema) {
  const val = (f) => {
    if (f.type === 'collection') {
      const prefix = `${f.id}.`;
      return (f.value || []).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.startsWith(prefix) ? k.slice(prefix.length) : k, v])));
    }
    if (f.type === 'items' && f.source === 'products') return [1, 2, 3, 4].map((i) => ({ id: i, name: `عباية مطرزة ${i}`, url: '#', image: { url: `${base}src/assets/images/wareef/look${i}.jpg` }, price: 450 + i * 50, regular_price: 600, sale_price: 450 + i * 50, is_on_sale: i % 2 === 0 }));
    if (f.type === 'items' && f.source === 'categories') return f.multichoice ? [1, 2, 3, 4].map((i) => ({ id: i, name: ['عبايات', 'جلابيات', 'أطقم', 'شالات'][i - 1], url: '#', image: `${base}src/assets/images/wareef/look${i}.jpg` })) : { id: 1, name: 'عبايات', url: '#' };
    if (f.type === 'items' && f.format === 'variable-list') return 'https://example.com/';
    if (f.type === 'items') return (f.selected && f.selected[0] && f.selected[0].value) || '';
    if (f.type === 'boolean') return f.value !== false;
    return f.value ?? '';
  };
  return Object.fromEntries((schema.fields || []).filter((f) => f.type !== 'static').map((f) => [f.id, val(f)]));
}

const STUBS = `<script>
const card=(i)=>'<div style="min-width:0"><div style="aspect-ratio:3/4;background:url(${base}src/assets/images/wareef/look'+((i%4)+1)+'.jpg) center/cover;border-radius:var(--w-radius)"></div><div style="padding:10px 2px;font-size:14px">عباية مطرزة '+(i+1)+'</div><div style="font-weight:700;font-size:14px">'+(450+i*50)+' ر.س</div></div>';
class Products extends HTMLElement{connectedCallback(){const n=+this.getAttribute('limit')||4;this.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:20px">'+Array.from({length:Math.min(n,8)},(_,i)=>card(i)).join('')+'</div>';}}
customElements.define('salla-products-slider',class extends Products{});customElements.define('salla-products-list',class extends Products{});
customElements.define('salla-slider',class extends HTMLElement{connectedCallback(){this.style.display='block';const s=this.querySelector('[slot=items]');if(s){s.style.display='flex';s.style.gap='16px';s.style.overflowX='auto';}}});
customElements.define('salla-rating-stars',class extends HTMLElement{connectedCallback(){this.textContent='★★★★★'.slice(0,+this.getAttribute('value')||5);this.style.color='#b8955a';}});
</script>`;

const css = `${base}${process.env.PREVIEW_CSS || "public/app.css"}`;
const browser = await chromium.launch();
for (const name of names) {
  const schema = JSON.parse(readFileSync(join(root, 'src/schema/components', `${name}.json`), 'utf8'));
  const tpl = readFileSync(join(root, 'src/views/components/home', `${name}.twig`), 'utf8');
  const html = Twig.twig({ data: tpl, rethrow: true }).render({ component: defaults(schema), position: 0, componentId: name, language: { code: 'ar' }, theme: { is_rtl: true, settings: { get: (k, d) => d } }, store: { name: 'وريف', url: '#', contacts: {}, social: {} } });
  const js = existsSync(join(root, 'src/assets/js/wareef/components', `${name}.js`)) ? `<script type="module" src="${base}src/assets/js/wareef/components/${name}.js"></script>` : '';
  const page = `<!doctype html><html lang="ar" dir="rtl" class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"><style>body{font-family:system-ui,'Noto Sans Arabic',sans-serif}</style>${STUBS}</head>
<body class="theme-wareef theme-raed w-style-luxe w-radius-sharp w-anim-full w-card-editorial w-ratio-portrait">${html}
<script type="module" src="${base}src/assets/js/wareef/core.js"></script>${js}</body></html>`;
  const file = join(out, `${name}.html`);
  writeFileSync(file, page);
  for (const [label, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::/.test(m.text()) && errors.push(m.text()));
    await p.goto(base + file.slice(root.length));
    await p.waitForTimeout(400);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    await p.waitForTimeout(1200);
    // Static review: show every revealed state regardless of scroll timing.
    await p.evaluate(() => document.querySelectorAll('[data-w-reveal],[data-w-split]').forEach((e) => e.classList.add('is-in')));
    await p.waitForTimeout(1300);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await p.screenshot({ path: join(out, `${name}-${label}${dark ? '-dark' : ''}.png`), fullPage: true });
    console.log(`${name} ${label}: ${errors.length ? 'ERRORS ' + errors.join(' | ') : 'ok'}${overflow ? ' · HORIZONTAL OVERFLOW' : ''}`);
    await p.close();
  }
}
await browser.close();
server.close();
