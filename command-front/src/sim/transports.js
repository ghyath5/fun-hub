// @ts-check
/**
 * Transports (section 10): APC (5 infantry, loads and unloads anywhere),
 * Transport Heli (5 infantry, only while landed) and Naval Transport (5
 * slots — infantry 1, vehicle 1, Titan / Harvester / MCV 2 — loading from
 * the shore). Passengers walk to a transport that stays put and give up
 * after 10 s if it keeps moving away; unloading puts one passenger every
 * 0.3 s on a free adjacent cell. Passengers keep their HP, cannot fire and
 * count for victory. Part of system 6.
 */
import { TRANSPORT } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { ticks, chebyshev } from '../core/fixed.js';
import { canEnter, occupy, vacate, spotPos } from './entities/units.js';
import { setMove } from './systems/movement.js';
import { spiral } from './nav.js';

/** @typedef {import('./world.js').World} World */

const GIVE_UP_TICKS = ticks(TRANSPORT.loadGiveUpSeconds);
const UNLOAD_EVERY = Math.max(1, ticks(TRANSPORT.unloadSecondsEach));

const tags = (/** @type {any} */ u) => UNITS[u.type].tags;
export const isTransport = (/** @type {any} */ u) => u.kind === 'unit' && tags(u).includes('transport');
const isNaval = (/** @type {any} */ t) => UNITS[t.type].loco === 'float';
const isHeli = (/** @type {any} */ t) => UNITS[t.type].loco === 'air';

/** Slots a passenger takes in this transport, or 0 if it cannot ride. @param {any} t @param {any} u */
export function slotsFor(t, u) {
  const loco = UNITS[u.type].loco;
  if (!isTransport(t) || u.id === t.id || loco === 'air' || loco === 'float') return 0;
  if (!isNaval(t)) return loco === 'foot' ? 1 : 0;
  return loco === 'foot' ? 1 : UNITS[u.type].slots >= 2 ? TRANSPORT.bigSlots : 1;
}

/** Slots in use. @param {World} w @param {any} t */
export function usedSlots(w, t) {
  let n = 0;
  for (const id of t.cargo ?? []) {
    const p = w.entities.get(id);
    if (p) n += slotsFor(t, p);
  }
  return n;
}

/** Can this passenger board now (transport in the right state, room left)? @param {World} w @param {any} t @param {any} u */
export function canBoard(w, t, u) {
  const need = slotsFor(t, u);
  if (!need || t.dead || t.owner !== u.owner) return false;
  if (isHeli(t) && !t.landed) return false;
  return usedSlots(w, t) + need <= UNITS[t.type].capacity;
}

/** Board: the passenger leaves the map and rides inside. @param {World} w @param {any} t @param {any} u */
function board(w, t, u) {
  vacate(w, u, u.cx, u.cy, u.spot);
  u.inside = t.id;
  u.task = null;
  u.target = 0;
  u.order = null;
  u.path = [];
  u.spot = -1;
  t.cargo = [...(t.cargo ?? []), u.id];
  w.events.emit('boarded', w.tick, { id: u.id, transport: t.id, owner: u.owner });
}

/** A free cell next to the transport for this passenger (land cells for ships). @param {World} w @param {any} t @param {any} u */
function exitCell(w, t, u) {
  for (const [x, y] of spiral(t.cx, t.cy, 2)) {
    if (x === t.cx && y === t.cy && !isHeli(t)) continue;
    if (chebyshev(x, y, t.cx, t.cy) > (isNaval(t) ? 1 : 2)) continue;
    const r = canEnter(w, u, x, y);
    if (r.ok) return { x, y, spot: r.spot };
  }
  return null;
}

/** Put one passenger back on the map. Returns false when nowhere is free. @param {World} w @param {any} t @param {any} u */
export function disembark(w, t, u) {
  const at = exitCell(w, t, u);
  if (!at) return false;
  const pos = spotPos(at.x, at.y, at.spot);
  u.inside = 0;
  u.x = pos.x; u.y = pos.y; u.px = pos.x; u.py = pos.y;
  u.cx = at.x; u.cy = at.y; u.spot = at.spot;
  u.post = { x: at.x, y: at.y };
  occupy(w, u, at.x, at.y, at.spot);
  t.cargo = t.cargo.filter((/** @type {number} */ id) => id !== u.id);
  w.events.emit('disembarked', w.tick, { id: u.id, transport: t.id, owner: u.owner });
  return true;
}

/**
 * Transport died (a death hook): APCs and landed helicopters let everyone
 * out at half their max HP lost; a helicopter in flight or a ship takes
 * everyone down with it.
 * @param {World} w @param {any} t @param {(w: World, u: any, killer: number) => void} kill
 */
export function transportDied(w, t, kill) {
  if (!t.cargo?.length) return;
  const survive = !isNaval(t) && (!isHeli(t) || t.landed);
  for (const id of [...t.cargo]) {
    const u = w.entities.get(id);
    if (!u) continue;
    if (!survive || !disembark(w, t, u)) {
      // Still inside (no map cell to clear): goes down with the transport.
      t.cargo = t.cargo.filter((/** @type {number} */ c) => c !== id);
      u.hp = 0;
      kill(w, u, 0);
      continue;
    }
    u.hp -= Math.floor(u.maxHp * TRANSPORT.ejectDamageFraction);
    if (u.hp <= 0) { u.hp = 0; kill(w, u, 0); }
  }
}

/** Passengers walking to their transport. @param {World} w */
function loading(w) {
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.task?.type !== 'load' || u.inside) continue;
    const t = w.entities.get(u.task.target);
    if (!t || t.dead || !slotsFor(t, u) || w.tick > u.task.giveUpAt) { u.task = null; continue; }
    if (usedSlots(w, t) + slotsFor(t, u) > UNITS[t.type].capacity) { u.task = null; continue; } // full: idle beside it
    // A hovering helicopter sets down for passengers walking to it.
    if (isHeli(t) && !t.landed && !t.task && !t.order && !t.next) t.task = { type: 'land' };
    const near = chebyshev(u.cx, u.cy, t.cx, t.cy) <= 1;
    if (near && !u.next && canBoard(w, t, u)) { board(w, t, u); continue; }
    const moved = !u.task.at || chebyshev(u.task.at.x, u.task.at.y, t.cx, t.cy) >= 2;
    if (!near && (moved || (!u.order && !u.next && !u.pathReq))) {
      u.task.at = { x: t.cx, y: t.cy };
      setMove(w, u, t.cx, t.cy);
    }
  }
}

/** Transports letting passengers out, one every 0.3 s. @param {World} w */
function unloading(w) {
  for (const t of w.entities.all()) {
    if (t.dead || !t.unloading) continue;
    if (!t.cargo?.length) { t.unloading = false; continue; }
    if (isHeli(t) && !t.landed) continue; // the air system lands it first
    if (t.next) continue;
    if ((w.tick - (t.unloadAt ?? 0)) < UNLOAD_EVERY) continue;
    const u = w.entities.get(t.cargo[0]);
    if (!u) { t.cargo.shift(); continue; }
    if (disembark(w, t, u)) t.unloadAt = w.tick;
  }
}

/** Passengers ride along: keep their position on the transport. @param {World} w */
function carry(w) {
  for (const t of w.entities.all()) {
    if (t.dead || !t.cargo?.length) continue;
    for (const id of t.cargo) {
      const u = w.entities.get(id);
      if (!u) continue;
      u.x = t.x; u.y = t.y; u.px = t.x; u.py = t.y;
      u.cx = t.cx; u.cy = t.cy;
    }
  }
}

/** Naval transports sent onto land unload when they reach the shore. @param {World} w */
function beaching(w) {
  for (const t of w.entities.all()) {
    if (t.dead || t.task?.type !== 'beach') continue;
    if (t.order || t.next || t.pathReq) continue;
    t.task = null;
    if (t.cargo?.length) t.unloading = true;
  }
}

/** Transports: part of system 6, after units moved. @param {World} w */
export function transportSystem(w) {
  loading(w);
  beaching(w);
  unloading(w);
  carry(w);
}

