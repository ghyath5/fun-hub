// @ts-check
/**
 * Aircraft pads (section 11): each aircraft is built on, and rearms at, one
 * parking slot of a pad — a Helipad has one slot (helicopters), an Airfield
 * has four (helicopters, planes and the Siege Airship) — so a player can own
 * as many aircraft as free slots. A slot is taken while a living aircraft of
 * the pad's owner names it (`u.pad`, `u.padSlot`); a lost aircraft frees it.
 * Shared by production, the build command, the build menu and flight.
 */
import { UNITS } from '../data/units.js';
import { SIM } from '../data/rules.js';
import { isActive, structureDef } from './entities/structures.js';

const L = SIM.leptonsPerCell;

/** The pad roles an aircraft type can park on. @param {string} type @returns {string[]} */
export function padRolesOf(type) {
  const d = UNITS[type];
  if (d.pad) return [d.pad];
  return d.tags.includes('heli') ? ['helipad', 'airfield'] : ['airfield'];
}

/** Parking spots of a pad, in cells from its footprint corner. @param {any} pad @returns {number[][]} */
export function spotsOf(pad) {
  const def = structureDef(pad.type);
  return def.padSpots ?? [[def.w / 2, def.h / 2]];
}

/** Cell an aircraft parks on in a slot. @param {any} pad @param {number} [slot] */
export function slotCell(pad, slot = 0) {
  const s = spotsOf(pad)[slot] ?? spotsOf(pad)[0];
  return { x: pad.cx + Math.floor(s[0]), y: pad.cy + Math.floor(s[1]) };
}

/** Exact parking point of a slot, leptons. @param {any} pad @param {number} [slot] */
export function slotPoint(pad, slot = 0) {
  const s = spotsOf(pad)[slot] ?? spotsOf(pad)[0];
  return { x: Math.round((pad.cx + s[0]) * L), y: Math.round((pad.cy + s[1]) * L) };
}

/** Working pads of the given roles a player owns, ascending id. @param {any} w @param {number} pid @param {string[] | string} roles */
export function padsOf(w, pid, roles) {
  const want = Array.isArray(roles) ? roles : [roles];
  return w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && !e.dead && isActive(e) && want.includes(structureDef(e.type).role));
}

/**
 * Who holds each slot of a pad (aircraft id, 0 = free). An aircraft that has
 * died, changed owner or moved to another pad no longer holds its slot.
 * @param {any} w @param {any} pad @returns {number[]}
 */
export function slotHolders(w, pad) {
  const out = spotsOf(pad).map(() => 0);
  for (const e of w.entities.all()) {
    if (e.dead || e.kind !== 'unit' || e.pad !== pad.id || e.owner !== pad.owner) continue;
    const k = e.padSlot ?? 0;
    if (k < out.length && !out[k]) out[k] = e.id;
  }
  return out;
}

/** First free slot of a pad not in `reserved` ("padId:slot" keys), or -1. @param {any} w @param {any} pad @param {Set<string>} [reserved] */
export function freeSlot(w, pad, reserved) {
  const holders = slotHolders(w, pad);
  return holders.findIndex((h, k) => !h && !reserved?.has(`${pad.id}:${k}`));
}

/** Is every slot of a pad taken? @param {any} w @param {any} pad */
export const padTaken = (w, pad) => freeSlot(w, pad) < 0;

/**
 * A free slot for an aircraft type: the preferred pad first, then any pad of
 * its roles in id order. @param {any} w @param {number} pid @param {string} type
 * @param {{ prefer?: any, reserved?: Set<string> }} [opts]
 * @returns {{ pad: any, slot: number } | null}
 */
export function findSlot(w, pid, type, opts = {}) {
  const pads = padsOf(w, pid, padRolesOf(type));
  if (opts.prefer && pads.includes(opts.prefer)) pads.unshift(opts.prefer);
  for (const pad of pads) {
    const slot = freeSlot(w, pad, opts.reserved);
    if (slot >= 0) return { pad, slot };
  }
  return null;
}

/** Slots already promised to aircraft in a player's queue. @param {any} w @param {number} pid */
export function reservedSlots(w, pid) {
  const set = new Set();
  for (const q of w.players[pid].lines.aircraft?.queue ?? []) if (q.pad) set.add(`${q.pad}:${q.slot ?? 0}`);
  return set;
}

/**
 * Can one more aircraft of this type be queued? It needs a free slot that no
 * queued aircraft has claimed, counting queued aircraft that have not
 * claimed one yet against the slots they could use.
 * @param {any} w @param {number} pid @param {string} type
 */
export function padAvailable(w, pid, type) {
  const roles = padRolesOf(type);
  let free = 0;
  for (const pad of padsOf(w, pid, roles)) free += slotHolders(w, pad).filter((h) => !h).length;
  const queue = w.players[pid].lines.aircraft?.queue ?? [];
  const waiting = queue.filter((/** @type {any} */ q) => padRolesOf(q.type).some((r) => roles.includes(r))).length;
  return free > waiting;
}
