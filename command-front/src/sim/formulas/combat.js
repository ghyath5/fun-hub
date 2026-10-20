// @ts-check
/** Pure combat rules (sections 8 and 9). */
import { WARHEADS, PRONE_REDUCED } from '../../data/warheads.js';
import { COMBAT } from '../../data/rules.js';

/** @typedef {import('../../types.js').WarheadId} WarheadId */
/** @typedef {import('../../types.js').ArmorId} ArmorId */

/** Warhead multiplier in percent. @param {WarheadId} warhead @param {ArmorId} armor */
export const multiplierPct = (warhead, armor) => WARHEADS[warhead][armor];

/**
 * Splash falloff in thousandths: 1000 at the impact point, falling linearly
 * to 250 at the edge, 0 beyond it.
 * @param {number} distLep   Distance from impact, leptons
 * @param {number} radiusLep Splash radius, leptons
 */
export function falloffPermille(distLep, radiusLep) {
  if (radiusLep <= 0) return distLep === 0 ? 1000 : 0;
  if (distLep > radiusLep) return 0;
  const edge = Math.round(COMBAT.splashEdgeFalloff * 1000);
  return 1000 - Math.floor(((1000 - edge) * distLep) / radiusLep);
}

/**
 * Damage dealt by one hit. Rounds down once at the end, minimum 1 whenever
 * the warhead multiplier is above 0.
 * @param {number} base         Weapon damage
 * @param {WarheadId} warhead
 * @param {ArmorId} armor
 * @param {{ falloff?: number, prone?: boolean, armorFactorPermille?: number }} [mods]
 *   falloff in thousandths (default 1000); armorFactorPermille divides damage (crate ×1.5 = 1500)
 */
export function damage(base, warhead, armor, mods = {}) {
  const mult = multiplierPct(warhead, armor);
  if (mult <= 0) return 0;
  const falloff = mods.falloff ?? 1000;
  if (falloff <= 0) return 0;
  const prone = mods.prone && PRONE_REDUCED.includes(warhead) ? Math.round(COMBAT.proneDamageFactor * 1000) : 1000;
  const armorK = mods.armorFactorPermille ?? 1000;
  const raw = Math.floor((base * mult * falloff * prone) / (100 * 1000 * armorK));
  return Math.max(1, raw);
}

/** Health band for colours (section 9). @param {number} hp @param {number} maxHp */
export function healthBand(hp, maxHp) {
  if (hp * 1000 > maxHp * Math.round(COMBAT.healthGreenAbove * 1000)) return 'green';
  if (hp * 1000 >= maxHp * Math.round(COMBAT.healthAmberAbove * 1000)) return 'amber';
  return 'red';
}

/**
 * Target acquisition score (section 9). Lower is better. All inputs pre-computed
 * by the caller so the function stays pure and integer.
 * @param {{ distanceMilli: number, canDamageMe: boolean, isStructure: boolean, myMultVsThemPct: number, isCurrent: boolean,
 *   inRange?: boolean, hpPermille?: number, allies?: number, overkill?: boolean, attackingMe?: boolean }} c
 *   distanceMilli: distance in thousandths of a cell; myMultVsThemPct: my best warhead multiplier against its armour, 0–100;
 *   inRange: I can hit it from where I stand; hpPermille: its HP left, thousandths (default 1000);
 *   allies: how many of my side already fire at it; overkill: they will kill it without me;
 *   attackingMe: it is aiming at me
 * @returns {number} Score in thousandths
 */
export function targetScore(c) {
  const S = COMBAT.score;
  let s = c.distanceMilli;
  if (c.canDamageMe) s -= S.canDamageMe * 1000;
  s -= S.multiplierWeight * Math.min(100, c.myMultVsThemPct) * 10;
  if (c.isStructure) s += S.structurePenalty * 1000;
  if (c.myMultVsThemPct < Math.round(S.uselessBelow * 100)) s += S.uselessPenalty * 1000;
  if (c.isCurrent) s -= S.stickiness * 1000;
  if (c.inRange) s -= S.inRange * 1000;
  const hp = Math.max(0, Math.min(1000, c.hpPermille ?? 1000));
  s -= Math.floor((S.wounded * 1000 * (1000 - hp)) / 1000);
  if (c.overkill) s += S.overkill * 1000;
  else if (c.allies) s -= Math.floor(S.focus * 1000) * Math.min(S.focusMax, c.allies);
  if (c.attackingMe) s -= S.attackingMe * 1000;
  return s;
}
