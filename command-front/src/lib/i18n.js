// @ts-check
/**
 * Languages (Settings → Language). The game's text and its voices each speak
 * English or Arabic, chosen separately: Arabic text with English voices,
 * English text with Arabic voices, or either language for both. Both start
 * as the browser's language.
 *
 * Text is written in English in the code and looked up when shown:
 *   t('Skirmish')                     → "مناوشة"
 *   t('Group {n} set ({count})', {…}) → placeholders filled after lookup
 *   nameOf('heavyTank', 'Heavy Tank') → a unit's or building's name
 * A string with no Arabic entry shows in English, so nothing ever goes blank.
 * Presentation only — the sim never reads this.
 */
import { AR } from '../data/lang/ar.js';

/** @typedef {'en' | 'ar'} Lang */

export const LANGS = /** @type {const} */ (['en', 'ar']);
/** Each language named in itself, for the pickers. */
export const LANG_NAMES = Object.freeze({ en: 'English', ar: 'العربية' });

/** @type {Lang} */
let text = 'en';
/** @type {Lang} */
let voice = 'en';
/** @type {Set<() => void>} */
const watchers = new Set();

/** The browser's language as one of ours (Arabic for any `ar-*`, else English). @returns {Lang} */
export function browserLang() {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const list = nav ? [...(nav.languages ?? []), nav.language ?? ''] : [];
  return list.find(Boolean)?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** @param {any} v @returns {Lang} */
const valid = (v) => (v === 'ar' || v === 'en' ? v : browserLang());

/**
 * Switch languages (missing ones fall back to the browser's). Arabic text
 * turns the page right-to-left where it reads text (menus, cards, toasts);
 * the battlefield layout stays put.
 * @param {{ text?: string, voice?: string }} choice
 */
export function setLanguages(choice) {
  text = valid(choice.text);
  voice = valid(choice.voice);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = text;
    document.documentElement.classList.toggle('lang-ar', text === 'ar');
    document.querySelectorAll('[data-ar]').forEach((el) => {
      const node = /** @type {HTMLElement} */ (el);
      node.dataset.en ??= node.textContent ?? '';
      node.textContent = text === 'ar' ? node.dataset.ar ?? '' : node.dataset.en;
    });
    // Remembered outside the async settings store so index.html can switch before the game loads.
    try { localStorage.setItem('cf-lang', text); } catch { /* storage blocked */ }
  }
  for (const fn of watchers) fn();
}

/** Current text language. */
export const textLang = () => text;
/** Current voice language. */
export const voiceLang = () => voice;
/** Run `fn` whenever a language changes; returns the unsubscribe. @param {() => void} fn */
export function onLanguage(fn) { watchers.add(fn); return () => watchers.delete(fn); }

/** Fill `{name}` placeholders. @param {string} s @param {Record<string, any>} [vars] */
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Untranslated strings met so far (shown by `?debug` in the console). */
export const missing = new Set();

/**
 * Translate an interface string.
 * @param {string} en  the English text, which is also the key
 * @param {Record<string, any>} [vars]
 */
export function t(en, vars) {
  if (text === 'en' || !en) return fill(en, vars);
  const ar = AR.ui[en];
  if (ar === undefined && /[A-Za-z]{2}/.test(en)) missing.add(en);
  return fill(ar ?? en, vars);
}

/** A unit's, building's or support power's name. @param {string} id @param {string} en */
export const nameOf = (id, en) => (text === 'ar' ? AR.names[id] ?? en : en);

/** A weapon's name. @param {string} id @param {string} en */
export const weaponNameOf = (id, en) => (text === 'ar' ? AR.weapons[id] ?? en : en);

/** Codex text in the current language. @param {string} id @param {{ about: string, bestFor: string, weakTo?: string }} en */
export const codexOf = (id, en) => (text === 'ar' ? AR.codex[id] ?? en : en);

/** A whole number for display (Western digits in both languages, grouped). @param {number} n */
export const int = (n) => Math.round(n).toLocaleString('en-US');

/** A list joined the way the language joins lists. @param {string[]} items */
export const list = (items) => items.join(text === 'ar' ? '، ' : ', ');
