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
    { type: 'advPowerPlant' }, { type: 'serviceDepot' }, { type: 'techCenter' }, { type: 'helipad' },
    { type: 'navalYard', naval: true }, { type: 'advPowerPlant' }, { type: 'phaseShifter', minDifficulty: 'normal' },
    { type: 'refinery', minDifficulty: 'hard' }, { type: 'gunTurret' }, { type: 'aaGun' },
  ],
  union: [
    { type: 'powerPlant' }, { type: 'barracks' }, { type: 'refinery' }, { type: 'powerPlant' }, { type: 'warFactory' },
    { type: 'refinery', minDifficulty: 'normal' }, { type: 'radarDome' }, { type: 'flameTower' }, { type: 'flameTower' },
    { type: 'advPowerPlant' }, { type: 'serviceDepot' }, { type: 'techCenter' }, { type: 'kennel' }, { type: 'airfield' },
    { type: 'subPen', naval: true }, { type: 'advPowerPlant' }, { type: 'missileSilo', minDifficulty: 'normal' },
    { type: 'aegisProjector', minDifficulty: 'normal' }, { type: 'refinery', minDifficulty: 'hard' }, { type: 'samSite' }, { type: 'arcTower' },
  ],
});

/** Attack-wave compositions: unit type → count. */
export const WAVES = Object.freeze({
  coalition: {
    easy: { lightTank: 2, rifleman: 4 },
    normal: { mediumTank: 4, lightTank: 2, artillery: 2, rifleman: 6 },
    hard: { mediumTank: 5, lightTank: 2, artillery: 3, rifleman: 6, rocketTrooper: 2, attackHeli: 1 },
  },
  union: {
    easy: { heavyTank: 2, rifleman: 4 },
    normal: { heavyTank: 4, ballisticLauncher: 2, rifleman: 6, rocketTrooper: 2 },
    hard: { heavyTank: 5, titanTank: 1, ballisticLauncher: 2, rifleman: 6, rocketTrooper: 3, flameTrooper: 2 },
  },
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
export const DIFFICULTY_RANK = Object.freeze({ easy: 0, normal: 1, hard: 2 });
