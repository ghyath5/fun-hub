// @ts-check
/**
 * Terrain drawn from pre-rendered tiles (src/render/art.js): only the cells
 * on screen, as sprites from one atlas, so the ground is sharp at any zoom
 * and costs almost no memory on big maps.
 *
 * Ground: each cell is a "splat" — its material plus a soft, ragged margin.
 * Materials are drawn lowest first (water → beach → grass → … → rock), so a
 * higher one bleeds over its neighbours and borders look natural. A cell at
 * (x, y) uses tile (x mod R, y mod R) of its material's seamless R × R
 * texture, so equal neighbours continue the same texture.
 * Decor: trees, boulders on rock, ore and gems, craters and rubble, drawn
 * row by row on top of the ground with their own baked shadows.
 *
 * Same interface as the chunk baker (terrainChunks.js), which remains the
 * fallback when the art cannot load.
 */
import { Container, Sprite } from 'pixi.js';
import { T } from '../data/terrain.js';
import { RENDER } from '../data/rules.js';

const C = RENDER.cellPx;

/** Drawing order of ground materials, lowest first. */
const ORDER = ['water', 'beach', 'clear', 'dirt', 'rough', 'road', 'rock', 'bridge'];

/** Ground material for each terrain type. */
const MATERIAL = {
  [T.clear]: 'clear', [T.road]: 'road', [T.rough]: 'rough', [T.beach]: 'beach', [T.water]: 'water',
  [T.rock]: 'rock', [T.tree]: 'clear', [T.bridge]: 'bridge', [T.rubble]: 'dirt', [T.crater]: 'clear',
};

/** Decor on top of the ground, by terrain type. */
const DECOR = { [T.tree]: 'tree', [T.rock]: 'boulder', [T.rubble]: 'rubble', [T.crater]: 'crater' };

/** Stable 0..1 hash of a cell, for picking variants. */
function hash01(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A pool of sprites in one container: hand them out per rebuild, hide the rest. */
function createPool() {
  const layer = new Container();
  /** @type {Sprite[]} */
  const sprites = [];
  let used = 0;
  return {
    layer,
    begin() { used = 0; },
    /** @param {import('pixi.js').Texture} tex @param {number} x @param {number} y */
    put(tex, x, y) {
      let s = sprites[used];
      if (!s) { s = new Sprite(tex); sprites.push(s); layer.addChild(s); }
      s.texture = tex;
      s.position.set(x, y);
      s.visible = true;
      used++;
    },
    end() { for (let i = used; i < sprites.length; i++) sprites[i].visible = false; },
  };
}

/**
 * @param {import('../types.js').MapData} map
 * @param {import('./art.js').TerrainArt} art
 * @param {() => { x0: number, y0: number, x1: number, y1: number }} visibleCells
 */
export function createTerrainTiles(map, art, visibleCells) {
  const layer = new Container();
  layer.label = 'terrain';
  const ground = ORDER.map(() => createPool());
  const decor = createPool();
  for (const p of ground) layer.addChild(p.layer);
  layer.addChild(decor.layer);
  const R = art.repeat;
  const hard = new Set(['bridge']);
  let win = '';
  let dirty = true;

  function rebuild(/** @type {{ x0: number, y0: number, x1: number, y1: number }} */ r) {
    for (const p of ground) p.begin();
    decor.begin();
    // One extra cell around the window: margins of off-screen cells reach in.
    const x0 = Math.max(0, r.x0 - 1), y0 = Math.max(0, r.y0 - 1);
    const x1 = Math.min(map.width - 1, r.x1 + 1), y1 = Math.min(map.height - 1, r.y1 + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.width + x;
        const t = map.terrain[i];
        const mat = MATERIAL[t] ?? 'clear';
        const tiles = art.ground[mat];
        const k = ORDER.indexOf(mat);
        if (tiles && k >= 0) {
          const tex = tiles[(y % R) * R + (x % R)];
          const m = hard.has(mat) ? 0 : art.margin;
          ground[k].put(tex, x * C - m, y * C - m);
        }
        const set = DECOR[t];
        if (set && art.decor[set]?.length) {
          const list = art.decor[set];
          const d = list[Math.floor(hash01(x, y, 3) * list.length)];
          decor.put(d.tex, x * C + d.ox, y * C + d.oy);
        }
        const bales = map.bales[i];
        if (bales > 0) {
          const list = art.decor[map.gem[i] ? 'gem' : 'ore'];
          if (list?.length) {
            const amount = map.gem[i] ? Math.min(list.length - 1, bales - 1) : Math.min(list.length - 1, Math.floor((bales - 1) / 2));
            const d = list[amount];
            decor.put(d.tex, x * C + d.ox, y * C + d.oy);
          }
        }
      }
    }
    for (const p of ground) p.end();
    decor.end();
  }

  return {
    layer,
    /** A cell changed (ore, a fallen tree, a crater): redraw on the next update. */
    invalidate(/** @type {number} */ _x, /** @type {number} */ _y) { dirty = true; },
    /** Rebuild the sprites when the view moves to other cells or something changed. Call every frame. */
    update() {
      const r = visibleCells();
      const key = `${r.x0},${r.y0},${r.x1},${r.y1}`;
      if (key === win && !dirty) return;
      win = key;
      dirty = false;
      rebuild(r);
    },
    destroy() { layer.destroy({ children: true }); },
  };
}
