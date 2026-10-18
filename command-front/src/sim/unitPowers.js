// @ts-check
/**
 * Abilities of the Red Alert 2 roster that no older unit has:
 *   - Mind control (Psi Commander): a direct hit turns an enemy unit to the
 *     Psi Commander's side; he holds up to MAX_CONTROLLED at once, and they all
 *     go back to their owners when he dies.
 *   - Kamikaze (Demolition Truck): firing destroys the shooter; units tagged
 *     'demolition' blow up with the Demolition Blast when they die, however
 *     they die.
 *   - Disguise (Mirage Tank): hidden from enemies while it stands still and
 *     has not fired for a moment, unless they come close (shroud.js detection).
 * All of it is deterministic sim state on the entities themselves.
 */
import { UNITS } from '../data/units.js';
import { SHROUD, SIM } from '../data/rules.js';
import { ticks } from '../core/fixed.js';
import { occupy, vacate } from './entities/units.js';
import { detonate } from './systems/projectiles.js';

/** @typedef {import('./world.js').World} World */

/** Most units one Psi Commander controls at a time. */
export const MAX_CONTROLLED = 3;
/** A Mirage Tank shows itself for this long after moving or firing. */
const DISGUISE_DELAY = ticks(2);

const tagsOf = (/** @type {any} */ u) => UNITS[u.type]?.tags ?? [];

/** Can a Psi Commander take this unit? Not aircraft, heroes, other psychics, robots or anyone carried. @param {any} t */
export function controllable(t) {
  if (!t || t.dead || t.kind !== 'unit' || t.inside || t.deploying) return false;
  const d = UNITS[t.type];
  if (d.loco === 'air' || d.limit > 0) return false;
  if (d.tags.some((g) => g === 'psi' || g === 'mindImmune' || g === 'support')) return false;
  return !(t.cargo?.length);
}

/** Living units this Psi Commander holds now. @param {World} w @param {any} psi */
export function heldBy(w, psi) {
  return (psi.psi ?? []).map((/** @type {number} */ id) => w.entities.get(id)).filter((/** @type {any} */ t) => t && !t.dead && t.ctrl?.by === psi.id);
}

/** May this shooter fire its mind-control weapon now? @param {World} w @param {any} u */
export const canControlMore = (w, u) => heldBy(w, u).length < MAX_CONTROLLED;

/**
 * Hand a unit to another player, as if it had always been theirs: its
 * occupancy and orders are reset, and nobody keeps shooting at a new friend.
 * @param {World} w @param {any} u @param {number} to
 */
export function changeOwner(w, u, to) {
  const from = u.owner;
  if (from === to) return;
  vacate(w, u, u.cx, u.cy, u.spot);
  if (u.next) vacate(w, u, u.next.x, u.next.y, u.next.spot);
  u.next = null;
  u.owner = to;
  occupy(w, u, u.cx, u.cy, u.spot);
  u.order = null;
  u.path = [];
  u.pathReq = 0;
  u.task = null;
  u.target = 0;
  u.fireCell = null;
  u.waypoints = [];
  u.chase = null;
  u.post = { x: u.cx, y: u.cy };
  u.lastAttacker = 0;
  if (u.harv) { u.harv.refinery = 0; u.harv.state = 'seekOre'; u.harv.timer = 0; }
  for (const e of w.entities.all()) {
    if (e.dead || e.target !== u.id || !w.allied(e.owner, to)) continue;
    e.target = 0;
    if (e.task?.target === u.id) e.task = null;
  }
  w.events.emit('unitConverted', w.tick, { id: u.id, type: u.type, from, to, x: u.x, y: u.y });
}

/** A mind-control beam lands on `target`. @param {World} w @param {any} psi @param {any} target */
export function mindControl(w, psi, target) {
  if (!psi || psi.dead || !controllable(target) || w.allied(target.owner, psi.owner)) return;
  if (!canControlMore(w, psi)) return;
  // Already held by another Psi Commander: it changes hands, its true owner stays the same.
  const original = target.ctrl ? target.ctrl.from : target.owner;
  const prev = target.ctrl ? w.entities.get(target.ctrl.by) : null;
  if (prev?.psi) prev.psi = prev.psi.filter((/** @type {number} */ id) => id !== target.id);
  target.ctrl = { by: psi.id, from: original };
  psi.psi = [...heldBy(w, psi).map((t) => t.id), target.id];
  psi.target = 0;
  if (psi.task?.type === 'attack') psi.task = null;
  changeOwner(w, target, psi.owner);
  if (target.owner === original) delete target.ctrl;
}

/** Death hook: released minds, and demolition charges going off. @param {World} w @param {any} u */
export function unitPowerDied(w, u) {
  if (u.psi?.length) {
    for (const t of heldBy(w, u)) {
      const home = t.ctrl.from;
      delete t.ctrl;
      if (w.players[home]?.alive !== false) changeOwner(w, t, home);
    }
    u.psi = [];
  }
  if (tagsOf(u).includes('demolition') && !u.inside) {
    detonate(w, { weapon: 'demoBlast', tx: u.x, ty: u.y, target: 0, direct: false, shooter: u.id, owner: u.owner });
  }
}

/** Weapon fired: a kamikaze unit is destroyed by its own attack. @param {World} w @param {any} u */
export function afterFiring(w, u) {
  if (u.kind !== 'unit') return;
  u.firedAt = w.tick;
  if (tagsOf(u).includes('kamikaze')) w.damage.push({ victim: u.id, amount: u.maxHp * 10, attacker: u.id, owner: -1 });
}

/**
 * Disguise detection for one unit (shroud system): visible to everyone while
 * it moves or just fired, otherwise only to enemy units within the camo reveal
 * radius. Returns the team bitmask that sees it.
 * @param {World} w @param {any} u
 */
export function disguiseMask(w, u) {
  const moving = !!(u.order || u.next);
  if (moving) u.stillSince = w.tick;
  const since = Math.max(u.stillSince ?? 0, u.firedAt ?? -1e9);
  if (moving || w.tick - since < DISGUISE_DELAY) return ~0;
  let mask = 0;
  const near = SHROUD.camoRevealRadius;
  for (const e of w.spatial.near(u.x, u.y, (near + 1) * SIM.leptonsPerCell)) {
    if (e.dead || e.kind !== 'unit' || e.inside || w.allied(e.owner, u.owner)) continue;
    if (Math.max(Math.abs(e.cx - u.cx), Math.abs(e.cy - u.cy)) <= near) mask |= 1 << w.players[e.owner].team;
  }
  return mask;
}

/** Is this a unit that can hide in plain sight? @param {any} u */
export const disguises = (u) => u.kind === 'unit' && tagsOf(u).includes('disguise');
