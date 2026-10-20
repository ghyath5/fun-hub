// @ts-check
/**
 * Scenery in 3D: trees on tree cells, boulders on rock, supply crates. Only
 * the cells on screen are drawn; each cell picks its variant, turn and size
 * from a stable hash, so the forest looks the same every frame and match.
 */
import * as THREE from 'three';
import { T } from '../data/terrain.js';
import { RENDER } from '../data/rules.js';
import { CELL } from './view.js';

const C = RENDER.cellPx;
const TREES = ['tree:pine', 'tree:round', 'tree:birch', 'tree:pine'];
const ROCKS = ['rock:a', 'rock:b'];
const WHITE = new THREE.Color(1, 1, 1);

/** Stable 0..1 hash of a cell (as the 2D terrain uses). */
function hash01(/** @type {number} */ x, /** @type {number} */ y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * @param {import('./library.js').Library} lib
 * @param {import('./instances.js').Instancer} inst
 */
export function createNature3D(lib, inst) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  /** @param {string} key @param {number} x @param {number} z @param {number} turn @param {number} size */
  function put(key, x, z, turn, size) {
    const def = lib.get(key);
    q.setFromAxisAngle(up, turn);
    m.compose(v.set(x, 0, z), q, s.set(CELL * size, CELL * size, CELL * size));
    for (const p of def.parts) inst.add(p, m, WHITE, 1, false);
  }

  return {
    /**
     * @param {any} world @param {{ x0: number, y0: number, x1: number, y1: number }} cells  on screen
     * @param {number} viewer  -1: everything
     */
    sync(world, cells, viewer) {
      const map = world.map;
      for (let y = cells.y0; y <= cells.y1; y++) {
        for (let x = cells.x0; x <= cells.x1; x++) {
          const t = map.terrain[y * map.width + x];
          if (t !== T.tree && t !== T.rock) continue;
          if (viewer >= 0 && !world.isExplored(viewer, x, y)) continue;
          const h = hash01(x, y, 3);
          const ox = (hash01(x, y, 5) - 0.5) * 0.3;
          const oz = (hash01(x, y, 7) - 0.5) * 0.3;
          if (t === T.tree) put(TREES[Math.floor(h * TREES.length)], (x + 0.5 + ox) * C, (y + 0.55 + oz) * C, hash01(x, y, 9) * Math.PI * 2, 0.85 + hash01(x, y, 11) * 0.35);
          else if (hash01(x, y, 13) < 0.55) put(ROCKS[Math.floor(h * ROCKS.length)], (x + 0.5 + ox) * C, (y + 0.5 + oz) * C, hash01(x, y, 9) * Math.PI * 2, 0.6 + hash01(x, y, 11) * 0.5);
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
