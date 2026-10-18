// @ts-check
/**
 * Aircraft (section 10), run in system 6 before units move. Every aircraft
 * is linked to one pad of its kind (Helipad for helicopters, Airfield for
 * planes); on it, it rearms 1 ammo per second and repairs 2% max HP per
 * second (charged like a Service Depot). Out of ammo, it flies home.
 * Helicopters hover; planes never stop: an attack flies passes over the
 * target, a move circles the spot for 30 s, then they return. A lost pad is
 * replaced by a free one; with none, helicopters land near the base and
 * planes circle the old pad for 60 s, then crash.
 */
import { AIRCRAFT, REPAIR, SIM } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { ticks } from '../core/fixed.js';
import { isActive, structureDef } from './entities/structures.js';
import { padRoleOf, padsOf, padTaken } from './pads.js';

export { padRoleOf };
import { setMove } from './systems/movement.js';
import { spend } from './formulas/economy.js';
import { spiral } from './nav.js';

/** @typedef {import('./world.js').World} World */

const L = SIM.leptonsPerCell;
const SECOND = ticks(1);
const CIRCLE_TICKS = ticks(AIRCRAFT.planeCircleSeconds);
const CRASH_TICKS = ticks(AIRCRAFT.orphanPlaneCrashSeconds);
/** Planes overfly their target by this many cells before turning for the next pass. */
const OVERFLY = 3;
/** Corners of the square a circling plane flies round its point. */
const ORBIT = [[2, 0], [0, 2], [-2, 0], [0, -2]];

const tagsOf = (/** @type {any} */ u) => UNITS[u.type].tags;
export const isAircraft = (/** @type {any} */ u) => u.kind === 'unit' && UNITS[u.type].loco === 'air' && !tagsOf(u).includes('support');
export const isHeli = (/** @type {any} */ u) => tagsOf(u).includes('heli');
export const isPlane = (/** @type {any} */ u) => tagsOf(u).includes('plane');
const padRole = (/** @type {any} */ u) => padRoleOf(u.type);

/** Cell an aircraft parks on. @param {any} pad */
export const padCell = (pad) => ({ x: pad.cx + (pad.w >> 1), y: pad.cy + (pad.h >> 1) });

/** A free working pad of the right kind for an aircraft. @param {World} w @param {any} u */
export function freePad(w, u) {
  return padsOf(w, u.owner, padRole(u)).find((e) => !padTaken(w, e)) ?? null;
}

/** Death hook: a destroyed aircraft lets go of its pad. @param {World} w @param {any} u */
export function aircraftDied(w, u) {
  const pad = u.pad ? w.entities.get(u.pad) : null;
  if (pad && pad.linked === u.id) pad.linked = 0;
}

/** Link an aircraft to a pad (and free its old one). @param {World} w @param {any} u @param {any} pad */
export function linkPad(w, u, pad) {
  const old = u.pad ? w.entities.get(u.pad) : null;
  if (old && old.linked === u.id) old.linked = 0;
  u.pad = pad ? pad.id : 0;
  if (pad) pad.linked = u.id;
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

/** A clear ground cell to set a helicopter down near a point. @param {World} w @param {number} x @param {number} y */
function landingCell(w, x, y) {
  for (const [cx, cy] of spiral(x, y, 3)) {
    if (!w.nav.passable('track', cx, cy) || w.occ.bld[cy * w.map.width + cx]) continue;
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

/** Keep a plane moving round a point. @param {World} w @param {any} u @param {{x: number, y: number}} c */
function orbit(w, u, c) {
  if (u.order || u.next) return;
  const k = (u.air.orbit = ((u.air.orbit ?? -1) + 1) % ORBIT.length);
  const x = Math.max(0, Math.min(w.map.width - 1, c.x + ORBIT[k][0]));
  const y = Math.max(0, Math.min(w.map.height - 1, c.y + ORBIT[k][1]));
  setMove(w, u, x, y, { auto: true });
}

/** A plane's attack run: fly through the target and beyond, then come round again. @param {World} w @param {any} u @param {{x: number, y: number}} t leptons */
function pass(w, u, t) {
  if (u.order || u.next) return;
  const dx = t.x - u.x;
  const dy = t.y - u.y;
  const d = Math.max(1, Math.abs(dx) + Math.abs(dy));
  const bx = Math.floor((t.x + Math.trunc((dx * OVERFLY * L) / d)) / L);
  const by = Math.floor((t.y + Math.trunc((dy * OVERFLY * L) / d)) / L);
  setMove(w, u, Math.max(0, Math.min(w.map.width - 1, bx)), Math.max(0, Math.min(w.map.height - 1, by)), { auto: true });
}

/** @param {World} w @param {any} u */
function stepAircraft(w, u) {
  u.air ??= { circle: null, orbit: -1, crashAt: 0, orphan: null };
  // Pad upkeep: relink when it is gone.
  let pad = u.pad ? w.entities.get(u.pad) : null;
  if (!pad || pad.dead || pad.owner !== u.owner || !isActive(pad)) {
    if (pad && !pad.dead) u.air.orphan = padCell(pad);
    pad = freePad(w, u);
    linkPad(w, u, pad);
    if (pad) { u.air.crashAt = 0; u.air.orphan = null; }
  }
  // Any order lifts it off.
  if (u.landed && ((u.task && u.task.type !== 'returnPad' && u.task.type !== 'land') || u.order)) u.landed = false;
  if (u.task?.type === 'land') {
    // Helicopters set down on clear ground within 3 cells (to load or unload passengers).
    const c = isHeli(u) ? landingCell(w, u.cx, u.cy) : null;
    if (!c) u.task = null;
    else if (u.cx === c.x && u.cy === c.y && !u.next) { u.landed = true; u.task = null; u.order = null; }
    else if (!u.order && !u.next) setMove(w, u, c.x, c.y, { auto: true });
    if (u.landed) return;
  }
  if (outOfAmmo(u) && u.task?.type !== 'returnPad' && !u.landed) returnToPad(w, u);

  if (u.task?.type === 'returnPad') {
    if (pad) {
      const c = padCell(pad);
      if (u.cx === c.x && u.cy === c.y && !u.next) { u.landed = true; u.task = null; u.order = null; }
      else if (!u.order && !u.next) setMove(w, u, c.x, c.y, { auto: true });
    } else if (isHeli(u)) {
      const b = nearBase(w, u);
      const c = landingCell(w, b.x, b.y);
      if (!c || (u.cx === c.x && u.cy === c.y && !u.next)) { u.landed = true; u.task = null; u.order = null; }
      else if (!u.order && !u.next) setMove(w, u, c.x, c.y, { auto: true });
    } else u.task = null; // a plane with no pad circles (below)
  }
  if (u.landed) {
    if (pad && u.cx === padCell(pad).x && u.cy === padCell(pad).y) service(w, u);
    return;
  }
  if (!isPlane(u)) return; // helicopters hover where they are

  // Planes never stop.
  const t = u.task;
  if (t && (t.type === 'attack' || t.type === 'forceFire')) {
    const e = t.target ? w.entities.get(t.target) : null;
    if (t.target && !e) { returnToPad(w, u); return; }
    pass(w, u, e ? { x: e.x, y: e.y } : { x: t.x * L + L / 2, y: t.y * L + L / 2 });
    return;
  }
  if (t && t.type === 'move' && !u.order && !u.next) {
    u.task = null;
    u.air.circle = { x: u.cx, y: u.cy, until: w.tick + CIRCLE_TICKS };
  }
  if (!pad) {
    if (!u.air.crashAt) u.air.crashAt = w.tick + CRASH_TICKS;
    if (w.tick >= u.air.crashAt) { w.damage.push({ victim: u.id, amount: u.maxHp, attacker: 0, owner: -1 }); return; }
    orbit(w, u, u.air.orphan ?? { x: u.cx, y: u.cy });
    return;
  }
  if (u.task?.type === 'returnPad') return;
  const c = u.air.circle;
  if (c && w.tick < c.until) { orbit(w, u, c); return; }
  if (!u.task) returnToPad(w, u);
}

/** Aircraft: part of system 6, before units move. @param {World} w */
export function airSystem(w) {
  for (const u of w.entities.all()) {
    if (u.dead || !isAircraft(u)) continue;
    stepAircraft(w, u);
  }
}
