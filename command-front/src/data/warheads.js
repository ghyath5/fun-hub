// @ts-check
/**
 * Warhead vs armour multipliers in percent (section 8).
 * @type {Record<import('../types.js').WarheadId, Record<import('../types.js').ArmorId, number>>}
 */
export const WARHEADS = {
  SA:          { none: 100, wood: 50,  light: 60,  heavy: 25,  concrete: 25 },
  HE:          { none: 90,  wood: 75,  light: 60,  heavy: 25,  concrete: 100 },
  AP:          { none: 30,  wood: 75,  light: 75,  heavy: 100, concrete: 50 },
  Fire:        { none: 90,  wood: 100, light: 60,  heavy: 25,  concrete: 50 },
  HollowPoint: { none: 100, wood: 5,   light: 5,   heavy: 5,   concrete: 5 },
  Arc:         { none: 100, wood: 100, light: 100, heavy: 100, concrete: 100 },
  Bite:        { none: 100, wood: 0,   light: 0,   heavy: 0,   concrete: 0 },
};

/** Warheads whose damage prone infantry halve (section 9). */
export const PRONE_REDUCED = Object.freeze(['SA', 'HE', 'AP', 'Fire']);
