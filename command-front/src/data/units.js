// @ts-check
/**
 * Units (section 8). Speeds in cells per second, sight in cells.
 * Turn rates (facing units per tick) come from TURN_RATE by class.
 */

/** @typedef {import('../types.js').UnitDef} UnitDef */

/** Turn rates in facing units per tick (section 3). */
export const TURN_RATE = Object.freeze({
  infantry: 255, wheel: 12, track: 8, heavy: 5, ship: 4, air: 12, turret: 10,
});

/** Directions each class is drawn with (section 3). */
export const FACING_FRAMES = Object.freeze({ infantry: 8, vehicle: 32, turret: 32, aircraft: 16, ship: 32 });

/** @type {Omit<UnitDef, 'id' | 'name' | 'faction' | 'line' | 'cost' | 'hp' | 'armor' | 'loco' | 'speed' | 'sight' | 'requires'>} */
const DEFAULTS = { weapons: [], turret: false, crusher: 'none', turnRate: 0, limit: 0, capacity: 0, slots: 1, tags: [] };

/**
 * @param {Partial<UnitDef> & Pick<UnitDef, 'id' | 'name' | 'faction' | 'line' | 'cost' | 'hp' | 'armor' | 'loco' | 'speed' | 'sight' | 'requires'>} p
 * @returns {UnitDef}
 */
function u(p) {
  const def = { ...DEFAULTS, ...p };
  if (!def.turnRate) {
    def.turnRate = def.loco === 'foot' ? TURN_RATE.infantry
      : def.loco === 'wheel' ? TURN_RATE.wheel
      : def.loco === 'float' ? TURN_RATE.ship
      : def.loco === 'air' ? TURN_RATE.air
      : TURN_RATE.track;
  }
  return Object.freeze(def);
}

const INF = /** @type {const} */ ('infantry');
const VEH = /** @type {const} */ ('vehicles');
const AIR = /** @type {const} */ ('aircraft');
const NAV = /** @type {const} */ ('naval');

/** @type {Record<string, UnitDef>} */
export const UNITS = Object.freeze({
  // Infantry
  rifleman:      u({ id: 'rifleman', name: 'Rifleman', faction: 'both', line: INF, cost: 100, hp: 50, armor: 'none', loco: 'foot', speed: 1.0, sight: 4, weapons: ['rifle'], requires: ['barracks'] }),
  rocketTrooper: u({ id: 'rocketTrooper', name: 'Rocket Trooper', faction: 'both', line: INF, cost: 300, hp: 45, armor: 'none', loco: 'foot', speed: 0.9, sight: 4, weapons: ['rocket'], requires: ['barracks'], tags: ['antiAir'] }),
  engineer:      u({ id: 'engineer', name: 'Engineer', faction: 'both', line: INF, cost: 500, hp: 25, armor: 'none', loco: 'foot', speed: 1.0, sight: 3, requires: ['barracks'], tags: ['engineer', 'noAutoAcquire'] }),
  grenadier:     u({ id: 'grenadier', name: 'Grenadier', faction: 'union', line: INF, cost: 160, hp: 50, armor: 'none', loco: 'foot', speed: 1.0, sight: 4, weapons: ['grenade'], requires: ['barracks'] }),
  flameTrooper:  u({ id: 'flameTrooper', name: 'Flame Trooper', faction: 'union', line: INF, cost: 300, hp: 40, armor: 'none', loco: 'foot', speed: 0.9, sight: 3, weapons: ['flamethrower'], requires: ['barracks'] }),
  hound:         u({ id: 'hound', name: 'Hound', faction: 'union', line: INF, cost: 200, hp: 12, armor: 'none', loco: 'foot', speed: 2.6, sight: 5, weapons: ['bite'], requires: ['kennel'], tags: ['detectsSpies'] }),
  medic:         u({ id: 'medic', name: 'Medic', faction: 'coalition', line: INF, cost: 800, hp: 80, armor: 'none', loco: 'foot', speed: 1.0, sight: 3, weapons: ['heal'], requires: ['barracks'], tags: ['medic'] }),
  spy:           u({ id: 'spy', name: 'Spy', faction: 'coalition', line: INF, cost: 500, hp: 25, armor: 'none', loco: 'foot', speed: 1.0, sight: 5, requires: ['barracks', 'radar'], tags: ['spy', 'noAutoAcquire'] }),
  thief:         u({ id: 'thief', name: 'Thief', faction: 'coalition', line: INF, cost: 500, hp: 25, armor: 'none', loco: 'foot', speed: 1.2, sight: 4, requires: ['barracks', 'radar'], tags: ['thief', 'noAutoAcquire'] }),
  guardTrooper:  u({ id: 'guardTrooper', name: 'Guard Trooper', faction: 'coalition', line: INF, cost: 250, hp: 70, armor: 'none', loco: 'foot', speed: 0.9, sight: 5, weapons: ['guardRocket'], requires: ['barracks'] }),
  marksman:      u({ id: 'marksman', name: 'Marksman', faction: 'coalition', line: INF, cost: 600, hp: 60, armor: 'none', loco: 'foot', speed: 1.0, sight: 7, weapons: ['sniper'], requires: ['barracks', 'radar'] }),
  shockTrooper:  u({ id: 'shockTrooper', name: 'Shock Trooper', faction: 'union', line: INF, cost: 500, hp: 130, armor: 'none', loco: 'foot', speed: 0.8, sight: 4, weapons: ['shockBolt'], requires: ['barracks', 'radar'] }),
  flakTrooper:   u({ id: 'flakTrooper', name: 'Flak Trooper', faction: 'union', line: INF, cost: 300, hp: 50, armor: 'none', loco: 'foot', speed: 1.0, sight: 5, weapons: ['flakGun'], requires: ['barracks'], tags: ['antiAir'] }),
  commando:      u({ id: 'commando', name: 'Commando', faction: 'coalition', line: INF, cost: 1200, hp: 100, armor: 'none', loco: 'foot', speed: 1.3, sight: 6, weapons: ['sniper'], requires: ['barracks', 'tech'], limit: 1, tags: ['c4'] }),

  // Vehicles
  harvester:     u({ id: 'harvester', name: 'Harvester', faction: 'both', line: VEH, cost: 1400, hp: 600, armor: 'heavy', loco: 'track', speed: 1.0, sight: 4, crusher: 'sandbags', turnRate: TURN_RATE.heavy, requires: ['factory', 'refinery'], slots: 2, tags: ['harvester', 'noAutoAcquire', 'noRally'] }),
  mcv:           u({ id: 'mcv', name: 'MCV', faction: 'both', line: VEH, cost: 2500, hp: 600, armor: 'light', loco: 'wheel', speed: 1.0, sight: 4, turnRate: TURN_RATE.heavy, requires: ['factory', 'depot'], slots: 2, tags: ['mcv', 'noAutoAcquire', 'noRally'] }),
  mineLayer:     u({ id: 'mineLayer', name: 'Mine Layer', faction: 'both', line: VEH, cost: 800, hp: 100, armor: 'heavy', loco: 'track', speed: 1.8, sight: 5, crusher: 'infantry', requires: ['factory', 'depot'], tags: ['mineLayer', 'noAutoAcquire'] }),
  ranger:        u({ id: 'ranger', name: 'Ranger', faction: 'coalition', line: VEH, cost: 600, hp: 150, armor: 'light', loco: 'wheel', speed: 2.8, sight: 6, weapons: ['heavyMg'], turret: true, requires: ['factory'], tags: ['scout'] }),
  apc:           u({ id: 'apc', name: 'APC', faction: 'coalition', line: VEH, cost: 800, hp: 200, armor: 'heavy', loco: 'track', speed: 2.2, sight: 5, weapons: ['heavyMg'], turret: true, crusher: 'infantry', requires: ['factory', 'barracks'], capacity: 5, tags: ['transport'] }),
  lightTank:     u({ id: 'lightTank', name: 'Light Tank', faction: 'coalition', line: VEH, cost: 700, hp: 300, armor: 'heavy', loco: 'track', speed: 2.0, sight: 5, weapons: ['gun75'], turret: true, crusher: 'infantry', requires: ['factory'] }),
  mediumTank:    u({ id: 'mediumTank', name: 'Medium Tank', faction: 'coalition', line: VEH, cost: 800, hp: 400, armor: 'heavy', loco: 'track', speed: 1.7, sight: 5, weapons: ['gun90'], turret: true, crusher: 'infantry', requires: ['factory'] }),
  artillery:     u({ id: 'artillery', name: 'Artillery', faction: 'coalition', line: VEH, cost: 600, hp: 75, armor: 'light', loco: 'wheel', speed: 1.0, sight: 5, weapons: ['howitzer155'], requires: ['factory', 'radar'], tags: ['artillery'] }),
  ifv:           u({ id: 'ifv', name: 'Sentinel IFV', faction: 'coalition', line: VEH, cost: 650, hp: 200, armor: 'light', loco: 'wheel', speed: 2.6, sight: 6, weapons: ['ifvRockets'], turret: true, requires: ['factory'], tags: ['antiAir'] }),
  laserTank:     u({ id: 'laserTank', name: 'Laser Tank', faction: 'coalition', line: VEH, cost: 1200, hp: 250, armor: 'light', loco: 'track', speed: 1.6, sight: 6, weapons: ['laserBeam'], turret: true, crusher: 'infantry', requires: ['factory', 'radar'] }),
  salvoLauncher: u({ id: 'salvoLauncher', name: 'Salvo Launcher', faction: 'coalition', line: VEH, cost: 1000, hp: 150, armor: 'light', loco: 'wheel', speed: 1.4, sight: 5, weapons: ['salvoRockets'], requires: ['factory', 'radar'], tags: ['artillery'] }),
  flakTrack:     u({ id: 'flakTrack', name: 'Flak Halftrack', faction: 'union', line: VEH, cost: 500, hp: 180, armor: 'light', loco: 'wheel', speed: 2.4, sight: 6, weapons: ['flakCannon'], turret: true, requires: ['factory'], capacity: 5, tags: ['transport', 'antiAir'] }),
  rotaryTank:    u({ id: 'rotaryTank', name: 'Rotary Tank', faction: 'union', line: VEH, cost: 650, hp: 300, armor: 'heavy', loco: 'track', speed: 2.0, sight: 6, weapons: ['gatling'], turret: true, crusher: 'infantry', requires: ['factory'], tags: ['antiAir'] }),
  arcTank:       u({ id: 'arcTank', name: 'Arc Tank', faction: 'union', line: VEH, cost: 1100, hp: 350, armor: 'heavy', loco: 'track', speed: 1.7, sight: 5, weapons: ['arcCannon'], turret: true, crusher: 'infantry', requires: ['factory', 'radar'] }),
  heavyTank:     u({ id: 'heavyTank', name: 'Heavy Tank', faction: 'union', line: VEH, cost: 950, hp: 400, armor: 'heavy', loco: 'track', speed: 1.5, sight: 5, weapons: ['twin105'], turret: true, crusher: 'infantry', requires: ['factory'] }),
  titanTank:     u({ id: 'titanTank', name: 'Titan Tank', faction: 'union', line: VEH, cost: 1700, hp: 600, armor: 'heavy', loco: 'track', speed: 0.9, sight: 6, weapons: ['twin120', 'titanMissiles'], turret: true, crusher: 'sandbags', turnRate: TURN_RATE.heavy, requires: ['factory', 'tech'], slots: 2, tags: ['selfRepair'] }),
  ballisticLauncher: u({ id: 'ballisticLauncher', name: 'Ballistic Launcher', faction: 'union', line: VEH, cost: 700, hp: 150, armor: 'light', loco: 'wheel', speed: 1.4, sight: 5, weapons: ['ballistic'], requires: ['factory', 'radar'], tags: ['artillery'] }),

  // Aircraft
  transportHeli: u({ id: 'transportHeli', name: 'Transport Heli', faction: 'coalition', line: AIR, cost: 1200, hp: 90, armor: 'light', loco: 'air', speed: 3.5, sight: 6, requires: ['helipad'], capacity: 5, tags: ['heli', 'transport', 'noRally'] }),
  attackHeli:    u({ id: 'attackHeli', name: 'Attack Heli', faction: 'coalition', line: AIR, cost: 1200, hp: 225, armor: 'heavy', loco: 'air', speed: 3.5, sight: 6, weapons: ['heliRockets'], requires: ['helipad'], tags: ['heli', 'noRally'] }),
  attackPlane:   u({ id: 'attackPlane', name: 'Attack Plane', faction: 'union', line: AIR, cost: 800, hp: 60, armor: 'light', loco: 'air', speed: 6.0, sight: 2, weapons: ['planeChaingun'], requires: ['airfield'], tags: ['plane', 'noRally'] }),
  strikeJet:     u({ id: 'strikeJet', name: 'Strike Jet', faction: 'union', line: AIR, cost: 1200, hp: 70, armor: 'light', loco: 'air', speed: 7.0, sight: 2, weapons: ['jetMissiles'], requires: ['airfield'], tags: ['plane', 'antiAir', 'noRally'] }),

  siegeAirship:  u({ id: 'siegeAirship', name: 'Siege Airship', faction: 'union', line: AIR, cost: 2000, hp: 1000, armor: 'heavy', loco: 'air', speed: 0.8, sight: 5, weapons: ['airshipBombs'], requires: ['airfield', 'tech'], pad: 'airfield', tags: ['heli', 'airship', 'noRally'] }),

  // Ships
  gunboat:       u({ id: 'gunboat', name: 'Gunboat', faction: 'coalition', line: NAV, cost: 500, hp: 200, armor: 'heavy', loco: 'float', speed: 2.6, sight: 6, weapons: ['deckGun', 'depthCharge'], turret: true, requires: ['navalyard'] }),
  destroyer:     u({ id: 'destroyer', name: 'Destroyer', faction: 'coalition', line: NAV, cost: 1000, hp: 400, armor: 'heavy', loco: 'float', speed: 2.3, sight: 6, weapons: ['deckGunTwin', 'depthCharge', 'shipAa'], turret: true, requires: ['navalyard', 'radar'], tags: ['detectsSubs'] }),
  cruiser:       u({ id: 'cruiser', name: 'Cruiser', faction: 'coalition', line: NAV, cost: 2000, hp: 700, armor: 'heavy', loco: 'float', speed: 1.2, sight: 7, weapons: ['cruiserGun'], turret: true, requires: ['navalyard', 'tech'] }),
  submarine:     u({ id: 'submarine', name: 'Submarine', faction: 'union', line: NAV, cost: 950, hp: 120, armor: 'light', loco: 'float', speed: 1.8, sight: 6, weapons: ['torpedo'], requires: ['navalyard'], tags: ['submarine'] }),
  // Support-power aircraft: summoned by Spy Plane and Paradrop, never built (faction 'none' hides it from every build menu).
  supportPlane:  u({ id: 'supportPlane', name: 'Support Plane', faction: /** @type {any} */ ('none'), line: AIR, cost: 0, hp: 200, armor: 'light', loco: 'air', speed: 6, sight: 3, requires: [], tags: ['support', 'noAutoAcquire', 'noRally'] }),
  navalTransport: u({ id: 'navalTransport', name: 'Naval Transport', faction: 'both', line: NAV, cost: 700, hp: 350, armor: 'heavy', loco: 'float', speed: 1.8, sight: 5, requires: ['navalyard'], capacity: 5, tags: ['transport', 'naval'] }),
});

/** Units summoned outside production (support powers), never buildable. */
export const SUPPORT_AIRCRAFT = Object.freeze({
  supportPlane: { id: 'supportPlane', name: 'Support Plane', hp: 200, armor: 'light', speed: 6 },
});
