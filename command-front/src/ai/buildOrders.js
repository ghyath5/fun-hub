// @ts-check
/**
 * AI build orders and attack waves (section 16), per
 * faction and difficulty. Change these tables to change how the AI plays;
 * the code only walks them.
 */

/**
 * Build order: each entry is a structure or defense type; repeated types
 * mean "own this many". `minDifficulty` entries are skipped below it, and
 * `naval` entries only when water connects the bases.
 * @typedef {{ type: string, minDifficulty?: 'normal' | 'hard', naval?: boolean }} BuildStep
 */

/** @type {Record<'coalition' | 'union', BuildStep[]>} */
export const BUILD_ORDER = Object.freeze({
  coalition: [
    { type: 'powerPlant' }, { type: 'barracks' }, { type: 'refinery' }, { type: 'powerPlant' }, { type: 'warFactory' },
    { type: 'refinery', minDifficulty: 'normal' }, { type: 'radarDome' }, { type: 'pillbox' }, { type: 'gunTurret' },
    { type: 'advPowerPlant' }, { type: 'serviceDepot' }, { type: 'techCenter' }, { type: 'airfield' },
    { type: 'navalYard', naval: true }, { type: 'helipad', minDifficulty: 'hard' }, { type: 'advPowerPlant' }, { type: 'phaseShifter', minDifficulty: 'normal' },
    { type: 'refinery', minDifficulty: 'hard' }, { type: 'gunTurret' }, { type: 'aaGun' }, { type: 'beamTower', minDifficulty: 'normal' },
    { type: 'oreProcessor', minDifficulty: 'normal' }, { type: 'longGun', minDifficulty: 'normal' }, { type: 'stormGenerator', minDifficulty: 'hard' },
  ],
  union: [
    { type: 'powerPlant' }, { type: 'barracks' }, { type: 'refinery' }, { type: 'powerPlant' }, { type: 'warFactory' },
    { type: 'refinery', minDifficulty: 'normal' }, { type: 'radarDome' }, { type: 'sentryGun' }, { type: 'flameTower' },
    { type: 'advPowerPlant' }, { type: 'serviceDepot' }, { type: 'techCenter' }, { type: 'subPen', naval: true }, { type: 'kennel' }, { type: 'airfield' },
    { type: 'advPowerPlant' }, { type: 'missileSilo', minDifficulty: 'normal' },
    { type: 'aegisProjector', minDifficulty: 'normal' }, { type: 'refinery', minDifficulty: 'hard' }, { type: 'samSite' }, { type: 'arcTower' },
    { type: 'industrialPlant', minDifficulty: 'normal' }, { type: 'sensorArray', minDifficulty: 'normal' }, { type: 'cloneLab', minDifficulty: 'hard' },
  ],
});

/** Attack-wave compositions: unit type → count. */
export const WAVES = Object.freeze({
  coalition: {
    beginner: { rifleman: 3, lightTank: 1 },
    easy: { lightTank: 2, rifleman: 4 },
    normal: { mediumTank: 3, ifv: 2, tankDestroyer: 1, robotTank: 1, artillery: 1, rifleman: 5, guardTrooper: 2 },
    hard: { mediumTank: 3, laserTank: 2, tankDestroyer: 2, mirageTank: 1, ifv: 2, salvoLauncher: 1, rifleman: 4, guardTrooper: 2, marksman: 1, chronoTrooper: 1, rocketeer: 2, attackHeli: 1, harrier: 1 },
  },
  union: {
    beginner: { rifleman: 3, flakTrack: 1 },
    easy: { heavyTank: 1, rifleman: 4, flameTrooper: 1 },
    normal: { heavyTank: 3, rotaryTank: 2, terrorDrone: 2, ballisticLauncher: 1, rifleman: 4, flakTrooper: 2, desolator: 1 },
    hard: { heavyTank: 3, arcTank: 2, titanTank: 1, rotaryTank: 2, terrorDrone: 2, ballisticLauncher: 1, shockTrooper: 2, desolator: 2, ivan: 1, rifleman: 3, siegeChopper: 1, migFighter: 1, siegeAirship: 1 },
  },
});

/** The fleet's make-up (unit type → share) when water links the bases. */
export const FLEETS = Object.freeze({
  coalition: { gunboat: 2, destroyer: 2, cruiser: 1 },
  union: { seaScorpion: 2, submarine: 1, dreadnought: 1 },
});

/** Cheap fast units for the early scout, best first. */
export const SCOUTS = Object.freeze(['ranger', 'hound', 'rifleman']);

/** Smallest wave worth sending (units). */
export const MIN_WAVE = 3;

/** Production lines the AI keeps busy with units, and how many items it queues ahead on each. */
export const UNIT_QUEUE_AHEAD = 2;

/** Credits the AI keeps for the next structure before spending on more units. */
export const STRUCTURE_RESERVE = 600;

/** Rank of each difficulty, for `minDifficulty`. */
export const DIFFICULTY_RANK = Object.freeze({ beginner: 0, easy: 1, normal: 2, hard: 3 });
