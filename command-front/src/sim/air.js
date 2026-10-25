// @ts-check
/**
 * Aircraft (section 10), run in system 6 before units move. Every aircraft
 * is linked to one parking slot of a pad (a Helipad holds one helicopter, an
 * Airfield four aircraft of any kind; see pads.js); there it rearms 1 ammo
 * per second and repairs 2% max HP per second (charged like a Service Depot). Out of ammo, it flies home.
 * Helicopters hover; planes never stop (movement.js flies them in arcs).
 * Like Red Alert 2's jets, an attack is a run at the target: the plane
 * fires as it lines up, overflies, loops round and comes again until its
 * ammo is spent, then flies home to rearm; if the target dies first it
 * strikes another enemy close by, or goes home. A move (or attack-move)
 * circles the spot for a while — hunting what comes near while it has
 * ammo — then returns. A lost pad is replaced by a free one; with none,
 * helicopters land near the base and planes circle the old pad for 60 s,
 * then crash.
 */
import { AIRCRAFT, REPAIR, SIM } from '../data/rules.js';
import { canAttack, autoTargetable, reachDist } from './targeting.js';
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { ticks } from '../core/fixed.js';
import { isActive, structureDef } from './entities/structures.js';
import { findSlot, reservedSlots, slotCell, slotPoint } from './pads.js';
import { setMove } from './systems/movement.js';
import { spend } from './formulas/economy.js';
import { spiral } from './nav.js';

/** @typedef {import('./world.js').World} World */

const L = SIM.leptonsPerCell;
const SECOND = ticks(1);
const CIRCLE_TICKS = ticks(AIRCRAFT.planeCircleSeconds);
const CRASH_TICKS = ticks(AIRCRAFT.orphanPlaneCrashSeconds);
/** How close (leptons, each axis) a plane must pass over its parking spot to land on it. */
const LAND_REACH = (L * 3) >> 2;

const tagsOf = (/** @type {any} */ u) => UNITS[u.type].tags;
/** Aircraft that use pads: not support planes, and not jump-jet infantry (they fly like any foot soldier walks). */
export const isAircraft = (/** @type {any} */ u) => u.kind === 'unit' && UNITS[u.type].loco === 'air' && !tagsOf(u).includes('support') && !tagsOf(u).includes('jumpjet');
export const isHeli = (/** @type {any} */ u) => tagsOf(u).includes('heli');
export const isPlane = (/** @type {any} */ u) => tagsOf(u).includes('plane');
/** Cell an aircraft parks on: its own slot of its pad. @param {any} pad @param {any} [u] */
export const padCell = (pad, u) => slotCell(pad, u?.pad === pad.id ? u.padSlot ?? 0 : 0);

/**
 * A free parking slot for an aircraft (its current pad first, so a
 * returnPad order to a pad with room keeps it there).
 * @param {World} w @param {any} u @param {any} [prefer]
 */
export function freePad(w, u, prefer) {
  return findSlot(w, u.owner, u.type, { prefer, reserved: reservedSlots(w, u.owner) });
}

/** Death hook: nothing to release — a slot is free once its aircraft is gone (pads.js). @param {World} _w @param {any} _u */
export function aircraftDied(_w, _u) {}

/** Link an aircraft to a pad slot (its old slot frees itself). @param {World} _w @param {any} u @param {any} pad @param {number} [slot] */
export function linkPad(_w, u, pad, slot = 0) {
  u.pad = pad ? pad.id : 0;
  u.padSlot = pad ? slot : 0;
}

/** Set an aircraft down on its slot's exact spot. @param {any} u @param {any} pad */
function park(u, pad) {
  const p = slotPoint(pad, u.padSlot ?? 0);
  u.x = p.x;
  u.y = p.y;
  u.landed = true;
  u.task = null;
  u.order = null;
}

/** Ammo-carrying weapons all empty? @param {any} u */
function outOfAmmo(u) {
  const ws = UNITS[u.type].weapons;
  if (!ws.some((id) => WEAPONS[id].ammo > 0)) return false;
  return ws.every((id, k) => WEAPONS[id].ammo === 0 || u.weapons[k].ammo <= 0);
}

/** Full ammo? @param {any} u */
const fullAmmo = (u) => UNITS[u.type].weapons.every((id, k) => u.weapons[k].ammo >= WEAPONS[id].ammo);

/** Send an aircraft home. @param {World} w @param {any} u */
export function returnToPad(w, u) {
  u.task = { type: 'returnPad' };
  u.target = 0;
  u.fireCell = null;
  u.air = { ...(u.air ?? {}), circle: null };
}

/** On its pad: rearm and repair once a second. @param {World} w @param {any} u */
function service(w, u) {
  if ((w.tick + u.id) % SECOND !== 0) return;
  const ws = UNITS[u.type].weapons;
  ws.forEach((id, k) => { if (u.weapons[k].ammo < WEAPONS[id].ammo) u.weapons[k].ammo++; });
  if (u.hp >= u.maxHp) return;
  const p = w.players[u.owner];
  const milli = Math.round(UNITS[u.type].cost * REPAIR.depotCostFractionPerStep * 1000);
  const owed = Math.floor((p.spendMilli + milli) / 1000);
  const paid = spend({ cash: p.cash, stored: p.stored }, owed);
  if (!paid) return;
  p.cash = paid.cash;
  p.stored = paid.stored;
  p.spendMilli = p.spendMilli + milli - owed * 1000;
  u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * REPAIR.padHpFractionPerSecond)));
}

/**
 * A clear ground cell to set a helicopter down near a point: no building,
 * no unit on it, and no other aircraft landed there or on its way down to it
 * (aircraft hold no cells, so they would otherwise all land in one place).
 * @param {World} w @param {any} u @param {number} x @param {number} y
 */
function landingCell(w, u, x, y) {
  const taken = new Set();
  for (const e of w.entities.all()) {
    if (e === u || e.dead || e.kind !== 'unit' || e.inside || UNITS[e.type].loco !== 'air') continue;
    if (e.landed) taken.add(e.cy * w.map.width + e.cx);
    else if (e.order && (e.task?.type === 'land' || e.task?.type === 'returnPad')) taken.add(e.order.dy * w.map.width + e.order.dx);
  }
  for (const [cx, cy] of spiral(x, y, 3)) {
    const i = cy * w.map.width + cx;
    if (!w.nav.passable('track', cx, cy) || w.occ.bld[i] || !w.occ.empty(i) || taken.has(i)) continue;
    return { x: cx, y: cy };
  }
  return null;
}

/** Nearest own structure (the "base") to a point, for helicopters with no pad. @param {World} w @param {any} u */
function nearBase(w, u) {
  let best = null;
  let bestD = Infinity;
  for (const e of w.entities.all()) {
    if (e.kind !== 'structure' || e.owner !== u.owner || e.dead) continue;
    const d = (e.cx - u.cx) ** 2 + (e.cy - u.cy) ** 2;
    if (d < bestD) { bestD = d; best = { x: e.cx, y: e.cy + e.h }; }
  }
  return best ?? { x: u.cx, y: u.cy };
}

/**
 * Point an aircraft at an exact spot (leptons), retuning its one order as the
 * spot moves — no path search, and never "already there": a plane over its
 * target keeps the order and loops back.
 * @param {World} w @param {any} u @param {number} x @param {number} y
 */
function steer(w, u, x, y) {
  const dx = Math.max(0, Math.min(w.map.width - 1, Math.floor(x / L)));
  const dy = Math.max(0, Math.min(w.map.height - 1, Math.floor(y / L)));
  const at = { x, y };
  if (u.order) { u.order.dx = dx; u.order.dy = dy; u.order.at = at; return; }
  u.order = { type: 'move', dx, dy, spot: -1, attackMove: false, speedCap: 0, auto: true, at };
  u.path = [];
  u.pathReq = 0;
}

/** Has any ammo left? @param {any} u */
const hasAmmo = (u) => !outOfAmmo(u);

/**
 * The nearest enemy within `cells` of a point that this plane can hit and
 * its side can see, or null.
 * @param {World} w @param {any} u @param {{x: number, y: number}} at @param {number} cells
 */
function enemyNear(w, u, at, cells) {
  let best = null;
  let bestD = Infinity;
  for (const e of w.spatial.near(at.x, at.y, (cells + 1) * L)) {
    if (e.dead || e.inside || e.owner < 0 || w.allied(e.owner, u.owner) || !canAttack(u, e)) continue;
    if (!autoTargetable(e, u, (o) => w.visibleTo(u.owner, o))) continue;
    const d = reachDist({ x: at.x, y: at.y }, e);
    if (d > cells * L) continue;
    if (d < bestD || (d === bestD && best && e.id < best.id)) { bestD = d; best = e; }
  }
  return best;
}

/** Start an attack run on an entity (the plane's own choice). @param {any} u @param {any} e */
function strike(u, e) {
  u.task = { type: 'attack', target: e.id, auto: true };
  u.target = e.id;
  u.air.last = { x: e.x, y: e.y };
}

/** A plane's attack run, one tick. @param {World} w @param {any} u */
function attackRun(w, u) {
  const t = u.task;
  let e = t.target ? w.entities.get(t.target) : null;
  if (e && (e.dead || e.inside)) e = null;
  if (t.target && !e) {
    // Target gone: another enemy close to where it was, while there is ammo; else home.
    const next = u.air.last && hasAmmo(u) ? enemyNear(w, u, u.air.last, AIRCRAFT.planeRetargetCells) : null;
    if (!next) { returnToPad(w, u); return; }
    strike(u, next);
    e = next;
  }
  if (e) u.air.last = { x: e.x, y: e.y };
  const p = e ? { x: e.x, y: e.y } : { x: t.x * L + (L >> 1), y: t.y * L + (L >> 1) };
  steer(w, u, p.x, p.y);
}

/** @param {World} w @param {any} u */
function stepAircraft(w, u) {
  u.air ??= { circle: null, crashAt: 0, orphan: null, last: null };
  // Pad upkeep: relink when it is gone.
  let pad = u.pad ? w.entities.get(u.pad) : null;
  if (!pad || pad.dead || pad.owner !== u.owner || !isActive(pad)) {
    if (pad && !pad.dead) u.air.orphan = padCell(pad, u);
    const got = freePad(w, u);
    pad = got?.pad ?? null;
    linkPad(w, u, pad, got?.slot ?? 0);
    if (pad) { u.air.crashAt = 0; u.air.orphan = null; }
  }
  // Any order lifts it off.
  if (u.landed && ((u.task && u.task.type !== 'returnPad' && u.task.type !== 'land') || u.order)) u.landed = false;
  if (u.task?.type === 'land') {
    // Helicopters set down on clear ground within 3 cells (to load or unload passengers).
    const c = isHeli(u) ? landingCell(w, u, u.cx, u.cy) : null;
    if (!c) u.task = null;
    else if (u.cx === c.x && u.cy === c.y && !u.next) { u.landed = true; u.task = null; u.order = null; }
    else if (!u.order && !u.next) setMove(w, u, c.x, c.y, { auto: true });
    if (u.landed) return;
  }
  if (outOfAmmo(u) && u.task?.type !== 'returnPad' && !u.landed) returnToPad(w, u);

  if (u.task?.type === 'returnPad') {
    if (pad) {
      const c = padCell(pad, u);
      const p = slotPoint(pad, u.padSlot ?? 0);
      if (isPlane(u)) {
        // A plane touches down once it is over its spot (it cannot stop to hover onto it).
        if (Math.abs(u.x - p.x) <= LAND_REACH && Math.abs(u.y - p.y) <= LAND_REACH) park(u, pad);
        else steer(w, u, p.x, p.y);
      } else if (u.cx === c.x && u.cy === c.y && !u.next) park(u, pad);
      else if (!u.order && !u.next) setMove(w, u, c.x, c.y, { auto: true });
    } else if (isHeli(u)) {
      const b = nearBase(w, u);
      const c = landingCell(w, u, b.x, b.y);
      if (!c || (u.cx === c.x && u.cy === c.y && !u.next)) { u.landed = true; u.task = null; u.order = null; }
      else if (!u.order && !u.next) setMove(w, u, c.x, c.y, { auto: true });
    } else u.task = null; // a plane with no pad circles (below)
  }
  if (u.landed) {
    if (pad && u.x === slotPoint(pad, u.padSlot ?? 0).x && u.y === slotPoint(pad, u.padSlot ?? 0).y) service(w, u);
    else if (pad && u.cx === padCell(pad, u).x && u.cy === padCell(pad, u).y) service(w, u);
    return;
  }
  if (!isPlane(u)) return; // helicopters hover where they are

  // Planes never stop.
  const t = u.task;
  if (t && (t.type === 'attack' || t.type === 'forceFire')) { attackRun(w, u); return; }
  if (!pad) {
    if (!u.air.crashAt) u.air.crashAt = w.tick + CRASH_TICKS;
    if (w.tick >= u.air.crashAt) { w.damage.push({ victim: u.id, amount: u.maxHp, attacker: 0, owner: -1 }); return; }
    const o = u.air.orphan ?? { x: u.cx, y: u.cy };
    if (!u.order) steer(w, u, o.x * L + (L >> 1), o.y * L + (L >> 1));
    return;
  }
  if (t?.type === 'returnPad') return;
  // Sent somewhere: fly there, then circle a while (flight circles a plane with no order).
  if (t && (t.type === 'move' || t.type === 'attackMove' || t.type === 'guardArea') && !u.order) {
    u.task = null;
    u.air.circle = { x: u.cx, y: u.cy, until: w.tick + CIRCLE_TICKS };
  }
  const c = u.air.circle;
  const hunting = (t && (t.type === 'attackMove' || t.type === 'guardArea')) || (c && w.tick < c.until);
  if (hunting && hasAmmo(u) && (w.tick + u.id) % 4 === 0) {
    const e = enemyNear(w, u, { x: u.x, y: u.y }, UNITS[u.type].sight + AIRCRAFT.planeHuntCells);
    if (e) { u.air.circle = null; strike(u, e); return; }
  }
  if (c && w.tick < c.until) return;
  if (!u.task) returnToPad(w, u);
}

/** Aircraft: part of system 6, before units move. @param {World} w */
export function airSystem(w) {
  for (const u of w.entities.all()) {
    if (u.dead || !isAircraft(u)) continue;
    stepAircraft(w, u);
  }
}
