// @ts-check
/**
 * Shroud drawing (section 12): one pixel per cell in a small canvas,
 * stretched over the map with linear filtering so edges come out soft.
 * Black where unexplored; explored ground stays open (Red Alert 2: no fog of war).
 * Redrawn only when the human's vision changed.
 */
import { Sprite, Texture } from 'pixi.js';
import { RENDER } from '../data/rules.js';

const C = RENDER.cellPx;

/** @param {{ width: number, height: number }} map */
export function createShroudLayer(map) {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const img = g.createImageData(map.width, map.height);
  const last = new Uint8Array(map.width * map.height).fill(255);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'linear';
  const sprite = new Sprite(texture);
  sprite.scale.set(C);
  // Half-cell offset so each cell's value sits at its centre after filtering.
  sprite.position.set(0, 0);
  let first = true;

  return {
    layer: sprite,
    /**
     * @param {any} world @param {number} pid
     * @returns {boolean} whether anything changed
     */
    update(world, pid) {
      const teams = world.visionTeams(pid).map((/** @type {number} */ t) => world.vision[t]);
      const n = map.width * map.height;
      let changed = first;
      for (let i = 0; i < n; i++) {
        // Explored ground stays open for good (only a Shroud Generator covers it again).
        let a = 255;
        for (const v of teams) if (v.explored[i]) { a = 0; break; }
        if (a !== last[i]) { last[i] = a; changed = true; }
      }
      if (!changed) return false;
      first = false;
      const d = img.data;
      for (let i = 0; i < n; i++) {
        d[i * 4] = 8; d[i * 4 + 1] = 8; d[i * 4 + 2] = 6;
        d[i * 4 + 3] = last[i];
      }
      g.putImageData(img, 0, 0);
      texture.source.update();
      return true;
    },
    /** Is any cell of this rect (cells) shrouded? Lets the layer skip drawing when the view is clear. @param {{ x0: number, y0: number, x1: number, y1: number }} r */
    anyIn(r) {
      for (let y = Math.max(0, r.y0); y <= Math.min(map.height - 1, r.y1); y++) {
        for (let x = Math.max(0, r.x0); x <= Math.min(map.width - 1, r.x1); x++) if (last[y * map.width + x]) return true;
      }
      return false;
    },
    /** Shroud alpha (0–255) of a cell as last drawn. @param {number} x @param {number} y */
    alphaAt: (x, y) => (x < 0 || y < 0 || x >= map.width || y >= map.height ? 255 : last[y * map.width + x]),
  };
}
