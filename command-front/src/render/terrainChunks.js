// @ts-check
/**
 * Terrain pre-rendered into 512×512 chunk textures (section 19). Only chunks
 * marked dirty (ore grew, a tree fell, a crater appeared) are redrawn.
 * Art is drawn in code; detail comes from a per-cell hash, never Math.random.
 */
import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import { TERRAIN, T } from '../data/terrain.js';
import { RENDER } from '../data/rules.js';

/** @typedef {import('../types.js').MapData} MapData */

const C = RENDER.cellPx;
const CHUNK = RENDER.chunkPx;
const CELLS_PER_CHUNK = Math.floor(CHUNK / C); // whole cells per chunk edge (21)

/** Stable 0..1 hash for a cell and a salt. */
function hash01(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1: bilinear blend of cell hashes on a coarse lattice. */
function smooth01(x, y, scale, salt) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash01(x0, y0, salt);
  const b = hash01(x0 + 1, y0, salt);
  const c = hash01(x0, y0 + 1, salt);
  const d = hash01(x0 + 1, y0 + 1, salt);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/** @param {string} hex @param {number} f */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (/** @type {number} */ s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const at = (/** @type {MapData} */ m, x, y) => (x < 0 || y < 0 || x >= m.width || y >= m.height ? -1 : m.terrain[y * m.width + x]);

/**
 * Draw one cell into a Graphics at local pixel (px, py).
 * @param {Graphics} g @param {MapData} map @param {number} x @param {number} y @param {number} px @param {number} py
 */
function drawCell(g, map, x, y, px, py) {
  const i = y * map.width + x;
  const t = map.terrain[i];
  const def = TERRAIN[t];
  const v = 0.9 + smooth01(x, y, 5, 91) * 0.14 + hash01(x, y) * 0.03;
  const base = t === T.tree ? TERRAIN[T.clear].color : def.color;
  g.rect(px, py, C, C).fill(shade(base, v));

  switch (t) {
    case T.clear:
    case T.rubble:
    case T.crater:
      for (let k = 0; k < 3; k++) {
        const fx = px + 2 + hash01(x, y, k + 1) * (C - 4);
        const fy = py + 2 + hash01(x, y, k + 7) * (C - 4);
        g.rect(fx, fy, 2, 1).fill({ color: shade(base, 1.2), alpha: 0.6 });
      }
      if (t === T.crater) g.circle(px + C / 2, py + C / 2, C * 0.36).fill({ color: 0x2c2a22, alpha: 0.6 });
      if (t === T.rubble) for (let k = 0; k < 4; k++) g.rect(px + hash01(x, y, k + 20) * (C - 5), py + hash01(x, y, k + 30) * (C - 5), 5, 3).fill(0x8a8272);
      break;
    case T.rough:
      for (let k = 0; k < 5; k++) {
        g.circle(px + 3 + hash01(x, y, k + 3) * (C - 6), py + 3 + hash01(x, y, k + 9) * (C - 6), 1.2 + hash01(x, y, k) * 1.4)
          .fill({ color: 0x4f4632, alpha: 0.75 });
      }
      break;
    case T.road:
      if (at(map, x, y - 1) !== T.road) g.rect(px, py, C, 2).fill({ color: 0x5f5648, alpha: 0.7 });
      if (at(map, x, y + 1) !== T.road) g.rect(px, py + C - 2, C, 2).fill({ color: 0x5f5648, alpha: 0.7 });
      break;
    case T.water: {
      for (let k = 0; k < 2; k++) {
        const wy = py + 6 + k * 10 + hash01(x, y, k) * 3;
        const wx = px + 3 + hash01(x, y, k + 5) * 8;
        g.moveTo(wx, wy).lineTo(wx + 8, wy).stroke({ width: 1, color: 0x7fa9bc, alpha: 0.5 });
      }
      break;
    }
    case T.beach:
      g.circle(px + hash01(x, y, 2) * C, py + hash01(x, y, 3) * C, 1).fill({ color: 0xa08a58, alpha: 0.7 });
      break;
    case T.rock: {
      // Bevel: lit edges where the neighbour is not rock, so ridges read as raised.
      if (at(map, x, y - 1) !== T.rock) g.rect(px, py, C, 4).fill({ color: 0x8b8072, alpha: 0.9 });
      if (at(map, x - 1, y) !== T.rock) g.rect(px, py, 3, C).fill({ color: 0x7c7266, alpha: 0.9 });
      if (at(map, x, y + 1) !== T.rock) g.rect(px, py + C - 5, C, 5).fill({ color: 0x2f2a25, alpha: 0.9 });
      if (at(map, x + 1, y) !== T.rock) g.rect(px + C - 3, py, 3, C).fill({ color: 0x3a342d, alpha: 0.9 });
      g.poly([px + 6, py + 14, px + 11, py + 7, px + 16, py + 12]).stroke({ width: 1, color: 0x2f2a25, alpha: 0.5 });
      break;
    }
    case T.tree: {
      const ox = (hash01(x, y, 4) - 0.5) * 4;
      const oy = (hash01(x, y, 5) - 0.5) * 4;
      g.circle(px + C / 2 + ox + 2, py + C / 2 + oy + 3, C * 0.42).fill({ color: 0x1c2412, alpha: 0.45 });
      g.circle(px + C / 2 + ox, py + C / 2 + oy, C * 0.42).fill(shade(def.color, v));
      g.circle(px + C / 2 + ox - 3, py + C / 2 + oy - 3, C * 0.2).fill({ color: 0x5f7f3c, alpha: 0.8 });
      break;
    }
    case T.bridge:
      for (let k = 0; k < C; k += 4) g.rect(px, py + k, C, 3).fill(shade(def.color, 0.9 + (k % 8) * 0.03));
      break;
    default:
      break;
  }

  const bales = map.bales[i];
  if (bales > 0) {
    if (map.gem[i]) {
      const n = 1 + Math.min(3, bales - 1);
      for (let k = 0; k < n; k++) {
        const cx = px + 5 + hash01(x, y, k + 40) * (C - 10);
        const cy = py + 5 + hash01(x, y, k + 50) * (C - 10);
        g.poly([cx, cy - 4, cx + 3, cy, cx, cy + 4, cx - 3, cy]).fill(0x64d8e8).stroke({ width: 1, color: 0x1f6f80 });
      }
    } else {
      const n = 1 + Math.floor((bales - 1) / 2);
      for (let k = 0; k < n; k++) {
        const cx = px + 4 + hash01(x, y, k + 60) * (C - 8);
        const cy = py + 4 + hash01(x, y, k + 70) * (C - 8);
        g.circle(cx, cy, 2 + hash01(x, y, k + 80) * 1.5).fill(0xd9a83a).stroke({ width: 1, color: 0x7a5414 });
      }
    }
  }
}

/**
 * @param {import('pixi.js').Renderer} renderer
 * @param {MapData} map
 */
export function createTerrain(renderer, map) {
  const layer = new Container();
  layer.label = 'terrain';
  const cols = Math.ceil(map.width / CELLS_PER_CHUNK);
  const rows = Math.ceil(map.height / CELLS_PER_CHUNK);
  /** @type {{ tex: RenderTexture, sprite: Sprite, cx: number, cy: number }[]} */
  const chunks = [];
  const dirty = new Set();

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const w = Math.min(CELLS_PER_CHUNK, map.width - cx * CELLS_PER_CHUNK) * C;
      const h = Math.min(CELLS_PER_CHUNK, map.height - cy * CELLS_PER_CHUNK) * C;
      const tex = RenderTexture.create({ width: w, height: h });
      const sprite = new Sprite(tex);
      sprite.position.set(cx * CELLS_PER_CHUNK * C, cy * CELLS_PER_CHUNK * C);
      layer.addChild(sprite);
      chunks.push({ tex, sprite, cx, cy });
      dirty.add(chunks.length - 1);
    }
  }

  /** @param {number} index */
  function bake(index) {
    const ch = chunks[index];
    const g = new Graphics();
    const x0 = ch.cx * CELLS_PER_CHUNK;
    const y0 = ch.cy * CELLS_PER_CHUNK;
    for (let y = y0; y < Math.min(map.height, y0 + CELLS_PER_CHUNK); y++) {
      for (let x = x0; x < Math.min(map.width, x0 + CELLS_PER_CHUNK); x++) drawCell(g, map, x, y, (x - x0) * C, (y - y0) * C);
    }
    renderer.render({ container: g, target: ch.tex, clear: true });
    g.destroy();
  }

  return {
    layer,
    /** Mark the chunk holding a cell (and neighbours across a chunk edge) for redraw. */
    invalidate(x, y) {
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        dirty.add(Math.floor(ny / CELLS_PER_CHUNK) * cols + Math.floor(nx / CELLS_PER_CHUNK));
      }
    },
    /** Redraw dirty chunks; call once per frame before rendering. */
    update() {
      for (const i of dirty) bake(i);
      dirty.clear();
    },
    destroy() {
      for (const ch of chunks) ch.tex.destroy(true);
      layer.destroy({ children: true });
    },
  };
}
