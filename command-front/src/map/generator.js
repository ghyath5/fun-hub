// @ts-check
/**
 * Seeded map generator (section 17). The same seed and settings always give
 * the same map. One sector is authored — half the map for 2 players (180°
 * rotation), a quarter for 4 (mirrored on both axes) — by working only in
 * "canonical" cells and copying every other cell from its canonical twin, so
 * the result is symmetric by construction.
 *
 * 1. Base terrain from simplex noise: Clear, patches of Rough, tree clusters.
 * 2. 1–3 rock ridges as random walks, broken by gaps of 3+ cells (passes).
 * 3. Optional lakes with beaches (naval-capable when large enough).
 * 4. Home ore 6–10 cells from each start, an expansion field per side, gems near the centre.
 * 5. Validate; on failure try the next seed, up to 20 times, then fall back to Duel Canyon.
 */
import { createRng } from '../lib/rng.js';
import { createNoise } from '../lib/noise.js';
import { parseMap } from './loader.js';
import { validateMap, VALIDATION } from './validator.js';
import { componentsFor } from './grid.js';

/** @typedef {import('../types.js').MapData} MapData */

export const GENERATOR = Object.freeze({
  sizes: [48, 64, 96],
  maxTries: 20,
  oreBales: 8,
  gemBales: 4,
});

/**
 * @typedef {object} GenOptions
 * @property {number} seed
 * @property {number} size     48, 64 or 96
 * @property {2 | 4} players
 */

/** Canonical twin of a cell under the map's symmetry. @param {number} N @param {2 | 4} players */
function canonOf(N, players) {
  if (players === 4) return (/** @type {number} */ x, /** @type {number} */ y) => [Math.min(x, N - 1 - x), Math.min(y, N - 1 - y)];
  return (/** @type {number} */ x, /** @type {number} */ y) => {
    const s = x + y;
    if (s < N - 1 || (s === N - 1 && x <= y)) return [x, y];
    return [N - 1 - x, N - 1 - y];
  };
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
  const rng = createRng(`map:${o.seed}:${N}:${o.players}`);
  const noise = createNoise(rng);
  const trees = createNoise(rng);
  const canon = canonOf(N, o.players);
  /** Codes of canonical cells (full grid; only canonical cells are authored). */
  const g = Array.from({ length: N }, () => new Array(N).fill('.'));
  const starts = startsFor(N, o.players);
  const home = starts[0];
  const centre = (N - 1) / 2;
  const R = VALIDATION.baseArea / 2; // the base square reaches 6 cells from its start
  const inBase = (/** @type {number} */ x, /** @type {number} */ y) => starts.some((s) => Math.abs(x - s.x) <= R + 1 && Math.abs(y - s.y) <= R + 1);
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
  const ridges = 1 + rng.int(3);
  for (let r = 0; r < ridges; r++) {
    let x = Math.round(centre + (rng.int(N) - N / 2) * 0.6);
    let y = Math.round(centre + (rng.int(N) - N / 2) * 0.6);
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let [dx, dy] = dirs[rng.int(dirs.length)];
    const length = Math.round(N * 0.45);
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

  // 3. Lakes with a beach rim (sometimes).
  const lakes = N >= 64 ? rng.int(3) : rng.int(2);
  for (let k = 0; k < lakes; k++) {
    const lx = Math.round(home.x + (centre - home.x) * (0.45 + rng.int(30) / 100)) + rng.int(7) - 3;
    const ly = Math.round(home.y + (centre - home.y) * (0.2 + rng.int(60) / 100)) + rng.int(7) - 3;
    const r = 2 + rng.int(N >= 64 ? 3 : 2);
    for (let y = ly - r - 1; y <= ly + r + 1; y++) {
      for (let x = lx - r - 1; x <= lx + r + 1; x++) {
        if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1 || inBase(x, y)) continue;
        const d2 = (x - lx) ** 2 + (y - ly) ** 2;
        if (d2 <= r * r) set(x, y, '~');
        else if (d2 <= (r + 1) * (r + 1) && get(x, y) !== '~') set(x, y, 'b');
      }
    }
  }

  // 4. Ore. Home field 6–10 cells from the start, toward the centre, outside the base square.
  const field = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ ch) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x > 0 && y > 0 && x < N - 1 && y < N - 1) set(x, y, ch);
  };
  const towardX = Math.sign(centre - home.x) || 1;
  const towardY = Math.sign(centre - home.y) || 1;
  const side = rng.int(2);
  // 4 × 6 cells starting 7 from the start: every cell but one corner pair lies within 10 (≥ 3800 credits).
  if (side === 0) field(home.x + towardX * (R + 1) - (towardX < 0 ? 3 : 0), home.y - 3, 4, 6, 'o');
  else field(home.x - 3, home.y + towardY * (R + 1) - (towardY < 0 ? 3 : 0), 6, 4, 'o');
  // Expansion field farther out, on the other side.
  const ex = side === 0 ? home.x - 1 : Math.round(home.x + (centre - home.x) * 0.75);
  const ey = side === 0 ? Math.round(home.y + (centre - home.y) * 0.75) : home.y - 1;
  field(ex, ey, 4, 3, 'o');
  // Gems near the centre.
  const gx = Math.round(centre) - 1 + rng.int(3) - 1;
  const gy = Math.round(centre) - 1 + rng.int(3) - 1;
  field(gx, gy, 3, 3, '*');

  // Clear every base square last.
  for (const s of starts) for (let y = s.y - R; y <= s.y + R; y++) for (let x = s.x - R; x <= s.x + R; x++) if (x >= 0 && y >= 0 && x < N && y < N) set(x, y, '.');

  const rows = () => Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => get(x, y)).join(''));
  // Fill tiny enclosed land pockets (trees and rocks can wall a few cells in) with rock.
  const probe = parseMap({ width: N, height: N, terrain: rows(), starts, schematicBales: { ore: GENERATOR.oreBales, gem: GENERATOR.gemBales } });
  const { ids, sizes } = componentsFor(probe, 'track');
  const main = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] >= 0 && ids[i] !== main && sizes[ids[i]] < VALIDATION.minPocketCells) set(i % N, Math.floor(i / N), '^');
  }

  const terrain = rows();
  return {
    id: `generated-${N}-${o.players}-${o.seed}`,
    name: `Generated ${N}×${N} #${o.seed}`,
    version: 1,
    width: N,
    height: N,
    maxPlayers: o.players,
    theme: 'temperate',
    schematicBales: { ore: GENERATOR.oreBales, gem: GENERATOR.gemBales },
    terrain,
    ore: [],
    gems: [],
    starts,
    bridges: [],
    neutral: [],
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
