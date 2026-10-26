// @ts-check
/**
 * Placement rules (section 6). Pure checks over the world: every footprint
 * cell inside the map, explored, buildable and free of structures, walls,
 * own mines and enemy or neutral units; friendly units only make a cell
 * amber (they will be asked to scatter). At least one cell within 2 of a
 * completed own non-wall structure (naval yards: all water, within 7).
 * Factory exits and refinery docks must be passable too.
 */
import { PLACEMENT } from '../data/rules.js';
import { buildable } from '../map/grid.js';
import { T } from '../data/terrain.js';
import { structureDef, footprint, isActive } from './entities/structures.js';

/** @typedef {'ok' | 'amber' | 'red'} CellState */
/** @typedef {{ x: number, y: number, state: CellState }} CellCheck */

/**
 * Own completed non-wall structures (they extend the build area).
 * @param {any} w @param {number} pid
 */
function anchors(w, pid) {
  const c = memo;
  if (c.w === w && c.epoch === w.structureEpoch && c.pid === pid) return c.anchors;
  const list = w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && e.buildUp === 0 && !e.dead && !structureDef(e.type).wall);
  const yard = w.entities.all().some((e) => e.kind === 'structure' && e.owner === pid && isActive(e) && structureDef(e.type).role === 'yard');
  memo = { w, epoch: w.structureEpoch, pid, anchors: list, yard };
  return list;
}

/**
 * Anchors and yard of one player, so scoring many candidate cells (AI
 * placement, drawing the build area) scans the entities once. Keyed by the
 * world's structure epoch, which every structure change bumps.
 * @type {{ w: any, epoch: number, pid: number, anchors: any[], yard: boolean }}
 */
let memo = { w: null, epoch: -1, pid: -1, anchors: [], yard: false };

/** Does the player own a working Construction Yard? @param {any} w @param {number} pid */
const hasYard = (w, pid) => { anchors(w, pid); return memo.yard; };

/** Chebyshev distance from a cell to the nearest cell of a structure's footprint. */
const distToFootprint = (/** @type {number} */ x, /** @type {number} */ y, /** @type {any} */ s) =>
  Math.max(Math.max(s.cx - x, 0, x - (s.cx + s.w - 1)), Math.max(s.cy - y, 0, y - (s.cy + s.h - 1)));

/** State of one cell for building by `pid`. @param {any} w @param {number} pid @param {number} x @param {number} y @param {boolean} water */
export function cellState(w, pid, x, y, water) {
  if (x < 0 || y < 0 || x >= w.map.width || y >= w.map.height) return 'red';
  if (!w.isExplored(pid, x, y)) return 'red';
  const i = y * w.map.width + x;
  if (water ? w.map.terrain[i] !== T.water : !buildable(w.map, x, y)) return 'red';
  if (w.occ.bld[i]) return 'red';
  if (w.mineAt?.(i, pid)) return 'red';
  let state = /** @type {CellState} */ ('ok');
  for (const id of w.occ.unitsIn(i)) {
    const u = w.entities.get(id);
    if (!u) continue;
    if (u.owner === pid || w.allied(u.owner, pid)) state = 'amber';
    else return 'red';
  }
  return state;
}

/**
 * Check a footprint for a structure type at top-left (cx, cy).
 * @param {any} w @param {number} pid @param {string} type @param {number} cx @param {number} cy
 * @returns {{ ok: boolean, amber: boolean, cells: CellCheck[], reason: string }}
 */
export function checkPlacement(w, pid, type, cx, cy) {
  const def = structureDef(type);
  const water = !!def.water;
  const probe = { cx, cy, w: def.w, h: def.h };
  /** @type {CellCheck[]} */
  const cells = footprint(probe).map(([x, y]) => ({ x, y, state: cellState(w, pid, x, y, water) }));
  // Exit and dock cells are part of the footprint check: they must be drivable (water for naval exits);
  // so is the doorway into a Service Depot (the cell south of its pad lane).
  for (const off of [def.exit, def.dock, def.pad ? { x: def.pad.x, y: def.h } : null]) {
    if (!off) continue;
    const x = cx + off.x;
    const y = cy + off.y;
    const inside = x >= 0 && y >= 0 && x < w.map.width && y < w.map.height;
    const loco = water ? 'float' : 'track';
    const okCell = inside && w.nav.passable(loco, x, y) && !w.occ.bld[y * w.map.width + x];
    cells.push({ x, y, state: okCell ? 'ok' : 'red' });
  }
  let reason = '';
  if (!hasYard(w, pid)) reason = 'Requires Construction Yard';
  const near = water ? PLACEMENT.navalAdjacency : PLACEMENT.adjacency;
  const own = anchors(w, pid);
  const reaches = footprint(probe).some(([x, y]) => own.some((s) => distToFootprint(x, y, s) <= near));
  if (!reaches) {
    reason = reason || 'Too far from your base';
    for (const c of cells) c.state = 'red';
  }
  const red = cells.some((c) => c.state === 'red');
  if (red && !reason) reason = 'Cannot build there';
  return { ok: !red && !reason, amber: cells.some((c) => c.state === 'amber'), cells, reason };
}

/**
 * Walls: a straight orthogonal line from the first cell. The first must be
 * within 2 of an own non-wall structure or next to an own wall; each further
 * cell orthogonally adjacent to the previous. Up to 20 cells, stopping at the
 * first invalid or unaffordable cell.
 * @param {any} w @param {number} pid @param {string} type @param {number[][]} line
 * @param {number} budget credits available
 * @returns {number[][]} the valid, affordable prefix
 */
export function wallPrefix(w, pid, type, line, budget) {
  const def = structureDef(type);
  const own = anchors(w, pid);
  const ownWalls = w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && !e.dead && structureDef(e.type).wall);
  const out = [];
  let spent = 0;
  for (let k = 0; k < Math.min(line.length, PLACEMENT.wallMaxCells); k++) {
    const [x, y] = line[k];
    if (cellState(w, pid, x, y, false) !== 'ok') break;
    if (k === 0) {
      const nearBase = own.some((s) => distToFootprint(x, y, s) <= PLACEMENT.adjacency);
      const byWall = ownWalls.some((s) => Math.abs(s.cx - x) + Math.abs(s.cy - y) === 1);
      if (!nearBase && !byWall) break;
    } else {
      const [px, py] = line[k - 1];
      if (Math.abs(px - x) + Math.abs(py - y) !== 1) break;
    }
    if (spent + def.cost > budget) break;
    spent += def.cost;
    out.push([x, y]);
  }
  return out;
}

/**
 * MCV deploy: a 3×3 centred on the MCV, every cell buildable and clear
 * except for the MCV itself (and friendlies, who will be asked to move).
 * No adjacency needed.
 * @param {any} w @param {any} mcv
 */
export function checkDeploy(w, mcv) {
  const n = PLACEMENT.mcvFootprint;
  const cx = mcv.cx - (n >> 1);
  const cy = mcv.cy - (n >> 1);
  const cells = footprint({ cx, cy, w: n, h: n }).map(([x, y]) => {
    let st = /** @type {CellState} */ (cellState(w, mcv.owner, x, y, false));
    if (st === 'amber') {
      const ids = w.occ.unitsIn(y * w.map.width + x).filter((/** @type {number} */ id) => id !== mcv.id);
      if (ids.length === 0) st = 'ok';
    }
    return { x, y, state: st };
  });
  return { ok: cells.every((c) => c.state !== 'red'), amber: cells.some((c) => c.state === 'amber'), cells, cx, cy };
}

/** Straight orthogonal wall line from a to b, axis locked to the dominant direction. */
export function wallLine(ax, ay, bx, by) {
  const out = [];
  const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
  const len = horizontal ? Math.abs(bx - ax) : Math.abs(by - ay);
  const sx = horizontal ? Math.sign(bx - ax) : 0;
  const sy = horizontal ? 0 : Math.sign(by - ay);
  for (let k = 0; k <= Math.min(len, PLACEMENT.wallMaxCells - 1); k++) out.push([ax + sx * k, ay + sy * k]);
  return out;
}

/** Is a cell within the player's build area (for drawing its outline)? */
export function inBuildArea(w, pid, x, y) {
  return buildArea(w, pid)(x, y);
}

/** A predicate for the player's build area, with its anchors gathered once (drawing tests many cells). @param {any} w @param {number} pid */
export function buildArea(w, pid) {
  const own = anchors(w, pid);
  return (/** @type {number} */ x, /** @type {number} */ y) => own.some((s) => distToFootprint(x, y, s) <= PLACEMENT.adjacency);
}
