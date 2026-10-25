// @ts-check
/**
 * Context orders (section 15): what tapping an object means for the units
 * selected. Each rule names who can do it, on what, and the command it
 * becomes; only units that can do it receive the order. Pure.
 */
import { UNITS } from '../data/units.js';
import { structureDef } from '../sim/entities/structures.js';
import { enterEffect, canC4 } from '../sim/specials.js';
import { slotsFor, canBoard } from '../sim/transports.js';
import { isAircraft, freePad } from '../sim/air.js';

/**
 * @typedef {object} ContextRule
 * @property {string} command
 * @property {(u: any) => boolean} who                   Units able to do it
 * @property {(w: any, u: any, t: any) => boolean} on   Valid target for that unit
 */

const isVehicle = (/** @type {any} */ u) => ['wheel', 'track'].includes(UNITS[u.type].loco);
const own = (/** @type {any} */ u, /** @type {any} */ t) => t.owner === u.owner;
const role = (/** @type {any} */ t) => (t.kind === 'structure' ? structureDef(t.type).role : '');

/** Rules in priority order: the first rule any selected unit satisfies decides the order. */
export const CONTEXT_RULES = /** @type {ContextRule[]} */ ([
  { command: 'unload', who: (u) => !!u.harv, on: (w, u, t) => own(u, t) && role(t) === 'refinery' && t.buildUp === 0 },
  { command: 'depot', who: isVehicle, on: (w, u, t) => own(u, t) && t.type === 'serviceDepot' && u.hp < u.maxHp && t.buildUp === 0 },
  // Specialists: Engineers repair, capture or sabotage; Spies infiltrate; Thieves steal; Commandos plant C4.
  { command: 'enter', who: (u) => UNITS[u.type].tags.some((g) => g === 'engineer' || g === 'spy' || g === 'thief'), on: (w, u, t) => !!enterEffect(w, u, t) },
  { command: 'c4', who: (u) => UNITS[u.type].tags.includes('c4'), on: (w, u, t) => canC4(w, u, t) },
  // Passengers tap their own transport.
  { command: 'load', who: (u) => UNITS[u.type].loco !== 'air', on: (w, u, t) => own(u, t) && t.kind === 'unit' && slotsFor(t, u) > 0 && (canBoard(w, t, u) || UNITS[t.type].loco === 'air') },
  // Aircraft tap their own pad to go home.
  { command: 'returnPad', who: isAircraft, on: (w, u, t) => own(u, t) && t.kind === 'structure' && ['helipad', 'airfield'].includes(role(t)) && (t.id === u.pad || freePad(w, u, t)?.pad.id === t.id) },
]);

/** Register more rules (specialists, transports and aircraft add theirs). @param {ContextRule[]} rules */
export function addContextRules(rules) {
  for (const r of rules) if (!CONTEXT_RULES.includes(r)) CONTEXT_RULES.push(r);
}

/**
 * The order a tap on `target` gives the selected `units`, or null.
 * @param {any} w @param {any[]} units @param {any} target
 * @returns {{ type: string, ids: number[], target: { id: number } } | null}
 */
export function contextOrder(w, units, target) {
  if (!target || target.dead) return null;
  for (const rule of CONTEXT_RULES) {
    const ids = units.filter((u) => u.id !== target.id && rule.who(u) && rule.on(w, u, target)).map((u) => u.id);
    if (ids.length) return { type: rule.command, ids, target: { id: target.id } };
  }
  return null;
}
