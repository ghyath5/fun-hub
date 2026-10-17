// @ts-check
/**
 * Terrain types (section 4). Speeds are percentages per locomotor; null means
 * impassable. Ore and gems are a resource overlay on Clear ground; a cell
 * holding resources uses the `ore` row for speed and buildability.
 */

/** @typedef {{foot: number|null, wheel: number|null, track: number|null, float: number|null}} SpeedRow */

/**
 * @typedef {object} TerrainDef
 * @property {number} index
 * @property {string} id
 * @property {string} name
 * @property {SpeedRow} speed
 * @property {boolean} buildable
 * @property {number} hp          Destructible terrain only (trees, bridges)
 * @property {import('../types.js').ArmorId | null} armor
 * @property {string} color       Base colour used by the terrain baker
 */

/** @type {TerrainDef[]} */
export const TERRAIN = [
  { index: 0, id: 'clear', name: 'Clear', speed: { foot: 100, wheel: 100, track: 100, float: null }, buildable: true, hp: 0, armor: null, color: '#6f7a44' },
  { index: 1, id: 'road', name: 'Road', speed: { foot: 100, wheel: 120, track: 110, float: null }, buildable: true, hp: 0, armor: null, color: '#8a8070' },
  { index: 2, id: 'rough', name: 'Rough', speed: { foot: 80, wheel: 60, track: 70, float: null }, buildable: false, hp: 0, armor: null, color: '#7c6f48' },
  { index: 3, id: 'beach', name: 'Beach', speed: { foot: 80, wheel: 60, track: 70, float: null }, buildable: false, hp: 0, armor: null, color: '#c8b27a' },
  { index: 4, id: 'water', name: 'Water', speed: { foot: null, wheel: null, track: null, float: 100 }, buildable: false, hp: 0, armor: null, color: '#2e5468' },
  { index: 5, id: 'rock', name: 'Rock / Cliff', speed: { foot: null, wheel: null, track: null, float: null }, buildable: false, hp: 0, armor: null, color: '#5b5249' },
  { index: 6, id: 'tree', name: 'Tree', speed: { foot: null, wheel: null, track: null, float: null }, buildable: false, hp: 300, armor: 'wood', color: '#3f5a2c' },
  { index: 7, id: 'bridge', name: 'Bridge', speed: { foot: 100, wheel: 100, track: 100, float: null }, buildable: false, hp: 1000, armor: 'concrete', color: '#7d6a55' },
  { index: 8, id: 'rubble', name: 'Rubble', speed: { foot: 80, wheel: 70, track: 80, float: null }, buildable: true, hp: 0, armor: null, color: '#6a6250' },
  { index: 9, id: 'crater', name: 'Crater', speed: { foot: 90, wheel: 80, track: 90, float: null }, buildable: true, hp: 0, armor: null, color: '#4e4a3c' },
];

/** Speed and buildability for a Clear cell carrying ore or gems. */
export const ORE_ROW = { speed: { foot: 90, wheel: 70, track: 90, float: null }, buildable: true };

/** Map index by id, for readable code: T.clear === 0. */
export const T = Object.freeze(Object.fromEntries(TERRAIN.map((t) => [t.id, t.index])));

/**
 * Authoring codes (section 17). `res` marks a resource overlay; digits are
 * start markers drawn as Clear (start cells themselves come from `starts`).
 */
export const AUTHORING_CODES = Object.freeze({
  '.': { terrain: 'clear' },
  ',': { terrain: 'rough' },
  '=': { terrain: 'road' },
  '~': { terrain: 'water' },
  'b': { terrain: 'beach' },
  '^': { terrain: 'rock' },
  'T': { terrain: 'tree' },
  'o': { terrain: 'clear', res: 'ore' },
  '*': { terrain: 'clear', res: 'gem' },
  'H': { terrain: 'bridge' },
  '1': { terrain: 'clear' },
  '2': { terrain: 'clear' },
  '3': { terrain: 'clear' },
  '4': { terrain: 'clear' },
});

/** Seconds rubble stays before turning back to Clear. */
export const RUBBLE_SECONDS = 30;
