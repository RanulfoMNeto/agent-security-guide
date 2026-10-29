/* Rendering, animation and navigation. The build places this after chapters.js, inside one
   function that also defines L, the text of the page's language. */

const NS = 'http://www.w3.org/2000/svg';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const scene = $('#scene'), stage = $('#stage'), doc = $('#doc'), fx = $('#fx'), rail = $('#rail'), trailsG = $('#trails');
const bar = $('#journey');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = () => matchMedia('(min-width: 1000px)').matches;
const BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

/* ---------- the agent ---------- */
// The drawing shows the structures of one agent at a time; the text is the same for both.
let agent = 'claude';
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
// The rail and the breadcrumb show text without its markup.
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
const CODE = {};
$$('[data-code]', scene).forEach((g) => {
  const { x, y, n, max } = g.dataset;
  CODE[g.dataset.code] = Array.from({ length: +n }, (_, i) => {
    const el = svg('text', { class: 'code', x, y: +y + i * 15.5, 'data-max': max });
    g.append(el);
    return el;
  });
});
// Strings, keys, literals and punctuation get their own tone; a whole line can carry one instead.
// A string cut short by the ellipsis has no closing quote.
const TOK = /("(?:[^"\\]|\\.)*"?)(\s*:)?|\b(true|false|null)\b|-?\b\d+\b|([{}[\],:=])|([^"{}[\],:=]+)/g;
function codeLine(el, line) {
  const [raw, tone] = lineOf(line);
  el.setAttribute('class', 'code' + (tone ? ' t-' + tone : ''));
  fitTo(el, label(raw), +el.dataset.max, (s) => {
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
  if (ls.length > slots.length) ls = [ls[0], '  …', ...ls.slice(ls.length - slots.length + 2)];
  slots.forEach((el, i) => { el.style.opacity = ''; if (i < ls.length) codeLine(el, ls[i]); else el.textContent = ''; });
  const sub = $('[data-fsub="' + comp + '"]', scene);
  if (sub) sub.classList.toggle('gone', ls.length > 0);
  const m = $('[data-fm="' + comp + '"]', scene);
  if (m) setText(m, meta || (STATIC_META[comp] ? AGENTS[agent].api : ''), +m.dataset.max);
  if (comp === 'proxy') $('#proxy-note').classList.toggle('on', ls.length > 0);
  if (comp === 'prompt') lineNumbers(ls.length);
  if (comp === 'context') contextCards(ls);
  // A lane's bar shows the hook's result: blue when it lets the event go on, clay when it stops it.
  if (comp.startsWith('hook.')) {
    const r = ls.find((l) => toneOf(l));
    $('#lane-' + comp.slice(5) + ' .lane-bar').setAttribute('class', 'lane-bar' + (r ? (toneOf(r) === 'deny' ? ' no' : ' ok') : ''));
  }
}
function lineNumbers(n) {
  const g = $('#ln-prompt');
  g.textContent = '';
  for (let i = 0; i < n; i++) { const e = svg('text', { class: 'ln', x: 88, y: 592 + i * 15.5, 'text-anchor': 'end' }); e.textContent = i + 1; g.append(e); }
}
// Each message of the context is a card, marked by where it came from: the memory, you, the
// model or a tool.
function roleOf(text) {
  if (/tool_result|function_call_output/.test(text)) return 'tool';
  if (/"assistant"|function_call|apply_patch/.test(text)) return 'model';
  if (/system-reminder|AGENTS\.md/.test(text)) return 'mem';
  return 'user';
}
function contextCards(ls) {
  const g = $('#ctx-cards');
  g.textContent = '';
  const groups = [];
  ls.forEach((l, i) => {
    const raw = rawOf(l);
    if (/^  \{/.test(raw)) groups.push({ from: i, to: i, text: raw });
    else if (/^    /.test(raw) && groups.length && groups[groups.length - 1].to === i - 1) { groups[groups.length - 1].to = i; groups[groups.length - 1].text += raw; }
  });
  groups.forEach((c) => {
    const y = 588 + c.from * 15.5 - 11.5, hh = (c.to - c.from + 1) * 15.5 + 3, r = roleOf(c.text);
    g.append(svg('rect', { class: 'card', x: 462, y, width: 316, height: hh, rx: 5 }), svg('rect', { class: 'card-bar r-' + r, x: 462, y, width: 3, height: hh, rx: 1.5 }));
  });
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
  $$('.a-logo, .h-logo', scene).forEach((u) => u.setAttribute('href', '#' + A.logo));
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
const COLS = 43, TYPE_CMD = 24;
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
// "you" is typed in the field and then sent; "sent" is already in the conversation; "note" is
// a notice to you; "agent" is the agent's answer.
const chatG = $('#chat-msgs');
const CHAT = { top: 108, bottom: 220, left: 82, right: 618, gap: 10 };
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
    return { h: ls.length * 16, draw(y) { ls.forEach((l, i) => textAt('chat-note', CHAT.right, y + 12 + i * 16, l, 'end')); } };
  }
  if (m.who === 'agent') {
    const ls = wrap(m.text, 470, 'chat-t');
    return { h: ls.length * 19, draw(y) { ls.forEach((l, i) => textAt('chat-t', CHAT.left, y + 14 + i * 19, l)); } };
  }
  const ls = wrap(m.text, 380, 'chat-t');
  return {
    h: ls.length * 19 + 14,
    draw(y) {
      const r = svg('rect', { class: 'bubble', y, height: ls.length * 19 + 14, rx: 14 });
      chatG.append(r);
      const els = ls.map((l, i) => { const e = svg('text', { class: 'chat-t', y: y + 21 + i * 19 }); e.textContent = l; chatG.append(e); return e; });
      const w = Math.max(...els.map(textWidth)) + 26;
      r.setAttribute('x', (CHAT.right - w).toFixed(1)); r.setAttribute('width', w.toFixed(1));
      els.forEach((e) => e.setAttribute('x', (CHAT.right - w + 13).toFixed(1)));
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
  const ls = text ? wrap(text, 470, 'chat-t').slice(-2) : [];
  const [a, b] = [$('#chat-in0'), $('#chat-in1')];
  a.textContent = ls[0] || ''; b.textContent = ls[1] || '';
  a.setAttribute('y', ls.length > 1 ? 252 : 262);
  $('#chat-ph').classList.toggle('gone', ls.length > 0);
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
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
// Packet labels step aside while the packet crosses a component.
let BOXES = null;
const inside = (p) => (BOXES || (BOXES = $$('.node .box', scene).map((b) => b.getBBox())))
  .some((b) => p.x > b.x + 6 && p.x < b.x + b.width - 6 && p.y > b.y + 6 && p.y < b.y + b.height - 6);

/* ---------- the request on its way ---------- */
const pk = (() => {
  const g = svg('g', { class: 'pk' });
  const link = svg('line', { class: 'pk-link' });
  const dot = svg('g', { class: 'pk-dot' });
  dot.append(svg('circle', { class: 'pk-halo', r: 8 }), svg('circle', { class: 'pk-head', r: 8 }));
  const lab = svg('g', { class: 'pk-lab' });
  const bg = svg('rect', { class: 'pk-bg', rx: 15, height: 30, y: -15 });
  const tx = svg('text', { class: 'pk-tx', y: 5 });
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
      lw = (textWidth(tx) || s.length * 8.2) + 28;
      bg.setAttribute('width', lw.toFixed(1)); bg.setAttribute('x', (-lw / 2).toFixed(1));
      tx.setAttribute('x', (-lw / 2 + 14).toFixed(1));
    },
    state(s) { g.classList.toggle('no', s === 'no'); },
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
    reset() { text = null; off = null; tx.textContent = ''; this.show(false, false); this.state(''); }
  };
})();

/* ---------- the journey ---------- */
// A scene is the example of a group of steps: every visit from its first step to its last.
const SPEED = 320;
const STAY = { session: 1500, prompt: 1200, hook: 1300, context: 1200, memory: 1000, model: 1300, perm: 1400, tools: 500, terminal: 600, proxy: 1300, net: 1600 };
const RATES = [1, 1.5, 2];
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
  // What the request carries out of each station, and whether it was stopped there.
  let carry = '', state = '';
  const out = visits.map((v) => {
    const o = pick(v.out);
    if (v.carry != null) { carry = v.carry; state = ''; }
    if (o) { carry = v.after != null ? v.after : carry; state = o === 'clean' ? '' : 'no'; }
    return { carry, state };
  });
  return { start: s0, init: steps[s0].init || {}, visits, ranges, out };
}
const outOf = (v) => pick(v.out);
const isPass = (v) => !!pick(v.pass);

let run = null, clock = 0, paused = false, rate = 1;
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
    pk.text(o.carry); pk.state(o.state);
    s.trail = trail(s.r, 'cur' + (o.state ? ' no' : ''));
    trailTo(s.trail, s.r, 0);
    if (follow) aimRect(union(boxOf(s.from), boxOf(v.at)));
    setBar(s.i, 'move');
  } else if (s.kind === 'jump') {
    pk.show(false, false);
    setBar(s.i, 'move');
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
    if (o) { pk.text(v.after); pk.state(o === 'clean' ? '' : 'no'); }
    if (follow) aimRect((v.frame || [v.at]).map(boxOf).reduce(union));
    setBar(s.i, 'stay');
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
  } else if (s.kind === 'stay') {
    if (s.plan) s.plan.tick(el);
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
  if (!paused) clock += dt * rate;
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
  bar.classList.add('ended');
  if (!last || !outOf(last) || outOf(last) === 'clean') pk.show(false, false);
}
// The whole scene up to visit a, at once.
function fastForward(sc, a) {
  enter({ fill: sc.init.fill }, false);
  if (sc.init.session) { msgs.push(...toChat(sc.init.session)); drawChat(); }
  (sc.init.trail || []).forEach((n) => trail(route(...n.split('>')), 'past'));
  for (let i = 0; i < a; i++) {
    const v = sc.visits[i], prev = sc.visits[i - 1];
    const r = prev && route(prev.at, v.at);
    if (r) trail(r, 'past' + (sc.out[i - 1].state ? ' no' : ''));
    enter(v, false);
  }
}

/* ---------- the journey bar ---------- */
const NAME = { net: 'internet' };
const stationName = (st) => L.diagram[NAME[compOf(st)] || compOf(st)];
function buildBar(sc, a, b) {
  const track = $('#j-track');
  track.textContent = '';
  sc.visits.forEach((v, i) => {
    if (isPass(v)) return;
    const s = document.createElement('i');
    s.dataset.i = i;
    s.className = i < a ? 'before' : i >= b ? 'after' : '';
    track.append(s);
  });
  bar.classList.remove('ended', 'blocked');
}
function setBar(i, phase) {
  const sc = run.sc, v = sc.visits[i];
  $('#j-name').textContent = stationName(v.at);
  const o = outOf(v);
  $('#j-detail').textContent = (phase === 'move' ? label(sc.out[i - 1] ? sc.out[i - 1].carry : '') : label(pick(v.say))) || '';
  bar.classList.toggle('blocked', phase === 'stay' && !!o && o !== 'clean');
  const segs = $$('#j-track i');
  const total = segs.length, at = segs.findIndex((s) => +s.dataset.i >= i);
  $('#j-count').textContent = (at < 0 ? total : at + 1) + ' / ' + total;
  segs.forEach((s) => {
    const k = +s.dataset.i;
    if (k < run.a || k >= run.b) return;
    s.className = k < i ? 'done' : k === i ? (phase === 'stay' && o && o !== 'clean' ? 'block' : 'cur') : '';
  });
}
function showFinal(sc, b) {
  const segs = $$('#j-track i');
  segs.forEach((s) => { const k = +s.dataset.i; s.className = k < b ? 'before' : 'after'; });
  const last = sc.visits[b - 1];
  if (last) { $('#j-name').textContent = stationName(last.at); $('#j-detail').textContent = label(pick(last.say)) || ''; }
  $('#j-count').textContent = segs.length + ' / ' + segs.length;
  bar.classList.add('ended');
}
$('#j-play').addEventListener('click', () => {
  paused = !paused;
  bar.classList.toggle('paused', paused);
  $('#j-play').setAttribute('aria-label', paused ? L.ui.play : L.ui.pause);
});
$('#j-speed').addEventListener('click', () => {
  rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  $('#j-speed').textContent = rate + '×';
});
$('#j-replay').addEventListener('click', () => { paused = false; bar.classList.remove('paused'); setStep(step, false, true); });

/* ---------- camera ---------- */
// The view eases toward a target: a fixed frame, or the stations the request is between.
let vb = { x: 0, y: 0, w: 1252, h: 1590 }, goal = null, goalRect = null, follow = false;
function safe() {
  const r = stage.getBoundingClientRect();
  const W = r.width || innerWidth, H = r.height || innerHeight;
  if (!wide()) return { W, H, x: 8, y: 50, w: W - 16, h: H - 50 - (bar.hidden ? 12 : 78) };
  const left = doc.getBoundingClientRect().right + 96;
  return { W, H, x: left, y: 120, w: W - left - 52, h: H - 120 - (bar.hidden ? 30 : 116) };
}
function fit(rect, maxScale) {
  const S = safe();
  const s = Math.min(S.w / rect.w, S.h / rect.h, maxScale || 1.35);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { x: cx - (S.x + S.w / 2) / s, y: cy - (S.y + S.h / 2) / s, w: S.W / s, h: S.H / s };
}
function applyVB() { scene.setAttribute('viewBox', vb.x.toFixed(2) + ' ' + vb.y.toFixed(2) + ' ' + vb.w.toFixed(2) + ' ' + vb.h.toFixed(2)); }
// Small stations are framed with room around them, so the view never jumps in too close.
function aimRect(r, instant) {
  const MIN_W = 640, MIN_H = 460, PAD = 44;
  let x = r.x - PAD, y = r.y - PAD, w = r.w + 2 * PAD, hh = r.h + 2 * PAD;
  if (w < MIN_W) { x -= (MIN_W - w) / 2; w = MIN_W; }
  if (hh < MIN_H) { y -= (MIN_H - hh) / 2; hh = MIN_H; }
  goalRect = { x, y, w, h: hh };
  goal = fit(goalRect, 1.2);
  if (instant || reduced()) { vb = { ...goal }; applyVB(); }
}
function aimFixed(r, instant) {
  goalRect = r;
  goal = fit(r, 1.35);
  if (instant || reduced()) { vb = { ...goal }; applyVB(); }
}
const camRect = (c) => ({ x: c[0], y: c[1], w: c[2], h: c[3] });

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
function stepLabels() {
  if (view === HOME) return HOME.steps.map((s) => L.ui.home.rail[s.id]);
  return view.steps.map((s) => plain(chapterText(view).steps[s.id].h));
}

/* ---------- states ---------- */
let lit = [];
function setStep(n, instant, force) {
  if (n === step && !force) return;
  step = n;
  const st = viewSteps()[n];
  current = st;
  stopRun();
  resetAll(st);
  const sc = st.run ? sceneOf(n) : null;
  const [a, b] = sc ? sc.ranges[n] : [0, 0];
  follow = !!sc && b > a && st.follow !== false && !reduced();
  bar.hidden = !sc || b === a;
  if (sc) {
    fastForward(sc, a);
    buildBar(sc, a, b);
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
        if (r) trail(r, sc.out[i - 1].state ? 'no' : '');
        enter(v, false);
      }
      if (b > a) showFinal(sc, b);
      const last = sc.visits[b - 1];
      if (last && b > a) activate(last.at, outOf(last) && outOf(last) !== 'clean');
    } else {
      run = makeRun(sc, a, b);
      if (a > 0) { const p = dock(sc, a - 1); pk.place(p, false, 0, true); }
    }
  } else lit = st.hl || [];
  paint(st, lit);
  if (follow) aimRect(boxOf(sc.visits[Math.max(0, a - 1)].at), instant);
  else aimFixed(camRect(st.cam || CAM.all), instant);
  $$('.step', doc).forEach((s) => s.classList.toggle('on', +s.dataset.i === n));
  $$('a', rail).forEach((el, i) => { el.classList.toggle('done', i < n); if (i === n) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
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
  else if (e.key === 'Escape' && view !== HOME) { e.preventDefault(); goRoute(''); }
});
addEventListener('resize', () => {
  if (step < 0 || !goalRect) return;
  goal = fit(goalRect, follow ? 1.2 : 1.35);
  vb = { ...goal }; applyVB();
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
  if (goal) {
    const k = reduced() ? 1 : 1 - Math.exp(-dt / 480);
    vb = { x: vb.x + (goal.x - vb.x) * k, y: vb.y + (goal.y - vb.y) * k, w: vb.w + (goal.w - vb.w) * k, h: vb.h + (goal.h - vb.h) * k };
    applyVB();
  }
  tickRun(dt);
  requestAnimationFrame(frame);
}
$('#j-play').setAttribute('aria-label', L.ui.pause);
themeLabel();
buildLists();
fitAll();
show(location.hash.slice(1));
if (goal) { vb = { ...goal }; applyVB(); }
requestAnimationFrame(frame);
// Text measured before the fonts load is re-measured once they do.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitAll(); BOXES = null; if (step >= 0) setStep(step, true, true); });
