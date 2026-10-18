// @ts-check
/**
 * Aircraft pads (section 11): each aircraft is built on, and rearms at, one
 * pad of its kind — a Helipad for helicopters, an Airfield for planes and the
 * Siege Airship — so a player can own as many aircraft of a kind as pads.
 * Shared by production, the build command, the build menu and flight.
 */
import { UNITS } from '../data/units.js';
import { isActive, structureDef } from './entities/structures.js';

/** The pad role an aircraft type is built on and rearms at. @param {string} type */
export const padRoleOf = (type) => UNITS[type].pad ?? (UNITS[type].tags.includes('heli') ? 'helipad' : 'airfield');

/** Working pads of one kind a player owns. @param {any} w @param {number} pid @param {string} role */
export const padsOf = (w, pid, role) => w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && !e.dead && isActive(e) && structureDef(e.type).role === role);

/**
 * Is a pad home to a living aircraft? A link to an aircraft that has since
 * been destroyed (or moved to another pad) does not count, so a lost
 * aircraft always frees its pad for a replacement.
 * @param {any} w @param {any} pad
 */
export function padTaken(w, pad) {
  const other = pad.linked ? w.entities.get(pad.linked) : null;
  return !!other && !other.dead && other.pad === pad.id;
}

/**
 * Can one more aircraft of this type be queued? Free pads of its kind must
 * outnumber the aircraft of that kind already queued.
 * @param {any} w @param {number} pid @param {string} type
 */
export function padAvailable(w, pid, type) {
  const role = padRoleOf(type);
  const free = padsOf(w, pid, role).filter((e) => !padTaken(w, e)).length;
  const queued = (w.players[pid].lines.aircraft?.queue ?? []).filter((/** @type {any} */ q) => padRoleOf(q.type) === role).length;
  return free > queued;
}
