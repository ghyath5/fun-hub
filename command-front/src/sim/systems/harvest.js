// @ts-check
/**
 * Harvesting and unloading (system 10, section 5). Each Harvester runs a
 * small state machine: SeekOre → MoveToOre → Harvesting → SeekRefinery →
 * QueueAtDock → Docking → Unloading → back to SeekOre near the last field.
 * A Coalition harvester whose turn at the dock comes while it is far away
 * warps there instead of driving (Chrono → Unloading).
 * A player move order switches automation off until a harvest or refinery
 * order turns it back on.
 */
import { ECONOMY, SIM } from '../../data/rules.js';
import { UNITS } from '../../data/units.js';
import { ticks, chebyshev } from '../../core/fixed.js';
import { createFsm } from '../fsm.js';
import { computeField } from '../flowField.js';
import { spiral } from '../nav.js';
import { deposit } from '../formulas/economy.js';
import { setMove } from './movement.js';
import { oreValueK } from '../bonuses.js';
import { isActive, structureDef, cellAt, structuresWithRole } from '../entities/structures.js';
import { canEnter, spotPos, occupy, vacate } from '../entities/units.js';

/** @typedef {import('../world.js').World} World */

const CAPACITY = ECONOMY.harvesterCapacity;
const CHRONO_TICKS = ticks(ECONOMY.chronoSeconds);

/** Does this harvester warp home (the Coalition's)? @param {World} w @param {any} u */
const chronoMiner = (w, u) => w.players[u.owner]?.faction === 'coalition';
/** Bales a harvester carries when full. @param {World} w @param {any} u */
const capacityOf = (w, u) => (chronoMiner(w, u) ? ECONOMY.chronoCapacity : CAPACITY);

/** Is a cell free for a harvester to appear in (nothing standing there)? @param {World} w @param {any} u @param {{x: number, y: number}} c */
const clearFor = (w, u, c) => canEnter(w, u, c.x, c.y).ok && w.occ.unitsIn(c.y * w.map.width + c.x).every((/** @type {number} */ id) => id === u.id);

/** Lift a harvester off the map and put it down on a cell. @param {World} w @param {any} u @param {{x: number, y: number}} to */
function warp(w, u, to) {
  vacate(w, u, u.cx, u.cy, u.spot);
  if (u.next) vacate(w, u, u.next.x, u.next.y, u.next.spot);
  u.next = null;
  u.order = null;
  u.path = [];
  u.pathReq = 0;
  const pos = spotPos(to.x, to.y, -1);
  u.x = pos.x; u.y = pos.y; u.px = pos.x; u.py = pos.y;
  u.cx = to.x; u.cy = to.y;
  occupy(w, u, to.x, to.y, -1);
}
const HARVEST_TICKS = Math.round(ECONOMY.harvestSecondsPerBale * SIM.ticksPerSecond);
const UNLOAD_TICKS = Math.round(ECONOMY.unloadSecondsPerBale * SIM.ticksPerSecond);
const RETRY_TICKS = ticks(2);
const NO_ORE_RETRY = ticks(5);
const CELL_COST = 100;   // field cost of one clear cell (computeField: 10000 / 100%)
const GEM_BONUS = 4 * CELL_COST;

/**
 * @typedef {object} HarvestState
 * @property {string} state
 * @property {number} ore      Ore bales carried
 * @property {number} gem      Gem bales carried
 * @property {number} last     Last harvested cell index (-1 = none)
 * @property {number} cell     Cell being harvested or headed for (-1 = none)
 * @property {number} refinery Refinery being used (0 = none)
 * @property {number} timer
 * @property {boolean} auto
 */

/** @returns {HarvestState} */
export const newHarvestState = () => ({ state: 'seekOre', ore: 0, gem: 0, last: -1, cell: -1, refinery: 0, timer: 0, auto: true });

export const isHarvester = (/** @type {any} */ u) => u.kind === 'unit' && UNITS[u.type].tags.includes('harvester');

const load = (/** @type {HarvestState} */ h) => h.ore + h.gem;

/** @param {World} w @param {any} u */
function release(w, u) {
  const h = u.harv;
  if (h.cell >= 0 && w.oreReserved.get(h.cell) === u.id) w.oreReserved.delete(h.cell);
  h.cell = -1;
}

/** @param {World} w @param {any} u */
function leaveDock(w, u) {
  const h = u.harv;
  const r = h.refinery ? w.entities.get(h.refinery) : null;
  if (r) {
    r.dockQueue = r.dockQueue.filter((/** @type {number} */ id) => id !== u.id);
    if (r.docked === u.id) r.docked = 0;
  }
  h.refinery = 0;
}

/** @param {World} w @param {number} i @param {number} id */
const free = (w, i, id) => w.map.bales[i] > 0 && (!w.oreReserved.has(i) || w.oreReserved.get(i) === id);

/** Is there free ore within `r` cells (Chebyshev) of a cell? @param {World} w @param {any} u @param {number} cx @param {number} cy @param {number} r */
function oreWithin(w, u, cx, cy, r) {
  const W = w.map.width;
  for (let y = Math.max(0, cy - r); y <= Math.min(w.map.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) if (free(w, y * W + x, u.id)) return true;
  }
  return false;
}

/**
 * Best ore or gem cell: lowest path cost − 4 for gems, skipping cells
 * reserved by other harvesters; cells within 6 of the last field first, then
 * within 20, then anywhere reachable.
 *
 * The search spreads out from the harvester cheapest-first and stops as soon
 * as no unseen cell could still win, so on a big map a harvester going back
 * to its own field never pays for a search of the whole map.
 * @param {World} w @param {any} u
 * @returns {number} cell index or -1
 */
export function findOre(w, u) {
  const W = w.map.width;
  const h = u.harv;
  const lastX = h.last >= 0 ? h.last % W : -1;
  const lastY = h.last >= 0 ? (h.last / W) | 0 : -1;
  // A tier with no free ore in its window can never win; one that has some can.
  const nearPossible = h.last >= 0 && oreWithin(w, u, lastX, lastY, ECONOMY.preferNearLast);
  const localPossible = oreWithin(w, u, u.cx, u.cy, ECONOMY.seekLocalRadius);
  let near = -1; let nearScore = Infinity;
  let local = -1; let localScore = Infinity;
  let any = -1; let anyScore = Infinity;
  computeField(w.nav.grids.track, u.cx, u.cy, (i, d) => {
    // Every cell still to come costs at least d, so scores below d − bonus are final.
    const floor = d - GEM_BONUS;
    if (near >= 0 && floor > nearScore) return true;
    if (!nearPossible && local >= 0 && floor > localScore) return true;
    if (!nearPossible && !localPossible && any >= 0 && floor > anyScore) return true;
    if (!free(w, i, u.id)) return false;
    const x = i % W;
    const y = (i / W) | 0;
    const score = d - (w.map.gem[i] ? GEM_BONUS : 0);
    const better = (/** @type {number} */ best, /** @type {number} */ bestCell) => score < best || (score === best && i < bestCell);
    if (h.last >= 0 && chebyshev(x, y, lastX, lastY) <= ECONOMY.preferNearLast && better(nearScore, near)) { nearScore = score; near = i; }
    if (chebyshev(x, y, u.cx, u.cy) <= ECONOMY.seekLocalRadius && better(localScore, local)) { localScore = score; local = i; }
    if (better(anyScore, any)) { anyScore = score; any = i; }
    return false;
  });
  return near >= 0 ? near : local >= 0 ? local : any;
}

/** Nearest unreserved ore within 3 cells of a cell, or -1. @param {World} w @param {any} u @param {number} from */
function nextNearby(w, u, from) {
  const W = w.map.width;
  for (const [x, y] of spiral(from % W, (from / W) | 0, ECONOMY.nextCellRadius)) {
    if (x < 0 || y < 0 || x >= W || y >= w.map.height) continue;
    const i = y * W + x;
    if (free(w, i, u.id) && w.nav.passable('track', x, y)) return i;
  }
  return -1;
}

/** @param {World} w @param {any} u @param {number} i */
function headFor(w, u, i) {
  const W = w.map.width;
  u.harv.cell = i;
  w.oreReserved.set(i, u.id);
  setMove(w, u, i % W, (i / W) | 0, { auto: true });
  return 'moveToOre';
}

/** Dock cell of a refinery. @param {any} r */
const dockOf = (r) => cellAt(r, structureDef(r.type).dock);

/** @param {World} w @param {any} u @param {any} r */
function refineryUsable(w, u, r) {
  return r && r.kind === 'structure' && isActive(r) && r.owner === u.owner && structureDef(r.type).role === 'refinery';
}

const fsm = createFsm({
  seekOre(w, u, h) {
    if (load(h) >= capacityOf(w, u)) return 'seekRefinery';
    if (h.timer > 0) { h.timer--; return 'seekOre'; }
    const i = findOre(w, u);
    if (i >= 0) {
      w.players[u.owner].flags.oreDepleted = 0;
      return headFor(w, u, i);
    }
    if (load(h) > 0) return 'seekRefinery';
    if (!w.players[u.owner].flags.oreDepleted) {
      w.players[u.owner].flags.oreDepleted = 1;
      w.events.emit('oreDepleted', w.tick, { owner: u.owner, id: u.id });
    }
    // Idle beside a refinery and look again later.
    const r = structuresWithRole(w, u.owner, 'refinery')[0];
    if (r && chebyshev(u.cx, u.cy, dockOf(r).x, dockOf(r).y) > 3 && !u.order) {
      const d = dockOf(r);
      setMove(w, u, d.x + 2, d.y, { auto: true });
    }
    h.timer = NO_ORE_RETRY;
    return 'seekOre';
  },

  moveToOre(w, u, h) {
    if (h.cell < 0 || w.map.bales[h.cell] === 0) {
      const at = h.cell;
      release(w, u);
      const next = at >= 0 ? nextNearby(w, u, at) : -1;
      return next >= 0 ? headFor(w, u, next) : 'seekOre';
    }
    const W = w.map.width;
    if (u.cx === h.cell % W && u.cy === ((h.cell / W) | 0) && !u.next) {
      h.timer = HARVEST_TICKS;
      return 'harvesting';
    }
    if (!u.order && !u.next) {
      // Could not get there (blocked, unreachable): try again shortly.
      release(w, u);
      h.timer = RETRY_TICKS;
      return 'seekOre';
    }
    return 'moveToOre';
  },

  harvesting(w, u, h) {
    const i = h.cell;
    if (i < 0) return 'seekOre';
    if (load(h) >= capacityOf(w, u)) { release(w, u); return 'seekRefinery'; }
    if (w.map.bales[i] === 0) {
      release(w, u);
      const next = nextNearby(w, u, i);
      if (next >= 0) return headFor(w, u, next);
      return load(h) > 0 ? 'seekRefinery' : 'seekOre';
    }
    if (--h.timer > 0) return 'harvesting';
    h.timer = HARVEST_TICKS;
    if (w.map.gem[i]) h.gem++; else h.ore++;
    w.map.bales[i]--;
    if (w.map.bales[i] === 0) {
      w.map.gem[i] = 0;
      w.nav.refreshCell(i % w.map.width, Math.floor(i / w.map.width)); // no ore: full speed again
    }
    h.last = i;
    w.events.emit('oreChanged', w.tick, { i });
    return 'harvesting';
  },

  seekRefinery(w, u, h) {
    const refineries = structuresWithRole(w, u.owner, 'refinery');
    if (!refineries.length) return 'waitRefinery';
    const W = w.map.width;
    // Search outward until every dock is reached or the rest are too far to beat the nearest.
    const docks = new Set(refineries.map((r) => { const d = dockOf(r); return d.y * W + d.x; }));
    let first = -1;
    const field = computeField(w.nav.grids.track, u.cx, u.cy, (i, d) => {
      if (first >= 0 && d > first + ECONOMY.refineryDetourCells * CELL_COST) return true;
      if (docks.delete(i) && first < 0) first = d;
      return docks.size === 0 && d > first;
    });
    const cost = (/** @type {any} */ r) => {
      const d = dockOf(r);
      return d.x >= 0 && d.y >= 0 && d.x < W && d.y < w.map.height ? field.dist[d.y * W + d.x] : Infinity;
    };
    const ranked = refineries.map((r) => ({ r, c: cost(r) })).filter((x) => Number.isFinite(x.c)).sort((a, b) => a.c - b.c || a.r.id - b.r.id);
    if (!ranked.length) return 'waitRefinery';
    let pick = ranked[0];
    const busy = (/** @type {any} */ r) => r.docked !== 0 || r.dockQueue.length > 0;
    if (busy(pick.r)) {
      const alt = ranked.find((x) => !busy(x.r) && x.c <= pick.c + ECONOMY.refineryDetourCells * CELL_COST);
      if (alt) pick = alt;
    }
    h.refinery = pick.r.id;
    pick.r.dockQueue.push(u.id);
    return 'queueAtDock';
  },

  waitRefinery(w, u, h) {
    if (structuresWithRole(w, u.owner, 'refinery').length) {
      w.players[u.owner].flags.noRefinery = 0;
      return 'seekRefinery';
    }
    if (!w.players[u.owner].flags.noRefinery) {
      w.players[u.owner].flags.noRefinery = 1;
      w.events.emit('noRefinery', w.tick, { owner: u.owner, id: u.id });
    }
    return 'waitRefinery';
  },

  queueAtDock(w, u, h) {
    const r = w.entities.get(h.refinery);
    if (!refineryUsable(w, u, r)) { leaveDock(w, u); return 'seekRefinery'; }
    const dock = dockOf(r);
    if (r.docked === 0 && r.dockQueue[0] === u.id) {
      // Far from home and the dock is clear: warp instead of driving.
      if (chronoMiner(w, u) && chebyshev(u.cx, u.cy, dock.x, dock.y) >= ECONOMY.chronoMinCells && clearFor(w, u, dock)) {
        r.docked = u.id; // hold the dock while charging
        r.dockQueue = r.dockQueue.filter((/** @type {number} */ id) => id !== u.id);
        u.order = null;
        u.path = [];
        h.timer = CHRONO_TICKS;
        w.events.emit('chrono', w.tick, { id: u.id, x: u.x, y: u.y, phase: 'out' });
        return 'chrono';
      }
      setMove(w, u, dock.x, dock.y, { auto: true });
      return 'docking';
    }
    // Wait on a free cell within 3 of the dock.
    if (chebyshev(u.cx, u.cy, dock.x, dock.y) > ECONOMY.dockQueueRadius && !u.order && !u.next) {
      for (const [x, y] of spiral(dock.x, dock.y, ECONOMY.dockQueueRadius)) {
        if ((x === dock.x && y === dock.y) || !canEnter(w, u, x, y).ok) continue;
        setMove(w, u, x, y, { auto: true });
        break;
      }
    }
    return 'queueAtDock';
  },

  chrono(w, u, h) {
    const r = w.entities.get(h.refinery);
    if (!refineryUsable(w, u, r)) { leaveDock(w, u); return 'seekRefinery'; }
    if (--h.timer > 0) return 'chrono';
    const dock = dockOf(r);
    if (!clearFor(w, u, dock)) {
      // Someone drove onto the dock meanwhile: drive there after all.
      setMove(w, u, dock.x, dock.y, { auto: true });
      return 'docking';
    }
    warp(w, u, dock);
    w.events.emit('chrono', w.tick, { id: u.id, x: u.x, y: u.y, phase: 'in' });
    h.timer = UNLOAD_TICKS;
    return 'unloading';
  },

  docking(w, u, h) {
    const r = w.entities.get(h.refinery);
    if (!refineryUsable(w, u, r)) { leaveDock(w, u); return 'seekRefinery'; }
    const dock = dockOf(r);
    if (u.cx === dock.x && u.cy === dock.y && !u.next) {
      r.docked = u.id;
      r.dockQueue = r.dockQueue.filter((/** @type {number} */ id) => id !== u.id);
      h.timer = UNLOAD_TICKS;
      return 'unloading';
    }
    if (!u.order && !u.next) setMove(w, u, dock.x, dock.y, { auto: true });
    return 'docking';
  },

  unloading(w, u, h) {
    const r = w.entities.get(h.refinery);
    if (!refineryUsable(w, u, r)) { leaveDock(w, u); return load(h) > 0 ? 'seekRefinery' : 'seekOre'; }
    if (load(h) === 0) {
      r.docked = 0;
      h.refinery = 0;
      return 'seekOre';
    }
    if (--h.timer > 0) return 'unloading';
    h.timer = UNLOAD_TICKS;
    const gem = h.ore === 0;
    if (gem) h.gem--; else h.ore--;
    const p = w.players[u.owner];
    // AI levels earn more or less per bale (section 16), and an Ore Processor adds 25%: factors in thousandths.
    const value = Math.floor(((gem ? ECONOMY.gemBaleValue : ECONOMY.oreBaleValue) * oreValueK(w, u.owner)) / 1000);
    const res = deposit({ cash: p.cash, stored: p.stored }, value, p.capacity);
    p.stored = res.wallet.stored;
    p.stats.creditsHarvested += value - res.lost;
    if (res.silosNeeded) w.events.emit('silosNeeded', w.tick, { owner: u.owner });
    return 'unloading';
  },

  idle() { return 'idle'; },
});

/** A player order took the Harvester over: stop automation. @param {World} w @param {any} u */
export function harvesterManual(w, u) {
  if (!u.harv) return;
  release(w, u);
  leaveDock(w, u);
  u.harv.auto = false;
  u.harv.state = 'idle';
}

/** Player: harvest this cell (or near it). @param {World} w @param {any} u @param {number} x @param {number} y */
export function harvestAt(w, u, x, y) {
  const h = u.harv;
  release(w, u);
  leaveDock(w, u);
  h.auto = true;
  const i = y * w.map.width + x;
  if (free(w, i, u.id)) h.state = headFor(w, u, i);
  else { h.last = i; h.state = 'seekOre'; h.timer = 0; }
}

/** Player: unload at this refinery now, even partly full. @param {World} w @param {any} u @param {any} r */
export function unloadAt(w, u, r) {
  const h = u.harv;
  if (!refineryUsable(w, u, r)) return false;
  release(w, u);
  leaveDock(w, u);
  h.auto = true;
  if (load(h) === 0) { h.state = 'seekOre'; return true; }
  h.refinery = r.id;
  r.dockQueue.push(u.id);
  h.state = 'queueAtDock';
  return true;
}

/** A Harvester died: free its ore claim and dock place; its cargo is lost. @param {World} w @param {any} u */
export function harvesterDied(w, u) {
  if (!u.harv) return;
  release(w, u);
  leaveDock(w, u);
}

/** System 10. @param {World} w */
export function harvestSystem(w) {
  for (const u of w.entities.all()) {
    if (u.dead || !u.harv || u.inside || !u.harv.auto) continue;
    fsm.step(w, u, u.harv);
  }
}
