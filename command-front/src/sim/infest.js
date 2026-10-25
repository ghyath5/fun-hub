// @ts-check
/**
 * Terror Drones inside vehicles (Red Alert 2). A drone's leap that lands on
 * an enemy tracked or wheeled vehicle takes it inside: off the map, where
 * nothing can shoot it, it shreds the vehicle from within (DRONE.chewDamage
 * every DRONE.chewSeconds) while the vehicle shakes, until the vehicle dies
 * and takes the drone with it. A Service Depot cuts the drone out; a vehicle
 * that turns friendly (mind control) lets it climb back out. One drone per
 * vehicle. The chewing runs inside system 6; damage lands in system 9.
 */
import { DRONE } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { ticks } from '../core/fixed.js';
import { canEnter, occupy, vacate, spotPos } from './entities/units.js';
import { infests } from './targeting.js';
import { spiral } from './nav.js';

/** @typedef {import('./world.js').World} World */

const CHEW_EVERY = Math.max(1, ticks(DRONE.chewSeconds));
/** Vehicles a drone can get into. */
const HOSTS = new Set(['track', 'wheel']);

/** Can this drone get inside that vehicle now? @param {World} w @param {any} drone @param {any} host */
export function canInfest(w, drone, host) {
  if (!drone || drone.dead || drone.inside || drone.kind !== 'unit' || !infests(drone)) return false;
  if (!host || host.dead || host.inside || host.kind !== 'unit' || host.infested) return false;
  return HOSTS.has(UNITS[host.type].loco) && !infests(host) && !w.allied(host.owner, drone.owner);
}

/** The drone leaves the map and rides inside its victim. @param {World} w @param {any} drone @param {any} host */
export function infest(w, drone, host) {
  vacate(w, drone, drone.cx, drone.cy, drone.spot);
  if (drone.next) vacate(w, drone, drone.next.x, drone.next.y, drone.next.spot);
  Object.assign(drone, { next: null, order: null, pathReq: 0, path: [], task: null, target: 0, chase: null, fireCell: null, waypoints: [], spot: -1 });
  drone.inside = host.id;
  ride(drone, host);
  host.infested = drone.id;
  host.chewAt = w.tick + CHEW_EVERY;
  w.events.emit('infested', w.tick, { drone: drone.id, host: host.id, owner: drone.owner, victim: host.owner });
}

/** Keep the drone where its host is. @param {any} drone @param {any} host */
function ride(drone, host) {
  drone.x = host.x; drone.y = host.y; drone.px = host.x; drone.py = host.y;
  drone.cx = host.cx; drone.cy = host.cy;
}

/** The drone climbs out onto a free cell next to its host; false when there is none. @param {World} w @param {any} drone @param {any} host */
function climbOut(w, drone, host) {
  for (const [x, y] of spiral(host.cx, host.cy, 2)) {
    if (x === host.cx && y === host.cy) continue;
    const r = canEnter(w, drone, x, y);
    if (!r.ok) continue;
    const pos = spotPos(x, y, r.spot);
    drone.inside = 0;
    Object.assign(drone, { x: pos.x, y: pos.y, px: pos.x, py: pos.y, cx: x, cy: y, spot: r.spot, post: { x, y } });
    occupy(w, drone, x, y, r.spot);
    host.infested = 0;
    w.events.emit('droneOut', w.tick, { drone: drone.id, host: host.id });
    return true;
  }
  return false;
}

/**
 * Take the drone out of its host: a Service Depot's work (the drone is destroyed).
 * @param {World} w @param {any} host @param {number} by  who gets the kill
 * @param {(w: World, u: any, killer: number) => void} kill
 */
export function cutOut(w, host, by, kill) {
  const drone = host.infested ? w.entities.get(host.infested) : null;
  host.infested = 0;
  if (!drone || drone.dead) return false;
  drone.hp = 0;
  kill(w, drone, by);
  w.events.emit('droneCutOut', w.tick, { host: host.id, owner: host.owner });
  return true;
}

/**
 * A death hook: a vehicle that dies takes its drone with it; a drone that dies
 * frees its host's slot.
 * @param {World} w @param {any} u @param {(w: World, u: any, killer: number) => void} kill
 */
export function infestDied(w, u, kill) {
  if (u.infested) {
    const drone = w.entities.get(u.infested);
    u.infested = 0;
    if (drone && !drone.dead && drone.inside === u.id) { drone.hp = 0; kill(w, drone, 0); }
  }
  if (u.inside) {
    const host = w.entities.get(u.inside);
    if (host?.infested === u.id) host.infested = 0;
  }
}

/** Drones at work inside their hosts. @param {World} w */
export function infestSystem(w) {
  for (const host of w.entities.all()) {
    if (host.dead || !host.infested) continue;
    const drone = w.entities.get(host.infested);
    if (!drone || drone.dead || drone.inside !== host.id) { host.infested = 0; continue; }
    ride(drone, host);
    // Turned friendly (taken over by the drone's side): the drone climbs back out, or waits inside, harmless.
    if (w.allied(host.owner, drone.owner)) { climbOut(w, drone, host); continue; }
    if (w.tick < host.chewAt) continue;
    host.chewAt = w.tick + CHEW_EVERY;
    w.damage.push({ victim: host.id, amount: DRONE.chewDamage, attacker: drone.id, owner: drone.owner });
  }
}
