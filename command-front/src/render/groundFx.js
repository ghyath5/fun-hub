// @ts-check
/**
 * Life on the painted ground (terrainTiles.js draws the tiles themselves):
 *
 *   - the sea: turquoise shallows fading to deep navy away from land, sunlight
 *     rippling over it, and foam lapping at every shore;
 *   - the grass: lighter and darker patches that break up the repeating tiles.
 *
 * Everything here is drawn once into small textures when the match starts
 * (no downloads); per frame only a few offsets and alphas move.
 */
import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { T } from '../data/terrain.js';
import { RENDER } from '../data/rules.js';

const C = RENDER.cellPx;

/** Look of the sea and the grass. Distances are in cells, speeds in world px per second. */
export const GROUND_FX = Object.freeze({
  /** Texture detail of the shore maps: sub-cells per cell, lowered on huge maps to stay under `maxTexture`. */
  shoreDetail: 4,
  maxTexture: 1024,
  shallow: { color: [84, 204, 196], alpha: 0.36, reach: 1.9 },
  deep: { color: [5, 20, 54], alpha: 0.56, from: 1.4, full: 7 },
  /** Two foam bands that swell in turn, so waves seem to run up the shore. */
  foam: [
    { at: 0.5, width: 0.34, alpha: 0.95, phase: 0 },
    { at: 1.05, width: 0.26, alpha: 0.42, phase: 2.2 },
  ],
  /** How far (cells) the foam line wanders in and out along the shore. */
  foamWander: 0.42,
  foamPeriodSeconds: 4.2,
  /** Sunlight on the water: two layers of bright ripples drifting across each other. */
  ripples: [
    { cells: 5.5, alpha: 0.2, vx: 7, vy: 3 },
    { cells: 8.5, alpha: 0.14, vx: -4, vy: 5.5 },
  ],
  rippleTexture: 256,
  /** Grass patches: px per cell of the map-wide tint and how strong the sunny and shaded patches are. */
  patchDetail: 2,
  patchCells: 9,
  sunny: { color: [124, 190, 84], alpha: 0.2 },
  shaded: { color: [14, 52, 22], alpha: 0.26 },
});

/** Stable 0..1 hash of a lattice point. @param {number} x @param {number} y @param {number} [salt] */
function hash01(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t);
const clamp01 = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));

/**
 * Smooth value noise, 0..1. With `period` the pattern repeats every `period`
 * units in both directions (for seamless tiles).
 * @param {number} x @param {number} y @param {number} [salt] @param {number} [period]
 */
export function valueNoise(x, y, salt = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const wrap = (/** @type {number} */ v) => (period ? ((v % period) + period) % period : v);
  const x0 = wrap(xi), x1 = wrap(xi + 1), y0 = wrap(yi), y1 = wrap(yi + 1);
  const a = hash01(x0, y0, salt), b = hash01(x1, y0, salt), c = hash01(x0, y1, salt), d = hash01(x1, y1, salt);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** @param {number} w @param {number} h */
function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')) };
}

/**
 * Paint a texture pixel by pixel. @param {number} w @param {number} h
 * @param {(x: number, y: number, out: number[]) => void} pixel  writes r, g, b (0–255) and a (0–1) into `out`
 */
function paintTexture(w, h, pixel) {
  const { canvas, ctx } = canvasOf(w, h);
  const img = ctx.createImageData(w, h);
  const out = [0, 0, 0, 0];
  for (let y = 0, k = 0; y < h; y++) {
    for (let x = 0; x < w; x++, k += 4) {
      pixel(x, y, out);
      img.data[k] = out[0]; img.data[k + 1] = out[1]; img.data[k + 2] = out[2];
      img.data[k + 3] = Math.round(clamp01(out[3]) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(canvas);
}

/**
 * Distance from every water sub-cell to the nearest land, in cells (0 on
 * land). Bridges count as water: the sea runs on under them.
 * @param {import('../types.js').MapData} map @param {number} s  sub-cells per cell
 */
export function shoreDistance(map, s) {
  const w = map.width * s, h = map.height * s;
  const FAR = 1e6;
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / s) * map.width;
    for (let x = 0; x < w; x++) {
      const t = map.terrain[row + Math.floor(x / s)];
      d[y * w + x] = t === T.water || t === T.bridge ? FAR : 0;
    }
  }
  // Two sweeps with straight and diagonal steps: close to the true distance, in one pass each way.
  const A = 1, B = Math.SQRT2;
  const relax = (/** @type {number} */ i, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ dx, /** @type {number} */ dy, /** @type {number} */ cost) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
    const v = d[ny * w + nx] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    relax(i, x, y, -1, 0, A); relax(i, x, y, 0, -1, A); relax(i, x, y, -1, -1, B); relax(i, x, y, 1, -1, B);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    relax(i, x, y, 1, 0, A); relax(i, x, y, 0, 1, A); relax(i, x, y, 1, 1, B); relax(i, x, y, -1, 1, B);
  }
  for (let i = 0; i < d.length; i++) d[i] /= s;
  return { d, w, h };
}

/** Bright, thin, wandering lines on a seamless tile: sunlight on ripples. @param {number} size */
function rippleTexture(size) {
  const P = 6;
  return paintTexture(size, size, (x, y, out) => {
    const u = (x / size) * P, v = (y / size) * P;
    // Bend the lattice a little so the lines wander instead of following a grid.
    const bx = valueNoise(u * 2, v * 2, 21, P * 2) - 0.5, by = valueNoise(u * 2, v * 2, 22, P * 2) - 0.5;
    const n = valueNoise(u + bx * 0.7, v + by * 0.7, 23, P) * 0.7 + valueNoise((u + by) * 2, (v + bx) * 2, 24, P * 2) * 0.3;
    const ridge = 1 - Math.abs(2 * n - 1);
    out[0] = 235; out[1] = 250; out[2] = 255;
    out[3] = Math.pow(ridge, 5) * 0.6;
  });
}

/** A sprite stretched over the whole map. @param {Texture} tex @param {import('../types.js').MapData} map */
function overMap(tex, map) {
  const s = new Sprite(tex);
  s.width = map.width * C;
  s.height = map.height * C;
  return s;
}

/**
 * @param {import('../types.js').MapData} map
 */
export function createGroundFx(map) {
  const F = GROUND_FX;
  const W = map.width * C, H = map.height * C;
  /** @type {Texture[]} */
  const textures = [];
  const keep = (/** @type {Texture} */ t) => { textures.push(t); return t; };

  // ── The sea (drawn over the water tiles, under every land tile).
  const water = new Container();
  water.label = 'water-fx';
  const hasWater = map.terrain.includes(T.water);
  /** @type {{ sprite: TilingSprite, vx: number, vy: number }[]} */
  const ripples = [];
  /** @type {{ sprite: Sprite, alpha: number, phase: number }[]} */
  const foams = [];
  if (hasWater) {
    const s = Math.max(1, Math.min(F.shoreDetail, Math.floor(F.maxTexture / Math.max(map.width, map.height))));
    const shore = shoreDistance(map, s);
    const at = (/** @type {number} */ x, /** @type {number} */ y) => shore.d[y * shore.w + x];
    water.addChild(overMap(keep(paintTexture(shore.w, shore.h, (x, y, out) => {
      const d = at(x, y);
      const shallow = F.shallow.alpha * clamp01(1 - d / F.shallow.reach) ** 1.4;
      const deep = F.deep.alpha * smooth(clamp01((d - F.deep.from) / (F.deep.full - F.deep.from)));
      const c = shallow >= deep ? F.shallow.color : F.deep.color;
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      out[3] = d > 0 ? Math.max(shallow, deep) : 0;
    })), map));
    const tile = keep(rippleTexture(F.rippleTexture));
    for (const r of F.ripples) {
      const sprite = new TilingSprite({ texture: tile, width: W, height: H });
      sprite.tileScale.set((r.cells * C) / F.rippleTexture);
      sprite.alpha = r.alpha;
      sprite.blendMode = 'add';
      water.addChild(sprite);
      ripples.push({ sprite, vx: r.vx, vy: r.vy });
    }
    F.foam.forEach((band, k) => {
      const sprite = overMap(keep(paintTexture(shore.w, shore.h, (x, y, out) => {
        const d = at(x, y);
        const cx = x / s, cy = y / s;
        // The line wanders and breaks into patches along the shore, as real foam does.
        const wander = (valueNoise(cx * 0.9, cy * 0.9, 64 + k) - 0.5) * 2 * F.foamWander * Math.min(1, band.at);
        const patchy = (0.2 + 0.8 * smooth(clamp01(valueNoise(cx * 1.7, cy * 1.7, 60 + k) * 2 - 0.45))) ** (1 + k);
        out[0] = 250; out[1] = 253; out[2] = 255;
        out[3] = d > 0 ? clamp01(1 - Math.abs(d - band.at - wander) / band.width) ** 1.5 * patchy : 0;
      })), map);
      water.addChild(sprite);
      foams.push({ sprite, alpha: band.alpha, phase: band.phase });
    });
  }

  // ── The grass (drawn over the grass tiles, under roads, rock and decor).
  const land = new Container();
  land.label = 'grass-fx';
  const p = F.patchDetail;
  const grassy = (/** @type {number} */ t) => t === T.clear || t === T.tree || t === T.crater;
  land.addChild(overMap(keep(paintTexture(map.width * p, map.height * p, (x, y, out) => {
    const cx = x / p, cy = y / p;
    if (!grassy(map.terrain[Math.floor(cy) * map.width + Math.floor(cx)])) { out[3] = 0; return; }
    const n = valueNoise(cx / F.patchCells, cy / F.patchCells, 71) * 0.65 + valueNoise(cx / (F.patchCells / 3), cy / (F.patchCells / 3), 72) * 0.35;
    const k = (n - 0.5) * 2.6;
    const tone = k > 0 ? F.sunny : F.shaded;
    out[0] = tone.color[0]; out[1] = tone.color[1]; out[2] = tone.color[2];
    out[3] = tone.alpha * clamp01(Math.abs(k));
  })), map));

  return {
    /** Goes right above the water tiles. */
    water,
    /** Goes right above the grass tiles. */
    land,
    /** Move the water. @param {number} seconds  running time */
    update(seconds) {
      for (const r of ripples) r.sprite.tilePosition.set(r.vx * seconds, r.vy * seconds);
      const turn = (seconds / F.foamPeriodSeconds) * Math.PI * 2;
      for (const f of foams) f.sprite.alpha = f.alpha * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(turn - f.phase)));
    },
    /** Whether anything moves (a map without water needs no per-frame work). */
    animated: hasWater,
    destroy() { for (const t of textures) t.destroy(true); },
  };
}
