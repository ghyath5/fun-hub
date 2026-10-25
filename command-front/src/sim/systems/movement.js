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
 *
 * Aircraft fly free of the grid (flyUnit): straight at their destination,
 * helicopters turning on the spot first, planes always moving forward and
 * banking round in arcs — so an attack run overflies the target and loops
 * back, the way Red Alert 2's jets do.
 */
import { facingOf, facingDelta, turnToward, isqrt, DIR8, stepAlong } from '../../core/fixed.js';
import { MOVEMENT, SIM, COMBAT, AIRCRAFT } from '../../data/rules.js';
import { TURN_RATE } from '../../data/units.js';
import { ticks } from '../../core/fixed.js';
import { defOf, isInfantry, isAir, canEnter, occupy, vacate, spotPos, isIdle, walkClear } from '../entities/units.js';
import { digOut } from '../dig.js';
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
/** Longest a soldier waits for another to walk past before he goes anyway (no deadlocks). */
const YIELD_TICKS = ticks(MOVEMENT.infantryYieldSeconds);
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
 * @param {{ spot?: number, attackMove?: boolean, speedCapK?: number, path?: number[], auto?: boolean, at?: { x: number, y: number } }} [opts]
 *   path: precomputed route from the unit's origin (flat x, y list), skipping the A* request;
 *   at: aircraft only, the exact point to fly to (leptons) instead of the cell's centre
 */
export function setMove(w, u, x, y, opts = {}) {
  // Anything that moves a dug-in Rifleman digs him out first.
  if (u.dug) digOut(w, u);
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
  u.order = { type: 'move', dx: x, dy: y, spot, attackMove: !!opts.attackMove, speedCap: opts.speedCapK ?? 0, auto: !!opts.auto, ...(opts.at ? { at: opts.at } : {}) };
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
      // At the destination cell a soldier steps over to his own spot, unless that would walk through someone.
      if (atDest && isInfantry(u) && o.spot >= 0 && u.spot !== o.spot && walkClear(w, u, u.cx, u.cy, o.spot)) {
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
      // Infantry keep their lane (the same spot in the next cell) on the way, so a squad walks side by side.
      const lane = isInfantry(u) && u.spot >= 0 ? u.spot : 0;
      const want = last && o.spot >= 0 ? o.spot : lane;
      // A soldier who would walk through another waits a moment for him to pass (then goes anyway).
      let r = canEnter(w, u, nx, ny, want, u.yielded < YIELD_TICKS);
      if (!r.ok && 'yieldTo' in r && r.yieldTo) {
        u.yielded++;
        checkStuck(w, u);
        return;
      }
      if (!r.ok) {
        handleBlocked(w, u, nx, ny, 'blocker' in r ? r.blocker : 0);
        checkStuck(w, u);
        return;
      }
      u.path.splice(0, 2);
      u.yielded = 0;
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
  const sx = Math.trunc((dx * stepLen) / dist);
  const sy = Math.trunc((dy * stepLen) / dist);
  // A soldier never steps onto another one: he holds this tick instead (for a moment at most),
  // and a friend standing in his way shuffles to another spot of his cell.
  const onto = isInfantry(u) && u.yielded < YIELD_TICKS ? wouldStepOnto(w, u, u.x + sx, u.y + sy) : null;
  if (onto) {
    // Someone standing in the way: he shuffles to another spot of his cell; failing that the
    // walker takes another free spot whose walk is clear; failing that an idle friend steps aside.
    if (!onto.next && w.allied(onto.owner, u.owner) && !shuffleAside(w, onto, u, target) && !respot(w, u) && isIdle(onto)) stepAside(w, onto, u);
    u.yielded++;
    checkStuck(w, u);
    return;
  }
  u.x += sx;
  u.y += sy;
  u.yielded = 0;
  checkStuck(w, u);
}

/** Soldiers' centres closer than this are standing in each other, leptons. */
const ONTO = 24;
/** Two walking soldiers on converging lines: the later one (higher id) gives way from this far. */
const GIVE_WAY = 48;

/**
 * Would a soldier stepping to (x, y) come onto another soldier? Closing on
 * one who stands still (or who has right of way) nearer than ONTO, or — for
 * the one who gives way, the higher id of two walkers — nearer than GIVE_WAY,
 * so he stops before their lines cross. Looks in the cells around him;
 * returns the soldier in the way, or null.
 * @param {World} w @param {Unit} u @param {number} x @param {number} y
 * @returns {Unit | null}
 */
function wouldStepOnto(w, u, x, y) {
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = u.cx + ox, cy = u.cy + oy;
    if (cx < 0 || cy < 0 || cx >= w.map.width || cy >= w.map.height) continue;
    for (const id of w.occ.unitsIn(w.occ.index(cx, cy))) {
      if (id === u.id) continue;
      const v = w.entities.get(id);
      if (!v || !isInfantry(v)) continue;
      const now = (u.x - v.x) ** 2 + (u.y - v.y) ** 2;
      const then = (x - v.x) ** 2 + (y - v.y) ** 2;
      const r = v.next && v.id < u.id ? GIVE_WAY : ONTO;
      if (then < r * r && then < now) return v;
    }
  }
  return null;
}

/**
 * A soldier standing on a walker's line steps to the free spot of his cell
 * farthest from that line (if any is clear of it), the way RA2 infantry
 * shuffle aside. @returns {boolean} whether he moved
 * @param {World} w @param {Unit} v @param {Unit} walker @param {{ x: number, y: number }} to
 */
function shuffleAside(w, v, walker, to) {
  const i = w.occ.index(v.cx, v.cy);
  let best = -1;
  let bestD = (GIVE_WAY * GIVE_WAY);
  for (let k = 0; k < MOVEMENT.infantrySpots; k++) {
    if (w.occ.freeSpot(i, k) !== k) continue;
    const p = spotPos(v.cx, v.cy, k);
    const vx = to.x - walker.x, vy = to.y - walker.y;
    const len = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - walker.x) * vx + (p.y - walker.y) * vy) / len));
    const d = (walker.x + vx * t - p.x) ** 2 + (walker.y + vy * t - p.y) ** 2;
    if (d > bestD && walkClear(w, v, v.cx, v.cy, k)) { bestD = d; best = k; }
  }
  if (best < 0) return false;
  occupy(w, v, v.cx, v.cy, best);
  v.next = { x: v.cx, y: v.cy, spot: best };
  return true;
}

/**
 * Change the spot a walking soldier is heading for (in the same next cell) to
 * a free one whose walk is clear. @param {World} w @param {Unit} u @returns {boolean}
 */
function respot(w, u) {
  const n = u.next;
  if (!n) return false;
  for (let k = 0; k < MOVEMENT.infantrySpots; k++) {
    if (k === n.spot || !walkClear(w, u, n.x, n.y, k)) continue;
    vacate(w, u, n.x, n.y, n.spot);
    occupy(w, u, n.x, n.y, k);
    u.next = { x: n.x, y: n.y, spot: k };
    return true;
  }
  return false;
}

// ── Flight ──────────────────────────────────────────────────────

const L = SIM.leptonsPerCell;

/** Does this aircraft fly like a plane (always forward, banking)? @param {any} def */
const fliesLikePlane = (def) => def.tags.includes('plane') || def.tags.includes('support');

/** Radius of a plane's turning circle at a speed, leptons. @param {number} step @param {number} turn */
const turnRadius = (step, turn) => Math.floor((step * 4074) / (100 * turn)); // step × 256 / (2π × turn)

/** Keep an aircraft's cell in step with its position, inside the map. @param {World} w @param {Unit} u */
function settle(w, u) {
  u.x = Math.max(0, Math.min(w.map.width * L - 1, u.x));
  u.y = Math.max(0, Math.min(w.map.height * L - 1, u.y));
  u.cx = Math.floor(u.x / L);
  u.cy = Math.floor(u.y / L);
}

/**
 * Is a point inside the circle this plane would fly if it turned toward it
 * at full rate? Then turning cannot reach it: the plane flies straight on
 * until it can (overflying, then looping back).
 * @param {Unit} u @param {number} tx @param {number} ty @param {number} R @param {number} side  +1 right, −1 left
 */
function insideTurn(u, tx, ty, R, side) {
  const c = stepAlong(u.facing + side * 64, R);
  const ex = tx - (u.x + c.dx);
  const ey = ty - (u.y + c.dy);
  return ex * ex + ey * ey < R * R;
}

/**
 * One tick of flight. Helicopters (and jump-jets) turn toward the destination
 * on the spot, then fly straight there and hover. Planes never stop: they
 * bank toward it at their turn rate while moving forward, and with no order
 * they circle where they are.
 * @param {World} w @param {Unit} u
 */
function flyUnit(w, u) {
  const def = defOf(u);
  if (u.next) u.next = null; // flight is free of the grid
  const plane = fliesLikePlane(def);
  let k = Math.round(def.speed * 1000);
  if (u.speedK) k = Math.floor((k * u.speedK) / 1000);
  const step = stepLeptons(k, 100);
  const turn = plane ? AIRCRAFT.planeTurnRate : def.turnRate;
  const o = u.order;
  if (!o) {
    if (plane) {
      // Loiter: a steady circle round where it is.
      u.facing = (u.facing + turn) & 255;
      const v = stepAlong(u.facing, step);
      u.x += v.dx;
      u.y += v.dy;
      settle(w, u);
    }
    return;
  }
  const tx = o.at ? o.at.x : o.dx * L + (L >> 1);
  const ty = o.at ? o.at.y : o.dy * L + (L >> 1);
  const dx = tx - u.x;
  const dy = ty - u.y;
  const dist = isqrt(dx * dx + dy * dy);
  if (plane ? dist <= Math.max(step, L >> 1) : dist <= step) {
    // Helicopters settle exactly on the point; planes pass through it and fly on.
    if (plane) {
      const v = stepAlong(u.facing, step);
      u.x += v.dx;
      u.y += v.dy;
    } else {
      u.x = tx;
      u.y = ty;
    }
    settle(w, u);
    finish(w, u);
    return;
  }
  const want = facingOf(dx, dy);
  const delta = facingDelta(u.facing, want);
  if (plane) {
    // Too close to turn onto the point (it lies inside the turning circle):
    // fly straight on until there is room for a full turn, then bank round.
    const R = turnRadius(step, turn);
    if (u.extend) { if (dist >= 2 * R + L) u.extend = false; }
    else if (insideTurn(u, tx, ty, R, delta >= 0 ? 1 : -1)) u.extend = true;
    if (!u.extend) u.facing = turnToward(u.facing, want, turn);
    const v = stepAlong(u.facing, step);
    u.x += v.dx;
    u.y += v.dy;
  } else {
    u.facing = turnToward(u.facing, want, turn);
    if (Math.abs(facingDelta(u.facing, want)) > AIRCRAFT.heliAlignBefore) return;
    u.x += Math.trunc((dx * step) / dist);
    u.y += Math.trunc((dy * step) / dist);
  }
  if (!def.turret) u.turret = u.facing;
  settle(w, u);
}

/**
 * Hovering aircraft (helicopters, jump-jets, the airship) never stack: two
 * closer than AIRCRAFT.hoverSpacing drift apart a little each tick (planes
 * keep flying their own loops). Same order every tick, so it is lockstep-safe.
 * @param {World} w
 */
function separateHovering(w) {
  const air = [];
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.inside || u.landed || !isAir(u) || fliesLikePlane(defOf(u))) continue;
    air.push(u);
  }
  const R = AIRCRAFT.hoverSpacing;
  for (let i = 0; i < air.length; i++) for (let j = i + 1; j < air.length; j++) {
    const a = air[i], b = air[j];
    let dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= R || Math.abs(dy) >= R) continue;
    let d = isqrt(dx * dx + dy * dy);
    if (d >= R) continue;
    if (d === 0) {
      // Exactly on top of each other: part along a direction set by their ids.
      const v = stepAlong(((a.id * 37 + b.id * 11) & 255), 64);
      dx = v.dx; dy = v.dy; d = isqrt(dx * dx + dy * dy) || 1;
    }
    const push = Math.min(AIRCRAFT.hoverPush, (R - d) >> 1) || 1;
    const px = Math.trunc((dx * push) / d), py = Math.trunc((dy * push) / d);
    nudge(w, a, -px, -py);
    nudge(w, b, px, py);
  }
}

/** Move a hovering aircraft, and the point it is flying to with it (so it settles there, not back on the other). @param {World} w @param {Unit} u @param {number} dx @param {number} dy */
function nudge(w, u, dx, dy) {
  u.x += dx;
  u.y += dy;
  settle(w, u);
  const o = u.order;
  if (o) {
    const at = o.at ?? { x: o.dx * L + (L >> 1), y: o.dy * L + (L >> 1) };
    o.at = { x: Math.max(0, Math.min(w.map.width * L - 1, at.x + dx)), y: Math.max(0, Math.min(w.map.height * L - 1, at.y + dy)) };
  }
}

/** @param {World} w */
export function movementSystem(w) {
  airSystem(w);
  w.nav.expire(w.tick);
  w.nav.calculate();
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.inside || u.landed) continue;
    if (isAir(u)) flyUnit(w, u);
    else stepUnit(w, u);
  }
  separateHovering(w);
  specialsSystem(w);
  transportSystem(w);
}
