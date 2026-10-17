// @ts-check
/**
 * One view over unit and structure definitions, so combat and targeting treat
 * a tank, a pillbox and a refinery alike. Built once from the data files.
 */
import { UNITS } from '../data/units.js';
import { STRUCTURES, NEUTRAL } from '../data/structures.js';

/**
 * @typedef {object} CombatDef
 * @property {string} id
 * @property {string} name
 * @property {boolean} structure
 * @property {import('../types.js').ArmorId} armor
 * @property {string[]} weapons
 * @property {number} sight
 * @property {boolean} turret
 * @property {number} turnRate
 * @property {string[]} tags
 * @property {import('../types.js').LocomotorId | null} loco
 * @property {number} cost
 * @property {number} hp
 * @property {number} w
 * @property {number} h
 * @property {boolean} defense
 * @property {boolean} wall
 */

/** @type {Map<string, CombatDef>} */
const CACHE = new Map();

for (const u of Object.values(UNITS)) {
  CACHE.set(u.id, {
    id: u.id, name: u.name, structure: false, armor: u.armor, weapons: u.weapons, sight: u.sight,
    turret: u.turret, turnRate: u.turnRate, tags: u.tags, loco: u.loco, cost: u.cost, hp: u.hp, w: 1, h: 1,
    defense: false, wall: false,
  });
}
for (const s of Object.values(STRUCTURES)) {
  if (CACHE.has(s.id)) throw new Error(`Unit and structure share the id ${s.id}`);
  CACHE.set(s.id, {
    id: s.id, name: s.name, structure: true, armor: s.armor, weapons: s.weapon ? [s.weapon] : [], sight: s.sight,
    turret: s.tags.includes('turret'), turnRate: 255, tags: s.tags, loco: null, cost: s.cost, hp: s.hp, w: s.w, h: s.h,
    defense: s.line === 'defenses' && !s.wall, wall: s.wall,
  });
}
for (const n of Object.values(NEUTRAL)) {
  CACHE.set(n.id, {
    id: n.id, name: n.name, structure: true, armor: /** @type {any} */ (n.armor), weapons: [], sight: 0,
    turret: false, turnRate: 0, tags: n.tags, loco: null, cost: n.cost, hp: n.hp, w: n.w, h: n.h, defense: false, wall: false,
  });
}

/** @param {string} type @returns {CombatDef} */
export function combatDef(type) {
  const d = CACHE.get(type);
  if (!d) throw new Error(`Unknown entity type ${type}`);
  return d;
}

export const isStructureType = (/** @type {string} */ type) => CACHE.get(type)?.structure === true;
