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
 * Flood fill in cell-index order, so ids are deterministic. Moves follow
 * `steps`: 8 directions, no corner cutting. The test is sampled once into a
 * byte grid, so big maps cost one pass plus a tight fill.
 * @param {number} w @param {number} h @param {(x: number, y: number) => boolean} ok
 * @returns {{ ids: Int32Array, sizes: number[] }}
 */
export function components(w, h, ok) {
  const open = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) open[y * w + x] = ok(x, y) ? 1 : 0;
  const at = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < w && y < h && open[y * w + x] === 1;
  const ids = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (ids[i] !== -1 || !open[i]) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    ids[i] = id;
    stack[top++] = i;
    while (top) {
      const c = stack[--top];
      size++;
      const x = c % w;
      const y = (c / w) | 0;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!at(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!at(x + dx, y) || !at(x, y + dy))) continue;
        const n = ny * w + nx;
        if (ids[n] === -1) { ids[n] = id; stack[top++] = n; }
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
