// @ts-check
/**
 * Seeded map generator (section 17). The same seed and settings always give
 * the same map. One sector is authored — half the map for 2 players (180°
 * rotation), a quarter for 4 (mirrored on both axes) — by working only in
 * "canonical" cells and copying every other cell from its canonical twin, so
 * the result is symmetric by construction.
 *
 * Feature counts scale with the map's area, so a big map is a bigger
 * battlefield rather than the same few features stretched out.
 *
 * 1. Base terrain from simplex noise: Clear, patches of Rough, tree clusters.
 * 2. Rock ridges as random walks, broken by gaps of 3+ cells (passes).
 * 3. Optional lakes with beaches (naval-capable when large enough).
 * 4. Ore fields, each round a mine that regrows it: a home field beside each
 *    start, expansion fields spread over the map, gems in the centre.
 * 5. Validate; on failure try the next seed, up to 20 times, then fall back to Duel Canyon.
 */
import { createRng } from '../lib/rng.js';
import { createNoise } from '../lib/noise.js';
import { parseMap } from './loader.js';
import { validateMap, VALIDATION } from './validator.js';
import { componentsFor } from './grid.js';
import { ECONOMY } from '../data/rules.js';

/** @typedef {import('../types.js').MapData} MapData */

export const GENERATOR = Object.freeze({
  /** Square sizes on offer, with their names in the setup screen. */
  sizes: Object.freeze([
    { size: 48, name: 'Small' },
    { size: 64, name: 'Medium' },
    { size: 96, name: 'Large' },
    { size: 128, name: 'Huge' },
    { size: 160, name: 'Giant' },
  ]),
  /** Smallest size with room for four bases. */
  minSizeFor4: 64,
  maxTries: 20,
  oreBales: ECONOMY.oreCellMax,
  gemBales: ECONOMY.gemCellMax,
  /** One expansion ore field per this many cells of a sector. */
  cellsPerField: 1100,
  /** Field centres (and their mirror images) stay at least this far apart. */
  fieldSpacing: 10,
  homeFieldRadius: 3,
  fieldRadius: [2.2, 3.4],
  gemFieldRadius: 1.6,
});

/** Mine markers in the authoring grid; they become neutral mine structures on Clear ground. */
const MINE_CODES = Object.freeze({ M: 'oreMine', G: 'gemMine' });

/**
 * @typedef {object} GenOptions
 * @property {number} seed
 * @property {number} size     one of GENERATOR.sizes
 * @property {2 | 4} players
 */

/** Player count a generated map supports at a size. @param {number} size @param {number} [wanted] */
export function playersForSize(size, wanted = 2) {
  return wanted === 4 && size >= GENERATOR.minSizeFor4 ? 4 : 2;
}

/** Canonical twin of a cell under the map's symmetry. @param {number} N @param {2 | 4} players */
function canonOf(N, players) {
  if (players === 4) return (/** @type {number} */ x, /** @type {number} */ y) => [Math.min(x, N - 1 - x), Math.min(y, N - 1 - y)];
  return (/** @type {number} */ x, /** @type {number} */ y) => {
    const s = x + y;
    if (s < N - 1 || (s === N - 1 && x <= y)) return [x, y];
    return [N - 1 - x, N - 1 - y];
  };
}

/** Every symmetric copy of a cell (including itself). @param {number} N @param {2 | 4} players */
function imagesOf(N, players) {
  return (/** @type {number} */ x, /** @type {number} */ y) => (players === 4
    ? [[x, y], [N - 1 - x, y], [x, N - 1 - y], [N - 1 - x, N - 1 - y]]
    : [[x, y], [N - 1 - x, N - 1 - y]]);
}

/** Start positions for a size and player count. @param {number} N @param {2 | 4} players */
function startsFor(N, players) {
  const s = Math.max(8, Math.round(N * 0.16));
  const far = N - 1 - s;
  return players === 4
    ? [{ x: s, y: s }, { x: far, y: s }, { x: s, y: far }, { x: far, y: far }]
    : [{ x: s, y: s }, { x: far, y: far }];
}

/**
 * One attempt with one seed. Returns the map document (not yet validated).
 * @param {GenOptions} o
 */
export function generateDoc(o) {
  const N = o.size;
  const players = /** @type {2 | 4} */ (playersForSize(N, o.players));
  const rng = createRng(`map:${o.seed}:${N}:${players}`);
  const noise = createNoise(rng);
  const trees = createNoise(rng);
  const blob = createNoise(rng);
  const canon = canonOf(N, players);
  const images = imagesOf(N, players);
  /** Feature multiplier: 1 up to 64 cells, growing with the map's side. */
  const scale = Math.max(1, Math.round(N / 64));
  /** Codes of canonical cells (full grid; only canonical cells are authored). */
  const g = Array.from({ length: N }, () => new Array(N).fill('.'));
  const starts = startsFor(N, players);
  const home = starts[0];
  const centre = (N - 1) / 2;
  const R = VALIDATION.baseArea / 2; // the base square reaches 6 cells from its start
  const inBase = (/** @type {number} */ x, /** @type {number} */ y, margin = 1) => starts.some((s) => Math.abs(x - s.x) <= R + margin && Math.abs(y - s.y) <= R + margin);
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => x > 0 && y > 0 && x < N - 1 && y < N - 1;
  const set = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ ch) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const [cx, cy] = canon(x, y);
    g[cy][cx] = ch;
  };
  const get = (/** @type {number} */ x, /** @type {number} */ y) => { const [cx, cy] = canon(x, y); return g[cy][cx]; };

  // 1. Noise: rough patches and tree clusters.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const [cx, cy] = canon(x, y);
      if (cx !== x || cy !== y) continue;
      const n = noise(x / 9, y / 9);
      const t = trees(x / 6 + 50, y / 6 + 50);
      if (t > 0.62) g[y][x] = 'T';
      else if (n > 0.55) g[y][x] = ',';
    }
  }

  // 2. Rock ridges: random walks broken into segments, leaving passes 3+ wide.
  const ridges = (1 + rng.int(3)) * scale;
  for (let r = 0; r < ridges; r++) {
    let x = Math.round(centre + (rng.int(N) - N / 2) * 0.6);
    let y = Math.round(centre + (rng.int(N) - N / 2) * 0.6);
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let [dx, dy] = dirs[rng.int(dirs.length)];
    const length = Math.round(Math.min(N, 64) * 0.45 + rng.int(Math.max(1, N - 64)) * 0.3);
    let run = 0;
    for (let k = 0; k < length; k++) {
      if (run >= 6 + rng.int(5)) {
        // A pass: skip 3–5 cells.
        const gap = 3 + rng.int(3);
        x += dx * gap; y += dy * gap; k += gap; run = 0;
        continue;
      }
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) break;
      if (!inBase(x, y)) { set(x, y, '^'); if (dx && dy) set(x + 1, y, '^'); }
      run++;
      x += dx; y += dy;
      if (rng.int(5) === 0) { // wander a little
        const turn = dirs[rng.int(dirs.length)];
        if (turn[0] !== -dx || turn[1] !== -dy) [dx, dy] = turn;
      }
    }
  }

  // 3. Lakes with a beach rim (sometimes): near the line between home and centre, more anywhere on big maps.
  const lake = (/** @type {number} */ lx, /** @type {number} */ ly, /** @type {number} */ r) => {
    for (let y = ly - r - 1; y <= ly + r + 1; y++) {
      for (let x = lx - r - 1; x <= lx + r + 1; x++) {
        if (!inside(x, y) || inBase(x, y)) continue;
        const d2 = (x - lx) ** 2 + (y - ly) ** 2;
        if (d2 <= r * r) set(x, y, '~');
        else if (d2 <= (r + 1) * (r + 1) && get(x, y) !== '~') set(x, y, 'b');
      }
    }
  };
  const lakes = N >= 64 ? rng.int(3) : rng.int(2);
  for (let k = 0; k < lakes; k++) {
    const lx = Math.round(home.x + (centre - home.x) * (0.45 + rng.int(30) / 100)) + rng.int(7) - 3;
    const ly = Math.round(home.y + (centre - home.y) * (0.2 + rng.int(60) / 100)) + rng.int(7) - 3;
    lake(lx, ly, 2 + rng.int(N >= 64 ? 3 : 2));
  }
  for (let k = 0; k < (scale - 1) * 2; k++) {
    const lx = 4 + rng.int(N - 8);
    const ly = 4 + rng.int(N - 8);
    if (!inBase(lx, ly, 6)) lake(lx, ly, 2 + rng.int(4));
  }

  // 4. Ore fields, each round a mine. A field is a ragged disc; it overwrites
  //    open ground, rough and trees but never rock, water or a base.
  /** @type {number[][]} */
  const centres = [];
  const field = (/** @type {number} */ fx, /** @type {number} */ fy, /** @type {number} */ r, /** @type {'o' | '*'} */ ch) => {
    for (let y = Math.floor(fy - r - 1); y <= Math.ceil(fy + r + 1); y++) {
      for (let x = Math.floor(fx - r - 1); x <= Math.ceil(fx + r + 1); x++) {
        if (!inside(x, y) || inBase(x, y, 0)) continue;
        const d = Math.hypot(x - fx, y - fy) + (blob(x / 3, y / 3) - 0.5) * 1.2;
        if (d > r) continue;
        const was = get(x, y);
        if (was === '.' || was === ',' || was === 'T' || was === 'o') set(x, y, ch);
      }
    }
    set(Math.round(fx), Math.round(fy), ch === '*' ? 'G' : 'M');
    for (const c of images(Math.round(fx), Math.round(fy))) centres.push(c);
  };
  /** Can a field centre go here (open ground, clear of bases and of other fields and their images)? */
  const roomFor = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (!inside(x, y) || x < 3 || y < 3 || x > N - 4 || y > N - 4 || inBase(x, y, 4)) return false;
    const was = get(x, y);
    if (was === '~' || was === 'b' || was === '^') return false;
    if (images(x, y).some(([ix, iy], k) => k > 0 && Math.hypot(ix - x, iy - y) < GENERATOR.fieldSpacing)) return false;
    return centres.every(([cx, cy]) => Math.hypot(cx - x, cy - y) >= GENERATOR.fieldSpacing);
  };

  // Home field: just outside the base square, toward the centre on one axis.
  const towardX = Math.sign(centre - home.x) || 1;
  const towardY = Math.sign(centre - home.y) || 1;
  const side = rng.int(2);
  const hr = GENERATOR.homeFieldRadius;
  const reach = R + hr;
  if (side === 0) field(home.x + towardX * reach, home.y + rng.int(3) - 1, hr, 'o');
  else field(home.x + rng.int(3) - 1, home.y + towardY * reach, hr, 'o');
  // Gems near the centre: a pair across it (2 players) or a ring of four (4 players).
  if (players === 4) field(Math.round(centre - 4), Math.round(centre - 4), GENERATOR.gemFieldRadius, '*');
  else field(Math.round(centre - 3), Math.round(centre + 3), GENERATOR.gemFieldRadius, '*');
  // Expansion fields spread over the sector, more on bigger maps.
  const sectorCells = (N * N) / players;
  const wanted = Math.max(1, Math.round(sectorCells / GENERATOR.cellsPerField));
  let placed = 0;
  for (let attempt = 0; attempt < wanted * 30 && placed < wanted; attempt++) {
    const x = 3 + rng.int(N - 6);
    const y = 3 + rng.int(N - 6);
    if (!roomFor(x, y)) continue;
    const [lo, hi] = GENERATOR.fieldRadius;
    field(x, y, lo + (rng.int(100) / 100) * (hi - lo), 'o');
    placed++;
  }
  // A few more gem fields on the biggest maps.
  for (let k = 0, attempt = 0; k < scale - 1 && attempt < 60; attempt++) {
    const x = 3 + rng.int(N - 6);
    const y = 3 + rng.int(N - 6);
    if (!roomFor(x, y)) continue;
    field(x, y, GENERATOR.gemFieldRadius, '*');
    k++;
  }

  // Clear every base square last.
  for (const s of starts) for (let y = s.y - R; y <= s.y + R; y++) for (let x = s.x - R; x <= s.x + R; x++) if (x >= 0 && y >= 0 && x < N && y < N) set(x, y, '.');

  /** Rows for the map file: a mine marker is Clear ground under its structure. */
  const rows = () => Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
    const ch = get(x, y);
    return ch in MINE_CODES ? '.' : ch;
  }).join(''));
  // Fill tiny enclosed land pockets (trees and rocks can wall a few cells in) with rock.
  const probe = parseMap({ width: N, height: N, terrain: rows(), starts, schematicBales: { ore: GENERATOR.oreBales, gem: GENERATOR.gemBales } });
  const { ids, sizes } = componentsFor(probe, 'track');
  const main = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] >= 0 && ids[i] !== main && sizes[ids[i]] < VALIDATION.minPocketCells) set(i % N, Math.floor(i / N), '^');
  }

  /** @type {{ type: string, x: number, y: number }[]} */
  const neutral = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const type = MINE_CODES[/** @type {keyof typeof MINE_CODES} */ (get(x, y))];
      if (type) neutral.push({ type, x, y });
    }
  }
  const name = GENERATOR.sizes.find((s) => s.size === N)?.name ?? `${N}`;
  return {
    id: `generated-${N}-${players}-${o.seed}`,
    name: `${name} ${N}×${N} #${o.seed}`,
    version: 1,
    width: N,
    height: N,
    maxPlayers: players,
    theme: 'temperate',
    schematicBales: { ore: GENERATOR.oreBales, gem: GENERATOR.gemBales },
    terrain: rows(),
    ore: [],
    gems: [],
    starts,
    bridges: [],
    neutral,
  };
}

/**
 * A valid generated map, or null when 20 seeds in a row fail (the caller falls back to Duel Canyon).
 * @param {GenOptions} o
 * @returns {{ map: MapData, seed: number, tries: number } | null}
 */
export function generateMap(o) {
  for (let k = 0; k < GENERATOR.maxTries; k++) {
    const seed = o.seed + k;
    const map = parseMap(generateDoc({ ...o, seed }));
    if (validateMap(map).ok) return { map, seed, tries: k + 1 };
  }
  return null;
}
