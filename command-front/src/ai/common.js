// @ts-check
/**
 * Small helpers every part of the computer player shares: issuing commands
 * the way a human's taps do, finding its own units and buildings, and plain
 * cell geometry (integers only, so two phones always agree).
 */
import { UNITS } from '../data/units.js';
import { isqrt } from '../core/fixed.js';

/** @typedef {import('../sim/world.js').World} World */
/** @typedef {{ x: number, y: number }} Cell */

/** Commands that act on units (pointless without any). */
const UNIT_COMMANDS = new Set(['move', 'attackMove', 'attack', 'enter', 'depot', 'deploy', 'guardArea', 'unload', 'harvest']);

/** Units that never fight in the army: workers, spies, transports and the like. */
export const NON_ARMY = Object.freeze(['harvester', 'mcv', 'engineer', 'spy', 'thief', 'mineLayer', 'support', 'transport', 'medic', 'kamikaze', 'psi']);

/** Queue a command for this player; it applies at the start of the next tick, like a human's. @param {World} w @param {{ pid: number }} ai @param {string} type @param {number[]} ids @param {any} target */
export function issue(w, ai, type, ids, target) {
  if (UNIT_COMMANDS.has(type) && !ids.length) return;
  w.queue.push({ tick: w.tick, playerId: ai.pid, type, entityIds: ids, target });
}

/** Can units of this type join the army (armed, not a worker, not a ship)? @param {string} type */
export function isCombatType(type) {
  const d = UNITS[type];
  return !!d && d.weapons.length > 0 && d.loco !== 'float' && !d.tags.some((t) => NON_ARMY.includes(t));
}

export const isPlane = (/** @type {any} */ u) => UNITS[u.type].tags.includes('plane');
export const isShip = (/** @type {any} */ u) => UNITS[u.type].loco === 'float';
export const isVehicle = (/** @type {any} */ u) => ['wheel', 'track'].includes(UNITS[u.type].loco);

export const ownStructures = (/** @type {World} */ w, /** @type {number} */ pid) => w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && !e.dead);
export const ownUnits = (/** @type {World} */ w, /** @type {number} */ pid) => w.entities.all().filter((e) => e.kind === 'unit' && e.owner === pid && !e.dead);

/** Combat units it can send anywhere on land or in the air. @param {World} w @param {number} pid */
export const armyOf = (w, pid) => ownUnits(w, pid).filter((u) => !u.inside && u.weapons.length > 0 && isCombatType(u.type));

/** Warships (not transports). @param {World} w @param {number} pid */
export const fleetOf = (w, pid) => ownUnits(w, pid).filter((u) => isShip(u) && u.weapons.length > 0);

/** Live units of a list of ids. @param {World} w @param {number[]} ids */
export const liveUnits = (w, ids) => ids.map((id) => w.entities.get(id)).filter((u) => u && !u.dead);

export const cellOf = (/** @type {any} */ u) => ({ x: u.cx, y: u.cy });
export const dist2 = (/** @type {Cell} */ a, /** @type {Cell} */ b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const distCells = (/** @type {Cell} */ a, /** @type {Cell} */ b) => isqrt(dist2(a, b));

/** Average cell of some units (null for none). @param {any[]} units @returns {Cell | null} */
export function centroid(units) {
  if (!units.length) return null;
  return {
    x: Math.floor(units.reduce((a, u) => a + u.cx, 0) / units.length),
    y: Math.floor(units.reduce((a, u) => a + u.cy, 0) / units.length),
  };
}

/** What a unit is worth in a fight: its price, scaled by the health it has left. @param {any} u */
export const fightValue = (u) => Math.floor((UNITS[u.type].cost * u.hp) / Math.max(1, u.maxHp));

/** Sum of fightValue. @param {any[]} units */
export const fightValueOf = (units) => units.reduce((a, u) => a + fightValue(u), 0);

/** A cell inside the map. @param {World} w @param {number} x @param {number} y @returns {Cell} */
export const clampCell = (w, x, y) => ({ x: Math.max(0, Math.min(w.map.width - 1, x)), y: Math.max(0, Math.min(w.map.height - 1, y)) });

/** The point `cells` along a→b from a (b itself when it is nearer). @param {Cell} a @param {Cell} b @param {number} cells */
export function towards(a, b, cells) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.max(1, isqrt(dx * dx + dy * dy));
  const s = Math.min(d, cells);
  return { x: a.x + Math.trunc((dx * s) / d), y: a.y + Math.trunc((dy * s) / d) };
}
