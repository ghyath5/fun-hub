// @ts-check
/**
 * The computer player's own dice. Its choices — playstyle, hesitation, how
 * far it misjudges a fight — come from a small integer generator kept in its
 * state, so saves and two-phone lockstep stay in step, and so its thinking
 * never shifts the world's combat rolls.
 */

/** A 32-bit seed from a string (FNV-1a). @param {string} text */
export function seedFrom(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** A number in [0, 1) (mulberry32), advancing the state's `dice`. @param {{ dice: number }} ai */
export function roll(ai) {
  ai.dice = (ai.dice + 0x6d2b79f5) | 0;
  let t = ai.dice;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** True with probability p. @param {{ dice: number }} ai @param {number} p */
export const chance = (ai, p) => p > 0 && (p >= 1 || roll(ai) < p);

/** x give or take a share of it: x × (1 ± spread). @param {{ dice: number }} ai @param {number} x @param {number} spread */
export const jitter = (ai, x, spread) => x * (1 + (roll(ai) * 2 - 1) * spread);

/** One item of a list. @template T @param {{ dice: number }} ai @param {readonly T[]} list @returns {T} */
export const pickOne = (ai, list) => list[Math.floor(roll(ai) * list.length)];
