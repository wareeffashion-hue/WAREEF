(() => {
  const C = window.ARSO_COURSE;
  const M = window.ARSO_MOTION;
  const view = document.querySelector('#view');
  const hero = document.querySelector('#home-hero');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // ------------------------------------------------------------ progress
  // يُحفظ تقدّم المتعلم في متصفحه فقط. إذا تعذّر التخزين تعمل الصفحة بلا حفظ.
  const KEY = 'arso-course-v1';
  let state = { done: {}, quiz: {}, path: '' };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const unitIndex = id => C.units.findIndex(u => u.id === id);
  const itemTitle = id => id === 'project' ? C.project.title : C.units[unitIndex(id)].title;
  const itemHref = id => id === 'project' ? '#/project' : `#/unit/${id}`;
  const itemNo = id => id === 'project' ? '★' : pad(unitIndex(id) + 1);
  const pathProgress = p => p.units.filter(id => state.done[id]).length;
  const totalMinutes = C.units.reduce((s, u) => s + u.minutes, 0);

  // ------------------------------------------------------------ blocks
  function renderBlock(b) {
    switch (b.type) {
      case 'h': return `<h3 class="block-h">${esc(b.text)}</h3>`;
      case 'p': return `<p>${b.html}</p>`;
      case 'note': return `<p class="note">${b.html}</p>`;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        return `<${tag} class="block-list">${b.items.map(i => `<li>${i}</li>`).join('')}</${tag}>`;
      }
      case 'table':
        return `<div class="table-wrap"><table><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
          b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      case 'code': return codeBox(b.text);
      default: return '';
    }
  }
  const codeBox = text => `<div class="code"><button class="copy" type="button">نسخ</button><pre dir="auto"><code>${esc(text)}</code></pre></div>`;

  // ------------------------------------------------------------ motion lesson player
  function motionPlayer(id, title) {
    const scenes = (M.units[id] || {}).scenes || [];
    if (!scenes.length) return '';
    return `<section class="player" data-unit="${id}" aria-label="درس متحرك: ${esc(title)}">
      <div class="player-stage" aria-live="polite"></div>
      <div class="player-poster"><button class="player-start" type="button"><i aria-hidden="true">▶</i><span>شاهد الدرس المتحرك</span><small>${scenes.length} مشاهد · ${Math.round(scenes.reduce((t, s) => t + sceneDuration(s), 0) / 1000)} ثانية</small></button></div>
      <div class="player-bar">
        <button class="pl-toggle" type="button" aria-label="تشغيل">▶</button>
        <div class="pl-segments">${scenes.map((_, i) => `<button type="button" class="pl-seg" data-i="${i}" aria-label="المشهد ${i + 1}"><span></span></button>`).join('')}</div>
        <span class="pl-count">01 / ${pad(scenes.length)}</span>
      </div>
      <p class="player-caption"></p>
    </section>`;
  }

  const sceneDuration = s => 3800 + (s.items ? s.items.length * 750 : 0) + (s.type === 'compare' ? 1500 : 0);

  function sceneHTML(s) {
    const head = s.kicker ? `<span class="sc-kicker">${s.kicker}</span>` : '';
    switch (s.type) {
      case 'title': return `${head}<h2 class="sc-title anim">${s.title}</h2>`;
      case 'stat': return `<div class="sc-stat anim">${esc(s.value)}</div><p class="sc-label anim">${esc(s.label)}</p>`;
      case 'list': return `<h3 class="sc-h anim">${esc(s.title)}</h3><ul class="sc-list">${s.items.map(i => `<li class="anim">${i}</li>`).join('')}</ul>`;
      case 'flow': return `<h3 class="sc-h anim">${esc(s.title)}</h3><ol class="sc-flow${s.items.length > 4 ? ' long' : ''}">${s.items.map(i => `<li class="anim"><span>${i}</span></li>`).join('')}</ol>`;
      case 'compare': return `<h3 class="sc-h anim">${esc(s.title)}</h3><div class="sc-compare"><div class="anim before"><small>قبل</small><p>${esc(s.before)}</p></div><div class="anim after"><small>بعد</small><p>${esc(s.after)}</p></div></div>`;
      default: return '';
    }
  }

  function initPlayer(root) {
    const scenes = M.units[root.dataset.unit].scenes;
    const stage = root.querySelector('.player-stage');
    const caption = root.querySelector('.player-caption');
    const toggle = root.querySelector('.pl-toggle');
    const segs = [...root.querySelectorAll('.pl-seg')];
    const count = root.querySelector('.pl-count');
    let i = 0, playing = false, timer = 0, started = 0, duration = 0, raf = 0;


    function show(n) {
      i = n;
      const s = scenes[i];
      stage.innerHTML = `<div class="scene scene-${s.type}">${sceneHTML(s)}</div>`;
      caption.textContent = s.caption || '';
      count.textContent = `${pad(i + 1)} / ${pad(scenes.length)}`;
      segs.forEach((seg, j) => { seg.classList.toggle('done', j < i); seg.classList.toggle('current', j === i); seg.firstElementChild.style.width = j < i ? '100%' : '0%'; });
      const parts = stage.querySelectorAll('.anim');
      parts.forEach((el, k) => { el.style.transitionDelay = reduced.matches ? '0ms' : `${120 + k * 420}ms`; });
      requestAnimationFrame(() => requestAnimationFrame(() => parts.forEach(el => el.classList.add('in'))));
      duration = sceneDuration(s);
      if (playing) schedule();
    }
    function schedule() {
      clearTimeout(timer); cancelAnimationFrame(raf);
      started = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - started) / duration);
        segs[i].firstElementChild.style.width = `${p * 100}%`;
        if (p < 1 && playing) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      timer = setTimeout(() => { if (i < scenes.length - 1) show(i + 1); else finish(); }, duration);
    }
    function play() {
      playing = true; root.classList.add('playing'); toggle.textContent = '❚❚'; toggle.setAttribute('aria-label', 'إيقاف مؤقت');
      if (root.classList.contains('ended')) { root.classList.remove('ended'); show(0); } else schedule();
    }
    function pause() {
      playing = false; root.classList.remove('playing'); toggle.textContent = '▶'; toggle.setAttribute('aria-label', 'تشغيل');
      clearTimeout(timer); cancelAnimationFrame(raf);
    }
    function finish() {
      pause(); root.classList.add('ended'); toggle.textContent = '↻'; toggle.setAttribute('aria-label', 'إعادة التشغيل');
      segs.forEach(seg => { seg.classList.add('done'); seg.firstElementChild.style.width = '100%'; });
    }
    root.querySelector('.player-start').addEventListener('click', () => { root.classList.add('started'); show(0); play(); });
    toggle.addEventListener('click', () => {
      if (!root.classList.contains('started')) { root.classList.add('started'); show(0); play(); return; }
      playing ? pause() : play();
    });
    segs.forEach(seg => seg.addEventListener('click', () => { root.classList.add('started'); root.classList.remove('ended'); show(Number(seg.dataset.i)); if (!playing) play(); }));
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' && i < scenes.length - 1) show(i + 1);
      if (e.key === 'ArrowRight' && i > 0) show(i - 1);
    });
    root._stop = pause;
  }

  // ------------------------------------------------------------ quiz
  function quizHTML(u) {
    return `<section class="quiz" data-unit="${u.id}"><div class="section-meta"><span>اختبر نفسك</span><small>CHECKPOINT</small></div>${
      u.quiz.map((q, qi) => `<fieldset class="q" data-answer="${q.answer}"><legend>${qi + 1}. ${esc(q.q)}</legend>${
        q.options.map((o, oi) => `<label><input type="radio" name="q-${u.id}-${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join('')
      }<p class="q-feedback" role="status"></p></fieldset>`).join('')
    }<p class="quiz-score" role="status"></p></section>`;
  }
  function initQuiz(root) {
    const id = root.dataset.unit;
    const qs = [...root.querySelectorAll('.q')];
    const score = root.querySelector('.quiz-score');
    root.addEventListener('change', e => {
      const fs = e.target.closest('.q');
      const ok = Number(e.target.value) === Number(fs.dataset.answer);
      fs.classList.toggle('right', ok); fs.classList.toggle('wrong', !ok);
      fs.querySelector('.q-feedback').textContent = ok ? 'إجابة صحيحة.' : 'ليست هذه. راجع الشرح وجرّب مرة أخرى.';
      const right = qs.filter(q => q.classList.contains('right')).length;
      if (qs.every(q => q.classList.contains('right') || q.classList.contains('wrong'))) {
        score.textContent = `النتيجة: ${right} من ${qs.length}`;
        state.quiz[id] = right; save();
      }
    });
  }

  // ------------------------------------------------------------ views
  function homeView() {
    const current = M.paths.find(p => p.id === state.path);
    const next = current && current.units.find(id => !state.done[id]);
    return `
      ${current ? `<section class="resume reveal"><div><small>مسارك الحالي</small><h3>${esc(current.title)}</h3><div class="meter"><span data-p="${pathProgress(current) / current.units.length}"></span></div><p>${pathProgress(current)} من ${current.units.length} مكتملة</p></div>${next ? `<a class="circle-link" href="${itemHref(next)}"><span>تابع: ${esc(itemTitle(next))}</span><i aria-hidden="true">↖</i></a>` : '<p class="gold">أكملت هذا المسار.</p>'}</section>` : ''}
      <section class="method" id="method"><div class="section-meta reveal"><span>01 / طريقة التعلّم</span><small>HOW YOU LEARN</small></div>
        <h2 class="reveal">كل وحدة،<br><em>خمس خطوات.</em></h2>
        <ol class="method-steps">${M.method.map((m, k) => `<li class="reveal"><b>${pad(k + 1)}</b><h3>${m[0]}</h3><p>${m[1]}</p></li>`).join('')}</ol>
      </section>
      <section class="paths" id="paths"><div class="section-meta reveal"><span>02 / المسارات</span><small>CHOOSE YOUR TRACK</small></div>
        <h2 class="reveal">اختر المسار<br><em>حسب هدفك.</em></h2>
        <div class="path-grid">${M.paths.map(p => `<a class="path-card reveal${p.id === state.path ? ' active' : ''}" href="#/path/${p.id}"><small>${p.en}</small><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p><div class="path-meta"><span>${p.units.length} محطات</span><span>${p.hours} ساعات</span></div><div class="meter"><span data-p="${pathProgress(p) / p.units.length}"></span></div><i aria-hidden="true">↖</i></a>`).join('')}</div>
      </section>
      <section class="units" id="units"><div class="section-meta reveal"><span>03 / الوحدات</span><small>${C.units.length} UNITS · ${Math.round(totalMinutes / 60)} HOURS</small></div>
        <h2 class="reveal">من البداية<br><em>إلى الاحتراف.</em></h2>
        <div class="unit-rows">${C.units.map((u, k) => `<a class="unit-row reveal${state.done[u.id] ? ' done' : ''}" href="#/unit/${u.id}"><b>${pad(k + 1)}</b><div><small>${C.levels[u.level]} · ${u.minutes} دقيقة</small><h3>${esc(u.title)}</h3><p>${esc(u.goal)}</p></div><span class="row-state" aria-label="${state.done[u.id] ? 'مكتملة' : 'لم تكتمل'}">${state.done[u.id] ? '✓' : '↖'}</span></a>`).join('')}
          <a class="unit-row reveal${state.done.project ? ' done' : ''}" href="#/project"><b>★</b><div><small>تطبيق</small><h3>${esc(C.project.title)}</h3><p>مساعدة خدمة عملاء تجمع كل الوحدات.</p></div><span class="row-state">${state.done.project ? '✓' : '↖'}</span></a>
        </div>
      </section>
      <section class="library-teaser reveal"><div class="section-meta"><span>04 / المكتبة</span><small>PROMPT LIBRARY</small></div><h2>${C.library.length} برومبتات<br><em>جاهزة للنسخ.</em></h2><a class="circle-link" href="#/library"><span>افتح المكتبة</span><i aria-hidden="true">↖</i></a></section>`;
  }

  function pathView(id) {
    const p = M.paths.find(x => x.id === id);
    if (!p) return notFound();
    const next = p.units.find(u => !state.done[u]);
    return `<section class="page-head"><a class="back" href="#/">→ الرئيسية</a><div class="section-meta"><span>المسار</span><small>${p.en}</small></div>
      <h1>${esc(p.title)}</h1><p class="lead">${esc(p.desc)}</p>
      <div class="path-meta big"><span>${p.units.length} محطات</span><span>${p.hours} ساعات تقريباً</span><span>${pathProgress(p)} مكتملة</span></div>
      <div class="meter"><span data-p="${pathProgress(p) / p.units.length}"></span></div>
      <div class="head-actions">${state.path === p.id ? '<span class="gold">هذا مسارك الحالي</span>' : `<button class="large-cta choose-path" data-path="${p.id}" type="button"><span>اعتمد هذا المسار</span><i aria-hidden="true">↖</i></button>`}${next ? `<a class="circle-link" href="${itemHref(next)}"><span>${pathProgress(p) ? 'تابع' : 'ابدأ'}: ${esc(itemTitle(next))}</span><i aria-hidden="true">↖</i></a>` : ''}</div></section>
      <ol class="timeline">${p.units.map((u, k) => `<li class="${state.done[u] ? 'done' : u === next ? 'next' : ''}"><span class="dot" aria-hidden="true"></span><a href="${itemHref(u)}"><small>المحطة ${pad(k + 1)}${u === next ? ' · التالية' : ''}${state.done[u] ? ' · مكتملة' : ''}</small><h3>${itemNo(u)} — ${esc(itemTitle(u))}</h3></a></li>`).join('')}</ol>`;
  }

  function unitView(id) {
    const k = unitIndex(id);
    if (k < 0) return notFound();
    const u = C.units[k];
    const prevId = k > 0 ? C.units[k - 1].id : null;
    const recap = prevId && M.units[prevId] && M.units[prevId].recap;
    const seq = (M.paths.find(p => p.id === state.path) || M.paths.find(p => p.id === 'full')).units;
    const pos = seq.indexOf(id);
    const nextId = pos >= 0 && pos < seq.length - 1 ? seq[pos + 1] : (k < C.units.length - 1 ? C.units[k + 1].id : 'project');
    return `<article class="lesson">
      <section class="page-head"><a class="back" href="#/">→ الرئيسية</a><div class="section-meta"><span>الوحدة ${pad(k + 1)} · ${C.levels[u.level]} · ${u.minutes} دقيقة</span><small>${u.en}</small></div>
        <h1>${esc(u.title)}</h1><p class="lead">${u.lead}</p></section>
      ${recap ? `<aside class="recap"><small>مراجعة سريعة من الوحدة ${pad(k)}: ${esc(C.units[k - 1].title)}</small><ul>${recap.map(r => `<li>${esc(r)}</li>`).join('')}</ul></aside>` : ''}
      <div class="step-label"><b>01</b> شاهد</div>
      ${motionPlayer(u.id, u.title)}
      <div class="step-label"><b>02</b> اقرأ</div>
      <div class="prose">${u.blocks.map(renderBlock).join('')}</div>
      <div class="step-label"><b>03</b> طبّق</div>
      <section class="exercise"><small>تمرين</small><p>${esc(u.exercise)}</p></section>
      <div class="step-label"><b>04</b> اختبر</div>
      ${quizHTML(u)}
      <section class="finish"><button class="large-cta mark-done" data-id="${u.id}" type="button"><span>${state.done[u.id] ? 'مكتملة ✓ — إلغاء' : 'أكملت هذه الوحدة'}</span><i aria-hidden="true">✓</i></button>
        <a class="circle-link" href="${itemHref(nextId)}"><span>التالي: ${esc(itemTitle(nextId))}</span><i aria-hidden="true">↖</i></a></section>
    </article>`;
  }

  function projectView() {
    const P = C.project;
    return `<article class="lesson"><section class="page-head"><a class="back" href="#/">→ الرئيسية</a><div class="section-meta"><span>تطبيق</span><small>${P.en}</small></div><h1>${esc(P.title)}</h1><p class="lead">${esc(P.lead)}</p></section>
      <div class="step-label"><b>01</b> شاهد</div>${motionPlayer('project', P.title)}
      <div class="step-label"><b>02</b> نفّذ</div>
      <ol class="timeline">${P.steps.map((s, k) => `<li><span class="dot" aria-hidden="true"></span><div><small>المرحلة ${pad(k + 1)} · الوحدة ${esc(s[1])}</small><h3>${esc(s[0])}</h3><p>المخرج: ${esc(s[2])}</p></div></li>`).join('')}</ol>
      <h3 class="block-h">قالب البرومبت للبدء</h3>${codeBox(P.template)}
      <p class="note"><b>معيار الاحتراف:</b> ${esc(P.criterion)}</p>
      <section class="finish"><button class="large-cta mark-done" data-id="project" type="button"><span>${state.done.project ? 'مكتمل ✓ — إلغاء' : 'أنهيت المشروع'}</span><i aria-hidden="true">✓</i></button><a class="circle-link" href="#/library"><span>مكتبة البرومبتات</span><i aria-hidden="true">↖</i></a></section></article>`;
  }

  function libraryView() {
    return `<section class="page-head"><a class="back" href="#/">→ الرئيسية</a><div class="section-meta"><span>المكتبة</span><small>PROMPT LIBRARY</small></div><h1>برومبتات<br><em>جاهزة للنسخ.</em></h1><p class="lead">انسخ البرومبت، واستبدل ما بين {{ }} ببياناتك.</p></section>
      <div class="library">${C.library.map((l, k) => `<section class="lib-item"><b>${pad(k + 1)}</b><h3>${esc(l.title)}</h3><p>${esc(l.use)}</p>${codeBox(l.text)}</section>`).join('')}</div>
      <section class="sources"><div class="section-meta"><span>المصادر</span><small>SOURCES</small></div><ul>${C.sources.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join('')}</ul>
      <p>تفاصيل محاضرة The prompting playbook مأخوذة من ملخصات منشورة عنها لا من نص الفيديو. الأسعار والنماذج والميزات تتغير، فراجعها في التوثيق الرسمي. دورة مستقلة من أرسو، وليست صادرة عن Anthropic.</p></section>`;
  }

  const notFound = () => `<section class="page-head"><h1>الصفحة غير موجودة</h1><a class="circle-link" href="#/"><span>الرئيسية</span><i aria-hidden="true">↖</i></a></section>`;

  // ------------------------------------------------------------ router
  function route() {
    view.querySelectorAll('.player').forEach(p => p._stop && p._stop());
    const [, kind, id] = (location.hash.replace(/^#/, '') || '/').split('/');
    const isHome = !kind;
    hero.hidden = !isHome;
    document.body.classList.toggle('inner', !isHome);
    view.innerHTML = isHome ? homeView() : kind === 'path' ? pathView(id) : kind === 'unit' ? unitView(id) : kind === 'project' ? projectView() : kind === 'library' ? libraryView() : notFound();
    const title = isHome ? '' : (view.querySelector('h1') || {}).textContent;
    document.title = title ? `${title} — أسرار Claude | أرسو` : 'أسرار Claude — دورة أرسو';
    view.querySelectorAll('[data-p]').forEach(el => el.style.setProperty('--p', el.dataset.p));
    view.querySelectorAll('.player').forEach(initPlayer);
    view.querySelectorAll('.quiz').forEach(initQuiz);
    observeReveals();
    if (!isHome) { window.scrollTo(0, 0); view.querySelector('h1')?.setAttribute('tabindex', '-1'); view.querySelector('h1')?.focus({ preventScroll: true }); }
    closeMenu();
  }

  view.addEventListener('click', e => {
    const copy = e.target.closest('.copy');
    if (copy) {
      const text = copy.parentElement.querySelector('code').textContent;
      navigator.clipboard.writeText(text).then(() => { copy.textContent = 'تم النسخ'; setTimeout(() => { copy.textContent = 'نسخ'; }, 1600); }, () => { copy.textContent = 'تعذّر النسخ'; });
      return;
    }
    const done = e.target.closest('.mark-done');
    if (done) { const id = done.dataset.id; state.done[id] = !state.done[id]; if (!state.done[id]) delete state.done[id]; save(); route(); return; }
    const choose = e.target.closest('.choose-path');
    if (choose) { state.path = choose.dataset.path; save(); route(); }
  });

  // ------------------------------------------------------------ reveal + menu + progress bar
  let io;
  function observeReveals() {
    const els = view.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || reduced.matches) { els.forEach(el => el.classList.add('visible')); return; }
    io && io.disconnect();
    io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); } }), { threshold: 0.12 });
    els.forEach(el => io.observe(el));
  }

  const menuBtn = document.querySelector('.chapter-menu');
  const nav = document.querySelector('#navigation');
  function closeMenu() { nav.classList.remove('open'); nav.inert = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open); nav.inert = !open; menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });

  const bar = document.querySelector('#progress');
  addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = `${h > 0 ? (scrollY / h) * 100 : 0}%`;
  }, { passive: true });

  document.querySelector('#year').textContent = new Date().getFullYear();
  addEventListener('hashchange', route);
  route();
})();
