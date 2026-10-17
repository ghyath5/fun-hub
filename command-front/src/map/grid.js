// @ts-check
/**
 * Terrain queries shared by the map validator, the generator and (later) the
 * sim's passability layers. Pure functions over MapData.
 */
import { TERRAIN, ORE_ROW } from '../data/terrain.js';

/** @typedef {import('../types.js').MapData} MapData */
/** @typedef {import('../types.js').LocomotorId} LocomotorId */

/** Speed % for a locomotor on a cell, or null when impassable. Air is always 100. */
export function speedAt(/** @type {MapData} */ map, /** @type {LocomotorId} */ loco, x, y) {
  if (loco === 'air') return 100;
  const i = y * map.width + x;
  const row = map.bales[i] > 0 ? ORE_ROW : TERRAIN[map.terrain[i]];
  return row.speed[loco];
}

export const inBounds = (/** @type {MapData} */ map, x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;

export const passable = (/** @type {MapData} */ map, /** @type {LocomotorId} */ loco, x, y) =>
  inBounds(map, x, y) && speedAt(map, loco, x, y) != null;

export function buildable(/** @type {MapData} */ map, x, y) {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  return map.bales[i] > 0 ? ORE_ROW.buildable : TERRAIN[map.terrain[i]].buildable;
}

const N8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

/**
 * Neighbours a unit may step to: 8 directions, no corner cutting (a diagonal
 * needs both orthogonal neighbours passable).
 * @param {(x: number, y: number) => boolean} ok
 * @returns {number[][]}
 */
export function steps(ok, x, y) {
  const out = [];
  for (const [dx, dy] of N8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!ok(nx, ny)) continue;
    if (dx !== 0 && dy !== 0 && (!ok(x + dx, y) || !ok(x, y + dy))) continue;
    out.push([nx, ny]);
  }
  return out;
}

/**
 * Connected-component id per cell for a passability test (-1 = blocked).
 * Flood fill in cell-index order, so ids are deterministic.
 * @param {number} w @param {number} h @param {(x: number, y: number) => boolean} ok
 * @returns {{ ids: Int32Array, sizes: number[] }}
 */
export function components(w, h, ok) {
  const ids = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (ids[i] !== -1 || !ok(i % w, (i / w) | 0)) continue;
    const id = sizes.length;
    let size = 0;
    ids[i] = id;
    stack.push(i);
    while (stack.length) {
      const c = /** @type {number} */ (stack.pop());
      size++;
      for (const [nx, ny] of steps(ok, c % w, (c / w) | 0)) {
        const n = ny * w + nx;
        if (ids[n] === -1) { ids[n] = id; stack.push(n); }
      }
    }
    sizes.push(size);
  }
  return { ids, sizes };
}

/** Components for a locomotor on a map. @param {MapData} map @param {LocomotorId} loco */
export const componentsFor = (map, loco) => components(map.width, map.height, (x, y) => passable(map, loco, x, y));

/** Credit value of resources in one cell. @param {MapData} map @param {number} i @param {{ oreBaleValue: number, gemBaleValue: number }} eco */
export const cellValue = (map, i, eco) => map.bales[i] * (map.gem[i] ? eco.gemBaleValue : eco.oreBaleValue);
