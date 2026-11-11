'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'locales');
const cache = new Map();

function load(lang) {
  if (cache.has(lang)) return cache.get(lang);
  let data = {};
  try { data = JSON.parse(fs.readFileSync(path.join(DIR, `${lang}.json`), 'utf8')); } catch { /* missing file = empty */ }
  cache.set(lang, data);
  return data;
}

function lookup(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

/** Languages that actually have content (so the switcher never offers an empty one). */
function availableLangs() {
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((l) => Object.keys(load(l)).length > 0)
    .sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
}

/** t(key, vars) for a language, falling back to English, then to the key itself. */
function translator(lang) {
  const primary = load(lang);
  const fallback = load('en');
  return function t(key, vars = {}) {
    let s = lookup(primary, key);
    if (s === undefined) s = lookup(fallback, key);
    if (s === undefined) return key;
    if (typeof s !== 'string') return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  };
}

/** Whole subtree for a language (with English fallback merged), e.g. for the tip page's client script. */
function subtree(lang, prefix) {
  const t = translator(lang);
  const base = lookup(load('en'), prefix) || {};
  const out = {};
  for (const k of Object.keys(base)) out[k] = t(`${prefix}.${k}`);
  return out;
}

function pickLang(req, config) {
  const langs = availableLangs();
  const q = req.query && req.query.lang;
  if (q && langs.includes(q)) return q;
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)lang=([a-z]{2})/);
  if (cookie && langs.includes(cookie[1])) return cookie[1];
  return langs.includes(config.defaultLang) ? config.defaultLang : 'en';
}

module.exports = { translator, subtree, availableLangs, pickLang };
