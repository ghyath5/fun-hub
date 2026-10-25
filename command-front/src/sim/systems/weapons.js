// @ts-check
/**
 * Weapon firing (system 7, sections 8 and 9). A weapon fires only when the
 * target is in range and outside minimum range, on a layer it hits, the
 * turret (or body) faces it within ±8, the cooldown is ready and ammo remains.
 * Each tick a unit fires its best ready weapon (damage × multiplier); separate
 * weapons keep separate cooldowns. Bursts follow 0.2 s apart. Shots become
 * projectiles; nothing is damaged here.
 */
import { TURN_RATE, UNITS } from '../../data/units.js';
import { WEAPONS, PROJECTILE_SPEED, reachCells } from '../../data/weapons.js';
import { SIM, SPECIALS } from '../../data/rules.js';
import { isqrt, facingOf, facingDelta, turnToward, ticks } from '../../core/fixed.js';
import { weaponCanHit, effectiveness, layerOf, reachDist, weaponsOf, hasTurret } from '../targeting.js';
import { stepSubmarine, subReady } from '../naval.js';
import { combatDef } from '../defs.js';
import { afterFiring, canControlMore } from '../unitPowers.js';

/** @typedef {import('../entities/units.js').Unit} Unit */
/** @typedef {import('../world.js').World} World */
/** @typedef {import('../../types.js').WeaponDef} WeaponDef */

const L = SIM.leptonsPerCell;
const LEAP_TICKS = ticks(SPECIALS.houndLeapSeconds);

/** Projectile kinds that land on the tick after firing. */
const INSTANT = new Set(['instant', 'beam', 'strafe', 'melee']);

/**
 * @typedef {object} Projectile
 * @property {number} id
 * @property {string} weapon
 * @property {number} owner     Shooter's player
 * @property {number} shooter   Shooter's entity id
 * @property {number} x         Current position, leptons
 * @property {number} y
 * @property {number} sx        Launch position (render arcs)
 * @property {number} sy
 * @property {number} tx        Aim point
 * @property {number} ty
 * @property {number} target    Entity aimed at (0 = ground)
 * @property {boolean} homing   Follows the target while it lives
 * @property {number} speed     Leptons per tick (0 = lands after `ticks`)
 * @property {number} ticks
 * @property {boolean} direct   No scatter: hits the target if it is still there
 * @property {number} born      Tick fired; a projectile starts moving (or lands, if instant) the tick after
 */

/** Where to aim: the target entity, or the centre of a force-fired cell. @param {World} w @param {Unit} u */
function aimOf(w, u) {
  const t = u.target ? w.entities.get(u.target) : null;
  if (t) return { x: t.x, y: t.y, e: t };
  if (u.fireCell) return { x: u.fireCell.x * L + (L >> 1), y: u.fireCell.y * L + (L >> 1), e: null };
  return null;
}

/**
 * Can weapon k of unit u shoot at the aim now (ignoring facing and cooldown)?
 * @param {World} w @param {Unit} u @param {WeaponDef} wd @param {{x: number, y: number, e: any}} aim @param {number} d
 */
function canShoot(w, u, wd, aim, d) {
  if (d > Math.round(reachCells(wd) * L) || d < Math.round(wd.minRange * L)) return false;
  if (!aim.e) return wd.hits.includes('G') && !!wd.warhead;
  const friendly = w.allied(aim.e.owner, u.owner);
  if (weaponCanHit(wd, aim.e, friendly)) return true;
  // Force-fire may shoot own and allied objects with any weapon that reaches their layer.
  return u.task?.type === 'forceFire' && !!wd.warhead && wd.damage > 0 && wd.hits.includes(layerOf(aim.e));
}

/** @param {World} w @param {any} u unit or structure @param {number} k @param {{x: number, y: number, e: any}} aim @param {number} d */
function launch(w, u, k, aim, d) {
  const id = weaponsOf(u)[k];
  const wd = WEAPONS[id];
  let tx = aim.x;
  let ty = aim.y;
  // Scatter: up to wd.scatter cells at full range, scaled by distance / range.
  const s = wd.scatter > 0 ? Math.floor((wd.scatter * L * d) / Math.max(1, Math.round(wd.range * L))) : 0;
  if (s > 0) {
    tx += w.rng.int(2 * s + 1) - s;
    ty += w.rng.int(2 * s + 1) - s;
  }
  const instant = INSTANT.has(wd.projectile);
  /** @type {Projectile} */
  const p = {
    id: ++w.projectileSeq,
    weapon: id,
    owner: u.owner,
    shooter: u.id,
    x: u.x, y: u.y, sx: u.x, sy: u.y,
    tx, ty,
    target: aim.e ? aim.e.id : 0,
    homing: instant || wd.projectile === 'homing' || wd.projectile === 'torpedo',
    speed: instant ? 0 : Math.max(1, Math.round(((wd.speed || PROJECTILE_SPEED.shell) * L) / SIM.ticksPerSecond)),
    ticks: wd.projectile === 'melee' && d > L ? LEAP_TICKS : 1,
    direct: s === 0 && !!aim.e,
    born: w.tick,
  };
  w.projectiles.push(p);
  if (u.sub) u.sub.lastShot = w.tick;
  if (u.kind === 'structure') u.firedAt = w.tick; // a Camo Pillbox shows itself for 3 s after firing
  else afterFiring(w, u); // Mirage Tanks show themselves; kamikaze units go up with their shot
  w.events.emit('shot', w.tick, { shooter: u.id, weapon: id, x: u.x, y: u.y, tx, ty, projectile: p.id });
}

/**
 * Is this aircraft's heading the flight's to set? Planes always fly their
 * own line (they fire when it lines up); a helicopter turns to aim only
 * while it hovers.
 * @param {any} u
 */
function steeredInFlight(u) {
  if (u.kind !== 'unit' || UNITS[u.type].loco !== 'air') return false;
  const tags = UNITS[u.type].tags;
  return tags.includes('plane') || tags.includes('support') || !!u.order;
}

/** @param {World} w @param {any} u */
function fireUnit(w, u) {
  const cdef = combatDef(u.type);
  const def = { weapons: weaponsOf(u), turnRate: cdef.turnRate };
  const structure = cdef.structure;
  const states = u.weapons;
  for (const st of states) {
    if (st.cd > 0) st.cd--;
    if (st.burstCd > 0) st.burstCd--;
  }
  const aim = aimOf(w, u);
  const turret = hasTurret(u);
  if (!aim) {
    if (turret && !structure) u.turret = turnToward(u.turret, u.facing, TURN_RATE.turret);
    return;
  }
  const d = aim.e ? reachDist(u, aim.e) : isqrt((aim.x - u.x) ** 2 + (aim.y - u.y) ** 2);
  const want = facingOf(aim.x - u.x, aim.y - u.y);
  if (turret) u.turret = turnToward(u.turret, want, TURN_RATE.turret);
  else if (!structure && !u.next && !steeredInFlight(u)) u.facing = turnToward(u.facing, want, def.turnRate);
  const aimFacing = turret ? u.turret : u.facing;
  // Defenses without a turret (pillboxes, towers) fire in any direction.
  const aligned = d === 0 || (structure && !turret) || Math.abs(facingDelta(aimFacing, want)) <= SIM.facingTolerance;

  // Shots still owed by a burst in progress go first.
  for (let k = 0; k < states.length; k++) {
    const st = states[k];
    if (st.burst > 0 && st.burstCd === 0 && aligned && canShoot(w, u, WEAPONS[def.weapons[k]], aim, d)) {
      st.burst--;
      st.burstCd = ticks(WEAPONS[def.weapons[k]].burstGap);
      launch(w, u, k, aim, d);
      return;
    }
  }
  // Charging weapons (Arc Bolt) release when the charge completes.
  for (let k = 0; k < states.length; k++) {
    const st = states[k];
    if (st.charge > 0 && --st.charge === 0) {
      if (canShoot(w, u, WEAPONS[def.weapons[k]], aim, d)) launch(w, u, k, aim, d);
      return;
    }
  }
  if (!aligned) return;
  let best = -1;
  let bestEff = -1;
  for (let k = 0; k < states.length; k++) {
    const wd = WEAPONS[def.weapons[k]];
    const st = states[k];
    if (st.cd > 0 || st.burst > 0 || (wd.ammo > 0 && st.ammo <= 0)) continue;
    if (wd.powered && w.players[u.owner].power.low) continue; // Arc Tower, AA Gun, SAM Site go dark at low power
    if (wd.effect === 'mindControl' && !canControlMore(w, u)) continue; // a Psi Commander's mind is full
    if (!canShoot(w, u, wd, aim, d)) continue;
    const eff = aim.e ? effectiveness(wd, aim.e) : wd.damage;
    if (eff > bestEff) { bestEff = eff; best = k; }
  }
  if (best < 0) return;
  const wd = WEAPONS[def.weapons[best]];
  const st = states[best];
  st.cd = ticks(wd.cooldown);
  if (wd.ammo > 0) st.ammo--;
  if (wd.chargeUp > 0) {
    st.charge = ticks(wd.chargeUp);
    st.burst = wd.burst - 1;
    st.burstCd = ticks(wd.burstGap);
    w.events.emit('charge', w.tick, { shooter: u.id, weapon: def.weapons[best] });
    return;
  }
  st.burst = wd.burst - 1;
  st.burstCd = ticks(wd.burstGap);
  launch(w, u, best, aim, d);
}

/** System 7. Units killed this tick still fire this tick: damage lands in system 9. @param {World} w */
export function weaponSystem(w) {
  for (const u of w.entities.all()) {
    if (u.dead || u.inside || u.landed || !u.weapons || u.weapons.length === 0) continue;
    if (u.kind === 'structure' && (u.buildUp > 0 || u.selling)) continue;
    if (u.sub) {
      // A submarine surfaces before it can shoot.
      stepSubmarine(w, u, !!(u.target || u.fireCell));
      if (!subReady(u)) { for (const st of u.weapons) { if (st.cd > 0) st.cd--; } continue; }
    }
    fireUnit(w, u);
  }
}
