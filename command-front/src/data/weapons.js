// @ts-check
/**
 * Weapons (section 8). Durations in seconds, distances in cells.
 * Projectile speeds are not in the spec; see DECISIONS.md.
 */

/** @typedef {import('../types.js').WeaponDef} WeaponDef */

/** @type {Omit<WeaponDef, 'id' | 'name' | 'damage' | 'range' | 'cooldown' | 'warhead' | 'hits'>} */
const DEFAULTS = {
  burst: 1, burstGap: 0.2, minRange: 0, splash: 0, projectile: 'instant', speed: 0,
  scatter: 0, ammo: 0, chargeUp: 0, leap: 0, only: null, powered: false,
};

/** Projectile speeds in cells per second, by projectile kind. */
export const PROJECTILE_SPEED = Object.freeze({
  instant: 0, beam: 0, melee: 0, strafe: 0,
  fastShell: 14, shell: 10, arc: 7, homing: 8, missile: 4, dropped: 3, torpedo: 5,
});

/**
 * @param {string} id
 * @param {string} name
 * @param {Partial<WeaponDef> & Pick<WeaponDef, 'damage' | 'range' | 'cooldown' | 'warhead' | 'hits'>} p
 * @returns {WeaponDef}
 */
function w(id, name, p) {
  const def = { ...DEFAULTS, ...p, id, name };
  if (!p.speed) def.speed = PROJECTILE_SPEED[/** @type {keyof typeof PROJECTILE_SPEED} */ (def.projectile)] ?? 0;
  return Object.freeze(def);
}

const GN = /** @type {import('../types.js').HitLayer[]} */ (['G', 'N']);
const G = /** @type {import('../types.js').HitLayer[]} */ (['G']);
const A = /** @type {import('../types.js').HitLayer[]} */ (['A']);
const GAN = /** @type {import('../types.js').HitLayer[]} */ (['G', 'A', 'N']);

/** @type {Record<string, WeaponDef>} */
export const WEAPONS = Object.freeze({
  rifle:        w('rifle', 'Rifle', { damage: 15, range: 3, cooldown: 1.2, warhead: 'SA', hits: GN }),
  heavyMg:      w('heavyMg', 'Heavy MG', { damage: 15, range: 4, cooldown: 0.8, warhead: 'SA', hits: GN }),
  pillboxMg:    w('pillboxMg', 'Pillbox MG', { damage: 25, range: 5, cooldown: 0.7, warhead: 'SA', hits: GN }),
  grenade:      w('grenade', 'Grenade', { damage: 50, range: 4, cooldown: 3.0, warhead: 'HE', splash: 1.0, projectile: 'arc', scatter: 0.75, hits: G }),
  flakGun:      w('flakGun', 'Flak Gun', { damage: 25, burst: 2, range: 5, cooldown: 1.2, warhead: 'AP', hits: A }),
  shockBolt:    w('shockBolt', 'Shock Bolt', { damage: 40, range: 3.5, cooldown: 2.5, warhead: 'Arc', projectile: 'beam', hits: GN }),
  rocket:       w('rocket', 'Rocket', { damage: 35, range: 5, cooldown: 3.3, warhead: 'AP', splash: 0.25, projectile: 'homing', hits: GAN }),
  flamethrower: w('flamethrower', 'Flamethrower', { damage: 70, range: 2, cooldown: 3.0, warhead: 'Fire', splash: 0.5, hits: G }),
  sniper:       w('sniper', 'Sniper', { damage: 100, range: 5.5, cooldown: 2.0, warhead: 'HollowPoint', hits: G, only: 'infantry' }),
  bite:         w('bite', 'Bite', { damage: 100, range: 1, leap: 2, cooldown: 1.5, warhead: 'Bite', projectile: 'melee', hits: G, only: 'infantry' }),
  heal:         w('heal', 'Heal', { damage: -25, range: 1.5, cooldown: 2.0, warhead: null, hits: G, only: 'friendlyInfantry' }),
  gun75:        w('gun75', '75mm Gun', { damage: 25, range: 4.75, cooldown: 2.2, warhead: 'AP', splash: 0.5, projectile: 'fastShell', hits: GN }),
  gun90:        w('gun90', '90mm Gun', { damage: 35, range: 4.75, cooldown: 3.0, warhead: 'AP', splash: 0.5, projectile: 'fastShell', hits: GN }),
  guardRocket:  w('guardRocket', 'Anti-Tank Rocket', { damage: 35, range: 5, cooldown: 3.3, warhead: 'AP', splash: 0.25, projectile: 'homing', hits: GN }),
  ifvRockets:   w('ifvRockets', 'IFV Rockets', { damage: 25, burst: 2, range: 5.5, cooldown: 3.0, warhead: 'AP', splash: 0.25, projectile: 'homing', hits: GAN }),
  laserBeam:    w('laserBeam', 'Laser Beam', { damage: 90, range: 6, cooldown: 3.2, warhead: 'Laser', splash: 0.5, projectile: 'beam', hits: GN }),
  salvoRockets: w('salvoRockets', 'Salvo Rockets', { damage: 45, burst: 6, burstGap: 0.15, range: 8, minRange: 3, cooldown: 9, warhead: 'HE', splash: 0.75, projectile: 'missile', speed: 9, scatter: 1.2, hits: GN }),
  gatling:      w('gatling', 'Rotary Cannon', { damage: 9, range: 4.5, cooldown: 0.3, warhead: 'SA', hits: GAN }),
  flakCannon:   w('flakCannon', 'Flak Cannon', { damage: 25, burst: 2, range: 6, cooldown: 0.9, warhead: 'AP', hits: A }),
  arcCannon:    w('arcCannon', 'Arc Cannon', { damage: 75, range: 4.5, cooldown: 3.0, warhead: 'Arc', projectile: 'beam', hits: GN }),
  airshipBombs: w('airshipBombs', 'Airship Bombs', { damage: 180, range: 1.5, cooldown: 3.5, warhead: 'HE', splash: 1.5, projectile: 'dropped', hits: GN }),
  sentryMg:     w('sentryMg', 'Sentry MG', { damage: 20, range: 5, cooldown: 0.5, warhead: 'SA', hits: GN }),
  twin105:      w('twin105', '105mm Twin', { damage: 35, burst: 2, range: 4.75, cooldown: 4.0, warhead: 'AP', splash: 0.5, projectile: 'fastShell', hits: GN }),
  twin120:      w('twin120', '120mm Twin', { damage: 40, burst: 2, range: 4.75, cooldown: 5.3, warhead: 'AP', splash: 0.5, projectile: 'fastShell', hits: GN }),
  titanMissiles: w('titanMissiles', 'Titan Missiles', { damage: 50, burst: 2, range: 5, cooldown: 4.0, warhead: 'AP', splash: 0.25, projectile: 'homing', hits: GAN }),
  howitzer155:  w('howitzer155', '155mm Howitzer', { damage: 150, range: 6, minRange: 2, cooldown: 6.0, warhead: 'HE', splash: 1.0, projectile: 'arc', scatter: 1.5, hits: GN }),
  ballistic:    w('ballistic', 'Ballistic Missile', { damage: 600, range: 10, minRange: 3, cooldown: 20, warhead: 'HE', splash: 1.5, projectile: 'missile', scatter: 1.0, hits: GN }),
  turretCannon: w('turretCannon', 'Turret Cannon', { damage: 40, range: 6, cooldown: 3.0, warhead: 'AP', splash: 0.25, projectile: 'fastShell', hits: GN }),
  towerFlame:   w('towerFlame', 'Tower Flame', { damage: 125, range: 4, cooldown: 3.3, warhead: 'Fire', splash: 0.5, hits: G }),
  towerBeam:    w('towerBeam', 'Tower Beam', { damage: 110, range: 7, cooldown: 4.5, chargeUp: 0.4, warhead: 'Laser', splash: 0.5, projectile: 'beam', hits: GN, powered: true }),
  arcBolt:      w('arcBolt', 'Arc Bolt', { damage: 140, range: 6.5, cooldown: 5.0, chargeUp: 0.8, warhead: 'Arc', projectile: 'beam', hits: GN, powered: true }),
  flak:         w('flak', 'Flak', { damage: 25, burst: 2, range: 6, cooldown: 0.7, warhead: 'AP', hits: A, powered: true }),
  sam:          w('sam', 'SAM', { damage: 50, burst: 2, range: 7.5, cooldown: 3.0, warhead: 'AP', projectile: 'homing', hits: A, powered: true }),
  heliRockets:  w('heliRockets', 'Heli Rockets', { damage: 40, range: 4, cooldown: 0.5, ammo: 6, warhead: 'AP', splash: 0.25, projectile: 'homing', hits: GN }),
  planeChaingun: w('planeChaingun', 'Plane Chaingun', { damage: 40, range: 5, cooldown: 0.25, ammo: 15, warhead: 'SA', projectile: 'strafe', hits: GN }),
  jetMissiles:  w('jetMissiles', 'Jet Missiles', { damage: 60, range: 4, cooldown: 0.5, ammo: 4, warhead: 'AP', splash: 0.25, projectile: 'homing', hits: GAN }),
  deckGun:      w('deckGun', 'Deck Gun', { damage: 30, range: 6.5, cooldown: 2.0, warhead: 'AP', splash: 0.25, projectile: 'shell', hits: GN }),
  deckGunTwin:  w('deckGunTwin', 'Deck Gun (twin)', { damage: 30, burst: 2, range: 6.5, cooldown: 2.0, warhead: 'AP', splash: 0.25, projectile: 'shell', hits: GN }),
  depthCharge:  w('depthCharge', 'Depth Charge', { damage: 80, range: 4, cooldown: 2.5, warhead: 'AP', splash: 0.5, projectile: 'dropped', hits: ['S', 'N'], only: 'subs' }),
  shipAa:       w('shipAa', 'Ship AA', { damage: 50, range: 7, cooldown: 2.0, warhead: 'AP', projectile: 'homing', hits: A }),
  cruiserGun:   w('cruiserGun', 'Cruiser Gun', { damage: 500, burst: 2, range: 22, minRange: 4, cooldown: 10, warhead: 'HE', splash: 1.5, projectile: 'arc', scatter: 2.0, hits: GN }),
  torpedo:      w('torpedo', 'Torpedo', { damage: 90, range: 9, cooldown: 3.3, warhead: 'AP', projectile: 'torpedo', hits: ['N'], only: 'ships' }),

  // Effects that are not carried by any unit: mines and the Atomic Strike detonate through the same impact rules.
  mineAntiTank: w('mineAntiTank', 'Anti-tank Mine', { damage: 400, range: 0, cooldown: 0, warhead: 'AP', hits: G }),
  mineAntiPersonnel: w('mineAntiPersonnel', 'Anti-personnel Mine', { damage: 200, range: 0, cooldown: 0, warhead: 'HE', splash: 0.5, hits: G }),
  crateBomb:    w('crateBomb', 'Booby-trapped Crate', { damage: 200, range: 0, cooldown: 0, warhead: 'HE', splash: 1.5, hits: G }),
  atomicStrike: w('atomicStrike', 'Atomic Strike', { damage: 1000, range: 0, cooldown: 0, warhead: 'HE', splash: 3, projectile: 'missile', hits: GN }),
});

/** Weapons no unit carries (they are fired by mines and support powers). */
export const EFFECT_WEAPONS = Object.freeze(['mineAntiTank', 'mineAntiPersonnel', 'crateBomb', 'atomicStrike']);

/** Mines (section 10), applied as direct damage on trigger. */
export const MINES = Object.freeze({
  coalition: { kind: 'antiTank', triggeredBy: 'vehicle', damage: 400, warhead: 'AP', splash: 0, weapon: 'mineAntiTank' },
  union: { kind: 'antiPersonnel', triggeredBy: 'infantry', damage: 200, warhead: 'HE', splash: 0.5, weapon: 'mineAntiPersonnel' },
});
