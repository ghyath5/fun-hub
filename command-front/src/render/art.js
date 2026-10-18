// @ts-check
/**
 * Pre-rendered art (assets/art/): every structure and unit modelled in 3D
 * and rendered with lighting, shadows and ambient occlusion by the studio in
 * tools/art, packed into atlas pages. Each sprite comes as the same two
 * layers the code-drawn art used — `paint` (grey, tinted with the player
 * colour) and `detail` (its own colours) — so the layers above stay simple.
 *
 * Structures are drawn in an oblique view: the footprint maps onto the grid
 * and the building rises up the screen, so the image is larger than the
 * footprint (`ox`, `oy` place it). Units, turrets, dishes and rotors are
 * seen from straight above and rotated by the game.
 *
 * Downloaded once per page; decoded into fresh textures per renderer, so a
 * renderer's teardown can never break the next match's art.
 */
import { ImageSource, Rectangle, Texture } from 'pixi.js';

const BASE = './assets/art/';

/** @typedef {{ page: number, x: number, y: number, w: number, h: number }} Frame */
/** @typedef {{ paint: Texture, detail: Texture }} Layers */

/**
 * @typedef {object} StructureArt
 * @property {Texture} paint @property {Texture} detail
 * @property {null} turret             (code-drawn art only)
 * @property {number} w @property {number} h      footprint, world px
 * @property {number} ox @property {number} oy    image top-left relative to the footprint corner, world px
 * @property {number} iw @property {number} ih    image size, world px
 * @property {{ role: 'turret' | 'spin', x: number, y: number, paint: Texture, detail: Texture }[]} parts  pivots in world px from the footprint corner
 * @property {true} art
 */

/**
 * @typedef {object} UnitArt
 * @property {Texture} paint @property {Texture} detail
 * @property {Layers | null} turret
 * @property {number} radius          world px, for hit testing and marks
 * @property {{ x: number, y: number, paint: Texture, detail: Texture }[]} rotors
 * @property {true} art
 */

/**
 * @typedef {object} TerrainArt
 * @property {Record<string, Texture[]>} ground   per material: repeat² splat tiles (cell + soft margin)
 * @property {number} margin                       splat margin, world px
 * @property {number} repeat                       a material repeats every `repeat` cells
 * @property {Record<string, { tex: Texture, ox: number, oy: number }[]>} decor  variants; image offset from the cell corner, world px
 */

/** @type {Promise<{ json: any, blobs: Blob[], groundBlobs: Blob[] } | null> | null} */
let download = null;

/**
 * How much of the atlas resolution to keep on the GPU (1 = all of it). Every
 * page is 2048² RGBA (16 MB, 21 MB with mipmaps), so phones and low-memory
 * devices decode the pages smaller: ¾ keeps sprites sharp at normal zoom
 * for 56% of the memory, ½ for 25%. `?art=low|medium|full` overrides.
 */
export function artScale() {
  const want = new URLSearchParams(location.search).get('art');
  if (want === 'low') return 0.5;
  if (want === 'medium') return 0.75;
  if (want === 'full') return 1;
  const nav = /** @type {any} */ (navigator);
  const memory = nav.deviceMemory ?? 8; // GB (Chromium only; others report nothing)
  if (memory <= 2) return 0.5;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  if (memory <= 4 || phone) return 0.75;
  return 1;
}

/** Fetch the atlas index and pages once (the service worker keeps them offline). */
function fetchArt() {
  download ??= (async () => {
    try {
      const res = await fetch(`${BASE}atlas.json`);
      if (!res.ok) return null;
      const json = await res.json();
      const get = async (/** @type {string} */ p) => {
        const r = await fetch(BASE + p);
        if (!r.ok) throw new Error(`${p}: ${r.status}`);
        return r.blob();
      };
      const blobs = await Promise.all(json.pages.map(get));
      const groundBlobs = await Promise.all((json.terrain?.ground.pages ?? []).map(get));
      return { json, blobs, groundBlobs };
    } catch (e) {
      console.warn('[art] pre-rendered art unavailable, using code-drawn art', e);
      return null;
    }
  })();
  return download;
}

/**
 * Textures for every structure and unit, or null when the art cannot be
 * loaded (the caller falls back to code-drawn art).
 * @returns {Promise<{ structures: Map<string, StructureArt>, units: Map<string, UnitArt>, terrain: TerrainArt | null, destroy: () => void } | null>}
 */
export async function loadArt() {
  const got = await fetchArt();
  if (!got) return null;
  const { json, blobs, groundBlobs } = got;
  const res = json.pxPerCell / json.cellPx; // atlas px per world px
  const gj = json.terrain?.ground;
  const gres = gj ? gj.pxPerCell / json.cellPx : 1;
  const scale = artScale();
  /** @param {Blob} b @param {number} resolution */
  // WebGL ignores its premultiply-on-upload flag for ImageBitmaps, so the
  // bitmap is premultiplied as it is decoded and declared as such. On small
  // devices it is also scaled down while decoding (artScale), so the full
  // size never reaches the GPU; frames are cut in atlas pixels / resolution,
  // so the scale only changes `resolution`.
  const source = async (b, resolution) => {
    let bitmap = await createImageBitmap(b, { premultiplyAlpha: 'premultiply' });
    if (scale < 1) {
      const full = bitmap;
      bitmap = await createImageBitmap(full, {
        premultiplyAlpha: 'premultiply', resizeQuality: 'high',
        resizeWidth: Math.round(full.width * scale), resizeHeight: Math.round(full.height * scale),
      });
      full.close();
    }
    return new ImageSource({
      resource: bitmap,
      resolution: resolution * scale,
      autoGenerateMipmaps: true,
      scaleMode: 'linear',
      alphaMode: 'premultiplied-alpha',
    });
  };
  let sources;
  let groundSources;
  try {
    sources = await Promise.all(blobs.map((b) => source(b, res)));
    groundSources = await Promise.all(groundBlobs.map((b) => source(b, gres)));
  } catch (e) {
    console.warn('[art] could not decode the atlas', e);
    return null;
  }
  /** @param {any} frames @param {ImageSource[]} srcs @param {number} r @param {string} key */
  const cut = (frames, srcs, r, key) => {
    const f = /** @type {Frame} */ (frames[key]);
    return new Texture({ source: srcs[f.page], frame: new Rectangle(f.x / r, f.y / r, f.w / r, f.h / r) });
  };
  /** @param {string} key */
  const tex = (key) => cut(json.frames, sources, res, key);
  /** @param {string} layer */
  const layers = (layer) => ({ paint: tex(`${layer}:paint`), detail: tex(`${layer}:detail`) });
  const C = json.cellPx;

  /** @type {Map<string, StructureArt>} */
  const structures = new Map();
  for (const [id, s] of Object.entries(json.structures)) {
    structures.set(id, {
      ...layers(s.layer),
      turret: null,
      w: s.w * C, h: s.h * C,
      ox: -s.fx * C, oy: -s.fy * C,
      iw: s.iw * C, ih: s.ih * C,
      parts: s.parts.map((/** @type {any} */ p) => ({ role: p.role, x: p.ax * C, y: p.ay * C, ...layers(p.layer) })),
      art: true,
    });
  }
  /** @type {Map<string, UnitArt>} */
  const units = new Map();
  for (const [id, u] of Object.entries(json.units)) {
    units.set(id, {
      ...layers(u.body),
      turret: u.turret ? layers(u.turret) : null,
      radius: Math.max(4, u.radius * C * 0.85),
      rotors: u.rotors.map((/** @type {any} */ r) => ({ x: r.x * C, y: r.z * C, ...layers(r.layer) })),
      art: true,
    });
  }
  /** @type {TerrainArt | null} */
  let terrain = null;
  if (json.terrain && gj) {
    /** @type {Record<string, Texture[]>} */
    const ground = {};
    for (const [id, keys] of Object.entries(gj.tiles)) ground[id] = /** @type {string[]} */ (keys).map((k) => cut(gj.frames, groundSources, gres, k));
    /** @type {TerrainArt['decor']} */
    const decor = {};
    for (const [set, list] of Object.entries(json.terrain.decor)) {
      decor[set] = /** @type {any[]} */ (list).map((d) => ({ tex: tex(d.key), ox: -d.fx * C, oy: -d.fy * C }));
    }
    terrain = { ground, decor, margin: gj.margin * C, repeat: gj.repeat };
  }
  return {
    structures,
    units,
    terrain,
    destroy() { for (const s of [...sources, ...groundSources]) s.destroy(); },
  };
}
