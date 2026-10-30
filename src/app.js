/* Rendering, animation and navigation. The build places this after chapters.js, inside one
   function that also defines L, the text of the page's language. */

const NS = 'http://www.w3.org/2000/svg';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const scene = $('#scene'), stage = $('#stage'), doc = $('#doc'), fx = $('#fx'), trailsG = $('#trails');
const player = $('#player');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = () => matchMedia('(min-width: 1000px)').matches;
const BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
// Width of the blur transition beside the documentation column (--fade in styles.css).
const FADE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fade')) || 220;

/* ---------- the agent ---------- */
// The diagram shows one agent's formats at a time; the documentation text is the same for every
// agent. The first agent in AGENTS is the default; the last choice is remembered.
let agent = Object.keys(AGENTS)[0];
try { const a = localStorage.getItem('agent-security-guide:agent'); if (a in AGENTS) agent = a; } catch (e) {}
// A value in chapters.js can depend on the agent.
const pick = (v) => (typeof v === 'function' ? v(agent) : v);

/* ---------- text ---------- */
// @key reads the locale's labels, {@key} inserts one, {token} and {key} are the sample credentials.
function label(v) {
  v = pick(v);
  if (typeof v !== 'string') return v;
  if (v[0] === '@') v = L.labels[v.slice(1)];
  return v.replace(/\{@(\w+)\}/g, (m, k) => L.labels[k]).replace(/\{token\}/g, GH).replace(/\{key\}/g, STRIPE);
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Locale text is plain; `code` and *emphasis* are its only markup.
const md = (s) => esc(label(s)).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
const chapterText = (f) => L.chapters[f.id];
// The breadcrumb shows text without its markup.
const plain = (s) => label(s).replace(/[`*]/g, '');
const num = (f) => String(FEATURES.indexOf(f) + 1).padStart(2, '0');

/* ---------- helpers ---------- */
function svg(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function t(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeIn = (u) => u * u * u;
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const textWidth = (el) => { try { return el.getComputedTextLength(); } catch (e) { return 0; } };
const lineOf = (l) => (Array.isArray(l) ? l : [l, '']);
const logo = (id, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
// Cuts a text element with an ellipsis until it fits; draw(s) renders s into it.
function fitTo(el, s, max, draw) {
  draw(s);
  if (!max || textWidth(el) <= max) return;
  let lo = 1, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; draw(s.slice(0, m) + '…'); if (textWidth(el) <= max) lo = m; else hi = m - 1; }
  draw(s.slice(0, lo) + '…');
}
const setText = (el, s, max) => fitTo(el, s, max, (x) => { el.textContent = x; });

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
  const ht = $('.h-title', scene);
  $('#h-sub').setAttribute('x', (+ht.getAttribute('x') + textWidth(ht) + 10).toFixed(1));
  const st = $('#sess-t', scene);
  $('#sess-chev').setAttribute('transform', 'translate(' + (+st.getAttribute('x') + textWidth(st) + 7).toFixed(1) + ' 62.5)');
}

/* ---------- painting the drawing ---------- */
// Which controls exist, and which parts the step is about.
function paint(st, lit) {
  const on = new Set(st.bare ? (st.on || []) : ALL.filter((c) => !(st.off || []).includes(c)).concat(st.on || []));
  $$('[data-c]', scene).forEach((e) => e.classList.toggle('is-off', !on.has(e.dataset.c)));
  $$('[data-cn]', scene).forEach((e) => e.classList.toggle('is-off', on.has(e.dataset.cn)));
  const hl = new Set(lit || []);
  if (hl.size) ['policy', 'sandbox', 'proxy'].forEach((c) => { if (on.has(c) && (c === 'policy' || hl.has(c === 'sandbox' ? 'terminal' : 'net'))) hl.add(c); });
  scene.classList.toggle('focus', hl.size > 0);
  $$('[data-k]', scene).forEach((e) => e.classList.toggle('lit', e.dataset.k.split(' ').some((k) => hl.has(k))));
}

/* ---------- code: JSON and TOML, as the agents write them ---------- */
const CODE = {}, LH = 15.5;
$$('[data-code]', scene).forEach((g) => {
  const { x, y, n, max } = g.dataset;
  CODE[g.dataset.code] = Array.from({ length: +n }, (_, i) => {
    const el = svg('text', { class: 'code', x, y: +y + i * LH, 'data-max': max });
    g.append(el);
    return el;
  });
});
// Strings, keys, literals and punctuation get their own tone; a whole line can carry one instead.
// A string cut short by the ellipsis has no closing quote.
const TOK = /("(?:[^"\\]|\\.)*"?)(\s*:)?|\b(true|false|null)\b|-?\b\d+\b|([{}[\],:=])|([^"{}[\],:=]+)/g;
function codeLine(el, line, max) {
  const [raw, tone] = lineOf(line);
  el.setAttribute('class', 'code' + (tone ? ' t-' + tone : ''));
  fitTo(el, label(raw), max, (s) => {
    el.textContent = '';
    if (tone) { el.textContent = s; return; }
    for (const m of s.matchAll(TOK)) {
      const sp = svg('tspan', { class: m[1] ? (m[2] ? 'c-k' : 'c-s') : m[3] ? 'c-l' : m[4] ? 'c-p' : 'c-o' });
      sp.textContent = m[0];
      el.append(sp);
    }
  });
}
// The meta line names the format or the file; prompt, context and model take the agent's API.
// Content longer than the component keeps its first line and its latest ones.
const STATIC_META = { prompt: 1, context: 1, model: 1 };
const rawOf = (l) => lineOf(l)[0];
const toneOf = (l) => lineOf(l)[1];
function setCode(comp, v) {
  v = pick(v);
  let { meta, lines: ls } = Array.isArray(v) ? { lines: v } : v || { lines: [] };
  // The permission's verdict is its last card, not a line.
  if (comp === 'perm') {
    const k = ls.findIndex((l) => toneOf(l) && rawOf(l).startsWith('→'));
    setVerdict(k < 0 ? null : ls[k]);
    if (k >= 0) ls = ls.filter((_, i) => i !== k);
  }
  const slots = CODE[comp];
  if (comp === 'context') ls = contextFit(ls, slots.length);
  else if (ls.length > slots.length) ls = [ls[0], '  …', ...ls.slice(ls.length - slots.length + 2)];
  // A message of the context leaves room on its first line for the name of where it came from.
  const room = comp === 'context' ? contextCards(ls) : {};
  slots.forEach((el, i) => { el.style.opacity = ''; if (i < ls.length) codeLine(el, ls[i], +el.dataset.max - (room[i] || 0)); else el.textContent = ''; });
  const sub = $('[data-fsub="' + comp + '"]', scene);
  if (sub) sub.classList.toggle('gone', ls.length > 0);
  const m = $('[data-fm="' + comp + '"]', scene);
  if (m) setText(m, meta || (STATIC_META[comp] ? AGENTS[agent].api : ''), +m.dataset.max);
  if (comp === 'proxy') $('#proxy-note').classList.toggle('on', ls.length > 0);
  if (comp === 'prompt') lineNumbers(ls.length);
  // A lane's bar shows the hook's result: "ok" when the event continues, "no" when the hook blocks
  // or changes it.
  if (comp.startsWith('hook.')) {
    const r = ls.find((l) => toneOf(l));
    $('#lane-' + comp.slice(5) + ' .lane-bar').setAttribute('class', 'lane-bar' + (r ? (toneOf(r) === 'ok' ? ' ok' : ' no') : ''));
  }
}
function lineNumbers(n) {
  const g = $('#ln-prompt');
  g.textContent = '';
  for (let i = 0; i < n; i++) { const e = svg('text', { class: 'ln', x: 88, y: 592 + i * LH, 'text-anchor': 'end' }); e.textContent = i + 1; g.append(e); }
}
// Each context message is a card marked with its origin (memory, user, model or tool): a bar, and
// the origin's name on its first line.
const FROM = { user: 'fromUser', mem: 'fromMemory', model: 'fromModel', tool: 'fromTool' };
const CTX_Y = +$('[data-code="context"]', scene).dataset.y;
// The messages that do not fit give way, oldest first, to an ellipsis.
function contextFit(ls, n) {
  if (ls.length <= n) return ls;
  const msgs = [];
  ls.slice(1, -1).forEach((l) => { if (lineOf(l)[2] || !msgs.length) msgs.push([l]); else msgs[msgs.length - 1].push(l); });
  while (msgs.length > 1 && msgs.flat().length + 3 > n) msgs.shift();
  return [ls[0], '  …', ...msgs.flat(), ls[ls.length - 1]];
}
function contextCards(ls) {
  const g = $('#ctx-cards'), room = {};
  g.textContent = '';
  ls.forEach((l, i) => {
    const from = lineOf(l)[2];
    if (!from) return;
    let n = 1;
    while (i + n < ls.length && /^ {4}/.test(rawOf(ls[i + n]))) n++;
    const y = CTX_Y + i * LH - 11.5, hh = n * LH - 2.5;
    const name = svg('text', { class: 'ctx-o o-' + from, x: 770, y: CTX_Y + i * LH, 'text-anchor': 'end' });
    name.textContent = L.diagram[FROM[from]];
    g.append(svg('rect', { class: 'card', x: 462, y, width: 316, height: hh, rx: 5 }), svg('rect', { class: 'card-bar o-' + from, x: 462, y, width: 3, height: hh, rx: 1.5 }), name);
    room[i] = textWidth(name) + 14;
  });
  return room;
}
function setVerdict(line) {
  const g = $('#perm-verdict');
  g.classList.toggle('on', !!line);
  if (!line) return;
  // Allowed, allowed within a limit, or denied.
  const tone = toneOf(line);
  g.classList.toggle('no', tone === 'deny');
  g.classList.toggle('lim', tone === 'limit');
  setText($('.v-t', g), label(rawOf(line)).replace(/^→ /, ''), 262);
  $('.v-i', g).setAttribute('d', tone === 'deny' ? 'M866 1270 L872 1276 M872 1270 L866 1276'
    : tone === 'limit' ? 'M865.5 1269.5 H872.5 V1276.5 H865.5 Z' : 'M865 1273.5 L868.5 1277 L874 1270');
}
// The model writes its response line by line.
function streamPlan(comp) {
  const els = CODE[comp].filter((e) => e.textContent);
  const STEP = 85;
  els.forEach((e) => { e.style.opacity = 0; });
  return {
    dur: els.length * STEP,
    tick(el) { els.forEach((e, i) => { e.style.opacity = el >= i * STEP ? '' : 0; }); },
    done() { els.forEach((e) => { e.style.opacity = ''; }); }
  };
}

/* ---------- tools, memory and the agent's marks ---------- */
function buildLists() {
  const A = AGENTS[agent];
  const tl = $('#tool-list');
  tl.textContent = '';
  // Each tool is a card, in two columns.
  A.tools.forEach((name, i) => {
    const x = 462 + (i % 2) * 161, y = 1134 + Math.floor(i / 2) * 37;
    const g = svg('g', { class: 'tool', 'data-tool': name });
    const tx = svg('text', { class: 'tool-t', x: x + 14, y: y + 19 });
    tx.textContent = name;
    g.append(svg('rect', { class: 'card', x, y, width: 155, height: 29, rx: 6 }), svg('rect', { class: 'tool-bar', x, y, width: 3, height: 29, rx: 1.5 }), tx);
    tl.append(g);
  });
  // Each memory file is a card, with the bar its content gets in the context.
  const mr = $('#mem-rows');
  mr.textContent = '';
  A.memory.forEach(([file, kind], i) => {
    const y = 432 + i * 23;
    const g = svg('g', { class: 'mem' });
    const tx = svg('text', { class: 'mem-t', x: 476, y: y + 14.5 });
    tx.textContent = file;
    const k = svg('text', { class: 'mem-k', x: 766, y: y + 14.5, 'text-anchor': 'end' });
    k.textContent = label(kind);
    g.append(svg('rect', { class: 'card', x: 462, y, width: 316, height: 20, rx: 5 }), svg('rect', { class: 'mem-bar', x: 462, y, width: 3, height: 20, rx: 1.5 }), tx, k);
    mr.append(g);
  });
  $$('.h-logo', scene).forEach((u) => u.setAttribute('href', '#' + A.logo));
  $$('.agents button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.agent === agent)));
}
function setTool(name) { name = pick(name); $$('.tool', scene).forEach((g) => g.classList.toggle('on', g.dataset.tool === name)); }
function setMemory(on) { on = !!pick(on); $$('.mem', scene).forEach((e) => e.classList.toggle('on', on)); }

/* ---------- the browser ---------- */
function setPage(p) {
  p = pick(p) || { tab: L.diagram.newTab, url: '', lines: [] };
  setText($('#net-tab'), p.tab, 170);
  setText($('#net-url'), p.url, 420);
  $$('[data-nl]', scene).forEach((el, i) => {
    const l = p.lines[i];
    el.setAttribute('class', 'page-t' + (l && l[1] ? ' ' + l[1] : ''));
    setText(el, l ? label(l[0]) : '', 460);
  });
}

/* ---------- the terminal ---------- */
// "$" lines are typed as the command arrives; output follows it. Long lines wrap, as in a
// terminal, and the latest rows stay in view.
const TERM = Array.from({ length: 8 }, (_, i) => { const e = svg('text', { class: 'term-t', x: 76, y: 1138 + i * 20 }); $('#term-lines').append(e); return e; });
const COLS = 42, TYPE_CMD = 24;
let term = [];
const termLine = (l) => (l.length === 3 ? { kind: l[0], text: label(l[1]), tone: l[2] }
  : l[0] === '$' ? { kind: '$', text: label(l[1]) } : { kind: '', text: label(l[0]), tone: l[1] });
function drawTerm(list, cursor) {
  const rows = [];
  list.forEach((l) => {
    const s = (l.kind === '$' ? '$ ' : '') + l.text;
    for (let i = 0; i === 0 || i < s.length; i += COLS) rows.push({ s: s.slice(i, i + COLS), tone: l.tone, prompt: l.kind === '$' && i === 0 });
  });
  const vis = rows.slice(-TERM.length);
  TERM.forEach((el, i) => {
    const r = vis[i];
    el.textContent = '';
    el.setAttribute('class', 'term-t' + (r && r.tone ? ' t-' + r.tone : ''));
    if (!r) return;
    if (r.prompt) { const p = svg('tspan', { class: 'term-p' }); p.textContent = '$ '; el.append(p, document.createTextNode(r.s.slice(2))); }
    else el.textContent = r.s;
    if (cursor && i === vis.length - 1) { const c = svg('tspan', { class: 'term-c' }); c.textContent = '▌'; el.append(c); }
  });
}
function termSet(lines) { term = lines; drawTerm(term); }
// The typing of a visit, driven by the journey's clock so that it pauses with it.
function termPlan(ls) {
  const parts = [];
  let dur = 0;
  ls.forEach((l) => {
    if (l.kind === '$') { dur += 250; parts.push({ l, t0: dur, typed: true }); dur += l.text.length * TYPE_CMD + 420; }
    else { dur += 170; parts.push({ l, t0: dur }); }
  });
  return {
    dur,
    tick(el) {
      const shown = [];
      let cursor = false;
      for (const p of parts) {
        if (el < p.t0) break;
        cursor = !!p.typed;
        if (!p.typed) { shown.push(p.l); continue; }
        const n = Math.min(p.l.text.length, Math.floor((el - p.t0) / TYPE_CMD));
        shown.push({ ...p.l, text: p.l.text.slice(0, n) });
      }
      drawTerm(term.concat(shown), cursor);
    },
    done() { term = term.concat(ls); drawTerm(term); }
  };
}

/* ---------- the session ---------- */
// "you" is typed in the input and then sent; "sent" is already in the conversation; "note" is a
// notice to the user; "agent" is the agent's answer, followed by the agent's logo.
const chatG = $('#chat-msgs');
const CHAT = { top: 86, bottom: 196, left: 82, right: 618, gap: 12 };
const TYPE_CHAT = 28;
let msgs = [];
function wrap(text, max, cls) {
  const probe = svg('text', { class: cls });
  chatG.append(probe);
  const fits = (s) => { probe.textContent = s; return textWidth(probe) <= max; };
  const out = [];
  let line = '';
  for (let w of text.split(' ')) {
    while (!fits(w)) {
      let n = w.length - 1;
      while (n > 1 && !fits(w.slice(0, n))) n--;
      if (line) { out.push(line); line = ''; }
      out.push(w.slice(0, n));
      w = w.slice(n);
    }
    if (line && !fits(line + ' ' + w)) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  probe.remove();
  return out;
}
function chatBlock(m) {
  const textAt = (cls, x, y, s, anchor) => { const e = svg('text', { class: cls, x, y }); if (anchor) e.setAttribute('text-anchor', anchor); e.textContent = s; chatG.append(e); };
  if (m.who === 'note') {
    const ls = wrap(m.text, 470, 'chat-note');
    return { h: ls.length * 17, draw(y) { ls.forEach((l, i) => textAt('chat-note', CHAT.right, y + 12 + i * 17, l, 'end')); } };
  }
  if (m.who === 'agent') {
    const ls = wrap(m.text, 520, 'chat-r');
    return {
      h: ls.length * 20 + 24,
      draw(y) {
        ls.forEach((l, i) => textAt('chat-r', CHAT.left, y + 14 + i * 20, l));
        chatG.append(svg('use', { href: '#' + AGENTS[agent].logo, x: CHAT.left, y: y + ls.length * 20 + 6, width: 16, height: 16 }));
      }
    };
  }
  const ls = wrap(m.text, 380, 'chat-t');
  return {
    h: ls.length * 18 + 14,
    draw(y) {
      const r = svg('rect', { class: 'bubble', y, height: ls.length * 18 + 14, rx: 12 });
      chatG.append(r);
      const els = ls.map((l, i) => { const e = svg('text', { class: 'chat-t', y: y + 20 + i * 18 }); e.textContent = l; chatG.append(e); return e; });
      const w = Math.max(...els.map(textWidth)) + 24;
      r.setAttribute('x', (CHAT.right - w).toFixed(1)); r.setAttribute('width', w.toFixed(1));
      els.forEach((e) => e.setAttribute('x', (CHAT.right - w + 12).toFixed(1)));
    }
  };
}
// The latest messages that fit are shown; older ones scroll away.
function drawChat() {
  chatG.textContent = '';
  const blocks = msgs.map(chatBlock);
  let hgt = 0, start = blocks.length;
  while (start > 0 && hgt + blocks[start - 1].h + (hgt ? CHAT.gap : 0) <= CHAT.bottom - CHAT.top) { hgt += blocks[start - 1].h + (hgt ? CHAT.gap : 0); start--; }
  let y = CHAT.top;
  blocks.slice(start).forEach((b) => { b.draw(y); y += b.h + CHAT.gap; });
}
function setInput(text) {
  const ls = text ? wrap(text, 480, 'chat-t').slice(-2) : [];
  const [a, b] = [$('#chat-in0'), $('#chat-in1')];
  a.textContent = ls[0] || ''; b.textContent = ls[1] || '';
  a.setAttribute('y', ls.length > 1 ? 224 : 232);
  b.setAttribute('y', 242);
  $('#chat-ph').classList.toggle('gone', ls.length > 0);
  $('#send').classList.toggle('on', ls.length > 0);
}
const toChat = (list) => list.map(([who, text]) => ({ who: who === 'you' ? 'sent' : who, text: label(text) }));
function chatPlan(list) {
  const first = label(list[0][1]), T0 = 250, tSend = T0 + first.length * TYPE_CHAT + 380;
  let sent = false;
  const send = () => { if (sent) return; sent = true; setInput(''); msgs.push(...toChat(list)); drawChat(); };
  return {
    dur: tSend + 350,
    tick(el) { if (el < tSend) setInput(first.slice(0, clamp(Math.floor((el - T0) / TYPE_CHAT), 0, first.length))); else send(); },
    done: send
  };
}

/* ---------- filling the components ---------- */
// A visit leaves its content in the components. Played live, the terminal and the session type
// it; otherwise it appears at once.
function enter(v, live) {
  const plans = [];
  Object.entries(v.fill || {}).forEach(([c, raw]) => {
    const val = pick(raw);
    if (val == null) return;
    if (c === 'terminal') { const ls = val.map(termLine); if (live) plans.push(termPlan(ls)); else termSet(term.concat(ls)); }
    else if (c === 'session') { if (live && v.type) plans.push(chatPlan(val)); else { msgs.push(...toChat(val)); drawChat(); } }
    else if (c === 'tools') setTool(val);
    else if (c === 'memory') setMemory(val);
    else if (c === 'net') setPage(val);
    else { setCode(c, val); if (live && c === 'model') plans.push(streamPlan(c)); }
  });
  if (!plans.length) return null;
  return {
    dur: Math.max(...plans.map((p) => p.dur)),
    tick(el) { plans.forEach((p) => p.tick(el)); },
    done() { plans.forEach((p) => p.done()); }
  };
}
// Every component back to its generic description, then what the step itself shows.
function resetAll(st) {
  Object.keys(CODE).forEach((c) => setCode(c, null));
  setTool(null); setMemory(false); setPage(null); termSet([]);
  msgs = []; setInput(''); drawChat();
  trailsG.textContent = '';
  enter({ fill: st.fill }, false);
  if (st.session) { msgs.push(...toChat(st.session)); drawChat(); }
}

/* ---------- where things are ---------- */
const EDGE = {};
$$('[data-edge]', scene).forEach((p) => { EDGE[p.dataset.edge] = p; p.dataset.k = p.dataset.edge; });
const compOf = (st) => st.split('.')[0];
// The arrow between two stations, in either direction.
function route(a, b) {
  const f = EDGE[a + '>' + b], r = EDGE[b + '>' + a];
  const el = f || r;
  if (!el) return null;
  return { el, rev: !f, name: el.dataset.edge, len: el.getTotalLength() };
}
const pointOn = (r, d) => r.el.getPointAtLength(r.rev ? r.len - d : d);
// The area of a station, for the camera.
function boxOf(st) {
  let b;
  if (st === 'proxy') b = { x: 195, y: 1360, width: 350, height: 120 };
  else if (st.startsWith('hook.')) { const l = $('#lane-' + st.slice(5) + ' .lane-b', scene).getBBox(); b = { x: l.x, y: l.y - 36, width: l.width, height: l.height + 36 }; }
  else b = $('#c-' + st + ' .box', scene).getBBox();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
// Packet labels step aside while the packet crosses a component.
let BOXES = null;
const inside = (p) => (BOXES || (BOXES = $$('.node .box', scene).map((b) => b.getBBox())))
  .some((b) => p.x > b.x + 6 && p.x < b.x + b.width - 6 && p.y > b.y + 6 && p.y < b.y + b.height - 6);
// Where what the request carries comes from: the station that produced it. What leaves the
// context is all of it together.
const SOURCE = { session: 'user', prompt: 'user', memory: 'mem', model: 'model', tools: 'tool', terminal: 'tool', proxy: 'tool', net: 'tool' };
const toneClass = (o) => 'o-' + o.from + (o.state ? ' no' : '');

/* ---------- the request on its way ---------- */
const pk = (() => {
  const g = svg('g', { class: 'pk' });
  const link = svg('line', { class: 'pk-link' });
  const dot = svg('g', { class: 'pk-dot' });
  dot.append(svg('circle', { class: 'pk-halo', r: 8 }), svg('circle', { class: 'pk-head', r: 8 }));
  const lab = svg('g', { class: 'pk-lab' });
  const bg = svg('rect', { class: 'pk-bg', rx: 15, height: 30, y: -15 });
  const tx = svg('text', { class: 'pk-tx', y: 4.5 });
  lab.append(bg, tx);
  g.append(link, dot, lab);
  fx.append(g);
  let text = null, lw = 0, off = null, at = { x: 0, y: 0 }, vertical = false;
  return {
    g,
    text(s) {
      s = label(s) || '';
      if (s.length > 44) s = s.slice(0, 43) + '…';
      if (s === text) return;
      text = s;
      tx.textContent = s;
      lw = (textWidth(tx) || s.length * 7.2) + 28;
      bg.setAttribute('width', lw.toFixed(1)); bg.setAttribute('x', (-lw / 2).toFixed(1));
      tx.setAttribute('x', (-lw / 2 + 14).toFixed(1));
    },
    // The origin of what it carries, or the blocked state once a control has stopped it.
    tone(from, state) { g.setAttribute('class', 'pk o-' + (from || 'ctx') + (state === 'no' ? ' no' : '')); },
    show(dotOn, labOn) { dot.style.opacity = dotOn ? 1 : 0; lab.style.opacity = link.style.opacity = labOn && text ? 1 : 0; },
    // Labels sit above horizontal stretches and beside vertical ones, and glide between; a
    // stopped request keeps its label on the side it came from.
    place(p, vert, dx = 0, snap, side) {
      at = { x: p.x + dx, y: p.y };
      if (vert !== undefined) vertical = vert;
      const tg = side ? { x: (side === 'left' ? -1 : 1) * (lw / 2 + 22), y: 0 }
        : vertical ? { x: (at.x > 900 ? -1 : 1) * (lw / 2 + 20), y: 0 } : { x: 0, y: -40 };
      off = !off || snap ? tg : { x: off.x + (tg.x - off.x) * 0.16, y: off.y + (tg.y - off.y) * 0.16 };
      dot.setAttribute('transform', 'translate(' + at.x.toFixed(1) + ' ' + at.y.toFixed(1) + ')');
      const lx = at.x + off.x, ly = at.y + off.y;
      lab.setAttribute('transform', 'translate(' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ')');
      let x2 = at.x, y2 = at.y;
      if (Math.abs(off.x) > lw / 2) x2 = lx - Math.sign(off.x) * lw / 2; else if (Math.abs(off.y) > 15) y2 = ly - Math.sign(off.y) * 15;
      link.setAttribute('x1', at.x.toFixed(1)); link.setAttribute('y1', at.y.toFixed(1));
      link.setAttribute('x2', x2.toFixed(1)); link.setAttribute('y2', y2.toFixed(1));
    },
    reset() { text = null; off = null; tx.textContent = ''; this.show(false, false); this.tone('ctx', ''); }
  };
})();

/* ---------- the journey ---------- */
// A scene is the example of a group of steps: every visit from its first step to its last.
const SPEED = 320;
const STAY = { session: 1500, prompt: 1200, hook: 1300, context: 1200, memory: 1000, model: 1300, perm: 1400, tools: 500, terminal: 600, proxy: 1300, net: 1600 };
const OUT_STAY = 2400;
function sceneOf(n) {
  const steps = viewSteps();
  let s0 = n;
  while (s0 > 0 && !steps[s0].scene) s0--;
  const visits = [], ranges = {};
  for (let i = s0; i < steps.length; i++) {
    if (i > s0 && steps[i].scene) break;
    const r = pick(steps[i].run);
    if (!r) break;
    ranges[i] = [visits.length, visits.length + r.length];
    visits.push(...r);
  }
  // What the request carries out of each station, where that came from, and whether it was
  // stopped there.
  let carry = '', state = '', from = 'ctx';
  const out = visits.map((v) => {
    const o = pick(v.out);
    if (v.carry != null) { carry = v.carry; state = ''; from = SOURCE[compOf(v.at)] || 'ctx'; }
    if (o) { carry = v.after != null ? v.after : carry; state = o === 'clean' ? '' : 'no'; }
    return { carry, state, from };
  });
  return { start: s0, init: steps[s0].init || {}, visits, ranges, out };
}
const outOf = (v) => pick(v.out);
const isPass = (v) => !!pick(v.pass);

let run = null, clock = 0, paused = false;
function stopRun() { run = null; pk.reset(); $$('.node.act, .lane.on', scene).forEach((e) => e.classList.remove('act', 'no', 'on')); }
function activate(st, no) {
  $$('.node.act, .lane.on', scene).forEach((e) => e.classList.remove('act', 'no', 'on'));
  const node = $('#c-' + compOf(st), scene);
  if (node && node.classList.contains('node')) { node.classList.add('act'); node.classList.toggle('no', !!no); }
  if (st.startsWith('hook.')) { const l = $('#lane-' + st.slice(5), scene); l.classList.add('on'); l.classList.toggle('no', !!no); }
}
function trail(r, cls) {
  const p = svg('path', { class: 'trail ' + (cls || ''), d: r.el.getAttribute('d') });
  trailsG.append(p);
  return p;
}
// A trail drawn up to d; a reversed one grows from the arrow's end.
function trailTo(p, r, d) {
  if (d >= r.len - 0.5) { p.removeAttribute('stroke-dasharray'); return; }
  p.setAttribute('stroke-dasharray', r.rev ? '0 ' + (r.len - d).toFixed(1) + ' ' + d.toFixed(1) + ' ' + r.len.toFixed(1) : d.toFixed(1) + ' ' + r.len.toFixed(1));
}
// Plays visits [a, b) of the scene; the ones before a are already in place.
function makeRun(sc, a, b) {
  const segs = [];
  for (let i = a; i < b; i++) {
    const v = sc.visits[i], prev = i > 0 ? sc.visits[i - 1] : null;
    if (prev && prev.at !== v.at) {
      const r = route(prev.at, v.at);
      if (r) segs.push({ kind: 'move', i, r, dur: clamp(r.len / SPEED * 1000, 700, 2600), from: prev.at, inPass: isPass(prev), outPass: isPass(v) });
      else segs.push({ kind: 'jump', i, dur: 450 });
    } else if (!prev) segs.push({ kind: 'jump', i, dur: 450 });
    if (!isPass(v)) segs.push({ kind: 'stay', i });
  }
  return { sc, a, b, segs, k: 0, t0: clock, done: false };
}
// The point where a station sends the request on.
function dock(sc, i) {
  const v = sc.visits[i], next = sc.visits[i + 1];
  const r = next && route(v.at, next.at);
  if (r) return pointOn(r, 0);
  const b = boxOf(v.at);
  return { x: b.x + b.w / 2, y: b.y + b.h };
}
function beginSeg(s) {
  const sc = run.sc, v = sc.visits[s.i];
  if (s.kind === 'move') {
    const o = sc.out[s.i - 1];
    pk.text(o.carry); pk.tone(o.from, o.state);
    s.trail = trail(s.r, 'cur ' + toneClass(o));
    trailTo(s.trail, s.r, 0);
    // The camera slides from where it is to the next station, with the request.
    s.c0 = aim && !aim.rect ? { x: aim.x, y: aim.y } : centerOf(boxOf(s.from));
    s.c1 = centerOf(boxOf(v.at));
  } else if (s.kind === 'jump') {
    pk.show(false, false);
    if (follow) aimAt(centerOf(boxOf(v.at)));
  } else {
    const o = outOf(v);
    s.plan = enter(v, true);
    s.dur = (pick(v.hold) || (o ? OUT_STAY : STAY[compOf(v.at)] || 1200)) + (s.plan ? s.plan.dur : 0);
    activate(v.at, o && o !== 'clean');
    const end = s.i > 0 ? route(sc.visits[s.i - 1].at, v.at) : null;
    s.p = end ? pointOn(end, end.len) : dock(sc, s.i);
    if (end) {
      const a = pointOn(end, Math.max(0, end.len - 6));
      if (Math.abs(s.p.x - a.x) > Math.abs(s.p.y - a.y)) s.side = s.p.x > a.x ? 'left' : 'right';
    }
    if (o) { pk.text(v.after); pk.tone(sc.out[s.i].from, o === 'clean' ? '' : 'no'); }
    // A stay that shows more than one station visits each in turn.
    s.frames = (v.frame || [v.at]).map((st) => centerOf(boxOf(st)));
    if (follow) aimAt(s.frames[0]);
  }
}
function tickSeg(s, el) {
  const sc = run.sc, v = sc.visits[s.i];
  if (s.kind === 'move') {
    const u = clamp(el / s.dur, 0, 1);
    const f = s.inPass && s.outPass ? u : s.inPass ? easeOut(u) : s.outPass ? easeIn(u) : ease(u);
    const d = f * s.r.len;
    trailTo(s.trail, s.r, d);
    const p = pointOn(s.r, d);
    const a = pointOn(s.r, clamp(d - 3, 0, s.r.len)), b2 = pointOn(s.r, clamp(d + 3, 0, s.r.len));
    pk.place(p, Math.abs(b2.y - a.y) > Math.abs(b2.x - a.x));
    pk.show(true, !inside(p));
    if (follow) aimAt({ x: s.c0.x + (s.c1.x - s.c0.x) * f, y: s.c0.y + (s.c1.y - s.c0.y) * f });
  } else if (s.kind === 'stay') {
    if (s.plan) s.plan.tick(el);
    if (follow && s.frames.length > 1) aimAt(s.frames[Math.min(s.frames.length - 1, Math.floor(el / (s.dur / s.frames.length)))]);
    const o = outOf(v);
    // A stopped request stays in view, shaken; otherwise the component holds it.
    if (o === 'block' || o === 'ask' || o === 'clean') {
      const shake = o === 'block' && el < 500 ? Math.sin(el / 22) * 5 * (1 - el / 500) : 0;
      pk.place(s.p, undefined, shake, false, s.side);
      pk.show(true, v.at !== 'proxy');
    } else if (v.at === 'proxy') { pk.place(s.p); pk.show(true, false); }
    else { pk.place(s.p); pk.show(el < 220, false); }
  }
}
function endSeg(s) {
  if (s.kind === 'move') { trailTo(s.trail, s.r, s.r.len); s.trail.classList.remove('cur'); }
  if (s.kind === 'stay' && s.plan) s.plan.done();
}
function tickRun(dt) {
  if (!run || run.done) return;
  if (!paused) clock += dt;
  let guard = 0;
  while (guard++ < 8) {
    const s = run.segs[run.k];
    if (!s) { finish(); return; }
    if (!s.begun) { s.begun = true; s.t0 = run.t0; beginSeg(s); }
    const el = clock - s.t0;
    tickSeg(s, Math.min(el, s.dur));
    if (el < s.dur) return;
    endSeg(s);
    run.t0 = s.t0 + s.dur;
    run.k++;
  }
}
function finish() {
  run.done = true;
  const last = run.sc.visits[run.b - 1];
  if (!last || !outOf(last) || outOf(last) === 'clean') pk.show(false, false);
  playerState();
}
// The whole scene up to visit a, at once.
function fastForward(sc, a) {
  enter({ fill: sc.init.fill }, false);
  if (sc.init.session) { msgs.push(...toChat(sc.init.session)); drawChat(); }
  (sc.init.trail || []).forEach((n) => trail(route(...n.split('>')), 'past o-' + SOURCE[n.split('>')[0]]));
  for (let i = 0; i < a; i++) {
    const v = sc.visits[i], prev = sc.visits[i - 1];
    const r = prev && route(prev.at, v.at);
    if (r) trail(r, 'past ' + toneClass(sc.out[i - 1]));
    enter(v, false);
  }
}

/* ---------- the player ---------- */
// The previous section, the animation of this one, the next section, and which section is on.
function playerState() {
  const n = viewSteps().length;
  $('#p-n').textContent = String(step + 1);
  $('#p-of').textContent = String(n);
  $('#p-prev').disabled = step <= 0;
  $('#p-next').disabled = step >= n - 1;
  const state = !run ? 'still' : run.done ? 'ended' : paused ? 'paused' : 'playing';
  player.dataset.state = state;
  const play = $('#p-play'), name = state === 'ended' ? L.ui.replay : state === 'playing' ? L.ui.pause : L.ui.play;
  play.disabled = state === 'still';
  play.setAttribute('aria-label', name);
  play.title = name;
}
$('#p-play').addEventListener('click', () => {
  if (!run) return;
  if (run.done) { setStep(step, false, true); return; }
  paused = !paused;
  playerState();
});
$('#p-prev').addEventListener('click', () => goTo(step - 1));
$('#p-next').addEventListener('click', () => goTo(step + 1));

/* ---------- camera ---------- */
// Close-ups use one scale, derived from the window size, and the camera pans between stations
// without zooming. An overview fits the whole diagram. A click on the diagram hands the camera to
// the pointer: dragging pans and the wheel zooms; after IDLE ms without input, the camera returns
// to the request.
let vb = { x: 0, y: 0, w: 1252, h: 1590 }, goal = null, aim = null, follow = false;
// The unobstructed part of the window: right of the documentation column and its blur, between
// the header and the player.
function safe() {
  const r = stage.getBoundingClientRect();
  const W = r.width || innerWidth, H = r.height || innerHeight;
  if (!wide()) return { W, H, x: 8, y: 8, w: W - 16, h: H - 60 };
  const left = doc.getBoundingClientRect().right + FADE * 0.55;
  return { W, H, x: left, y: 80, w: W - left - 40, h: H - 80 - 78 };
}
// On narrow screens a close-up spans the widest component, the session.
const closeScale = (S) => clamp(Math.min(S.w / (wide() ? 700 : 600), S.h / (wide() ? 540 : 420)), 0.5, 1.15);
const viewAt = (c, s, S) => ({ x: c.x - (S.x + S.w / 2) / s, y: c.y - (S.y + S.h / 2) / s, w: S.W / s, h: S.H / s });
// An aim is a point, for a close-up, or a rectangle to show whole, for an overview.
function goalOf(a) {
  const S = safe();
  if (!a.rect) return viewAt(a, closeScale(S), S);
  const r = a.rect;
  return viewAt(centerOf(r), Math.min(S.w / r.w, S.h / r.h, closeScale(S)), S);
}
function applyVB() { scene.setAttribute('viewBox', vb.x.toFixed(2) + ' ' + vb.y.toFixed(2) + ' ' + vb.w.toFixed(2) + ' ' + vb.h.toFixed(2)); }
function aimAt(a, instant) {
  aim = a;
  goal = goalOf(a);
  if ((instant || reduced()) && !free) { vb = { ...goal }; applyVB(); }
}
const camRect = (c) => ({ x: c[0], y: c[1], w: c[2], h: c[3] });
const camAim = (c) => (c === CAM.all ? { rect: camRect(c) } : centerOf(camRect(c)));

// The camera in the pointer's hands.
const IDLE = 2000;
const pointers = new Map();
let free = false, lastInput = 0, tap = null;
function takeCamera() { free = true; lastInput = performance.now(); stage.classList.add('free'); }
function giveCamera() { free = false; pointers.clear(); stage.classList.remove('free', 'dragging'); }
// Zooms by f around a point of the window, from a little below the overview to three close-ups.
function zoomAt(px, py, f) {
  const r = stage.getBoundingClientRect(), S = safe(), s0 = r.width / vb.w;
  const s = clamp(s0 * f, Math.min(S.w / CAM.all[2], S.h / CAM.all[3]) * 0.9, closeScale(S) * 3);
  const ux = vb.x + (px - r.left) / s0, uy = vb.y + (py - r.top) / s0;
  vb = { x: ux - (px - r.left) / s, y: uy - (py - r.top) / s, w: r.width / s, h: r.height / s };
  applyVB();
}
const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button')) return;
  // A mouse takes the camera at once; a finger only after a tap, so that a swipe still scrolls.
  if (e.pointerType !== 'mouse' && !free) { tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; return; }
  takeCamera();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.setPointerCapture(e.pointerId);
  stage.classList.add('dragging');
});
stage.addEventListener('pointermove', (e) => {
  if (!free) return;
  lastInput = performance.now();
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
    const k = vb.w / stage.getBoundingClientRect().width;
    vb.x -= (e.clientX - p.x) * k; vb.y -= (e.clientY - p.y) * k;
    p.x = e.clientX; p.y = e.clientY;
    applyVB();
  } else {
    const d0 = spread();
    p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...pointers.values()];
    if (d0 > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, spread() / d0);
  }
});
function lift(e) {
  pointers.delete(e.pointerId);
  if (!pointers.size) stage.classList.remove('dragging');
  if (tap && tap.id === e.pointerId) {
    if (e.type === 'pointerup' && performance.now() - tap.t < 500 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) takeCamera();
    tap = null;
  }
}
stage.addEventListener('pointerup', lift);
stage.addEventListener('pointercancel', lift);
stage.addEventListener('wheel', (e) => {
  if (!free) return;
  e.preventDefault();
  lastInput = performance.now();
  // Pixels, lines or pages, as the device reports them.
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
  zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.0015));
}, { passive: false });

/* ---------- the text column ---------- */
let view = null, step = -1, current = null;
function rowFor(f) {
  const C = chapterText(f);
  const a = h('a', 'row');
  a.href = '#' + f.id;
  const main = h('span', '');
  const top = h('span', 'row-top');
  top.append(h('span', 'row-name', md(C.name)), h('span', 'chip', md(C.kick)));
  main.append(top, h('span', 'row-deck', md(C.deck)));
  a.append(t('span', 'row-n', num(f)), main, t('span', 'row-go', '→'));
  a.addEventListener('mouseenter', () => preview(f));
  a.addEventListener('focus', () => preview(f));
  a.addEventListener('mouseleave', () => preview(null));
  a.addEventListener('blur', () => preview(null));
  return a;
}
function renderHome() {
  const H = L.ui.home;
  doc.textContent = '';
  const s0 = h('section', 'step hero');
  const actions = h('div', 'actions');
  const go = h('a', 'cta', md(H.start) + '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>');
  go.href = '#' + FEATURES[0].id;
  const agents = h('span', 'for', logo('logo-claude') + '<span></span>' + logo('logo-codex'));
  agents.setAttribute('role', 'img');
  agents.setAttribute('aria-label', L.ui.forAgents);
  actions.append(go, agents);
  s0.append(h('h1', '', md(H.title)), h('p', 'lede', md(H.lede)), actions);
  const s1 = h('section', 'step cat');
  s1.append(h('h2', '', md(H.contentsTitle)), h('p', '', md(H.contentsText)));
  const rows = h('div', 'rows');
  FEATURES.forEach((f) => rows.append(rowFor(f)));
  s1.append(rows);
  [s0, s1].forEach((s, i) => { s.dataset.i = String(i); doc.append(s); });
}
// A chapter is one example told in steps: each section is a heading and its paragraphs.
function renderFeature(f) {
  const C = chapterText(f);
  doc.textContent = '';
  f.steps.forEach((st, i) => {
    const tx = C.steps[st.id];
    const sec = h('section', 'step');
    sec.dataset.i = String(i);
    if (i === 0) {
      const head = h('header', 'f-head');
      head.append(h('p', 'eyebrow', '<span class="n">' + num(f) + '</span><span class="chip">' + md(C.kick) + '</span>'), h('h1', '', md(C.name)), h('p', 'deck', md(C.deck)));
      sec.append(head);
    }
    sec.append(h('h2', '', md(tx.h)));
    tx.p.forEach((p) => sec.append(h('p', '', md(p))));
    doc.append(sec);
  });
}
function viewSteps() { return view.steps.map((s) => s.s); }

/* ---------- states ---------- */
let lit = [];
function setStep(n, instant, force) {
  if (n === step && !force) return;
  step = n;
  const st = viewSteps()[n];
  current = st;
  stopRun();
  paused = false;
  resetAll(st);
  const sc = st.run ? sceneOf(n) : null;
  const [a, b] = sc ? sc.ranges[n] : [0, 0];
  follow = !!sc && b > a && st.follow !== false && !reduced();
  if (sc) {
    fastForward(sc, a);
    // The stations this step visits, and the arrows between them.
    const set = new Set(st.hl || []);
    for (let i = Math.max(0, a - 1); i < b; i++) {
      set.add(compOf(sc.visits[i].at));
      (sc.visits[i].frame || []).forEach((c) => set.add(c));
      const r = i > a - 1 && i > 0 && route(sc.visits[i - 1].at, sc.visits[i].at);
      if (r) set.add(r.name);
    }
    lit = b > a && st.follow !== false ? [...set] : st.hl || [];
    if (reduced() || b === a) {
      for (let i = a; i < b; i++) {
        const v = sc.visits[i], r = i > 0 && route(sc.visits[i - 1].at, v.at);
        if (r) trail(r, toneClass(sc.out[i - 1]));
        enter(v, false);
      }
      const last = sc.visits[b - 1];
      if (last && b > a) activate(last.at, outOf(last) && outOf(last) !== 'clean');
    } else {
      run = makeRun(sc, a, b);
      if (a > 0) { const p = dock(sc, a - 1); pk.place(p, false, 0, true); }
    }
  } else lit = st.hl || [];
  paint(st, lit);
  if (follow) aimAt(centerOf(boxOf(sc.visits[Math.max(0, a - 1)].at)), instant);
  else aimAt(camAim(st.cam || CAM.all), instant);
  $$('.step', doc).forEach((s) => s.classList.toggle('on', +s.dataset.i === n));
  playerState();
  crumb();
}
function preview(f) {
  if (view !== HOME) return;
  if (f) paint({ hl: f.preview }, f.preview); else if (current) paint(current, lit);
}
function crumb() {
  const c = $('#crumb');
  c.textContent = '';
  if (view === HOME) return;
  c.append(t('span', 'n', num(view)), t('b', '', plain(chapterText(view).name)));
}
$$('.agents button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.agent === agent) return;
  agent = b.dataset.agent;
  try { localStorage.setItem('agent-security-guide:agent', agent); } catch (e) {}
  buildLists();
  if (step >= 0) setStep(step, false, true);
}));

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
    $('#back').hidden = view === HOME;
    scrollTo(0, 0);
    step = -1;
    setStep(0);
    langLinks();
    doc.classList.remove('swap');
  };
  if (reduced() || !doc.childElementCount) swap(); else setTimeout(swap, 220);
}
function goRoute(id) {
  if (id === '') {
    try { history.pushState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    show('');
  } else if (location.hash !== '#' + id) location.hash = id;
  else show(id);
}
addEventListener('hashchange', () => show(location.hash.slice(1)));
addEventListener('popstate', () => show(location.hash.slice(1)));
$('#brand').addEventListener('click', (e) => { e.preventDefault(); goRoute(''); });
$('#back').addEventListener('click', (e) => { e.preventDefault(); goRoute(''); });

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
  // Below the last section, the last step stays on.
  if (sections.length && sections[sections.length - 1].getBoundingClientRect().bottom <= y) return sections.length - 1;
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
  if (e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); goTo(step + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(step - 1); }
  else if (e.key === 'Escape' && free) { e.preventDefault(); giveCamera(); }
  else if (e.key === 'Escape' && view !== HOME) { e.preventDefault(); goRoute(''); }
});
addEventListener('resize', () => {
  if (step < 0 || !aim) return;
  goal = goalOf(aim);
  if (!free) { vb = { ...goal }; applyVB(); }
});

/* ---------- theme ---------- */
function effectiveTheme() {
  const th = document.documentElement.dataset.theme;
  if (th === 'light' || th === 'dark') return th;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function themeLabel() {
  const s = effectiveTheme() === 'dark' ? L.ui.themeLight : L.ui.themeDark;
  $('#theme').setAttribute('aria-label', s); $('#theme').title = s;
}
$('#theme').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('agent-security-guide:theme', next); } catch (e) {}
  themeLabel();
});
try { const saved = localStorage.getItem('agent-security-guide:theme'); if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved; } catch (e) {}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', themeLabel);

/* ---------- run ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(64, now - last);
  last = now;
  // A pointer that rests gives the camera back to the request.
  if (free && !pointers.size && now - lastInput > IDLE) giveCamera();
  if (goal && !free) {
    const k = reduced() ? 1 : 1 - Math.exp(-dt / 480);
    vb = { x: vb.x + (goal.x - vb.x) * k, y: vb.y + (goal.y - vb.y) * k, w: vb.w + (goal.w - vb.w) * k, h: vb.h + (goal.h - vb.h) * k };
    applyVB();
  }
  tickRun(dt);
  requestAnimationFrame(frame);
}
themeLabel();
buildLists();
fitAll();
show(location.hash.slice(1));
if (goal) { vb = { ...goal }; applyVB(); }
requestAnimationFrame(frame);
// Text measured before the fonts load is re-measured once they do.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitAll(); BOXES = null; if (step >= 0) setStep(step, true, true); });
