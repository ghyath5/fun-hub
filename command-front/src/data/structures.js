// @ts-check
/**
 * Structures, defenses and walls (section 7). Exits, docks and pads are cells
 * relative to the footprint's top-left cell; exits and docks sit just outside
 * the footprint, below its bottom-centre.
 */
import { WEAPONS } from './weapons.js';

/** @typedef {import('../types.js').StructureDef} StructureDef */

/** Sight of a non-defense structure, in cells. */
export const STRUCTURE_SIGHT = 4;

/** @type {Omit<StructureDef, 'id' | 'name' | 'role' | 'faction' | 'cost' | 'power' | 'hp' | 'w' | 'h' | 'requires'>} */
const DEFAULTS = {
  line: 'structures', armor: 'wood', sight: STRUCTURE_SIGHT, storage: 0, water: false,
  exit: null, dock: null, pad: null, weapon: null, powers: [], wall: false, capturable: true, tags: [],
};

/** @param {number} w @param {number} h */
const belowCentre = (w, h) => ({ x: Math.floor(w / 2), y: h });

/**
 * @param {Partial<StructureDef> & Pick<StructureDef, 'id' | 'name' | 'role' | 'faction' | 'cost' | 'power' | 'hp' | 'w' | 'h' | 'requires'>} p
 * @returns {StructureDef}
 */
function s(p) {
  const def = { ...DEFAULTS, ...p };
  if (def.line === 'defenses') {
    def.armor = 'concrete';
    def.capturable = false;
    def.sight = def.weapon ? Math.ceil(WEAPONS[def.weapon].range) + 1 : STRUCTURE_SIGHT;
  }
  return Object.freeze(def);
}

const DEF = /** @type {const} */ ('defenses');

/** @type {Record<string, StructureDef>} */
export const STRUCTURES = Object.freeze({
  constructionYard: s({ id: 'constructionYard', name: 'Construction Yard', role: 'yard', faction: 'both', cost: 0, power: 0, hp: 1000, w: 3, h: 3, requires: [], tags: ['fromMcv'] }),
  powerPlant:       s({ id: 'powerPlant', name: 'Power Plant', role: 'power', faction: 'both', cost: 300, power: 100, hp: 400, w: 2, h: 2, requires: ['yard'] }),
  advPowerPlant:    s({ id: 'advPowerPlant', name: 'Advanced Power Plant', role: 'power', faction: 'both', cost: 500, power: 200, hp: 700, w: 3, h: 3, requires: ['power'] }),
  refinery:         s({ id: 'refinery', name: 'Ore Refinery', role: 'refinery', faction: 'both', cost: 2000, power: -30, hp: 900, w: 3, h: 3, requires: ['power'], storage: 2000, dock: belowCentre(3, 3), tags: ['freeHarvester'] }),
  silo:             s({ id: 'silo', name: 'Ore Silo', role: 'silo', faction: 'both', cost: 150, power: -10, hp: 300, w: 1, h: 1, requires: ['refinery'], storage: 1500 }),
  barracks:         s({ id: 'barracks', name: 'Barracks', role: 'barracks', faction: 'both', cost: 300, power: -20, hp: 600, w: 2, h: 2, requires: ['power'], exit: belowCentre(2, 2) }),
  warFactory:       s({ id: 'warFactory', name: 'War Factory', role: 'factory', faction: 'both', cost: 2000, power: -30, hp: 1000, w: 3, h: 3, requires: ['refinery'], exit: belowCentre(3, 3) }),
  radarDome:        s({ id: 'radarDome', name: 'Radar Dome', role: 'radar', faction: 'both', cost: 1000, power: -40, hp: 1000, w: 2, h: 2, requires: ['refinery'], tags: ['radar'] }),
  serviceDepot:     s({ id: 'serviceDepot', name: 'Service Depot', role: 'depot', faction: 'both', cost: 1200, power: -30, hp: 800, w: 3, h: 3, requires: ['factory'], pad: { x: 1, y: 1 } }),
  techCenter:       s({ id: 'techCenter', name: 'Tech Center', role: 'tech', faction: 'both', cost: 1500, power: -200, hp: 600, w: 2, h: 2, requires: ['factory', 'radar'], powers: ['satelliteUplink'] }),
  kennel:           s({ id: 'kennel', name: 'Kennel', role: 'kennel', faction: 'union', cost: 200, power: -10, hp: 300, w: 1, h: 1, requires: ['barracks'], exit: { x: 0, y: 1 } }),
  helipad:          s({ id: 'helipad', name: 'Helipad', role: 'helipad', faction: 'coalition', cost: 1500, power: -10, hp: 800, w: 2, h: 2, requires: ['radar'], tags: ['pad'] }),
  airfield:         s({ id: 'airfield', name: 'Airfield', role: 'airfield', faction: 'union', cost: 600, power: -20, hp: 1000, w: 3, h: 2, requires: ['radar'], powers: ['spyPlane', 'paradrop'], tags: ['pad'] }),
  navalYard:        s({ id: 'navalYard', name: 'Naval Yard', role: 'navalyard', faction: 'coalition', cost: 650, power: -30, hp: 1000, w: 3, h: 3, requires: ['power'], water: true, exit: belowCentre(3, 3) }),
  subPen:           s({ id: 'subPen', name: 'Sub Pen', role: 'navalyard', faction: 'union', cost: 650, power: -30, hp: 1000, w: 3, h: 3, requires: ['power'], water: true, exit: belowCentre(3, 3) }),
  phaseShifter:     s({ id: 'phaseShifter', name: 'Phase Shifter', role: 'superA', faction: 'coalition', cost: 2800, power: -200, hp: 1000, w: 2, h: 2, requires: ['tech'], powers: ['phaseShift'], tags: ['limitOne'] }),
  aegisProjector:   s({ id: 'aegisProjector', name: 'Aegis Projector', role: 'superB', faction: 'union', cost: 2800, power: -200, hp: 1000, w: 2, h: 2, requires: ['tech'], powers: ['aegisField'], tags: ['limitOne'] }),
  missileSilo:      s({ id: 'missileSilo', name: 'Missile Silo', role: 'superC', faction: 'union', cost: 2500, power: -150, hp: 1000, w: 2, h: 1, requires: ['tech'], powers: ['atomicStrike'], tags: ['limitOne'] }),

  // Defenses and walls
  sandbagWall:      s({ id: 'sandbagWall', name: 'Sandbag Wall', role: 'wall', faction: 'both', line: DEF, cost: 25, power: 0, hp: 100, w: 1, h: 1, requires: ['yard'], wall: true, tags: ['crushable'] }),
  concreteWall:     s({ id: 'concreteWall', name: 'Concrete Wall', role: 'wall', faction: 'both', line: DEF, cost: 100, power: 0, hp: 400, w: 1, h: 1, requires: ['factory'], wall: true }),
  pillbox:          s({ id: 'pillbox', name: 'Pillbox', role: 'defense', faction: 'coalition', line: DEF, cost: 400, power: -15, hp: 400, w: 1, h: 1, requires: ['barracks'], weapon: 'pillboxMg' }),
  camoPillbox:      s({ id: 'camoPillbox', name: 'Camo Pillbox', role: 'defense', faction: 'coalition', line: DEF, cost: 600, power: -15, hp: 400, w: 1, h: 1, requires: ['radar'], weapon: 'pillboxMg', tags: ['camo'] }),
  gunTurret:        s({ id: 'gunTurret', name: 'Gun Turret', role: 'defense', faction: 'coalition', line: DEF, cost: 600, power: -40, hp: 400, w: 1, h: 1, requires: ['factory'], weapon: 'turretCannon', tags: ['turret'] }),
  aaGun:            s({ id: 'aaGun', name: 'AA Gun', role: 'defense', faction: 'coalition', line: DEF, cost: 600, power: -50, hp: 400, w: 1, h: 1, requires: ['radar'], weapon: 'flak', tags: ['powered'] }),
  beamTower:        s({ id: 'beamTower', name: 'Beam Tower', role: 'defense', faction: 'coalition', line: DEF, cost: 1500, power: -75, hp: 500, w: 1, h: 1, requires: ['factory'], weapon: 'towerBeam', tags: ['powered'] }),
  shroudGenerator:  s({ id: 'shroudGenerator', name: 'Shroud Generator', role: 'defense', faction: 'coalition', line: DEF, cost: 500, power: -60, hp: 500, w: 1, h: 1, requires: ['tech'], tags: ['powered', 'shroudGen'] }),
  flameTower:       s({ id: 'flameTower', name: 'Flame Tower', role: 'defense', faction: 'union', line: DEF, cost: 600, power: -15, hp: 400, w: 1, h: 1, requires: ['barracks'], weapon: 'towerFlame' }),
  arcTower:         s({ id: 'arcTower', name: 'Arc Tower', role: 'defense', faction: 'union', line: DEF, cost: 1500, power: -150, hp: 400, w: 1, h: 1, requires: ['factory'], weapon: 'arcBolt', tags: ['powered'] }),
  sentryGun:        s({ id: 'sentryGun', name: 'Sentry Gun', role: 'defense', faction: 'union', line: DEF, cost: 500, power: -15, hp: 400, w: 1, h: 1, requires: ['barracks'], weapon: 'sentryMg', tags: ['turret'] }),
  samSite:          s({ id: 'samSite', name: 'SAM Site', role: 'defense', faction: 'union', line: DEF, cost: 750, power: -20, hp: 400, w: 2, h: 1, requires: ['radar'], weapon: 'sam', tags: ['powered'] }),
});

/** Neutral structures that may appear on maps (capturable by Engineers unless noted). */
const neutral = (/** @type {any} */ p) => Object.freeze({
  line: 'structures', role: 'neutral', faction: 'both', cost: 0, power: 0, storage: 0, sight: 0, requires: [], water: false,
  exit: null, dock: null, pad: null, weapon: null, powers: [], wall: false, capturable: true, armor: 'wood', mine: null, ...p, tags: ['neutral', ...(p.tags ?? [])],
});
export const NEUTRAL = Object.freeze({
  'civilian-house': neutral({ id: 'civilian-house', name: 'Civilian House', hp: 400, w: 1, h: 1 }),
  bridgeHut: neutral({ id: 'bridgeHut', name: 'Bridge Repair Hut', hp: 500, w: 1, h: 1, armor: 'concrete', capturable: false, tags: ['hut', 'invulnerable'] }),
  // Mines sit in the middle of resource fields and regrow them for the whole match (sim/systems/ore.js).
  oreMine: neutral({ id: 'oreMine', name: 'Ore Mine', hp: 1000, w: 1, h: 1, armor: 'concrete', capturable: false, mine: 'ore', tags: ['mine', 'invulnerable'] }),
  gemMine: neutral({ id: 'gemMine', name: 'Gem Mine', hp: 1000, w: 1, h: 1, armor: 'concrete', capturable: false, mine: 'gem', tags: ['mine', 'invulnerable'] }),
});
