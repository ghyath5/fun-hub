// @ts-check
/**
 * Movement and pathing (system 6, sections 3, 4 and 13).
 *
 * A unit holds its current cell and reserves the next one before entering it.
 * It must face the next cell within ±8 before moving; infantry turn instantly.
 * Speed = base speed × terrain % of the cell being entered (× formation cap).
 * Blocked: wait up to 1 s, then ask an idle blocker to step aside, otherwise
 * re-path with that cell blocked for 2 s. No progress for 3 s re-paths; 8 s gives up.
 * Head-on in a 1-cell pass: the higher id backs up one cell after 1 s.
 */
import { facingOf, facingDelta, turnToward, isqrt, DIR8 } from '../../core/fixed.js';
import { MOVEMENT, SIM, COMBAT } from '../../data/rules.js';
import { TURN_RATE } from '../../data/units.js';
import { ticks } from '../../core/fixed.js';
import { defOf, isInfantry, isAir, canEnter, occupy, vacate, spotPos, isIdle } from '../entities/units.js';
import { spiral } from '../nav.js';
import { triggerMine } from '../mines.js';
import { collectCrate } from './crates.js';
import { airSystem } from '../air.js';
import { specialsSystem } from '../specials.js';
import { transportSystem } from '../transports.js';

/** @typedef {import('../entities/units.js').Unit} Unit */
/** @typedef {import('../world.js').World} World */

const WAIT_TICKS = ticks(MOVEMENT.reserveWaitSeconds);
const BLOCK_TICKS = ticks(MOVEMENT.blockedCellSeconds);
const REPATH_TICKS = ticks(MOVEMENT.stuckRepathSeconds);
const GIVE_UP_TICKS = ticks(MOVEMENT.stuckIdleSeconds);
const MAX_RETRIES = 6;
/** After a failed search or a back-up, wait this long before asking again (outlasts a 2 s block). */
const RETRY_TICKS = BLOCK_TICKS + 1;
/** Stuck re-paths are staggered by id so a jammed crowd does not re-path in one tick. */
const MOVEMENT_STAGGER = 8;

/** Leptons per tick for a speed in thousandths of cells/s on a terrain %. */
export const stepLeptons = (speedK, pct) =>
  Math.max(1, Math.floor((speedK * SIM.leptonsPerCell * pct) / (1000 * 100 * SIM.ticksPerSecond)));

/** The cell a unit is in or committed to, where its next path starts. @param {Unit} u */
const origin = (u) => (u.next ? { x: u.next.x, y: u.next.y } : { x: u.cx, y: u.cy });

/**
 * Ask the pathfinder for a route from the unit's origin to its order's
 * destination. The answer lands inside this tick's or a later tick's
 * `nav.calculate()`; until then the unit waits (or finishes entering its next cell).
 * @param {World} w @param {Unit} u
 */
export function requestPath(w, u) {
  const o = u.order;
  if (!o) return;
  const from = origin(u);
  u.path = [];
  if (isAir(u)) {
    u.path = [o.dx, o.dy];
    return;
  }
  if (from.x === o.dx && from.y === o.dy) return;
  const def = defOf(u);
  const team = w.players[u.owner].team;
  // A destination the pathfinder would treat as hard-blocked can never be
  // reached; pick the nearest open cell around it instead of searching the map.
  if (w.nav.hardFor(team, w.occ.index(o.dx, o.dy), def.loco)) {
    for (const [x, y] of spiral(o.dx, o.dy, MOVEMENT.spawnSearch)) {
      if (w.nav.passable(def.loco, x, y) && w.nav.reachable(def.loco, from.x, from.y, x, y) && !w.nav.hardFor(team, w.occ.index(x, y), def.loco)) {
        o.dx = x; o.dy = y; o.spot = -1;
        break;
      }
    }
    if (from.x === o.dx && from.y === o.dy) return;
  }
  const token = ++w.pathToken;
  u.pathReq = token;
  const id = u.id;
  w.nav.finder(team, def.loco).find(from.x, from.y, o.dx, o.dy, (path) => {
    const v = w.entities.get(id);
    if (!v || v.pathReq !== token) return;
    v.pathReq = 0;
    if (!path) {
      // No route right now (a pass is jammed or temporarily blocked): wait and try again.
      v.path = [];
      v.retryAt = w.tick + RETRY_TICKS;
      return;
    }
    const flat = [];
    for (let k = 1; k < path.length; k++) flat.push(path[k].x, path[k].y);
    v.path = flat;
  });
}

/**
 * Give a unit a move order (used by commands and by the sim itself, e.g. step-aside).
 * A move to the cell it already stands in is a no-op with no path request.
 * @param {World} w @param {Unit} u @param {number} x @param {number} y
 * @param {{ spot?: number, attackMove?: boolean, speedCapK?: number, path?: number[], auto?: boolean }} [opts]
 *   path: precomputed route from the unit's origin (flat x, y list), skipping the A* request
 */
export function setMove(w, u, x, y, opts = {}) {
  let spot = opts.spot ?? -1;
  const from = origin(u);
  // Never search for an impassable or unreachable cell: aim for the nearest reachable one instead.
  const loco = defOf(u).loco;
  if (loco !== 'air' && !w.nav.reachable(loco, from.x, from.y, x, y)) {
    const d = w.nav.resolveDestination(loco, from.x, from.y, x, y);
    x = d.x;
    y = d.y;
    spot = -1;
  }
  const sameSpot = spot < 0 || !isInfantry(u) || (!u.next && u.spot === spot);
  if (from.x === x && from.y === y && sameSpot) {
    if (!u.next) { u.order = null; u.path = []; u.pathReq = 0; }
    else u.order = { type: 'move', dx: x, dy: y, spot, attackMove: !!opts.attackMove, speedCap: opts.speedCapK ?? 0 };
    return;
  }
  u.order = { type: 'move', dx: x, dy: y, spot, attackMove: !!opts.attackMove, speedCap: opts.speedCapK ?? 0, auto: !!opts.auto };
  u.waited = 0;
  u.askedAside = false;
  u.sinceCell = 0;
  u.retries = 0;
  if (opts.path && opts.path.length) {
    u.path = opts.path;
    u.pathReq = 0;
  } else {
    requestPath(w, u);
  }
}

/** Stop: drop the order; a unit between cells still finishes entering its next one. @param {Unit} u */
export function stopUnit(u) {
  u.path = [];
  u.pathReq = 0;
  u.order = u.next ? { type: 'move', dx: u.next.x, dy: u.next.y, spot: u.next.spot, attackMove: false, speedCap: 0, auto: true } : null;
}

/** @param {World} w @param {Unit} u */
function finish(w, u) {
  u.order = null;
  u.path = [];
  u.pathReq = 0;
  u.waited = 0;
  u.sinceCell = 0;
  w.events.emit('unitArrived', w.tick, { id: u.id });
}

/**
 * Move an idle unit one cell out of someone's way: the first free neighbour,
 * preferring cells farther from the requester and never the cells it needs.
 * @param {World} w @param {Unit} blocker @param {Unit} requester
 * @returns {boolean}
 */
function stepAside(w, blocker, requester) {
  const avoid = new Set([`${requester.cx},${requester.cy}`]);
  if (requester.path.length >= 2) avoid.add(`${requester.path[0]},${requester.path[1]}`);
  if (requester.path.length >= 4) avoid.add(`${requester.path[2]},${requester.path[3]}`);
  const options = DIR8.map(([dx, dy], k) => {
    const x = blocker.cx + dx;
    const y = blocker.cy + dy;
    const d = (x - requester.cx) ** 2 + (y - requester.cy) ** 2;
    return { x, y, d, k };
  }).sort((a, b) => b.d - a.d || a.k - b.k);
  // First choice: off the requester's route. In a corridor there is none, so
  // the blocker is pushed ahead along the route instead (never onto the requester).
  const mine = `${requester.cx},${requester.cy}`;
  for (const strict of [true, false]) {
    for (const c of options) {
      const k = `${c.x},${c.y}`;
      if (k === mine || (strict && avoid.has(k))) continue;
      if (canEnter(w, blocker, c.x, c.y).ok) {
        setMove(w, blocker, c.x, c.y, { auto: true });
        return true;
      }
    }
  }
  return false;
}

/** Back one cell away from a head-on opponent, then carry on to the order's destination. @param {World} w @param {Unit} u @param {Unit} other */
function backUp(w, u, other) {
  const keep = u.order;
  // After backing up, the empty path triggers a fresh request to the order's destination.
  const avoid = new Set([`${other.cx},${other.cy}`]);
  if (other.next) avoid.add(`${other.next.x},${other.next.y}`);
  for (const [dx, dy] of DIR8) {
    const x = u.cx + dx;
    const y = u.cy + dy;
    if (avoid.has(`${x},${y}`) || !canEnter(w, u, x, y).ok) continue;
    u.path = [x, y];
    u.pathReq = 0;
    u.retryAt = w.tick + RETRY_TICKS; // yield: let the other unit through before re-pathing
    return keep !== null;
  }
  return false;
}

/** @param {World} w @param {Unit} u @param {number} nx @param {number} ny @param {number} blockerId */
function handleBlocked(w, u, nx, ny, blockerId) {
  u.waited++;
  const team = w.players[u.owner].team;
  const b = blockerId ? w.entities.get(blockerId) : null;
  if (!b) {
    // Static blocker (a structure appeared): re-path at once.
    w.nav.tempBlock(team, w.occ.index(nx, ny), w.tick + BLOCK_TICKS);
    requestPath(w, u);
    u.waited = 0;
    return;
  }
  const friendly = w.allied(b.owner, u.owner);
  // A vehicle nudges idle friendly infantry out of its way at once.
  if (friendly && !isInfantry(u) && isInfantry(b) && !u.askedAside) {
    for (const id of w.occ.unitsIn(w.occ.index(nx, ny))) {
      const inf = w.entities.get(id);
      if (inf && isIdle(inf) && w.allied(inf.owner, u.owner)) stepAside(w, inf, u);
    }
    u.askedAside = true;
  }
  if (u.waited < WAIT_TICKS) return;
  // A friend already moving to another cell will clear by itself: keep waiting.
  if (friendly && b.next && !(b.next.x === u.cx && b.next.y === u.cy) && !(b.next.x === nx && b.next.y === ny)) return;
  if (friendly) {
    const headOn = b.next ? b.next.x === u.cx && b.next.y === u.cy
      : b.path.length >= 2 && b.path[0] === u.cx && b.path[1] === u.cy;
    if (headOn) {
      if (u.id > b.id && backUp(w, u, b)) u.waited = 0;
      return;
    }
    if (isIdle(b) && !u.askedAside) {
      u.askedAside = true;
      if (stepAside(w, b, u)) { u.waited = 0; return; }
    }
  }
  w.nav.tempBlock(team, w.occ.index(nx, ny), w.tick + BLOCK_TICKS);
  requestPath(w, u);
  u.waited = 0;
  u.askedAside = false;
}

/** @param {World} w @param {Unit} u */
function checkStuck(w, u) {
  if (!u.order) return;
  u.sinceCell++;
  if (u.sinceCell === REPATH_TICKS + (u.id % MOVEMENT_STAGGER)) requestPath(w, u);
  else if (u.sinceCell >= GIVE_UP_TICKS) finish(w, u);
}

/** Effective step this tick, leptons. @param {World} w @param {Unit} u */
function speedOf(w, u) {
  const def = defOf(u);
  let k = Math.round(def.speed * 1000);
  if (u.speedK) k = Math.floor((k * u.speedK) / 1000); // speed crate
  if (u.order?.speedCap) k = Math.min(k, u.order.speedCap);
  if (w.tick < u.proneUntil && def.loco === 'foot') k = Math.floor(k * COMBAT.proneSpeedFactor);
  const n = /** @type {{x: number, y: number}} */ (u.next);
  return stepLeptons(k, w.nav.speedPct(def.loco, n.x, n.y));
}

/**
 * Crushing (section 9): a crusher entering a cell kills every enemy infantry
 * unit in it. Collected as damage so it lands with everything else in system 9.
 * @param {World} w @param {Unit} u
 */
function crush(w, u) {
  for (const id of w.occ.unitsIn(w.occ.index(u.cx, u.cy))) {
    const v = w.entities.get(id);
    if (!v || v.id === u.id || !isInfantry(v) || w.allied(v.owner, u.owner)) continue;
    if (v.next && (v.next.x !== u.cx || v.next.y !== u.cy)) continue; // already stepping out of the cell
    w.damage.push({ victim: v.id, amount: v.hp, attacker: u.id, owner: u.owner });
  }
}

/**
 * Enemy infantry not under a direct player order scatter when a crusher's next
 * cell is theirs or adjacent to it.
 * @param {World} w @param {Unit} crusher @param {number} nx @param {number} ny
 */
function warnInfantry(w, crusher, nx, ny) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = nx + dx;
      const y = ny + dy;
      if (x < 0 || y < 0 || x >= w.map.width || y >= w.map.height) continue;
      for (const id of w.occ.unitsIn(w.occ.index(x, y))) {
        const v = w.entities.get(id);
        if (!v || !isInfantry(v) || w.allied(v.owner, crusher.owner)) continue;
        if (v.order && !v.order.auto) continue; // a direct order wins
        if (v.next) continue;
        // Step to the free neighbour farthest from the crusher's path, never into it.
        let best = null;
        let bestD = -1;
        for (const [sx, sy] of DIR8) {
          const cx = v.cx + sx;
          const cy = v.cy + sy;
          if ((cx === nx && cy === ny) || (cx === crusher.cx && cy === crusher.cy)) continue;
          if (!canEnter(w, v, cx, cy).ok) continue;
          const d = (cx - nx) ** 2 + (cy - ny) ** 2;
          if (d > bestD) { bestD = d; best = { x: cx, y: cy }; }
        }
        if (best) setMove(w, v, best.x, best.y, { auto: true });
      }
    }
  }
}

/** @param {World} w @param {Unit} u */
function stepUnit(w, u) {
  const def = defOf(u);
  if (!u.next) {
    if (!u.order) return;
    if (u.pathReq) { checkStuck(w, u); return; }
    const o = u.order;
    if (u.path.length === 0) {
      const atDest = u.cx === o.dx && u.cy === o.dy;
      if (atDest && isInfantry(u) && o.spot >= 0 && u.spot !== o.spot && w.occ.freeSpot(w.occ.index(u.cx, u.cy), o.spot) === o.spot) {
        occupy(w, u, u.cx, u.cy, o.spot);
        u.next = { x: u.cx, y: u.cy, spot: o.spot };
      } else if (atDest || u.retries >= MAX_RETRIES) {
        finish(w, u);
        return;
      } else if (w.tick < u.retryAt) {
        checkStuck(w, u);
        return;
      } else {
        u.retries = u.retries + 1;
        requestPath(w, u);
        return;
      }
    } else {
      const nx = u.path[0];
      const ny = u.path[1];
      const last = u.path.length === 2;
      const r = canEnter(w, u, nx, ny, last && o.spot >= 0 ? o.spot : 0);
      if (!r.ok) {
        handleBlocked(w, u, nx, ny, 'blocker' in r ? r.blocker : 0);
        checkStuck(w, u);
        return;
      }
      u.path.splice(0, 2);
      occupy(w, u, nx, ny, r.spot);
      u.next = { x: nx, y: ny, spot: r.spot };
      if (def.crusher !== 'none') warnInfantry(w, u, nx, ny);
      u.waited = 0;
      u.askedAside = false;
    }
  }

  const n = /** @type {{x: number, y: number, spot: number}} */ (u.next);
  const target = spotPos(n.x, n.y, isInfantry(u) ? n.spot : -1);
  const dx = target.x - u.x;
  const dy = target.y - u.y;
  if (dx !== 0 || dy !== 0) {
    const want = facingOf(dx, dy);
    u.facing = turnToward(u.facing, want, def.turnRate);
    if (!def.turret) u.turret = u.facing;
    if (Math.abs(facingDelta(u.facing, want)) > SIM.facingTolerance) {
      checkStuck(w, u);
      return;
    }
  }
  // Turrets follow the hull only while nothing is being aimed at (the weapon system aims them otherwise).
  if (def.turret && !u.target && !u.fireCell) u.turret = turnToward(u.turret, u.facing, TURN_RATE.turret);

  const stepLen = speedOf(w, u);
  const dist = isqrt(dx * dx + dy * dy);
  if (dist <= stepLen) {
    u.x = target.x;
    u.y = target.y;
    vacate(w, u, u.cx, u.cy, u.spot);
    u.cx = n.x;
    u.cy = n.y;
    u.spot = isInfantry(u) ? n.spot : -1;
    u.next = null;
    u.sinceCell = 0;
    if (def.crusher !== 'none') crush(w, u);
    if (w.mines.size) triggerMine(w, u);
    if (w.crates.length) collectCrate(w, u);
    return;
  }
  u.x += Math.trunc((dx * stepLen) / dist);
  u.y += Math.trunc((dy * stepLen) / dist);
  checkStuck(w, u);
}

/** @param {World} w */
export function movementSystem(w) {
  airSystem(w);
  w.nav.expire(w.tick);
  w.nav.calculate();
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.inside || u.landed) continue;
    stepUnit(w, u);
  }
  specialsSystem(w);
  transportSystem(w);
}
