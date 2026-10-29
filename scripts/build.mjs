#!/usr/bin/env node
// Builds the guide: one self-contained page per language, from src/.
//
//   node scripts/build.mjs           validate, then write dist/
//   node scripts/build.mjs --check   validate only
//
// The default language is written to dist/index.html, every other one to dist/<meta.path>/.
// SITE_URL (the published base URL, e.g. https://user.github.io/repo/) adds canonical and
// hreflang links; without it they are left out.
//
// Validation fails the build when a locale differs from the default one in shape: a missing or
// extra key, an empty string, or a {placeholder} that does not match. It also checks that every
// chapter in chapters.js has a kicker, a name and a deck, that every step has a heading and
// paragraphs, and that every @label it uses exists.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DEFAULT = 'en';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check');
const SITE = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, '/') : '';

const read = (p) => readFileSync(join(SRC, p), 'utf8');
const errors = [];
const fail = (msg) => errors.push(msg);

/* ---------- sources ---------- */
const template = read('index.html');
const styles = read('styles.css');
const chaptersJs = read('chapters.js');
const appJs = read('app.js');
const locales = {};
for (const file of readdirSync(join(SRC, 'locales')).filter((f) => f.endsWith('.json')).sort()) {
  try { locales[file.slice(0, -5)] = JSON.parse(read('locales/' + file)); }
  catch (e) { fail(`locales/${file}: ${e.message}`); }
}
const base = locales[DEFAULT];
if (!base) fail(`locales/${DEFAULT}.json is missing; it is the reference for every other language`);
const { FEATURES, HOME } = vm.runInNewContext(chaptersJs + '\n;({ FEATURES, HOME })');

/* ---------- validation ---------- */
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : [v]);
function sameShape(ref, val, where, file) {
  if (typeof ref === 'string') {
    if (typeof val !== 'string') return fail(`${file}: ${where} must be text`);
    if (!val.trim() && where !== 'meta.path') fail(`${file}: ${where} is empty`);
    if (placeholders(ref) !== placeholders(val)) fail(`${file}: ${where} must use the placeholders {${placeholders(ref)}}`);
  } else if (Array.isArray(ref)) {
    if (!Array.isArray(val) || !val.length) return fail(`${file}: ${where} must be a non-empty list`);
    if (flat(val).some((v) => typeof v !== 'string')) fail(`${file}: ${where} has an entry that is not text`);
    const a = placeholders(flat(ref).join(' ')), b = placeholders(flat(val).join(' '));
    if (a !== b) fail(`${file}: ${where} must use the placeholders {${a}}`);
  } else {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return fail(`${file}: ${where} must be an object`);
    for (const k of Object.keys(ref)) {
      if (!(k in val)) fail(`${file}: ${where ? where + '.' : ''}${k} is missing`);
      else sameShape(ref[k], val[k], (where ? where + '.' : '') + k, file);
    }
    for (const k of Object.keys(val)) if (!(k in ref)) fail(`${file}: ${where ? where + '.' : ''}${k} is not in ${DEFAULT}.json`);
  }
}
const lookup = (obj, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const templateKeys = [...new Set([...template.matchAll(/\{\{([\w.]+)\}\}/g)].map((m) => m[1]))];
const SPECIAL = new Set(['styles', 'script', 'languages', 'alternates']);

if (base) {
  // chapters.js against the default locale
  for (const f of FEATURES) {
    const text = base.chapters[f.id];
    if (!text) { fail(`${DEFAULT}.json: chapters.${f.id} is missing`); continue; }
    for (const k of ['kick', 'name', 'deck']) if (typeof text[k] !== 'string') fail(`${DEFAULT}.json: chapters.${f.id}.${k} is missing`);
    for (const st of f.steps) {
      const tx = text.steps[st.id];
      if (!tx) fail(`${DEFAULT}.json: chapters.${f.id}.steps.${st.id} is missing`);
      else if (typeof tx.h !== 'string' || !Array.isArray(tx.p)) fail(`${DEFAULT}.json: chapters.${f.id}.steps.${st.id} needs "h" and "p"`);
    }
    for (const id of Object.keys(text.steps)) if (!f.steps.some((s) => s.id === id)) fail(`${DEFAULT}.json: chapters.${f.id}.steps.${id} is not a step in chapters.js`);
  }
  for (const id of Object.keys(base.chapters)) if (!FEATURES.some((f) => f.id === id)) fail(`${DEFAULT}.json: chapters.${id} is not a chapter in chapters.js`);
  for (const st of HOME.steps) if (!base.ui.home.rail[st.id]) fail(`${DEFAULT}.json: ui.home.rail.${st.id} is missing`);
  // Labels are named as '@name', or inserted as {@name}, anywhere in chapters.js, including the
  // functions that build per-agent content.
  const used = new Set([...chaptersJs.matchAll(/(?:'@|\{@)(\w+)/g)].map((m) => m[1]));
  for (const k of used) if (!(k in base.labels)) fail(`chapters.js uses @${k}, which is not in labels`);
  for (const k of Object.keys(base.labels)) if (!used.has(k) && !templateKeys.includes('labels.' + k)) fail(`${DEFAULT}.json: labels.${k} is never used`);
  for (const key of templateKeys) if (!SPECIAL.has(key) && typeof lookup(base, key) !== 'string') fail(`index.html uses {{${key}}}, which is not text in ${DEFAULT}.json`);
  // every other locale against the default one
  const paths = new Map();
  for (const [lang, loc] of Object.entries(locales)) {
    if (lang !== DEFAULT) sameShape(base, loc, '', `${lang}.json`);
    const path = loc.meta && loc.meta.path;
    if (lang === DEFAULT ? path !== '' : !/^[a-z0-9-]+$/.test(path || '')) fail(`${lang}.json: meta.path must be ${lang === DEFAULT ? 'empty' : 'lowercase letters, digits and hyphens'}`);
    if (paths.has(path)) fail(`${lang}.json: meta.path "${path}" is also used by ${paths.get(path)}.json`);
    paths.set(path, lang);
  }
}

if (errors.length) {
  console.error(errors.map((e) => '  ' + e).join('\n'));
  console.error(`build: ${errors.length} problem${errors.length > 1 ? 's' : ''}`);
  process.exit(1);
}
if (CHECK_ONLY) { console.log(`build: ${Object.keys(locales).length} locales are complete`); process.exit(0); }

/* ---------- output ---------- */
const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Safe inside <script>: no closing tag, no line separators that end a JS string.
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
const order = Object.keys(locales).sort((a, b) => (a === DEFAULT ? -1 : b === DEFAULT ? 1 : a.localeCompare(b)));
const dirOf = (lang) => locales[lang].meta.path;
const depth = (lang) => (dirOf(lang) ? dirOf(lang).split('/').length : 0);
const rel = (from, to) => '../'.repeat(depth(from)) + (dirOf(to) ? dirOf(to) + '/' : '') || './';

rmSync(OUT, { recursive: true, force: true });
for (const lang of order) {
  const loc = locales[lang];
  const languages = order.map((to) => {
    const m = locales[to].meta, href = rel(lang, to) || './';
    return `<a href="${href}" data-base="${href}" hreflang="${m.lang}" lang="${m.lang}" title="${escHtml(m.name)}"${to === lang ? ' aria-current="page"' : ''}>${escHtml(m.label)}</a>`;
  }).join('');
  const alternates = SITE
    ? [`<link rel="canonical" href="${SITE}${dirOf(lang) ? dirOf(lang) + '/' : ''}">`]
        .concat(order.map((to) => `<link rel="alternate" hreflang="${locales[to].meta.lang}" href="${SITE}${dirOf(to) ? dirOf(to) + '/' : ''}">`))
        .concat([`<link rel="alternate" hreflang="x-default" href="${SITE}">`]).join('\n')
    : '';
  const script = `(() => {\n'use strict';\nconst L = ${scriptJson(loc)};\n${chaptersJs}\n${appJs}\n})();`;
  const special = { styles: styles.trimEnd(), script, languages, alternates };
  // Locale keys first, then the inserted blocks, so that their contents are never read as keys.
  const html = template
    .replace(/\{\{([\w.]+)\}\}/g, (m, key) => (SPECIAL.has(key) ? m : escHtml(lookup(loc, key))))
    .replace(/\{\{(styles|script|languages|alternates)\}\}/g, (m, key) => special[key]);
  const dir = join(OUT, dirOf(lang));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log(`build: ${join('dist', dirOf(lang), 'index.html')}  ${lang}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}
