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
/** Two friends nose to nose with no way round wait this long, then squeeze past each other. */
const SQUEEZE_TICKS = ticks(MOVEMENT.squeezePastSeconds);
/** A unit blocked by a friend on the move waits this long, then keeps right round him. */
const SIDESTEP_TICKS = ticks(MOVEMENT.sidestepAfterSeconds);
/** ...and does not dodge again sooner than this (no weaving). */
const SIDESTEP_AGAIN = ticks(MOVEMENT.sidestepAgainSeconds);
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
        if (blocker.order) {
          // On an errand of its own: one step aside, then on to its own destination.
          blocker.path = [c.x, c.y];
          blocker.pathReq = 0;
          blocker.retryAt = 0;
          blocker.retries = 0;
        } else setMove(w, blocker, c.x, c.y, { auto: true });
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

/**
 * Keep right: step into the free cell ahead-right (else to the right) of the
 * blocked move, then plan again from there — the route avoids cells other
 * friends hold, so it stays in the free lane. Ahead-left / left only when the
 * right is walled and the blocker is not coming straight at us (else both
 * would dodge into the same lane). Returns whether it stepped.
 * @param {World} w @param {Unit} u @param {number} nx @param {number} ny
 */
function sidestep(w, u, nx, ny) {
  const dx = Math.sign(nx - u.cx), dy = Math.sign(ny - u.cy);
  if (!dx && !dy) return false;
  // Arriving is not traffic, and dodging without getting any closer has a limit (two units must
  // never dance round each other); real progress since the last dodges earns a fresh allowance.
  const o = u.order;
  if (!o) return false;
  const left = Math.max(Math.abs(o.dx - u.cx), Math.abs(o.dy - u.cy));
  if (left <= 2) return false;
  if (o.dodgeFrom !== undefined && left <= o.dodgeFrom - 3) o.dodges = 0;
  if ((o.dodges ?? 0) >= MOVEMENT.sidestepMax) return false;
  if (!o.dodges) o.dodgeFrom = left;
  const rx = -dy, ry = dx; // right of the heading (y grows south)
  const sgn = (v) => Math.sign(v);
  const options = [[sgn(dx + rx), sgn(dy + ry)], [rx, ry], [sgn(dx - rx), sgn(dy - ry)], [-rx, -ry]];
  const loco = defOf(u).loco;
  for (const [ox, oy] of options) {
    if (!ox && !oy) continue;
    const cx = u.cx + ox, cy = u.cy + oy;
    if (cx === nx && cy === ny) continue;
    // No cutting a corner past a wall.
    if (ox && oy && (!w.nav.passable(loco, u.cx + ox, u.cy) || !w.nav.passable(loco, u.cx, u.cy + oy))) continue;
    if (!canEnter(w, u, cx, cy).ok) continue;
    u.path = [cx, cy];
    u.pathReq = 0;
    u.retryAt = 0;
    u.retries = 0; // a deliberate dodge, not a failed route: it does not count toward giving up
    u.sidestepAt = w.tick + SIDESTEP_AGAIN;
    o.dodges = (o.dodges ?? 0) + 1;
    return true;
  }
  return false;
}

/**
 * Last resort for a jam with no way round (a full narrow pass): a unit and
 * the friends filling the cell ahead — all stuck, at least one of them trying
 * to get past the other way — swap cells, each driving into the other's as it
 * is left: a brief squeeze, never a standstill. The unit must be alone in its
 * cell. Everyone keeps its own order.
 * @param {World} w @param {Unit} u @param {number} nx @param {number} ny
 */
function squeezePast(w, u, nx, ny) {
  if (u.next || u.squeeze || u.sinceCell < SQUEEZE_TICKS) return false;
  const ui = w.occ.index(u.cx, u.cy), bi = w.occ.index(nx, ny);
  if (w.occ.unitsIn(ui).length !== 1) return false;
  const B = w.occ.unitsIn(bi).map((id) => w.entities.get(id));
  if (!B.length) return false;
  for (const v of B) {
    if (!v || v.dead || v.next || v.squeeze || !v.order || !w.allied(v.owner, u.owner) || v.sinceCell < SQUEEZE_TICKS) return false;
  }
  // Only to let someone through the other way (never pushing a friend back along its own road).
  const oncoming = B.some((v) => (v.order.dx - nx) * (u.cx - nx) + (v.order.dy - ny) * (u.cy - ny) > 0);
  if (!oncoming) return false;
  const team = (/** @type {Unit} */ e) => w.players[e.owner].team;
  const hand = (/** @type {Unit} */ e, /** @type {number} */ i) => {
    if (isInfantry(e)) w.occ.takeInfantry(i, e.spot, e.id); else w.occ.takeVehicle(i, e.id);
    w.nav.unitLeave(team(e), i, isInfantry(e));
  };
  const from = { x: u.cx, y: u.cy };
  hand(u, ui);
  for (const v of B) hand(v, bi);
  const su = isInfantry(u) ? 0 : -1;
  occupy(w, u, nx, ny, su);
  u.next = { x: nx, y: ny, spot: su };
  for (const v of B) {
    const sv = isInfantry(v) ? v.spot : -1; // soldiers keep their (distinct) spots
    occupy(w, v, from.x, from.y, sv);
    v.next = { x: from.x, y: from.y, spot: sv };
  }
  for (const e of [u, ...B]) {
    e.squeeze = true;
    if (e.path.length >= 2 && e.path[0] === e.next.x && e.path[1] === e.next.y) e.path.splice(0, 2);
    e.waited = 0;
  }
  return true;
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
  // Traffic: a friend on the move (or stuck in the queue) is in the way — keep right and
  // pass him, the way two columns meeting in a pass sort themselves into two lanes.
  if (friendly && !isIdle(b) && u.waited >= SIDESTEP_TICKS && w.tick >= (u.sidestepAt ?? 0)) {
    if (sidestep(w, u, nx, ny)) { u.waited = 0; return; }
    // Jammed with no way round: squeeze past.
    if (squeezePast(w, u, nx, ny)) return;
  }
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
  // A friend is no wall: the route already costs extra through cells friends hold. Blocking
  // the cell for the whole team would wall off a crowded pass and strand everyone in it.
  if (!friendly) w.nav.tempBlock(team, w.occ.index(nx, ny), w.tick + BLOCK_TICKS);
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
      const r = canEnter(w, u, nx, ny, last && o.spot >= 0 ? o.spot : lane);
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
    u.squeeze = false;
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
  u.x += sx;
  u.y += sy;
  checkStuck(w, u);
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
