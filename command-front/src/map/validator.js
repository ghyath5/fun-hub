// @ts-check
/**
 * Map validator (section 17). Runs at load and in tests; any error blocks the map.
 */
import { componentsFor, components, buildable, inBounds, cellValue } from './grid.js';
import { ECONOMY } from '../data/rules.js';
import { T } from '../data/terrain.js';

/** @typedef {import('../types.js').MapData} MapData */
/** @typedef {{ rule: string, message: string, cell?: { x: number, y: number } }} Finding */

export const VALIDATION = Object.freeze({
  baseArea: 12,           // clear buildable square centred on each start
  oreRadius: 10,
  minHomeOreCredits: 3000,
  symmetryTolerance: 1,
  minPocketCells: 4,
});

/**
 * Top-left of the even-sized base square "centred" on a start. An even square
 * has no centre cell, so it leans toward the map centre: s−6…s+5 in the near
 * half and s−5…s+6 in the far half. That keeps the check symmetric under the
 * map's own rotation or mirror.
 * @param {{x: number, y: number}} s @param {MapData} map
 */
const baseOrigin = (s, map) => {
  const half = VALIDATION.baseArea / 2;
  return {
    x: s.x - (s.x * 2 < map.width ? half : half - 1),
    y: s.y - (s.y * 2 < map.height ? half : half - 1),
  };
};

/** @param {MapData} map */
function checkReachability(map, /** @type {Finding[]} */ errors) {
  const { ids } = componentsFor(map, 'track');
  const comp = map.starts.map((s) => ids[s.y * map.width + s.x]);
  map.starts.forEach((s, i) => {
    if (comp[i] === -1) errors.push({ rule: 'start-passable', message: `Start ${i + 1} is on impassable ground.`, cell: s });
  });
  for (let i = 1; i < comp.length; i++) {
    if (comp[i] !== comp[0]) {
      errors.push({ rule: 'starts-connected', message: `Start ${i + 1} cannot reach start 1 by tracked vehicle.`, cell: map.starts[i] });
    }
  }
}

/** @param {MapData} map */
function checkBases(map, /** @type {Finding[]} */ errors) {
  const A = VALIDATION.baseArea;
  map.starts.forEach((s, n) => {
    const o = baseOrigin(s, map);
    for (let y = o.y; y < o.y + A; y++) {
      for (let x = o.x; x < o.x + A; x++) {
        if (!inBounds(map, x, y)) {
          errors.push({ rule: 'base-area', message: `Start ${n + 1}'s ${A}×${A} base area runs off the map.`, cell: { x, y } });
          return;
        }
        const i = y * map.width + x;
        if (map.bales[i] > 0) {
          errors.push({ rule: 'base-ore', message: `Start ${n + 1} has ore inside its ${A}×${A} base area.`, cell: { x, y } });
          return;
        }
        if (!buildable(map, x, y)) {
          errors.push({ rule: 'base-area', message: `Start ${n + 1}'s base area has unbuildable ground.`, cell: { x, y } });
          return;
        }
      }
    }
    let credits = 0;
    const r = VALIDATION.oreRadius;
    for (let y = s.y - r; y <= s.y + r; y++) {
      for (let x = s.x - r; x <= s.x + r; x++) {
        if (!inBounds(map, x, y)) continue;
        const dx = x - s.x;
        const dy = y - s.y;
        if (dx * dx + dy * dy > r * r) continue;
        credits += cellValue(map, y * map.width + x, ECONOMY);
      }
    }
    if (credits < VALIDATION.minHomeOreCredits) {
      errors.push({ rule: 'home-ore', message: `Start ${n + 1} has only ${credits} credits of ore within ${r} cells (needs ${VALIDATION.minHomeOreCredits}).`, cell: s });
    }
  });
}

/** Do the starts map onto themselves under rotation or mirroring? @param {MapData} map */
function checkSymmetry(map, /** @type {Finding[]} */ warnings) {
  const W = map.width - 1;
  const H = map.height - 1;
  /** @type {((p: {x: number, y: number}) => {x: number, y: number})[]} */
  const transforms = [
    (p) => ({ x: W - p.x, y: H - p.y }),       // 180° rotation
    (p) => ({ x: W - p.x, y: p.y }),           // mirror in x
    (p) => ({ x: p.x, y: H - p.y }),           // mirror in y
    (p) => ({ x: W - p.y, y: p.x }),           // 90° rotation (square maps)
    (p) => ({ x: p.y, y: p.x }),               // diagonal mirror
  ];
  const tol = VALIDATION.symmetryTolerance;
  const matches = (/** @type {(p: {x: number, y: number}) => {x: number, y: number}} */ f) => map.starts.every((s) => {
    const t = f(s);
    return map.starts.some((q) => Math.abs(q.x - t.x) <= tol && Math.abs(q.y - t.y) <= tol);
  });
  if (!transforms.some(matches)) warnings.push({ rule: 'symmetry', message: 'Start positions are not symmetric within ±1 cell.' });
}

/** @param {MapData} map */
function checkPockets(map, /** @type {Finding[]} */ errors) {
  const { ids, sizes } = componentsFor(map, 'track');
  const main = sizes.indexOf(Math.max(...sizes));
  sizes.forEach((size, id) => {
    if (id === main || size >= VALIDATION.minPocketCells) return;
    const i = ids.indexOf(id);
    errors.push({ rule: 'land-pocket', message: `Isolated land pocket of ${size} cell(s).`, cell: { x: i % map.width, y: (i / map.width) | 0 } });
  });
}

/** Water bodies large enough for a 3×3 naval yard must touch a Beach. @param {MapData} map */
function checkWater(map, /** @type {Finding[]} */ errors) {
  const W = map.width;
  const isWater = (/** @type {number} */ x, /** @type {number} */ y) => inBounds(map, x, y) && map.terrain[y * W + x] === T.water;
  const { ids, sizes } = components(map.width, map.height, isWater);
  sizes.forEach((_, id) => {
    let canHostYard = false;
    let touchesBeach = false;
    let first = -1;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== id) continue;
      if (first < 0) first = i;
      const x = i % W;
      const y = (i / W) | 0;
      if (!canHostYard && x + 2 < map.width && y + 2 < map.height) {
        let all = true;
        for (let dy = 0; dy < 3 && all; dy++) for (let dx = 0; dx < 3 && all; dx++) all = ids[(y + dy) * W + x + dx] === id;
        canHostYard = all;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(map, nx, ny) && map.terrain[ny * W + nx] === T.beach) touchesBeach = true;
      }
    }
    if (canHostYard && !touchesBeach) {
      errors.push({ rule: 'water-beach', message: 'A water body large enough for a naval yard touches no Beach.', cell: { x: first % W, y: (first / W) | 0 } });
    }
  });
}

/**
 * @param {MapData} map
 * @returns {{ ok: boolean, errors: Finding[], warnings: Finding[] }}
 */
export function validateMap(map) {
  /** @type {Finding[]} */ const errors = [];
  /** @type {Finding[]} */ const warnings = [];
  checkReachability(map, errors);
  checkBases(map, errors);
  checkPockets(map, errors);
  checkWater(map, errors);
  checkSymmetry(map, warnings);
  return { ok: errors.length === 0, errors, warnings };
}

/** One readable line per finding, for the blocked-map screen. @param {Finding[]} list */
export const describe = (list) => list.map((f) => `${f.rule}: ${f.message}${f.cell ? ` (cell ${f.cell.x}, ${f.cell.y})` : ''}`).join('\n');
