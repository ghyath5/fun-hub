// @ts-check
/**
 * Group move destinations (section 13).
 * - A group spanning 6 cells or fewer keeps each unit's offset from the
 *   group centre (formation) and moves at the slowest unit's speed.
 * - Otherwise destinations fill a spiral around the target, nearest unit
 *   first; infantry fill the 3 spots of a cell before using the next one.
 */
import { MOVEMENT } from '../data/rules.js';
import { spiral } from './nav.js';
import { defOf, isInfantry } from './entities/units.js';

/** @typedef {import('./entities/units.js').Unit} Unit */
/** @typedef {{ x: number, y: number, spot: number }} Dest */

/** Cell claims made so far while assigning one command. */
function createClaims() {
  /** @type {Map<number, { veh: boolean, inf: number }>} */
  const m = new Map();
  return {
    /** @param {number} i @param {boolean} infantry */
    canTake(i, infantry) {
      const c = m.get(i);
      if (!c) return true;
      return infantry ? !c.veh && c.inf < MOVEMENT.infantrySpots : false;
    },
    /** @param {number} i @param {boolean} infantry @returns {number} spot */
    take(i, infantry) {
      const c = m.get(i) ?? { veh: false, inf: 0 };
      m.set(i, c);
      if (infantry) return c.inf++;
      c.veh = true;
      return -1;
    },
  };
}

/**
 * Is a cell usable as a destination for this unit: passable, reachable and not
 * held by a unit outside the group?
 * @param {any} world @param {Unit} u @param {Set<number>} group
 */
function usable(world, u, x, y, group) {
  const loco = defOf(u).loco;
  if (!world.nav.passable(loco, x, y)) return false;
  if (!world.nav.reachable(loco, u.cx, u.cy, x, y)) return false;
  if (loco === 'air') return true;
  const i = world.occ.index(x, y);
  return world.occ.unitsIn(i).every((/** @type {number} */ id) => group.has(id));
}

/**
 * @param {any} world
 * @param {Unit[]} units  In ascending id order
 * @param {number} tx @param {number} ty
 * @returns {{ dests: Map<number, Dest>, speedCapK: number }}  speedCapK = slowest speed ×1000 (cells/s) for formations, else 0
 */
export function assignDestinations(world, units, tx, ty) {
  /** @type {Map<number, Dest>} */
  const dests = new Map();
  if (units.length === 0) return { dests, speedCapK: 0 };
  const group = new Set(units.map((u) => u.id));
  const claims = createClaims();
  const W = world.map.width;

  if (units.length === 1) {
    const u = units[0];
    const d = world.nav.resolveDestination(defOf(u).loco, u.cx, u.cy, tx, ty);
    dests.set(u.id, { x: d.x, y: d.y, spot: -1 });
    return { dests, speedCapK: 0 };
  }

  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const u of units) {
    minX = Math.min(minX, u.cx); maxX = Math.max(maxX, u.cx);
    minY = Math.min(minY, u.cy); maxY = Math.max(maxY, u.cy);
  }
  const span = Math.max(maxX - minX, maxY - minY) + 1;

  /** Nearest claimable usable cell to (x, y) for u, searching outward. */
  const nearestFree = (/** @type {Unit} */ u, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r) => {
    const inf = isInfantry(u);
    for (const [sx, sy] of spiral(x, y, r)) {
      if (sx < 0 || sy < 0 || sx >= W || sy >= world.map.height) continue;
      if (claims.canTake(sy * W + sx, inf) && usable(world, u, sx, sy, group)) return { x: sx, y: sy };
    }
    return null;
  };

  if (span <= MOVEMENT.formationMaxSpan) {
    const ox = (minX + maxX) >> 1;
    const oy = (minY + maxY) >> 1;
    let slowest = Infinity;
    for (const u of units) {
      slowest = Math.min(slowest, Math.round(defOf(u).speed * 1000));
      const loco = defOf(u).loco;
      const want = world.nav.resolveDestination(loco, u.cx, u.cy, tx + (u.cx - ox), ty + (u.cy - oy));
      const at = nearestFree(u, want.x, want.y, MOVEMENT.unreachableSearch) ?? want;
      dests.set(u.id, { x: at.x, y: at.y, spot: claims.take(at.y * W + at.x, isInfantry(u)) });
    }
    return { dests, speedCapK: slowest };
  }

  const order = [...units].sort((a, b) => {
    const da = (a.cx - tx) ** 2 + (a.cy - ty) ** 2;
    const db = (b.cx - tx) ** 2 + (b.cy - ty) ** 2;
    return da - db || a.id - b.id;
  });
  const radius = Math.min(20, Math.ceil(Math.sqrt(units.length)) + 6);
  const cells = spiral(tx, ty, radius);
  for (const u of order) {
    const inf = isInfantry(u);
    let at = null;
    for (const [x, y] of cells) {
      if (x < 0 || y < 0 || x >= W || y >= world.map.height) continue;
      if (claims.canTake(y * W + x, inf) && usable(world, u, x, y, group)) { at = { x, y }; break; }
    }
    if (!at) at = world.nav.resolveDestination(defOf(u).loco, u.cx, u.cy, tx, ty);
    dests.set(u.id, { x: at.x, y: at.y, spot: claims.take(at.y * W + at.x, inf) });
  }
  return { dests, speedCapK: 0 };
}
