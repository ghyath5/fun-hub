// @ts-check
/**
 * What a player may build (section 7): prerequisites by role (captured
 * buildings count), faction unlocks through owned Yards and factories, the
 * tech-level setting, build limits and the unit cap.
 */
import { UNITS } from '../data/units.js';
import { STRUCTURES } from '../data/structures.js';
import { TECH_LEVEL_OF_ROLE, SUPPORT_POWER_TECH_LEVEL, LIMITS } from '../data/rules.js';
import { rolesOf, isActive, structureDef } from './entities/structures.js';
import { padAvailable, padRolesOf } from './pads.js';
import { priceFor } from './bonuses.js';

/** @typedef {'structures' | 'defenses' | 'infantry' | 'vehicles' | 'aircraft' | 'naval'} LineId */

export const LINES = /** @type {LineId[]} */ (['structures', 'defenses', 'infantry', 'vehicles', 'aircraft', 'naval']);

/** Roles whose buildings serve each line. */
export const FACTORY_ROLES = Object.freeze({
  structures: ['yard'], defenses: ['yard'], infantry: ['barracks'], vehicles: ['factory'],
  aircraft: ['helipad', 'airfield'], naval: ['navalyard'],
});

/** Static definition of a buildable type. @param {string} type */
export const itemDef = (type) => /** @type {any} */ (UNITS[type] ?? STRUCTURES[type]);

/** @param {string} type @returns {LineId} */
export const lineOf = (type) => itemDef(type).line;

/** Lowest tech level showing this item. @param {string} type */
export function techLevelOf(type) {
  const d = itemDef(type);
  let lvl = 1;
  if (d.role) lvl = Math.max(lvl, TECH_LEVEL_OF_ROLE[d.role] ?? 1);
  for (const r of d.requires) lvl = Math.max(lvl, TECH_LEVEL_OF_ROLE[r] ?? 1);
  if (d.powers?.length) lvl = Math.max(lvl, SUPPORT_POWER_TECH_LEVEL);
  return lvl;
}

/** The roles a unit's line needs to be produced at, given the unit. @param {string} type */
export function producerRoles(type) {
  const d = itemDef(type);
  if (d.line === 'aircraft') return padRolesOf(type);
  return FACTORY_ROLES[/** @type {LineId} */ (d.line)];
}

/** Working buildings of a player that can produce this type, ascending id. @param {any} w @param {number} pid @param {string} type */
export function producersOf(w, pid, type) {
  const roles = producerRoles(type);
  return w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && isActive(e) && roles.includes(structureDef(e.type).role));
}

/** Factions whose designs a player can use on a line. @param {any} w @param {number} pid @param {LineId} line */
function factionsFor(w, pid, line) {
  const set = new Set([w.players[pid].faction]);
  const roles = FACTORY_ROLES[line];
  for (const e of w.entities.all()) {
    if (e.kind === 'structure' && e.owner === pid && isActive(e) && roles.includes(structureDef(e.type).role)) set.add(e.faction);
  }
  return set;
}

/** How many of a type the player has alive or being produced. @param {any} w @param {number} pid @param {string} type */
export function countOwned(w, pid, type) {
  let n = 0;
  for (const e of w.entities.all()) if (!e.dead && e.owner === pid && e.type === type) n++;
  const line = w.players[pid].lines[lineOf(type)];
  if (line) {
    n += line.queue.filter((/** @type {any} */ q) => q.type === type).length;
    if (line.ready === type) n++;
  }
  return n;
}

/** Units a player controls (for the unit cap). @param {any} w @param {number} pid */
export const unitCount = (w, pid) => w.entities.all().filter((e) => !e.dead && e.kind === 'unit' && e.owner === pid).length;

/**
 * @typedef {object} ItemInfo
 * @property {string} type
 * @property {string} name
 * @property {LineId} line
 * @property {number} cost
 * @property {boolean} locked
 * @property {string[]} missing   Roles still required
 * @property {string} reason      Why it cannot be started now ('' = it can)
 */

/** @param {any} w @param {number} pid @param {string} type @param {Set<string>} [roles] @returns {ItemInfo | null} null = hidden */
export function itemInfo(w, pid, type, roles = rolesOf(w, pid)) {
  const d = itemDef(type);
  if (!d || type === 'constructionYard') return null;
  if (techLevelOf(type) > w.settings.techLevel) return null;
  if (d.faction !== 'both' && !factionsFor(w, pid, d.line).has(d.faction)) return null;
  const missing = d.requires.filter((/** @type {string} */ r) => !roles.has(r));
  let reason = '';
  if (missing.length) reason = 'locked';
  else if (d.limit && countOwned(w, pid, type) >= d.limit) reason = 'limit';
  else if (d.tags?.includes('limitOne') && countOwned(w, pid, type) >= 1) reason = 'limit';
  else if (UNITS[type] && unitCount(w, pid) >= LIMITS.unitsPerPlayer) reason = 'unitCap';
  else if (d.line === 'aircraft' && !padAvailable(w, pid, type)) reason = 'noPad';
  return { type, name: d.name, line: d.line, cost: priceFor(w, pid, type, d.cost), locked: missing.length > 0, missing, reason };
}

/** Every visible item, by line, in data order. @param {any} w @param {number} pid */
export function catalog(w, pid) {
  const roles = rolesOf(w, pid);
  /** @type {Record<LineId, ItemInfo[]>} */
  const out = { structures: [], defenses: [], infantry: [], vehicles: [], aircraft: [], naval: [] };
  for (const type of [...Object.keys(STRUCTURES), ...Object.keys(UNITS)]) {
    const info = itemInfo(w, pid, type, roles);
    if (info) out[info.line].push(info);
  }
  return out;
}
