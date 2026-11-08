// @ts-check
/**
 * Skill levels (section 16): a computer player's experience on the 0–10
 * slider, turned into the numbers its brain plays by. Values come from the
 * AI_SKILL table (skill 0, 5 and 10) and are interpolated in between, so each
 * step of the slider is a little better at everything rather than a jump in
 * one thing. Nothing here touches money, tech or unit stats.
 */
import { AI_SKILL, AI_SKILL_NAMES, LEGACY_SKILL, SETUP_DEFAULTS } from '../data/rules.js';

export const SKILL_MIN = 0;
export const SKILL_MAX = 10;

/** A whole skill level in range (anything unreadable becomes the default). @param {any} v */
export function clampSkill(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return SETUP_DEFAULTS.skill;
  return Math.max(SKILL_MIN, Math.min(SKILL_MAX, n));
}

/**
 * A player's or opponent slot's skill, reading the old difficulty names too.
 * @param {{ skill?: any, difficulty?: string }} p
 */
export function skillOf(p) {
  if (p.skill !== undefined && p.skill !== null) return clampSkill(p.skill);
  const legacy = LEGACY_SKILL[/** @type {keyof typeof LEGACY_SKILL} */ (p.difficulty ?? '')];
  return legacy ?? SETUP_DEFAULTS.skill;
}

/** The level's name, in English (look it up with t() to show it). @param {number} level */
export const skillName = (level) => AI_SKILL_NAMES[clampSkill(level)];

/** @typedef {{ [K in keyof typeof AI_SKILL]: number } & { level: number }} SkillProfile */

/** @type {Map<number, SkillProfile>} */
const cache = new Map();

/** Piecewise-linear value at a level from its [0, 5, 10] anchors. @param {readonly number[]} anchors @param {number} level */
function interpolate([at0, at5, at10], level) {
  return level <= 5 ? at0 + ((at5 - at0) * level) / 5 : at5 + ((at10 - at5) * (level - 5)) / 5;
}

/** Everything a level plays by (cached, frozen). @param {number} level @returns {SkillProfile} */
export function skillProfile(level) {
  const s = clampSkill(level);
  let p = cache.get(s);
  if (!p) {
    /** @type {any} */
    const out = { level: s };
    for (const [key, anchors] of Object.entries(AI_SKILL)) out[key] = interpolate(anchors, s);
    p = Object.freeze(out);
    cache.set(s, /** @type {SkillProfile} */ (p));
  }
  return /** @type {SkillProfile} */ (p);
}

/**
 * Bench only (tools/ai-bench): play a level with some values changed, to
 * measure what each one is worth. Never called by the game.
 * @param {number} level @param {Partial<SkillProfile>} patch
 */
export function tuneSkill(level, patch) {
  const s = clampSkill(level);
  cache.delete(s);
  cache.set(s, /** @type {SkillProfile} */ (Object.freeze({ ...skillProfile(s), ...patch })));
}
