// @ts-check
/**
 * Grid A* adapter over EasyStar.js (classic script → global EasyStar), one
 * instance per locomotor (section 13). Results arrive inside `calculate()`,
 * which only the movement system calls.
 *
 * EasyStar's sync mode runs every queued search to the end and ignores
 * setIterationsPerCalculation, which would let one hopeless search stall a
 * tick. So the engine runs in its normal mode — 4000 iterations per
 * calculate(), unfinished searches continuing next tick in request order —
 * and the callbacks it would post with setTimeout are captured and run
 * synchronously, in order, before `calculate()` (or `find()`) returns. Every
 * path result therefore still lands inside a tick, deterministically.
 */
import { MOVEMENT } from '../data/rules.js';

/** Run fn with setTimeout captured, then run what it scheduled, in order. @param {() => any} fn */
function captured(fn) {
  /** @type {(() => void)[]} */
  const posted = [];
  const real = globalThis.setTimeout;
  globalThis.setTimeout = /** @type {any} */ ((/** @type {() => void} */ f) => { posted.push(f); return 0; });
  let out;
  try {
    out = fn();
  } finally {
    globalThis.setTimeout = real;
  }
  for (const f of posted) f();
  return out;
}

/** Tile value for a cell nobody of this locomotor can enter. */
export const BLOCKED = 0;

/**
 * @typedef {object} Pathfinder
 * @property {(grid: number[][], costs: Map<number, number>) => void} setGrid
 * @property {(x: number, y: number, tile: number) => void} setTile
 * @property {(sx: number, sy: number, ex: number, ey: number, cb: (path: {x: number, y: number}[] | null) => void) => number} find
 * @property {() => void} calculate
 * @property {(x: number, y: number, baseCost: number) => void} softBlock    own/allied unit: tile cost × friendlyUnitPointCost
 * @property {(x: number, y: number) => void} softClear
 * @property {(x: number, y: number) => void} avoid        temporary hard block
 * @property {(x: number, y: number) => void} unavoid
 * @property {(id: number) => void} cancel
 * @property {any} engine        The EasyStar instance (debugging only)
 */

/** @returns {Pathfinder} */
export function createPathfinder() {
  const ES = /** @type {any} */ (globalThis).EasyStar;
  if (!ES) throw new Error('EasyStar not loaded (vendor/easystar.min.js)');
  const es = new ES.js();
  es.enableDiagonals();
  es.disableCornerCutting();
  es.setIterationsPerCalculation(MOVEMENT.iterationsPerCalculation);
  /** @type {number[][]} */
  let grid = [];

  return {
    setGrid(g, costs) {
      grid = g;
      es.setGrid(grid);
      es.setAcceptableTiles([...costs.keys()].filter((t) => t !== BLOCKED));
      for (const [tile, cost] of costs) if (tile !== BLOCKED) es.setTileCost(tile, cost);
    },
    setTile(x, y, tile) {
      grid[y][x] = tile; // EasyStar reads the same array by reference
    },
    find(sx, sy, ex, ey, cb) {
      return captured(() => es.findPath(sx, sy, ex, ey, (/** @type {any} */ path) => cb(path ?? null)));
    },
    calculate() { captured(() => es.calculate()); },
    softBlock(x, y, baseCost) { es.setAdditionalPointCost(x, y, baseCost * MOVEMENT.friendlyUnitPointCost); },
    softClear(x, y) { es.removeAdditionalPointCost(x, y); },
    avoid(x, y) { es.avoidAdditionalPoint(x, y); },
    unavoid(x, y) { es.stopAvoidingAdditionalPoint(x, y); },
    cancel(id) { es.cancelPath(id); },
    /** The EasyStar instance (debugging only). */
    get engine() { return es; },
  };
}
