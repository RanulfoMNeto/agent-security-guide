/* Rendering, animation and navigation. The build places this after chapters.js, inside one
   function that also defines L, the text of the page's language. */

const NS = 'http://www.w3.org/2000/svg';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const scene = $('#scene'), stage = $('#stage'), doc = $('#doc'), fx = $('#fx'), marksG = $('#marks'), rail = $('#rail');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = () => matchMedia('(min-width: 1000px)').matches;
const BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

/* ---------- text ---------- */
// @key reads the locale's labels; {token} is the sample credential.
function label(v) {
  if (typeof v !== 'string') return v;
  if (v[0] === '@') v = L.labels[v.slice(1)];
  return v.replace(/\{token\}/g, P_TOKEN);
}
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Locale text is plain; `code` and *emphasis* are its only markup.
const md = (s) => esc(label(s)).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
const famName = (id) => (id === 'start' ? L.ui.startHere : L.families[id].name);
const chapterText = (f) => L.chapters[f.id];
function kicker(f, st) {
  const own = chapterText(f).steps[st.id].k;
  if (own) return own;
  if (st.id.startsWith('how-')) return fill(L.ui.kinds.how, { n: st.id.slice(4), total: f.steps.filter((s) => s.id.startsWith('how-')).length });
  return L.ui.kinds[st.id];
}

/* ---------- helpers ---------- */
function svg(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function t(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const textWidth = (el) => { try { return el.getComputedTextLength(); } catch (e) { return 0; } };

/* ---------- fitting translated labels ---------- */
// A label with data-fit shrinks to that width; a pill with data-pill grows around its text.
// Together they let a longer translation fit the drawing without layout changes.
function fitText(el) {
  el.style.fontSize = '';
  const max = +el.dataset.fit, w = textWidth(el);
  if (w > max) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * max / w).toFixed(2) + 'px';
}
function sizePill(g) {
  const r = $('rect', g), tx = $('text', g);
  if (!g.dataset.box) g.dataset.box = [r.getAttribute('x'), r.getAttribute('width')].join(' ');
  const [x0, w0] = g.dataset.box.split(' ').map(Number);
  const w = Math.max(w0, textWidth(tx) + 2 * +g.dataset.pill);
  const x = g.dataset.anchor === 'end' ? x0 + w0 - w : x0 + w0 / 2 - w / 2;
  r.setAttribute('x', x.toFixed(1)); r.setAttribute('width', w.toFixed(1));
  tx.setAttribute('x', (x + w / 2).toFixed(1));
}
function fitAll() {
  $$('[data-fit]', scene).forEach(fitText);
  $$('[data-pill]', scene).forEach(sizePill);
}

/* ---------- painting the drawing ---------- */
function paint(st) {
  const on = new Set(st.bare ? (st.on || []) : ALL.filter((c) => !(st.off || []).includes(c)).concat(st.on || []));
  $$('[data-c]', scene).forEach((e) => e.classList.toggle('is-off', !on.has(e.dataset.c)));
  $$('[data-cn]', scene).forEach((e) => e.classList.toggle('is-off', on.has(e.dataset.cn)));
  $$('[data-cg]', scene).forEach((e) => e.classList.toggle('gone', on.has(e.dataset.cg)));
  const hl = new Set(st.hl || []);
  scene.classList.toggle('focus', hl.size > 0);
  $$('[data-k]', scene).forEach((e) => e.classList.toggle('lit', e.dataset.k.split(' ').some((k) => hl.has(k))));
  const x = st.x || {};
  $$('.ex', scene).forEach((e) => { const v = x[e.id]; ['raw', 'ok', 'cut'].forEach((c) => e.classList.toggle(c, v === c)); });
  const cfg = st.cfg || {};
  const CFG = { r1: L.diagram.cfgManagedValue, r2: L.diagram.cfgCommandLineValue, r3: L.diagram.cfgProjectValue, r4: L.diagram.cfgUserValue };
  for (const r in CFG) {
    const [text, tone] = cfg[r] || [CFG[r], ''];
    const el = $('#cfg-' + r);
    el.textContent = label(text);
    el.setAttribute('class', 'cfg-v' + (tone ? ' v-' + tone : ''));
    fitText(el);
  }
}
function drawMarks(list) {
  marksG.textContent = '';
  (list || []).forEach(([x, y, text, tone, anchor], i) => {
    const g = svg('g', { class: 'mark m-' + (tone || 'ink'), style: '--i:' + i });
    const r = svg('rect', { rx: 13, height: 26, y: y - 13 });
    const tx = svg('text', { class: 'mk-t', y: y + 4.5 });
    tx.textContent = label(text);
    g.append(r, tx);
    marksG.append(g);
    const w = (textWidth(tx) || tx.textContent.length * 7.6) + 24;
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    r.setAttribute('x', left.toFixed(1)); r.setAttribute('width', w.toFixed(1));
    tx.setAttribute('x', (left + 12).toFixed(1));
  });
}

/* ---------- windows ---------- */
const T = Array.from({ length: 7 }, (_, i) => $('#t' + i));
const TERM_MAX = 60;
let termTimer = null;
const fitLine = (s) => (s.length > TERM_MAX ? s.slice(0, TERM_MAX - 1) + '…' : s);
const resolveScript = (script) => script.map(([c, outs]) => [label(c), outs.map(([x, tone]) => [label(x), tone])]);
function drawTerm(lines) {
  const vis = lines.slice(-7);
  T.forEach((el, i) => {
    const l = vis[i];
    el.textContent = '';
    el.setAttribute('class', 'term-t' + (l && l.tone ? ' t-' + l.tone : ''));
    if (!l) return;
    if (l.cmd) { const p = svg('tspan', { class: 'term-p' }); p.textContent = '$ '; el.append(p, document.createTextNode(fitLine(l.text))); }
    else el.textContent = fitLine(l.text);
  });
}
function runTerm(script) {
  clearTimeout(termTimer);
  script = resolveScript(script);
  const lines = [];
  if (reduced()) {
    script.forEach(([c, outs]) => { lines.push({ cmd: true, text: c }); outs.forEach(([x, tone]) => lines.push({ text: x, tone })); });
    drawTerm(lines);
    return;
  }
  let ci = 0;
  const nextCmd = () => {
    if (ci >= script.length) return;
    const [cmd, outs] = script[ci++];
    const line = { cmd: true, text: '' };
    lines.push(line);
    let i = 0;
    const type = () => {
      line.text = cmd.slice(0, ++i);
      drawTerm(lines);
      termTimer = i < cmd.length ? setTimeout(type, 30) : setTimeout(() => showOut(outs, 0), 340);
    };
    type();
  };
  const showOut = (outs, j) => {
    if (j >= outs.length) { termTimer = setTimeout(nextCmd, 650); return; }
    lines.push({ text: outs[j][0], tone: outs[j][1] });
    drawTerm(lines);
    termTimer = setTimeout(() => showOut(outs, j + 1), 170);
  };
  drawTerm(lines);
  termTimer = setTimeout(nextCmd, 450);
}
function setBrowser(key) {
  const p = NET[key];
  $('#net-tab').textContent = p.tab;
  $('#net-url').textContent = p.url;
  for (let i = 0; i < 5; i++) {
    const el = $('#net-l' + (i + 1));
    const l = p.lines[i];
    el.textContent = l ? label(l[0]) : '';
    el.setAttribute('class', 'page-t' + (l && l[1] ? ' ' + l[1] : ''));
  }
}
function setPrompt(input, note) {
  const tIn = $('#you-input');
  tIn.textContent = input ? label(input) : '›';
  $('#you-caret').setAttribute('x', (356 + (textWidth(tIn) || 14) + 4).toFixed(1));
  $('#you-note').textContent = note ? label(note) : '';
  $('#you-bubble').setAttribute('width', Math.min(320, (textWidth($('#you-msg')) || 160) + 32).toFixed(1));
}

/* ---------- packets ---------- */
let active = [];
function nearest(path, len, pt) {
  let best = 0, bd = Infinity;
  for (let d = 0; d <= len; d += 3) {
    const p = path.getPointAtLength(d);
    const dd = (p.x - pt[0]) ** 2 + (p.y - pt[1]) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}
// A packet is a dot on its path with a label beside it.
function packets(runs) {
  const g = svg('g', { class: 'pk' });
  const link = svg('line', { class: 'pk-link' });
  const dot = svg('circle', { class: 'pk-dot', r: 6.5 });
  const lab = svg('g');
  const bg = svg('rect', { class: 'pk-bg', rx: 15, height: 30, y: -15 });
  const tx = svg('text', { class: 'pk-tx', y: 5 });
  lab.append(bg, tx);
  g.append(link, dot, lab);
  fx.append(g);
  let text = null, cur = null, i = 0, t0 = performance.now() + 600, actEl = null, off = null, lw = 0;
  function setLabel(s) {
    s = label(s);
    if (s === text) return;
    text = s;
    tx.textContent = s;
    lw = (textWidth(tx) || s.length * 8.4) + 28;
    bg.setAttribute('width', lw.toFixed(1));
    bg.setAttribute('x', (-lw / 2).toFixed(1));
    tx.setAttribute('x', (-lw / 2 + 14).toFixed(1));
  }
  function prep(r) {
    const path = document.getElementById(r.g);
    const len = path.getTotalLength();
    return { ...r, path, len, stopLen: r.stop ? nearest(path, len, r.stop) : len };
  }
  // Labels sit above or below horizontal stretches and beside vertical ones, and glide between.
  function target(d) {
    if (cur.ly !== undefined) return { x: 0, y: cur.ly };
    const a = cur.path.getPointAtLength(clamp(d - 3, 0, cur.len)), b = cur.path.getPointAtLength(clamp(d + 3, 0, cur.len));
    const p = cur.path.getPointAtLength(clamp(d, 0, cur.len));
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) return { x: (p.x > 1450 ? -1 : 1) * (lw / 2 + 20), y: 0 };
    return { x: 0, y: p.y <= 565 ? -72 : 72 };
  }
  function place(d, dx) {
    const p = cur.path.getPointAtLength(clamp(d, 0, cur.len));
    const tg = target(d);
    off = off ? { x: off.x + (tg.x - off.x) * 0.16, y: off.y + (tg.y - off.y) * 0.16 } : tg;
    const x = p.x + (dx || 0), lx = x + off.x, ly = p.y + off.y;
    dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', p.y.toFixed(1));
    lab.setAttribute('transform', 'translate(' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ')');
    let x2 = x, y2 = p.y;
    if (Math.abs(off.x) > lw / 2) x2 = lx - Math.sign(off.x) * lw / 2;
    else if (Math.abs(off.y) > 15) y2 = ly - Math.sign(off.y) * 15;
    link.setAttribute('x1', x.toFixed(1)); link.setAttribute('y1', p.y.toFixed(1));
    link.setAttribute('x2', x2.toFixed(1)); link.setAttribute('y2', y2.toFixed(1));
  }
  function setState(s) { g.classList.toggle('blocked', s === 'blocked'); g.classList.toggle('clean', s === 'clean'); }
  function act(on) {
    if (actEl) { actEl.classList.remove('act'); actEl = null; }
    if (on && cur.act) { actEl = scene.querySelector('.node[data-k="' + cur.act + '"]'); if (actEl) actEl.classList.add('act'); }
  }
  if (reduced()) {
    cur = prep(runs[0]);
    const o = cur.outcome || 'pass';
    setLabel(o === 'pass' ? cur.label : cur.after);
    setState(o === 'redact' ? 'clean' : o === 'pass' ? '' : 'blocked');
    place(o === 'bounce' ? cur.stopLen - 60 : cur.stop ? cur.stopLen : cur.len * 0.5);
    act(o === 'block');
    return { tick() {}, destroy() { act(false); g.remove(); } };
  }
  cur = prep(runs[0]);
  g.style.opacity = 0;
  function next(now) { act(false); i = (i + 1) % runs.length; cur = prep(runs[i]); off = null; t0 = now + 300; }
  const HOLD = 1800, BACK = 650, TAIL = 1300, FADE = 450, GAP = 600;
  return {
    tick(now) {
      const tt = now - t0;
      if (tt < 0) { g.style.opacity = 0; return; }
      const o = cur.outcome || 'pass';
      const travel = (cur.dur || 2400) * (cur.stopLen / cur.len || 1);
      let op = 1;
      if (tt < travel) {
        setState(''); setLabel(cur.label);
        place(ease(tt / travel) * cur.stopLen);
        op = Math.min(1, tt / 250);
      } else {
        const u = tt - travel;
        if (o === 'pass') {
          const hold = cur.stop ? cur.hold || 600 : 0;
          const rest = cur.len - cur.stopLen;
          const tail = rest > 1 ? Math.max(700, (cur.dur || 2400) * (rest / cur.len)) : 0;
          if (u < hold) place(cur.stopLen);
          else if (u < hold + tail) place(cur.stopLen + ease((u - hold) / tail) * rest);
          else { place(cur.len); op = 1 - (u - hold - tail) / FADE; if (u > hold + tail + FADE + GAP) next(now); }
        } else if (o === 'redact') {
          setLabel(cur.after); setState('clean'); act(u < 900);
          if (u < 900) place(cur.stopLen);
          else if (u < 900 + TAIL) place(cur.stopLen + ease((u - 900) / TAIL) * (cur.len - cur.stopLen));
          else { place(cur.len); op = 1 - (u - 900 - TAIL) / FADE; if (u > 900 + TAIL + FADE + GAP) next(now); }
        } else if (o === 'bounce') {
          setLabel(cur.after); setState('blocked');
          place(cur.stopLen - easeOut(Math.min(1, u / BACK)) * 60);
          if (u > BACK + HOLD) { op = 1 - (u - BACK - HOLD) / FADE; if (u > BACK + HOLD + FADE + GAP) next(now); }
        } else {
          setLabel(cur.after); setState('blocked'); act(true);
          const shake = u < 450 ? Math.sin(u / 22) * 5 * (1 - u / 450) : 0;
          place(cur.stopLen, shake);
          if (u > HOLD) { op = 1 - (u - HOLD) / FADE; if (u > HOLD + FADE + GAP) next(now); }
        }
      }
      g.style.opacity = clamp(op, 0, 1);
    },
    destroy() { act(false); g.remove(); }
  };
}
function startFx(list) {
  active.forEach((f) => f.destroy());
  active = [];
  if (list && list.length) active.push(packets(list));
}

/* ---------- camera ---------- */
let vb = { x: 200, y: 16, w: 1480, h: 1464 };
let tween = null;
function fit(cam) {
  const r = stage.getBoundingClientRect();
  const W = r.width || innerWidth, H = r.height || innerHeight;
  const S = wide() ? { x: 28, y: 72, w: W - 28 - 52, h: H - 72 - 28 } : { x: 8, y: 8, w: W - 16, h: H - 16 };
  const [rx, ry, rw, rh] = cam;
  const s = Math.min(S.w / rw, S.h / rh, 1.35);
  const cx = rx + rw / 2, cy = ry + rh / 2;
  const sx = S.x + S.w / 2, sy = S.y + S.h / 2;
  return { x: cx - sx / s, y: cy - sy / s, w: W / s, h: H / s };
}
function applyVB() { scene.setAttribute('viewBox', vb.x.toFixed(2) + ' ' + vb.y.toFixed(2) + ' ' + vb.w.toFixed(2) + ' ' + vb.h.toFixed(2)); }
function aim(cam, instant) {
  const target = fit(cam);
  if (instant || reduced()) { vb = target; tween = null; applyVB(); return; }
  tween = { from: { ...vb }, to: target, t0: performance.now(), dur: 1200 };
}

/* ---------- the text column ---------- */
let view = null, step = -1, current = null;
function rowFor(f) {
  const a = h('a', 'row');
  a.href = '#' + f.id;
  const at = /^\d$/.test(f.at) ? h('span', 'row-at', '<span class="stage-no">' + f.at + '</span>') : t('span', 'row-at', L.ui.atStart);
  const main = h('span', '');
  main.append(h('span', 'row-name', md(chapterText(f).name)), h('span', 'row-deck', md(chapterText(f).deck)));
  a.append(at, main, t('span', 'row-go', '→'));
  a.addEventListener('mouseenter', () => preview(f));
  a.addEventListener('focus', () => preview(f));
  a.addEventListener('mouseleave', () => preview(null));
  a.addEventListener('blur', () => preview(null));
  return a;
}
function codeBlock(lines) {
  const pre = h('div', 'code');
  lines.forEach(([text, tone]) => pre.append(t('span', tone ? 'c-' + tone : '', label(text) || ' ')));
  return pre;
}
function scriptLines(script) {
  const out = [];
  resolveScript(script).forEach(([c, outs]) => { out.push([c, 'cmd']); outs.forEach((o) => out.push(o)); });
  return out;
}
function renderHome() {
  const H = L.ui.home;
  doc.textContent = '';
  const s0 = h('section', 'step hero');
  s0.append(h('p', 'kick', '<i>' + md(H.kick) + '</i>'), h('h1', '', md(H.title)), h('p', 'lede', md(H.lede)),
    h('div', 'meta', '<span class="cue">' + md(H.cue) + '</span><span>' + md(H.agents) + '</span>'));
  const s1 = h('section', 'step cat');
  s1.append(h('p', 'kick', md(H.contentsKick)), h('h2', '', md(H.contentsTitle)), h('p', '', md(H.contentsText)));
  const start = h('div', 'rows start');
  start.append(rowFor(FEATURES.find((f) => f.fam === 'start')));
  s1.append(start);
  FAMILIES.forEach((id) => {
    const box = h('div', 'fam');
    const head = h('div', 'fam-h');
    head.append(t('h3', '', L.families[id].name), t('span', '', L.families[id].blurb));
    const rows = h('div', 'rows');
    FEATURES.filter((f) => f.fam === id).forEach((f) => rows.append(rowFor(f)));
    box.append(head, rows);
    s1.append(box);
  });
  [s0, s1].forEach((s, i) => { s.dataset.i = String(i); doc.append(s); });
}
function renderFeature(f) {
  const C = chapterText(f);
  doc.textContent = '';
  f.steps.forEach((st, i) => {
    const tx = C.steps[st.id];
    const sec = h('section', 'step');
    sec.dataset.i = String(i);
    if (i === 0) {
      const head = h('header', 'f-head');
      const kick = h('p', 'kick');
      kick.append(t('i', '', famName(f.fam)));
      if (/^\d$/.test(f.at)) kick.append(h('span', 'chip', '<span class="stage-no">' + f.at + '</span>' + esc(fill(L.ui.stage, { n: f.at }))));
      head.append(kick, h('h1', '', md(C.name)), h('p', 'deck', md(C.deck)));
      sec.append(head);
    }
    sec.append(h('p', 'kick', md(kicker(f, st))), h('h2', '', md(tx.h)));
    (tx.p || []).forEach((p) => sec.append(h('p', '', md(p))));
    if (st.code === 'term') sec.append(codeBlock(scriptLines(st.s.term)));
    else if (tx.code) sec.append(codeBlock(tx.code));
    if (tx.facts) {
      const ul = h('ul', 'facts');
      tx.facts.forEach(([a, b]) => { const li = h('li'); li.append(h('b', '', md(a)), h('span', '', md(b))); ul.append(li); });
      sec.append(ul);
    }
    if (tx.notes) {
      const box = h('div', 'notes');
      ['claude', 'codex'].forEach((k) => { const n = h('div', 'note'); n.append(t('b', '', L.ui.agents[k]), h('span', '', md(tx.notes[k]))); box.append(n); });
      sec.append(box);
    }
    doc.append(sec);
  });
  const E = L.ui.end;
  const end = h('section', 'step end');
  end.dataset.i = String(f.steps.length);
  end.append(t('p', 'kick', E.kick), h('h2', '', md(fill(E.title, { name: C.name }))), t('p', 'kick', E.related));
  const rows = h('div', 'rows');
  f.related.forEach((id) => rows.append(rowFor(BY_ID[id])));
  end.append(rows);
  const acts = h('div', 'end-actions');
  const back = t('a', 'ghost', '← ' + E.back);
  back.href = '#';
  back.addEventListener('click', (e) => { e.preventDefault(); route(''); });
  acts.append(back, t('span', '', E.esc));
  end.append(acts);
  doc.append(end);
}
function viewSteps() {
  if (view === HOME) return HOME.steps.map((s) => s.s);
  return view.steps.map((s) => s.s).concat([{ hl: view.preview, cam: CAM.all }]);
}
function stepLabels() {
  if (view === HOME) return HOME.steps.map((s) => L.ui.home.rail[s.id]);
  return view.steps.map((s) => kicker(view, s)).concat([L.ui.end.rail]);
}

/* ---------- states ---------- */
function setStep(n, instant) {
  if (n === step) return;
  step = n;
  const st = viewSteps()[n];
  current = st;
  paint(st);
  aim(st.cam || CAM.all, instant);
  setBrowser(st.net || 'pypi');
  setPrompt(st.input, st.note);
  runTerm(st.term || IDLE);
  startFx(st.fx);
  drawMarks(st.marks);
  $$('.step', doc).forEach((s) => s.classList.toggle('on', +s.dataset.i === n));
  $$('a', rail).forEach((a, i) => { if (i === n) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
  crumb();
}
function preview(f) {
  if (view !== HOME) return;
  if (f) paint({ hl: f.preview }); else if (current) paint(current);
}
function crumb() {
  const c = $('#crumb');
  c.textContent = '';
  if (view === HOME) return;
  c.append(t('span', '', famName(view.fam)), t('span', '', '/'), t('b', '', chapterText(view).name + ' · ' + stepLabels()[step]));
}
function buildRail() {
  rail.textContent = '';
  stepLabels().forEach((text, n) => {
    const a = document.createElement('a');
    a.href = '#' + (view.id || '');
    a.setAttribute('aria-label', text);
    a.append(t('span', '', text));
    a.addEventListener('click', (e) => { e.preventDefault(); goTo(n); });
    rail.append(a);
  });
}

/* ---------- views, routing and languages ---------- */
// The language links keep the open chapter.
function langLinks() { $$('.langs a[data-base]').forEach((a) => { a.href = a.dataset.base + location.hash; }); }
function show(id) {
  const next = BY_ID[id] || HOME;
  if (next === view && step >= 0) return;
  view = next;
  doc.classList.add('swap');
  const swap = () => {
    if (view === HOME) renderHome(); else renderFeature(view);
    sections = $$('.step', doc);
    buildRail();
    $('#back').hidden = view === HOME;
    scrollTo(0, 0);
    step = -1;
    setStep(0);
    langLinks();
    doc.classList.remove('swap');
  };
  if (reduced() || !doc.childElementCount) swap(); else setTimeout(swap, 220);
}
function route(id) {
  if (id === '') {
    try { history.pushState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    show('');
  } else if (location.hash !== '#' + id) location.hash = id;
  else show(id);
}
addEventListener('hashchange', () => show(location.hash.slice(1)));
addEventListener('popstate', () => show(location.hash.slice(1)));
$('#brand').addEventListener('click', (e) => { e.preventDefault(); route(''); });
$('#back').addEventListener('click', (e) => { e.preventDefault(); route(''); });

/* ---------- scrolling and keys ---------- */
let sections = [], navUntil = 0, pending = false;
function lineY() {
  if (wide()) return innerHeight * 0.42;
  const b = stage.getBoundingClientRect().bottom;
  return b + (innerHeight - b) * 0.25;
}
function stepAtLine() {
  const y = lineY();
  for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= y && r.bottom > y) return +s.dataset.i; }
  if (sections.length && sections[0].getBoundingClientRect().top > y) return 0;
  return null;
}
function track() {
  pending = false;
  if (performance.now() < navUntil) return;
  const n = stepAtLine();
  if (n !== null) setStep(n);
}
// A jump fixes the target step first, then scrolls this page only, so the scroll that follows
// cannot move the active step through the sections it passes.
function goTo(n) {
  n = clamp(n, 0, viewSteps().length - 1);
  const sec = sections[n];
  if (!sec) return;
  const r = sec.getBoundingClientRect();
  const top = wide() ? scrollY + r.top - 64 : scrollY + r.top - stage.getBoundingClientRect().bottom - 4;
  navUntil = performance.now() + 1600;
  setStep(n);
  scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' });
}
addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(track); } }, { passive: true });
addEventListener('scrollend', () => { navUntil = 0; track(); });
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); goTo(step + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(step - 1); }
  else if (e.key === 'Escape' && view !== HOME) { e.preventDefault(); route(''); }
});
addEventListener('resize', () => {
  if (step < 0) return;
  vb = fit(current.cam || CAM.all); tween = null; applyVB();
});

/* ---------- theme ---------- */
function effectiveTheme() {
  const th = document.documentElement.dataset.theme;
  if (th === 'light' || th === 'dark') return th;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function themeLabel() { $('#theme').textContent = effectiveTheme() === 'dark' ? L.ui.themeLight : L.ui.themeDark; }
$('#theme').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('agent-security-guide:theme', next); } catch (e) {}
  themeLabel();
});
try { const saved = localStorage.getItem('agent-security-guide:theme'); if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved; } catch (e) {}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', themeLabel);

/* ---------- run ---------- */
function frame(now) {
  if (tween) {
    const u = Math.min(1, (now - tween.t0) / tween.dur);
    const e = ease(u);
    vb = {
      x: tween.from.x + (tween.to.x - tween.from.x) * e,
      y: tween.from.y + (tween.to.y - tween.from.y) * e,
      w: tween.from.w + (tween.to.w - tween.from.w) * e,
      h: tween.from.h + (tween.to.h - tween.from.h) * e
    };
    applyVB();
    if (u >= 1) tween = null;
  }
  active.forEach((f) => f.tick(now));
  requestAnimationFrame(frame);
}
themeLabel();
fitAll();
show(location.hash.slice(1));
vb = fit((current && current.cam) || CAM.all); applyVB();
requestAnimationFrame(frame);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitAll(); if (current) { paint(current); setPrompt(current.input, current.note); drawMarks(current.marks); } });
