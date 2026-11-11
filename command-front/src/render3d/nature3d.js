// @ts-check
/**
 * Scenery in 3D: trees with undergrowth on tree cells, boulders on rock,
 * supply crates. Only the cells on screen are drawn; each cell picks its
 * kinds, turn, size and shade from a stable hash, so the forest looks the
 * same every frame and match. Trees lean a little with the wind.
 */
import * as THREE from 'three';
import { T } from '../data/terrain.js';
import { RENDER } from '../data/rules.js';
import { CELL } from './view.js';

const C = RENDER.cellPx;
const ROCKS = ['rock:a', 'rock:b'];
const BUSHES = ['bush:a', 'bush:b', 'bush:fern', 'bush:a'];
const WHITE = new THREE.Color(1, 1, 1);

/** How the forest is planted and how it moves. */
export const NATURE = Object.freeze({
  /** Groves: over `groveCells` the mix drifts from conifers to broadleaves, so woods have character. */
  groveCells: 7,
  conifers: ['tree:pine', 'tree:spruce', 'tree:pine', 'tree:birch'],
  mixed: ['tree:round', 'tree:pine', 'tree:birch', 'tree:oak', 'tree:poplar'],
  broadleaf: ['tree:oak', 'tree:round', 'tree:oak', 'tree:poplar', 'tree:birch'],
  /** Within this many cells of a beach, most trees are palms. */
  palmReach: 2,
  palmShare: 0.75,
  /** Share of tree cells with a bush, and with a second, smaller tree. */
  bushes: 0.7,
  saplings: 0.3,
  /** Each tree's own shade of green: brightness from `1 - shade` to `1 + shade`. */
  shade: 0.14,
  /** Wind: how far a tree leans (radians) and how fast the gusts pass (per second, and per cell across the map). */
  sway: 0.03,
  gustSpeed: 1.25,
  gustSpread: 0.32,
});

/** Stable 0..1 hash of a cell (as the 2D terrain uses). */
function hash01(/** @type {number} */ x, /** @type {number} */ y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 0..1 noise over cells (bilinear between hashed corners). @param {number} x @param {number} y @param {number} salt */
function drift(x, y, salt) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const a = hash01(xi, yi, salt), b = hash01(xi + 1, yi, salt), c = hash01(xi, yi + 1, salt), d = hash01(xi + 1, yi + 1, salt);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * @param {import('./library.js').Library} lib
 * @param {import('./instances.js').Instancer} inst
 */
export function createNature3D(lib, inst) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  /** Which kind of tree stands on each cell (never changes during a match). @type {Map<number, string>} */
  const kinds = new Map();

  /**
   * @param {string} key @param {number} x @param {number} z  world px
   * @param {number} turn @param {number} size @param {number} [bright] @param {number} [wind]  lean now, radians
   */
  function put(key, x, z, turn, size, bright = 1, wind = 0) {
    const def = lib.get(key);
    q.setFromAxisAngle(up, turn);
    if (wind) q.premultiply(lean.setFromEuler(e.set(wind * 0.6, 0, wind)));
    m.compose(v.set(x, 0, z), q, s.set(CELL * size, CELL * size, CELL * size));
    for (const p of def.parts) inst.add(p, m, WHITE, bright, false);
  }

  /** @param {any} map @param {number} x @param {number} y */
  function nearBeach(map, x, y) {
    const R = NATURE.palmReach;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && map.terrain[ny * map.width + nx] === T.beach) return true;
    }
    return false;
  }

  /** @param {any} map @param {number} x @param {number} y */
  function treeAt(map, x, y) {
    const i = y * map.width + x;
    let kind = kinds.get(i);
    if (kind) return kind;
    if (nearBeach(map, x, y) && hash01(x, y, 17) < NATURE.palmShare) kind = 'tree:palm';
    else {
      const grove = drift(x / NATURE.groveCells, y / NATURE.groveCells, 19);
      const list = grove < 0.4 ? NATURE.conifers : grove < 0.6 ? NATURE.mixed : NATURE.broadleaf;
      kind = list[Math.floor(hash01(x, y, 3) * list.length)];
    }
    kinds.set(i, kind);
    return kind;
  }

  return {
    /**
     * @param {any} world @param {{ x0: number, y0: number, x1: number, y1: number }} cells  on screen
     * @param {number} viewer  -1: everything
     */
    sync(world, cells, viewer) {
      const map = world.map;
      const now = performance.now() / 1000;
      for (let y = cells.y0; y <= cells.y1; y++) {
        for (let x = cells.x0; x <= cells.x1; x++) {
          const t = map.terrain[y * map.width + x];
          if (t !== T.tree && t !== T.rock) continue;
          if (viewer >= 0 && !world.isExplored(viewer, x, y)) continue;
          const h = hash01(x, y, 3);
          const ox = (hash01(x, y, 5) - 0.5) * 0.3;
          const oz = (hash01(x, y, 7) - 0.5) * 0.3;
          const turn = hash01(x, y, 9) * Math.PI * 2;
          if (t === T.rock) {
            if (hash01(x, y, 13) < 0.55) put(ROCKS[Math.floor(h * ROCKS.length)], (x + 0.5 + ox) * C, (y + 0.5 + oz) * C, turn, 0.6 + hash01(x, y, 11) * 0.5);
            continue;
          }
          // Gusts cross the map as waves; every tree answers a little differently.
          const gust = Math.sin(now * NATURE.gustSpeed + (x + y * 0.6) * NATURE.gustSpread);
          const wind = NATURE.sway * (gust + 0.35 * Math.sin(now * 2.9 + h * 40));
          const shade = 1 + (hash01(x, y, 23) - 0.5) * 2 * NATURE.shade;
          put(treeAt(map, x, y), (x + 0.5 + ox) * C, (y + 0.55 + oz) * C, turn, 0.88 + hash01(x, y, 11) * 0.34, shade, wind);
          // Undergrowth in the cell's other corners.
          const side = ox >= 0 ? -1 : 1;
          if (hash01(x, y, 27) < NATURE.bushes) {
            put(BUSHES[Math.floor(hash01(x, y, 29) * BUSHES.length)], (x + 0.5 + side * 0.3) * C, (y + 0.78 - oz * 0.4) * C,
              turn * 1.7, 0.8 + hash01(x, y, 31) * 0.5, shade * 0.96, wind * 0.5);
          }
          if (hash01(x, y, 33) < NATURE.saplings) {
            put(treeAt(map, x, y), (x + 0.5 - side * 0.3) * C, (y + 0.22 + oz * 0.3) * C, turn * 2.3, 0.45 + hash01(x, y, 35) * 0.2, shade * 1.06, wind * 1.3);
          }
        }
      }
      for (const c of world.crates) {
        if (c.x < cells.x0 || c.x > cells.x1 || c.y < cells.y0 || c.y > cells.y1) continue;
        if (viewer >= 0 && !world.isExplored(viewer, c.x, c.y)) continue;
        put('crate', (c.x + 0.5) * C, (c.y + 0.5) * C, 0.3, 0.5);
      }
    },
  };
}
