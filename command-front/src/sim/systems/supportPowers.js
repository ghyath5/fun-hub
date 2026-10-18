// @ts-check
/**
 * Support powers (system 13, section 11). Each charges while its granting
 * building stands and its owner has full power; low power pauses the charge,
 * losing every granting building resets it. One charge at most; a ready
 * charge waits until used. Firing is a 'power' command validated here.
 * Spy Plane and Paradrop fly a Support Plane in from the nearest map edge,
 * which anti-air can shoot down on the way.
 */
import { SUPPORT_POWERS, SIM } from '../../data/rules.js';
import { UNITS } from '../../data/units.js';
import { ticks, isqrt } from '../../core/fixed.js';
import { isActive, structureDef } from '../entities/structures.js';
import { spawnUnit, canEnter, occupy, vacate, spotPos } from '../entities/units.js';
import { setMove } from './movement.js';
import { revealAll, revealCircle } from './shroud.js';
import { spiral } from '../nav.js';

/** @typedef {import('../world.js').World} World */
/** @typedef {keyof typeof SUPPORT_POWERS} PowerId */
/** @typedef {{ charge: number, ready: boolean, used: boolean }} PowerState */

const L = SIM.leptonsPerCell;
export const POWER_IDS = /** @type {PowerId[]} */ (Object.keys(SUPPORT_POWERS));
export const chargeTicks = (/** @type {PowerId} */ id) => ticks(SUPPORT_POWERS[id].chargeSeconds);

/** A player's state for a power (created on first use). @param {any} p @param {PowerId} id @returns {PowerState} */
export function powerState(p, id) {
  return (p.powers[id] ??= { charge: 0, ready: false, used: false });
}

/** Does the player own a working building granting this power (of their own faction's powers)? @param {World} w @param {number} pid @param {PowerId} id */
export function grants(w, pid, id) {
  const p = w.players[pid];
  if (SUPPORT_POWERS[id].faction !== p.faction) return false;
  for (const e of w.entities.all()) {
    if (e.kind === 'structure' && e.owner === pid && isActive(e) && structureDef(e.type).powers?.includes(id)) return true;
  }
  return false;
}

/** System 13: charge timers. @param {World} w */
export function supportPowerSystem(w) {
  for (const p of w.players) {
    if (!p.alive) continue;
    for (const id of POWER_IDS) {
      const has = grants(w, p.id, id);
      if (!has) {
        if (p.powers[id]) { p.powers[id].charge = 0; p.powers[id].ready = false; }
        continue;
      }
      const st = powerState(p, id);
      if (st.ready || (st.used && SUPPORT_POWERS[id].oneUse)) continue;
      if (p.power.low) continue; // paused, not reset
      if (++st.charge >= chargeTicks(id)) {
        st.ready = true;
        w.events.emit('powerReady', w.tick, { owner: p.id, power: id });
      }
    }
  }
  flights(w);
}

const inMap = (/** @type {World} */ w, /** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < w.map.width && y < w.map.height;
const isLand = (/** @type {World} */ w, /** @type {number} */ x, /** @type {number} */ y) => inMap(w, x, y) && w.nav.passable('foot', x, y);

/** Nearest map-edge cell to a target, and the opposite edge to fly out by. @param {World} w @param {number} x @param {number} y */
function edgesFor(w, x, y) {
  const W = w.map.width - 1;
  const H = w.map.height - 1;
  const d = [x, W - x, y, H - y];
  const k = d.indexOf(Math.min(...d));
  const entry = [{ x: 0, y }, { x: W, y }, { x, y: 0 }, { x, y: H }][k];
  const exit = [{ x: W, y }, { x: 0, y }, { x, y: H }, { x, y: 0 }][k];
  return { entry, exit };
}

/** Send a Support Plane on a mission. @param {World} w @param {number} pid @param {string} kind @param {number} x @param {number} y */
function launchPlane(w, pid, kind, x, y) {
  const { entry, exit } = edgesFor(w, x, y);
  const u = spawnUnit(w, 'supportPlane', pid, entry.x, entry.y, { facing: 0 });
  if (!u) return false;
  u.mission = { kind, tx: x, ty: y, done: false, exit };
  u.stance = 'holdFire';
  setMove(w, u, x, y, { auto: true });
  w.events.emit('supportPlane', w.tick, { owner: pid, kind, id: u.id });
  return true;
}

/** Five Riflemen on free land cells around a point (water shifts to the nearest land). @param {World} w @param {number} pid @param {number} x @param {number} y */
function paradrop(w, pid, x, y) {
  const spec = SUPPORT_POWERS.paradrop;
  let landed = 0;
  for (const [cx, cy] of spiral(x, y, 6)) {
    if (landed >= spec.count) break;
    if (!isLand(w, cx, cy) || w.occ.bld[cy * w.map.width + cx]) continue;
    if (spawnUnit(w, spec.unit, pid, cx, cy)) landed++;
  }
  w.events.emit('paradrop', w.tick, { owner: pid, x, y, count: landed });
}

/** Support Planes flying their missions: deliver over the target, then leave by the far edge. @param {World} w */
function flights(w) {
  for (const u of w.entities.all()) {
    if (u.dead || !u.mission) continue;
    const m = u.mission;
    if (!m.done && u.cx === m.tx && u.cy === m.ty && !u.next) {
      m.done = true;
      if (m.kind === 'spyPlane') revealCircle(w, w.players[u.owner].team, m.tx, m.ty, SUPPORT_POWERS.spyPlane.revealRadius);
      else if (m.kind === 'paradrop') paradrop(w, u.owner, m.tx, m.ty);
      setMove(w, u, m.exit.x, m.exit.y, { auto: true });
      continue;
    }
    if (m.done && !u.order && !u.next) {
      // Off the map: gone (not a loss).
      u.mission = null;
      w.entities.remove(u);
      w.events.emit('unitLeft', w.tick, { id: u.id, owner: u.owner });
    }
  }
}

/** Phase Shift destination: passable for the vehicle and free, else the nearest such cell within 3. @param {World} w @param {any} v @param {number} x @param {number} y */
function shiftCell(w, v, x, y) {
  for (const [cx, cy] of spiral(x, y, SUPPORT_POWERS.phaseShift.fallbackRadius)) {
    if (!inMap(w, cx, cy) || w.occ.bld[cy * w.map.width + cx]) continue;
    const r = canEnter(w, v, cx, cy);
    if (r.ok && !w.occ.unitsIn(cy * w.map.width + cx).length) return { x: cx, y: cy };
  }
  return null;
}

/** Teleport a vehicle (passengers ride along). @param {World} w @param {any} v @param {{x: number, y: number}} to */
function teleport(w, v, to) {
  vacate(w, v, v.cx, v.cy, v.spot);
  if (v.next) vacate(w, v, v.next.x, v.next.y, v.next.spot);
  v.next = null;
  v.order = null;
  v.path = [];
  v.pathReq = 0;
  v.task = null;
  v.target = 0;
  const pos = spotPos(to.x, to.y, -1);
  v.x = pos.x; v.y = pos.y; v.px = pos.x; v.py = pos.y;
  v.cx = to.x; v.cy = to.y;
  v.post = { x: to.x, y: to.y };
  occupy(w, v, to.x, to.y, -1);
}

/** Is this a vehicle (for Phase Shift and Aegis)? @param {any} e */
const isVehicle = (e) => e.kind === 'unit' && ['wheel', 'track'].includes(UNITS[e.type].loco);

/**
 * Can this power be aimed here? Shared by the command and the targeting UI.
 * @param {World} w @param {number} pid @param {PowerId} id @param {any} t  { x, y } and/or { id }, plus { unit } for Phase Shift
 */
export function validPowerTarget(w, pid, id, t) {
  const spec = SUPPORT_POWERS[id];
  const cell = t && Number.isInteger(t.x) && Number.isInteger(t.y) && inMap(w, t.x, t.y);
  switch (spec.target) {
    case 'none': return true;
    case 'cell':
    case 'anyCell': return !!cell;
    case 'exploredLand': return !!cell && w.isExplored(pid, t.x, t.y);
    case 'ownVehicleThenCell': {
      const v = Number.isInteger(t?.unit) ? w.entities.get(t.unit) : null;
      if (!v || v.dead || v.owner !== pid || !isVehicle(v) || v.inside) return false;
      if (t.x === undefined) return true; // first step: the vehicle alone
      return !!cell && w.isExplored(pid, t.x, t.y);
    }
    case 'vehicleOrStructure': {
      const e = Number.isInteger(t?.id) ? w.entities.get(t.id) : null;
      return !!e && !e.dead && (e.kind === 'structure' || isVehicle(e)) && w.visibleTo(pid, e);
    }
    default: return false;
  }
}

/**
 * Fire a ready power (the 'power' command). Returns false and keeps the
 * charge when the target is invalid or the effect cannot happen.
 * @param {World} w @param {number} pid @param {PowerId} id @param {any} t
 */
export function firePower(w, pid, id, t) {
  const p = w.players[pid];
  const spec = SUPPORT_POWERS[id];
  if (!spec || !grants(w, pid, id)) return false;
  const st = powerState(p, id);
  if (!st.ready || !validPowerTarget(w, pid, id, t)) return false;
  switch (id) {
    case 'spyPlane':
    case 'paradrop': {
      let { x, y } = t;
      if (id === 'paradrop' && !isLand(w, x, y)) {
        const land = spiral(x, y, 10).find(([cx, cy]) => isLand(w, cx, cy));
        if (!land) return false;
        [x, y] = land;
      }
      if (!launchPlane(w, pid, id, x, y)) return false;
      break;
    }
    case 'satelliteUplink':
      revealAll(w, p.team);
      st.used = true;
      break;
    case 'phaseShift': {
      const v = w.entities.get(t.unit);
      const to = shiftCell(w, v, t.x, t.y);
      if (!to) return false; // cancel: the charge is kept
      teleport(w, v, to);
      break;
    }
    case 'aegisField': {
      const e = w.entities.get(t.id);
      e.aegisUntil = w.tick + ticks(SUPPORT_POWERS.aegisField.durationSeconds);
      break;
    }
    case 'lightningStorm': {
      // The storm gathers for a few seconds, then bolts strike random cells round the target until it passes.
      const spec = SUPPORT_POWERS.lightningStorm;
      const every = ticks(spec.boltEverySeconds);
      const first = ticks(spec.delaySeconds);
      const bolts = Math.floor(ticks(spec.durationSeconds) / every);
      for (let k = 0; k < bolts; k++) {
        const a = (w.rng.int(3600) / 3600) * Math.PI * 2;
        const r = Math.sqrt(w.rng.int(1000) / 1000) * spec.radius;
        const bx = Math.max(0, Math.min(w.map.width - 1, Math.round(t.x + Math.cos(a) * r)));
        const by = Math.max(0, Math.min(w.map.height - 1, Math.round(t.y + Math.sin(a) * r)));
        const tx = bx * L + L / 2;
        const ty = by * L + L / 2;
        w.projectiles.push({
          id: ++w.projectileSeq, weapon: 'stormBolt', owner: pid, shooter: 0,
          x: tx, y: ty, sx: tx, sy: ty, tx, ty, target: 0, homing: false,
          speed: 0, ticks: first + k * every + w.rng.int(Math.max(1, every)), direct: false, born: w.tick,
        });
      }
      w.events.emit('stormStarted', w.tick, { owner: pid, x: t.x, y: t.y, radius: spec.radius, ticks: first + bolts * every });
      break;
    }
    case 'atomicStrike': {
      const silo = w.entities.all().find((e) => e.kind === 'structure' && e.owner === pid && isActive(e) && structureDef(e.type).powers?.includes('atomicStrike'));
      const tx = t.x * L + L / 2;
      const ty = t.y * L + L / 2;
      const sx = silo ? silo.x : tx;
      const sy = silo ? silo.y : ty;
      const dist = isqrt((tx - sx) ** 2 + (ty - sy) ** 2);
      const flight = ticks(SUPPORT_POWERS.atomicStrike.flightSeconds);
      w.projectiles.push({
        id: ++w.projectileSeq, weapon: 'atomicStrike', owner: pid, shooter: silo ? silo.id : 0,
        x: sx, y: sy, sx, sy, tx, ty, target: 0, homing: false,
        speed: Math.max(1, Math.ceil(dist / flight)), ticks: flight, direct: false, born: w.tick,
      });
      w.events.emit('missileLaunch', w.tick, { owner: pid, x: t.x, y: t.y });
      break;
    }
    default: return false;
  }
  st.ready = false;
  st.charge = 0;
  w.events.emit('powerUsed', w.tick, { owner: pid, power: id, x: t?.x, y: t?.y });
  return true;
}

