// @ts-check
/**
 * Warhead vs armour multipliers in percent (section 8).
 * @type {Record<import('../types.js').WarheadId, Record<import('../types.js').ArmorId, number>>}
 */
export const WARHEADS = {
  SA:          { none: 100, wood: 50,  light: 60,  heavy: 10,  concrete: 25 },
  HE:          { none: 90,  wood: 75,  light: 60,  heavy: 25,  concrete: 100 },
  AP:          { none: 50,  wood: 75,  light: 75,  heavy: 100, concrete: 50 },
  Fire:        { none: 90,  wood: 100, light: 60,  heavy: 25,  concrete: 50 },
  HollowPoint: { none: 100, wood: 5,   light: 5,   heavy: 5,   concrete: 5 },
  Arc:         { none: 100, wood: 100, light: 100, heavy: 100, concrete: 100 },
  Laser:       { none: 80,  wood: 100, light: 80,  heavy: 60,  concrete: 80 },
  Bite:        { none: 100, wood: 0,   light: 0,   heavy: 0,   concrete: 0 },
  // Radiation: deadly to infantry, little use against anything with armour.
  Rad:         { none: 140, wood: 15,  light: 25,  heavy: 10,  concrete: 10 },
  // Chrono ray: erases anything, buildings more slowly.
  Chrono:      { none: 100, wood: 70,  light: 100, heavy: 100, concrete: 50 },
  // Mind control: living crews only (no buildings); the weapon does no damage.
  Psi:         { none: 100, wood: 0,   light: 100, heavy: 100, concrete: 0 },
  // Terror Drone claws: vehicles (it climbs inside them) and infantry, never buildings.
  Drone:       { none: 100, wood: 0,   light: 100, heavy: 100, concrete: 0 },
};

/** Warheads whose damage prone infantry halve (section 9). */
export const PRONE_REDUCED = Object.freeze(['SA', 'HE', 'AP', 'Fire']);
