# Wareef theme — component authoring guide

Salla Twilight theme (Twig + Tailwind + vanilla JS), forked from Salla's official "Raed" theme.
Brand: luxury Saudi women's fashion & abayas. Arabic first (RTL), English supported.
Mood: editorial fashion magazine, cinematic, quiet luxury. Monochrome ivory/black with champagne detail.

## Files for one component named `w-NAME`
1. Template: `src/views/components/home/w-NAME.twig`
2. Schema:   `src/schema/components/w-NAME.json`  (merged into twilight.json by `node tools/build-twilight.mjs`)
3. Styles (optional): `src/assets/styles/06-wareef/components/_w-NAME.scss` (auto-imported)
4. JS (optional):     `src/assets/js/wareef/components/w-NAME.js` (auto-imported)
Do not edit any other file. Never edit twilight.json directly.

## Template rules
- Root: `<section component-id="{{ componentId }}" class="w-block w-NAME" data-testid="w-NAME"> … </section>`
  Use `<div class="container">` inside for boxed content; full-bleed sections skip it.
- Variables: `component.<field id>` (collections: `component.items` → each item has the sub-field names WITHOUT the prefix,
  e.g. field id `items.title` → `item.title`), `position` (int), `language.code`, `theme.is_rtl`, `store`.
- Multilingual text may arrive as a string or an object. Always read text fields with:
  `{% set t = component.title %}{% set t = t is iterable ? (t[language.code]|default(t|first)) : t %}`
- Image fallbacks (field empty) — use the bundled placeholders:
  `{{ item.image ?: ('images/wareef/look1.jpg'|asset) }}` — available: hero, look1, look2, look3, look4, square1, banner, editorial (.jpg)
- Links from `variable-list` fields arrive as a URL string; skip the link when empty or '#'.
- Images: `loading="lazy"` (except the first hero image: `fetchpriority="high"`), always `alt`, explicit width/height or aspect class.
- Products: use Salla web components, never fetch yourself:
  `<salla-products-slider source="selected" source-value="[{{ component.products|map(p => p.id)|join(',') }}]" slider-id="w-NAME-{{ position }}" block-title=" "></salla-products-slider>`
  other sources: `source="categories" source-value="{{ cat.id }}"`, `source="latest"`, `source="offers"`.
  Grid version: `<salla-products-list source="…" source-value="…" limit="8"></salla-products-list>`.
  A selected product object (from `component.products`) has: id, name, url, image.url, price, regular_price, sale_price, is_on_sale; format money with `|money`.
- Translatable UI words: `{{ trans('blocks.wareef.KEY') }}` with KEY in: shop_now, view_all, size_guide, days, hours, minutes,
  seconds, close, next, previous, shop_the_look, play, pause, delivery, offer_ends. Need another? Use field text instead.
- Twig syntax that is safe: if/for/set, filters `|default |length |split |trim |upper |join |map |raw |e |date |asset |cdn |money |replace`.
  `|raw` only for fields the merchant writes as HTML (none by default).

## Motion & behaviour (already implemented in src/assets/js/wareef/core.js — just add attributes)
- `data-w-reveal` (fade-up), `="fade" | "scale" | "mask" | "left" | "right"`; put `data-w-stagger` on a parent to delay children.
- `data-w-split` on headings: word-by-word rise.
- `data-w-parallax="0.15"` on an inner media wrapper (not the section).
- Marquee: `<div data-w-marquee="30"><div class="w-marquee__track">…items…</div></div>` (seconds per loop).
- Counter: `<span data-w-count="1250">0</span>`.
- Countdown: `<div data-w-countdown="2026-12-31T23:59:00+03:00"> <b data-w-unit="d">00</b> <b data-w-unit="h">00</b> <b data-w-unit="m">00</b> <b data-w-unit="s">00</b></div>` (adds `.is-over` at zero).
- Tabs: `<div data-w-tabs> <button data-w-tab="a">…</button> <div data-w-panel="a">…</div> </div>`.
- `data-w-magnetic` on primary buttons for a magnetic hover.
- Component JS: `import { Wareef } from '../core.js'; Wareef.register('w-NAME', (root) => { … });` and put `data-w="w-NAME"` on the root.
  Respect `Wareef.reduced()` (true when animations are off / reduced motion). No libraries; vanilla JS, passive listeners.

## CSS rules
- Tokens (CSS vars): --w-bg --w-surface --w-surface-2 --w-text --w-text-2 --w-muted --w-line --w-accent --w-accent-ink --w-gold
  --w-radius --w-radius-sm --w-ease --w-ease-out --w-gap --w-section --w-h1 --w-h2 --w-h3. Dark mode & presets swap them — never hard-code light colours
  for surfaces/text (white text over photos is fine).
- Ready classes: .w-kicker .w-title .w-display .w-lead .w-head(.w-head--center) .w-link .w-btn(.w-btn--ghost .w-btn--light) .w-media .w-zoom
  .w-overlay .w-on-media .w-ratio-portrait/-tall/-square/-wide/-banner .w-grain .w-scroll-x .w-block--tinted .w-block--flush.
- Scope every selector under `.w-NAME`. Use logical properties (margin-inline-start, inset-inline-end) so RTL/LTR both work.
- Mobile first; test mentally at 375px. No horizontal page scroll.
- Plain SCSS (nesting ok). Tailwind utility classes in templates are fine.

## Schema rules (src/schema/components/w-NAME.json)
{
  "order": 100,                       // ordering in the editor; use the number you were given
  "title": { "ar": "…", "en": "…" },
  "icon": "sicon-…",                  // a Salla icon name, e.g. sicon-image, sicon-play, sicon-star, sicon-list, sicon-layout-grid, sicon-clock, sicon-chat-bubbles
  "path": "home.w-NAME",
  "fields": [ … ]
}
- Field shapes you may use (copy exactly; `key` is generated automatically):
  text:      {"id":"title","type":"string","format":"text","label":"…","icon":"sicon-format-text-alt","multilanguage":true,"required":false,"value":"default text","placeholder":"…"}
  textarea:  same with "format":"textarea"
  image:     {"id":"image","type":"string","format":"image","label":"…","description":"المقاس المناسب 1200×1600","icon":"sicon-image","required":false,"value":null,"placeholder":"https://"}
  number:    {"id":"x","type":"number","format":"integer","label":"…","icon":"sicon-pencil-ruler","required":false,"value":50,"minimum":0,"maximum":100}
  switch:    {"id":"show","type":"boolean","format":"switch","label":"…","icon":"sicon-toggle-off","required":false,"value":true,"selected":true}
  dropdown:  {"id":"layout","type":"items","format":"dropdown-list","label":"…","icon":"sicon-list","source":"Manual","required":true,
              "options":[{"label":"…","value":"a"},{"label":"…","value":"b"}],"selected":[{"label":"…","value":"a"}]}
  products:  {"id":"products","type":"items","format":"dropdown-list","label":"المنتجات","icon":"sicon-keyboard_arrow_down","source":"products","multichoice":true,"searchable":true,"required":false,"minLength":1,"maxLength":12,"selected":[],"options":[],"value":[]}
  category:  same with "source":"categories" (multichoice false for one)
  link:      {"id":"url","type":"items","format":"variable-list","label":"الرابط","icon":"sicon-link","source":"custom","searchable":true,"required":false,"value":[],
              "sources":[{"label":"منتج","key":"products","value":"products"},{"label":"تصنيف","key":"categories","value":"categories"},{"label":"ماركة تجارية","key":"brands","value":"brands"},{"label":"صفحة تعريفية","key":"pages","value":"pages"},{"label":"التخفيضات","key":"offers_link","value":"offers_link"},{"label":"رابط خارجي","key":"custom","value":"custom"}]}
  collection:{"id":"items","type":"collection","format":"collection","label":"…","item_label":"…","icon":"sicon-list-add","required":false,"minLength":1,"maxLength":12,
              "fields":[ sub-fields whose ids are prefixed: "items.title", "items.image", … ],
              "value":[ {"items.title":"…","items.image":null}, … ]}   // defaults so the block looks complete on install
  description (editor note): {"id":"note","type":"static","format":"description","value":"<div>…</div>"}
- Arabic labels for merchants (clear, MSA). Defaults in Arabic, written like a luxury abaya house (no fake stats, no fake brands).
- Give generous defaults (text, 3–6 collection items) so the block is beautiful the moment it is added.

## Quality bar
Better than the best-selling Salla fashion theme: every block should feel like a fashion editorial, with purposeful motion,
perfect RTL, fast (no layout shift, lazy media), accessible (buttons are <button>, focus visible, aria-labels on icon buttons).
