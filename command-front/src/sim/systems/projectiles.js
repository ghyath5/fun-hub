// @ts-check
/**
 * Projectiles and damage collection (system 8, section 9). Projectiles fly
 * toward their aim point (homing ones follow a living target; a dead
 * target's last position is kept). On impact the intended target takes full
 * damage when it is still there, and everything within the splash radius
 * takes damage × multiplier × falloff — friends included. Ground splash never
 * reaches aircraft in flight; only weapons that hit submerged subs reach them.
 * Damage is only collected here; system 9 applies it.
 */
import { WEAPONS } from '../../data/weapons.js';
import { SIM } from '../../data/rules.js';
import { isqrt } from '../../core/fixed.js';
import { damage, falloffPermille } from '../formulas/combat.js';
import { armorOf, layerOf, isInfantryEntity, reachDist } from '../targeting.js';
import { terrainImpact, scorchEarth } from '../terrainDamage.js';
import { mindControl } from '../unitPowers.js';
import { canInfest, infest } from '../infest.js';

/** @typedef {import('../world.js').World} World */
/** @typedef {import('./weapons.js').Projectile} Projectile */

const L = SIM.leptonsPerCell;
/** A non-homing shot hits its intended target if it lands within half a cell of it. */
const DIRECT_RADIUS = L >> 1;

/**
 * @typedef {object} DamageRecord
 * @property {number} victim
 * @property {number} amount     HP to remove (negative heals)
 * @property {number} attacker   Entity id (0 = none)
 * @property {number} owner      Attacker's player (-1 = none)
 */

/** @param {World} w @param {any} e */
const isProne = (w, e) => isInfantryEntity(e) && w.tick < e.proneUntil;

/**
 * A detonation: direct hit, splash, terrain. Projectiles land here; mines
 * and the Atomic Strike call it directly with a projectile-shaped record.
 * @param {World} w @param {Pick<Projectile, 'weapon' | 'tx' | 'ty' | 'target' | 'direct' | 'shooter' | 'owner'> & { id?: number }} p
 */
export function detonate(w, p) {
  const wd = WEAPONS[p.weapon];
  const t = p.target ? w.entities.get(p.target) : null;
  const point = { x: p.tx, y: p.ty };
  const direct = t && !t.inside && (p.direct || reachDist(point, t) <= DIRECT_RADIUS) ? t : null;
  /** @param {any} victim @param {number} amount */
  const hit = (victim, amount) => w.damage.push({ victim: victim.id, amount, attacker: p.shooter, owner: p.owner });

  const shooter = w.entities.get(p.shooter);
  if (wd.effect === 'infest' && direct && canInfest(w, shooter, direct)) {
    // A Terror Drone's leap that lands on a vehicle takes it inside (infest.js); anything else it claws.
    infest(w, shooter, direct);
  } else if (wd.effect === 'mindControl') {
    // No damage: a direct hit turns the target (unitPowers.js).
    if (direct) mindControl(w, shooter, direct);
  } else if (!wd.warhead) {
    // Healing: a direct effect on its patient only.
    if (direct) hit(direct, wd.damage);
  } else {
    if (direct) hit(direct, damage(wd.damage, wd.warhead, armorOf(direct), { prone: isProne(w, direct) }));
    const r = Math.round(wd.splash * L);
    if (r > 0) {
      for (const e of w.spatial.near(p.tx, p.ty, r + 2 * L)) {
        if (e === direct || e.dead || e.immune || e.inside) continue; // riders (passengers, drones) are out of reach
        const layer = layerOf(e);
        if (layer === 'A') continue;
        if (layer === 'S' && !wd.hits.includes('S')) continue;
        const f = falloffPermille(reachDist(point, e), r);
        if (f <= 0) continue;
        const amount = damage(wd.damage, wd.warhead, armorOf(e), { falloff: f, prone: isProne(w, e) });
        if (amount > 0) hit(e, amount);
      }
    }
  }
  terrainImpact(w, wd, p.tx, p.ty);
  if (p.weapon === 'atomicStrike') scorchEarth(w, Math.floor(p.tx / L), Math.floor(p.ty / L), Math.round(wd.splash));
  w.events.emit('impact', w.tick, { weapon: p.weapon, x: p.tx, y: p.ty, direct: direct ? direct.id : 0, projectile: p.id ?? 0 });
}

/** System 8. @param {World} w */
export function projectileSystem(w) {
  if (w.projectiles.length === 0) return;
  w.spatial.rebuild(w.entities.all()); // units moved since system 5
  /** @type {Projectile[]} */
  const flying = [];
  for (const p of w.projectiles) {
    if (p.born === w.tick) { flying.push(p); continue; } // instant weapons land on the tick after firing
    const t = p.target && p.homing ? w.entities.get(p.target) : null;
    if (t) { p.tx = t.x; p.ty = t.y; }
    let landed = false;
    if (p.speed === 0) {
      landed = --p.ticks <= 0;
      if (landed) { p.x = p.tx; p.y = p.ty; }
    } else {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = isqrt(dx * dx + dy * dy);
      if (d <= p.speed) {
        p.x = p.tx;
        p.y = p.ty;
        landed = true;
      } else {
        p.x += Math.trunc((dx * p.speed) / d);
        p.y += Math.trunc((dy * p.speed) / d);
      }
    }
    if (landed) detonate(w, p);
    else flying.push(p);
  }
  w.projectiles = flying;
}
