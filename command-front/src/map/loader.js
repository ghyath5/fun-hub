// @ts-check
/**
 * Map loading (section 17). A map file stores terrain either as full-size
 * `terrain` strings or as a `schematic` with a `schematicScale` (one character
 * per block). Both are parsed here at load; there is no conversion step.
 */
import { AUTHORING_CODES, T } from '../data/terrain.js';
import { ECONOMY } from '../data/rules.js';

/** @typedef {import('../types.js').MapData} MapData */

export class MapFormatError extends Error {}

/** @param {object} doc @returns {string[]} full-resolution rows */
function expandRows(/** @type {any} */ doc) {
  if (Array.isArray(doc.terrain) && doc.terrain.length) return doc.terrain;
  const s = doc.schematicScale | 0;
  if (!Array.isArray(doc.schematic) || s < 1) throw new MapFormatError('Map has neither "terrain" rows nor a "schematic" with "schematicScale".');
  const rows = [];
  for (const line of doc.schematic) {
    const wide = [...line].map((ch) => ch.repeat(s)).join('');
    for (let k = 0; k < s; k++) rows.push(wide);
  }
  return rows;
}

/**
 * @param {any} doc  Parsed JSON
 * @returns {MapData}
 */
export function parseMap(doc) {
  const { width, height } = doc;
  if (!(width > 0 && height > 0)) throw new MapFormatError('Map width and height must be positive.');
  const rows = expandRows(doc);
  if (rows.length !== height) throw new MapFormatError(`Map has ${rows.length} rows, expected ${height}.`);

  const terrain = new Uint8Array(width * height);
  const bales = new Uint8Array(width * height);
  const gem = new Uint8Array(width * height);
  const defaultBales = {
    ore: doc.schematicBales?.ore ?? ECONOMY.oreCellMax,
    gem: doc.schematicBales?.gem ?? ECONOMY.gemCellMax,
  };

  rows.forEach((row, y) => {
    if (row.length !== width) throw new MapFormatError(`Row ${y} has ${row.length} cells, expected ${width}.`);
    for (let x = 0; x < width; x++) {
      const code = /** @type {keyof typeof AUTHORING_CODES} */ (row[x]);
      const def = AUTHORING_CODES[code];
      if (!def) throw new MapFormatError(`Unknown terrain code "${row[x]}" at (${x}, ${y}).`);
      const i = y * width + x;
      terrain[i] = T[def.terrain];
      if ('res' in def && def.res) {
        const isGem = def.res === 'gem';
        gem[i] = isGem ? 1 : 0;
        bales[i] = isGem ? defaultBales.gem : defaultBales.ore;
      }
    }
  });

  /** @param {any[] | undefined} rects @param {boolean} isGem */
  const stamp = (rects, isGem) => {
    for (const r of rects ?? []) {
      const max = isGem ? ECONOMY.gemCellMax : ECONOMY.oreCellMax;
      const n = Math.min(max, r.bales ?? max);
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) throw new MapFormatError(`Resource field at (${r.x}, ${r.y}) runs off the map.`);
          const i = y * width + x;
          terrain[i] = T.clear;
          bales[i] = n;
          gem[i] = isGem ? 1 : 0;
        }
      }
    }
  };
  stamp(doc.ore, false);
  stamp(doc.gems, true);

  for (const b of doc.bridges ?? []) for (const [x, y] of b.cells) terrain[y * width + x] = T.bridge;

  const starts = (doc.starts ?? []).map((/** @type {any} */ p) => ({ x: p.x | 0, y: p.y | 0 }));
  if (starts.length < 2) throw new MapFormatError('Map needs at least 2 start positions.');

  return {
    id: String(doc.id),
    name: String(doc.name ?? doc.id),
    width,
    height,
    maxPlayers: doc.maxPlayers ?? starts.length,
    theme: doc.theme ?? 'temperate',
    terrain,
    bales,
    gem,
    starts,
    bridges: doc.bridges ?? [],
    neutral: doc.neutral ?? [],
  };
}

/** Fetch and parse a bundled map. @param {string} id @param {string} [base] */
export async function loadMap(id, base = './maps/') {
  const res = await fetch(`${base}${id}.json`);
  if (!res.ok) throw new MapFormatError(`Map "${id}" not found (${res.status}).`);
  return parseMap(await res.json());
}

export const BUNDLED_MAPS = Object.freeze(['duel-canyon', 'twin-rivers', 'crossroads']);
