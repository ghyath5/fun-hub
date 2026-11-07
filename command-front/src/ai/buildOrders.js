// @ts-check
/**
 * Build orders (section 16), per faction and playstyle. Change these tables
 * to change how the computer builds; the code only walks them. Every order
 * opens the same way and then follows its style: a rusher gets its army and
 * repairs going first, a turtle walls itself in with guns and races to its
 * superweapon, a raider gets aircraft and fast units early.
 *
 * Repeated types mean "own this many". Refineries beyond what its skill
 * keeps running, and towers beyond what its style builds, are skipped;
 * `naval` steps only count when water links its base to an enemy's.
 */

/** @typedef {{ type: string, naval?: boolean }} BuildStep */
/** @typedef {'balanced' | 'rusher' | 'turtle' | 'raider'} StyleId */

/** Openings: a rusher gets its factories up first; the others take a second refinery (and its free Harvester) early. */
const RUSH = ['powerPlant', 'barracks', 'refinery', 'powerPlant', 'warFactory'];
const ECONOMY = ['powerPlant', 'refinery', 'barracks', 'powerPlant', 'warFactory', 'refinery'];
const navy = (/** @type {string} */ type) => ({ type, naval: true });

/** @type {Record<'coalition' | 'union', Record<StyleId, (string | BuildStep)[]>>} */
const PLANS = {
  coalition: {
    balanced: [...ECONOMY, 'radarDome', 'pillbox', 'refinery', 'gunTurret', 'advPowerPlant', 'serviceDepot', 'techCenter', 'airfield',
      navy('navalYard'), 'helipad', 'advPowerPlant', 'phaseShifter', 'gunTurret', 'aaGun', 'beamTower', 'oreProcessor', 'longGun', 'stormGenerator'],
    rusher: [...RUSH, 'radarDome', 'serviceDepot', 'refinery', 'pillbox', 'advPowerPlant', 'airfield', 'helipad', 'techCenter',
      navy('navalYard'), 'refinery', 'gunTurret', 'aaGun', 'advPowerPlant', 'phaseShifter', 'oreProcessor', 'stormGenerator'],
    turtle: ['powerPlant', 'refinery', 'barracks', 'pillbox', 'powerPlant', 'warFactory', 'refinery', 'gunTurret', 'radarDome', 'gunTurret', 'aaGun',
      'advPowerPlant', 'techCenter', navy('navalYard'), 'beamTower', 'serviceDepot', 'phaseShifter', 'oreProcessor', 'longGun', 'advPowerPlant', 'beamTower',
      'stormGenerator', 'airfield', 'refinery', 'aaGun', 'longGun', 'pillbox'],
    raider: [...ECONOMY, 'radarDome', 'refinery', 'airfield', 'serviceDepot', 'helipad', 'pillbox', 'advPowerPlant', 'techCenter',
      navy('navalYard'), 'gunTurret', 'aaGun', 'phaseShifter', 'advPowerPlant', 'oreProcessor', 'stormGenerator'],
  },
  union: {
    balanced: [...ECONOMY, 'radarDome', 'sentryGun', 'refinery', 'flameTower', 'advPowerPlant', 'serviceDepot', 'techCenter', navy('subPen'),
      'kennel', 'airfield', 'advPowerPlant', 'missileSilo', 'aegisProjector', 'samSite', 'arcTower', 'industrialPlant', 'sensorArray', 'cloneLab'],
    rusher: [...RUSH, 'kennel', 'radarDome', 'serviceDepot', 'refinery', 'sentryGun', 'advPowerPlant', 'airfield', 'techCenter',
      navy('subPen'), 'refinery', 'flameTower', 'samSite', 'aegisProjector', 'advPowerPlant', 'industrialPlant', 'missileSilo'],
    turtle: ['powerPlant', 'refinery', 'barracks', 'sentryGun', 'powerPlant', 'warFactory', 'refinery', 'flameTower', 'radarDome', 'flameTower', 'samSite',
      'advPowerPlant', 'techCenter', navy('subPen'), 'arcTower', 'serviceDepot', 'aegisProjector', 'sensorArray', 'missileSilo', 'advPowerPlant', 'arcTower',
      'industrialPlant', 'airfield', 'refinery', 'samSite', 'cloneLab', 'sentryGun'],
    raider: [...ECONOMY, 'kennel', 'radarDome', 'refinery', 'airfield', 'serviceDepot', 'sentryGun', 'advPowerPlant', 'techCenter',
      navy('subPen'), 'flameTower', 'samSite', 'aegisProjector', 'advPowerPlant', 'sensorArray', 'missileSilo', 'industrialPlant'],
  },
};

/** @type {Readonly<Record<'coalition' | 'union', Readonly<Record<StyleId, readonly BuildStep[]>>>>} */
export const BUILD_ORDER = /** @type {any} */ (Object.freeze(Object.fromEntries(Object.entries(PLANS).map(([faction, styles]) => [faction,
  Object.freeze(Object.fromEntries(Object.entries(styles).map(([style, steps]) => [style,
    Object.freeze(steps.map((s) => Object.freeze(typeof s === 'string' ? { type: s } : s)))]))),
]))));

/** The fleet's make-up (unit type → share) when water links the bases. */
export const FLEETS = Object.freeze({
  coalition: { gunboat: 2, destroyer: 2, cruiser: 1 },
  union: { seaScorpion: 2, submarine: 1, dreadnought: 1 },
});

/** Cheap fast units for scouting, best first. */
export const SCOUTS = Object.freeze(['ranger', 'hound', 'terrorDrone', 'ifv', 'rifleman']);

/** Production lines the AI keeps busy with units, and how many items it queues ahead on each. */
export const UNIT_QUEUE_AHEAD = 2;

/** Credits the AI keeps for the next structure before spending on more units. */
export const STRUCTURE_RESERVE = 600;
