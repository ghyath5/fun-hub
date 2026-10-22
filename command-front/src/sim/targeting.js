// @ts-check
/**
 * Who can shoot whom (sections 8 and 9). Pure functions over entity data:
 * layers, weapon eligibility, weapon choice, threat and distance. Units and
 * structures go through the same helpers via `combatDef`.
 */
import { UNITS } from '../data/units.js';
import { WEAPONS, reachCells } from '../data/weapons.js';
import { WARHEADS } from '../data/warheads.js';
import { SIM } from '../data/rules.js';
import { combatDef } from './defs.js';
import { dugWeapons } from './dig.js';
import { isqrt } from '../core/fixed.js';

/** @typedef {import('../types.js').WeaponDef} WeaponDef */
/** @typedef {import('../types.js').HitLayer} HitLayer */

const L = SIM.leptonsPerCell;

/**
 * Layer an entity is on: aircraft in flight A, ships N, submerged subs S,
 * everything else (ground units, landed aircraft, structures) G.
 * @param {any} e
 */
export function layerOf(e) {
  if (e.kind === 'structure') return 'G';
  const def = UNITS[e.type];
  if (!def) return 'G';
  if (def.loco === 'air') return e.landed ? 'G' : 'A';
  if (def.loco === 'float') return e.submerged ? 'S' : 'N';
  return 'G';
}

/** @param {any} e */
export const armorOf = (e) => combatDef(e.type).armor;

/** @param {any} e */
export const isInfantryEntity = (e) => e.kind === 'unit' && UNITS[e.type]?.loco === 'foot';

/** Weapon ids of an entity (a defense has one, most structures none; a dug-in Rifleman his nest gun). @param {any} e */
export const weaponsOf = (e) => dugWeapons(e) ?? combatDef(e.type).weapons;

/**
 * Distance in leptons from a's centre to b: to b's centre for units, to the
 * nearest point of the footprint for structures (section 3).
 * @param {any} a @param {any} b
 */
export function reachDist(a, b) {
  if (b.kind !== 'structure') return isqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  const x0 = b.cx * L;
  const y0 = b.cy * L;
  const nx = Math.max(x0, Math.min(x0 + b.w * L - 1, a.x));
  const ny = Math.max(y0, Math.min(y0 + b.h * L - 1, a.y));
  return isqrt((a.x - nx) ** 2 + (a.y - ny) ** 2);
}

/**
 * Could this weapon ever affect this target (layer, special limits, warhead)?
 * Range, facing and cooldown are checked when firing.
 * @param {WeaponDef} w @param {any} target @param {boolean} friendly  Target is the shooter's own or allied
 */
export function weaponCanHit(w, target, friendly) {
  if (w.only === 'friendlyInfantry') return friendly && isInfantryEntity(target) && target.hp < target.maxHp;
  if (!w.hits.includes(layerOf(target))) return false;
  if (w.only === 'infantry' && !isInfantryEntity(target)) return false;
  if (w.only === 'ships' && UNITS[target.type]?.loco !== 'float') return false;
  if (w.only === 'subs' && !UNITS[target.type]?.tags.includes('submarine')) return false;
  if (!w.warhead) return false;
  return WARHEADS[w.warhead][armorOf(target)] > 0;
}

/** Damage × burst × multiplier of a weapon against a target, for weapon choice. @param {WeaponDef} w @param {any} target */
export function effectiveness(w, target) {
  if (!w.warhead) return Math.abs(w.damage) * 100;
  return w.damage * w.burst * WARHEADS[w.warhead][armorOf(target)];
}

/**
 * Weapon indexes of an entity that could ever affect the target.
 * @param {any} shooter @param {any} target @param {boolean} friendly
 * @returns {number[]}
 */
export function usableWeapons(shooter, target, friendly) {
  const out = [];
  weaponsOf(shooter).forEach((id, k) => { if (weaponCanHit(WEAPONS[id], target, friendly)) out.push(k); });
  return out;
}

/** Can this entity attack that target with any weapon? @param {any} shooter @param {any} target @param {boolean} [friendly] */
export const canAttack = (shooter, target, friendly = false) => usableWeapons(shooter, target, friendly).length > 0;

/** Longest range (leptons) among weapons that could hit the target, or 0. */
export function maxRangeVs(shooter, target, friendly = false) {
  const ws = weaponsOf(shooter);
  let r = 0;
  for (const k of usableWeapons(shooter, target, friendly)) r = Math.max(r, Math.round(reachCells(WEAPONS[ws[k]]) * L));
  return r;
}

/** Longest range of any weapon, leptons (Hold Position acquisition radius). @param {any} e */
export function maxRange(e) {
  let r = 0;
  for (const id of weaponsOf(e)) r = Math.max(r, Math.round(reachCells(WEAPONS[id]) * L));
  return r;
}

/**
 * Damage one volley of an entity's best usable weapon does to a target
 * (damage × burst × multiplier), for focus-fire bookkeeping. 0 for healers.
 * @param {any} shooter @param {any} target
 */
export function volleyDamage(shooter, target) {
  let best = 0;
  const ws = weaponsOf(shooter);
  for (const k of usableWeapons(shooter, target, false)) {
    const w = WEAPONS[ws[k]];
    if (!w.warhead || w.damage <= 0) continue;
    best = Math.max(best, Math.floor(effectiveness(w, target) / 100));
  }
  return best;
}

/** Best warhead multiplier (0–100) any of `attacker`'s weapons has against `victim`. */
export function bestMultiplierPct(attacker, victim) {
  let best = 0;
  for (const id of weaponsOf(attacker)) {
    const w = WEAPONS[id];
    if (!w.warhead || w.damage <= 0) continue;
    if (!weaponCanHit(w, victim, false)) continue;
    best = Math.max(best, WARHEADS[w.warhead][armorOf(victim)]);
  }
  return best;
}

/**
 * May units pick this entity as a target by themselves? Never walls, mines,
 * trees, bridges, neutral structures, disguised Spies (except for Hounds) or
 * undetected stealth objects (section 9).
 * @param {any} e @param {any} looker @param {(e: any, looker: any) => boolean} [visible]
 */
export function autoTargetable(e, looker, visible) {
  const def = combatDef(e.type);
  if (def.wall || def.tags.includes('neutral')) return false;
  if (e.kind === 'unit' && UNITS[e.type].tags.includes('spy') && !UNITS[looker.type]?.tags.includes('detectsSpies')) return false;
  if (visible && !visible(e, looker)) return false;
  return true;
}
