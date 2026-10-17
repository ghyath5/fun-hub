// @ts-check
/**
 * Structure art drawn in code and baked once per type (section 19). Drawn
 * in world pixels on the footprint (1 cell = 24 px), origin at the
 * footprint's top-left. `paint` is light grey and gets the team tint;
 * `detail` keeps its colours. The Gun Turret has a separate turret part.
 */
import { Graphics } from 'pixi.js';
import { STRUCTURES, NEUTRAL } from '../data/structures.js';
import { RENDER } from '../data/rules.js';

const C = RENDER.cellPx;
const PAINT = 0xdedad0;
const SHADE = 0xb8b4aa;
const CONCRETE = 0x8d8a80;
const CONCRETE_D = 0x5f5d56;
const DARK = 0x2a2a24;
const STEEL = 0x55574d;
const GLASS = 0x9fb4c0;
const WARN = 0xd8b03a;

/** @typedef {{ paint: Graphics, detail: Graphics }} Layers */

/** Concrete slab with a bevel, the base of most buildings. */
function slab(/** @type {Layers} */ l, w, h, inset = 1) {
  const W = w * C;
  const H = h * C;
  l.detail.rect(inset, inset + 2, W - inset * 2, H - inset * 2).fill({ color: 0x000000, alpha: 0.25 });
  l.detail.rect(inset, inset, W - inset * 2, H - inset * 2).fill(CONCRETE);
  l.detail.rect(inset, inset, W - inset * 2, 2).fill(0xb0ada2);
  l.detail.rect(inset, H - inset - 3, W - inset * 2, 3).fill(CONCRETE_D);
}

/** A team-coloured roof block with a darker ridge. */
function roof(/** @type {Layers} */ l, x, y, w, h) {
  l.paint.rect(x, y, w, h).fill(PAINT);
  l.paint.rect(x, y + h - 3, w, 3).fill(SHADE);
  l.detail.rect(x, y, w, h).stroke({ width: 1, color: DARK, alpha: 0.5 });
}

const stripe = (/** @type {Layers} */ l, x, y, w) => {
  for (let k = 0; k < w; k += 6) l.detail.rect(x + k, y, 3, 2).fill(WARN);
};

/** @type {Record<string, (l: Layers, t: Layers | null, w: number, h: number) => void>} */
const KITS = {
  constructionYard: (l, _t, w, h) => {
    slab(l, w, h);
    roof(l, 6, 8, 34, 26);
    l.detail.rect(10, 12, 26, 4).fill(GLASS);
    l.detail.rect(44, 6, 4, 58).fill(STEEL);          // crane mast
    l.detail.rect(20, 6, 30, 3).fill(STEEL);          // crane jib
    l.detail.rect(22, 9, 1, 14).fill(DARK);           // hook line
    l.detail.rect(19, 23, 7, 4).fill(WARN);
    stripe(l, 6, 62, 60);
  },
  powerPlant: (l, _t, w, h) => {
    slab(l, w, h);
    roof(l, 4, 26, 40, 16);
    for (const cx of [14, 34]) {
      l.detail.circle(cx, 16, 10).fill(CONCRETE_D);
      l.detail.circle(cx, 16, 8).fill(0x3a3a34);
      l.paint.rect(cx - 10, 24, 20, 3).fill(PAINT);
    }
    l.detail.rect(20, 30, 8, 4).fill(WARN);
  },
  advPowerPlant: (l, _t, w, h) => {
    slab(l, w, h);
    roof(l, 4, 46, 64, 20);
    for (const cx of [14, 36, 58]) {
      l.detail.circle(cx, 22, 11).fill(CONCRETE_D);
      l.detail.circle(cx, 22, 9).fill(0x3a3a34);
      l.paint.rect(cx - 11, 32, 22, 3).fill(PAINT);
    }
    l.detail.rect(30, 52, 12, 6).fill(0x8ad0ff);
  },
  refinery: (l, _t, w, h) => {
    slab(l, w, h);
    roof(l, 4, 4, 36, 30);
    l.detail.circle(56, 18, 11).fill(CONCRETE_D);
    l.detail.circle(56, 18, 9).fill(0xc79a3a);
    l.detail.circle(56, 50, 9).fill(CONCRETE_D);
    l.detail.circle(56, 50, 7).fill(0xc79a3a);
    l.detail.rect(24, 40, 24, 30).fill(0x4a4840);       // unloading bay over the dock
    l.detail.rect(26, 42, 20, 26).stroke({ width: 1, color: WARN });
    l.detail.rect(8, 10, 28, 4).fill(GLASS);
  },
  silo: (l, _t, w, h) => {
    l.detail.circle(12, 13, 11).fill({ color: 0, alpha: 0.25 });
    l.paint.circle(12, 12, 10).fill(PAINT);
    l.detail.circle(12, 12, 6).fill(0xc79a3a);
    l.detail.circle(12, 12, 10).stroke({ width: 1, color: DARK, alpha: 0.6 });
  },
  barracks: (l, _t, w, h) => {
    slab(l, w, h);
    roof(l, 4, 4, 18, 32);
    roof(l, 26, 4, 18, 32);
    l.detail.rect(18, 38, 12, 8).fill(DARK);           // door toward the exit
    l.detail.rect(6, 6, 2, 28).fill(SHADE);
  },
  warFactory: (l, _t, w, h) => {
    slab(l, w, h);
    roof(l, 4, 4, 64, 40);
    for (let x = 8; x < 66; x += 8) l.detail.rect(x, 6, 2, 36).fill({ color: DARK, alpha: 0.25 });
    l.detail.rect(18, 48, 36, 22).fill(0x3a3a34);      // hangar door
    for (let y = 50; y < 70; y += 4) l.detail.rect(18, y, 36, 1).fill(STEEL);
    stripe(l, 18, 46, 36);
  },
  radarDome: (l, _t, w, h) => {
    slab(l, w, h);
    l.paint.circle(24, 22, 16).fill(PAINT);
    l.detail.circle(24, 22, 16).stroke({ width: 1, color: DARK, alpha: 0.6 });
    l.detail.moveTo(10, 22).lineTo(38, 22).moveTo(24, 8).lineTo(24, 36).stroke({ width: 1, color: SHADE });
    l.detail.rect(22, 40, 4, 6).fill(STEEL);
  },
  serviceDepot: (l, _t, w, h) => {
    slab(l, w, h);
    l.detail.rect(26, 26, 20, 20).fill(0x45443e);      // drive-on pad
    l.detail.rect(34, 28, 4, 16).fill(WARN);
    l.detail.rect(28, 34, 16, 4).fill(WARN);
    roof(l, 4, 4, 18, 18);
    roof(l, 50, 50, 18, 18);
    for (const [x, y] of [[26, 26], [44, 26], [26, 44], [44, 44]]) l.detail.circle(x, y, 2).fill(0x8af07a);
  },
  techCenter: (l, _t, w, h) => {
    slab(l, w, h);
    roof(l, 4, 12, 40, 32);
    l.detail.rect(8, 16, 32, 6).fill(GLASS);
    l.detail.rect(22, 2, 3, 12).fill(STEEL);
    l.detail.circle(23, 3, 3).fill(0xe05a3a);
  },
  kennel: (l) => {
    l.paint.poly([2, 10, 12, 2, 22, 10, 22, 22, 2, 22]).fill(PAINT);
    l.detail.rect(8, 14, 8, 8).fill(DARK);
  },
  helipad: (l, _t, w, h) => {
    slab(l, w, h);
    l.detail.circle(24, 24, 18).fill(0x45443e);
    l.detail.circle(24, 24, 18).stroke({ width: 2, color: WARN });
    l.paint.rect(15, 14, 4, 20).fill(PAINT);
    l.paint.rect(29, 14, 4, 20).fill(PAINT);
    l.paint.rect(15, 22, 18, 4).fill(PAINT);
  },
  airfield: (l, _t, w, h) => {
    slab(l, w, h);
    l.detail.rect(4, 20, 64, 22).fill(0x45443e);       // runway
    for (let x = 8; x < 66; x += 10) l.detail.rect(x, 30, 5, 2).fill(0xf0f0e0);
    roof(l, 4, 2, 26, 16);
    l.detail.rect(52, 4, 3, 14).fill(STEEL);
  },
  navalYard: (l, _t, w, h) => {
    l.detail.rect(0, 0, w * C, h * C).fill({ color: 0x2e5468, alpha: 0.4 });
    l.detail.rect(2, 2, 68, 10).fill(CONCRETE);
    l.detail.rect(2, 2, 10, 68).fill(CONCRETE);
    l.detail.rect(60, 2, 10, 68).fill(CONCRETE);
    roof(l, 14, 4, 44, 8);
    l.detail.rect(30, 14, 3, 40).fill(STEEL);
  },
  subPen: (l, _t, w, h) => {
    l.detail.rect(0, 0, w * C, h * C).fill({ color: 0x2e5468, alpha: 0.4 });
    l.detail.roundRect(4, 4, 64, 40, 10).fill(CONCRETE);
    roof(l, 12, 10, 48, 26);
    l.detail.rect(26, 44, 20, 24).fill({ color: 0x1a3442, alpha: 0.8 });
  },
  phaseShifter: (l, _t, w, h) => {
    slab(l, w, h);
    l.paint.circle(24, 24, 15).fill(PAINT);
    for (const r of [12, 8, 4]) l.detail.circle(24, 24, r).stroke({ width: 2, color: 0x7ad0ff, alpha: 0.9 });
  },
  aegisProjector: (l, _t, w, h) => {
    slab(l, w, h);
    l.paint.poly([24, 6, 40, 15, 40, 33, 24, 42, 8, 33, 8, 15]).fill(PAINT);
    l.detail.poly([24, 12, 34, 18, 34, 30, 24, 36, 14, 30, 14, 18]).fill({ color: 0xffd04a, alpha: 0.8 });
  },
  missileSilo: (l, _t, w, h) => {
    slab(l, w, h);
    l.detail.rect(6, 4, 36, 16).fill(0x3a3a34);
    l.paint.rect(6, 4, 17, 16).fill(PAINT);
    l.paint.rect(25, 4, 17, 16).fill(PAINT);
    stripe(l, 6, 2, 36);
  },
  sandbagWall: (l) => {
    for (const [x, y] of [[2, 4], [12, 4], [7, 11], [2, 17], [12, 17]]) l.detail.roundRect(x, y, 10, 6, 3).fill(0xb8a678).stroke({ width: 1, color: 0x7a6a48 });
  },
  concreteWall: (l) => {
    l.detail.rect(1, 3, 22, 20).fill(0x000000);
    l.detail.rect(1, 1, 22, 20).fill(CONCRETE);
    l.detail.rect(1, 1, 22, 3).fill(0xb0ada2);
    l.detail.rect(11, 1, 1, 20).fill(CONCRETE_D);
  },
  pillbox: (l) => {
    l.detail.circle(12, 13, 11).fill({ color: 0, alpha: 0.3 });
    l.detail.circle(12, 12, 10).fill(CONCRETE);
    l.paint.circle(12, 12, 6).fill(PAINT);
    l.detail.rect(6, 4, 12, 2).fill(DARK);
  },
  camoPillbox: (l) => {
    l.detail.circle(12, 12, 10).fill(0x56693a);
    l.detail.circle(8, 9, 4).fill(0x3f5a2c);
    l.detail.circle(15, 14, 4).fill(0x4f6a34);
    l.paint.circle(12, 12, 3).fill(PAINT);
    l.detail.rect(6, 4, 12, 2).fill(DARK);
  },
  gunTurret: (l, t) => {
    l.detail.rect(2, 2, 20, 20).fill(CONCRETE);
    l.detail.rect(2, 19, 20, 3).fill(CONCRETE_D);
    if (t) {
      t.detail.rect(-1.2, -14, 2.4, 12).fill(STEEL);
      t.paint.circle(0, 0, 6).fill(PAINT);
      t.detail.circle(0, 0, 6).stroke({ width: 1, color: DARK, alpha: 0.6 });
    }
  },
  aaGun: (l) => {
    l.detail.rect(2, 2, 20, 20).fill(CONCRETE);
    l.paint.circle(12, 12, 6).fill(PAINT);
    l.detail.rect(8, 1, 2, 10).fill(STEEL);
    l.detail.rect(14, 1, 2, 10).fill(STEEL);
  },
  shroudGenerator: (l) => {
    l.detail.rect(4, 4, 16, 18).fill(0x1a1a18);
    l.paint.rect(4, 20, 16, 3).fill(PAINT);
    l.detail.circle(12, 10, 3).fill(0x7a5ab0);
  },
  flameTower: (l) => {
    l.detail.rect(4, 4, 16, 18).fill(CONCRETE);
    l.paint.rect(6, 6, 12, 10).fill(PAINT);
    l.detail.rect(10, 0, 4, 8).fill(0xa0402a);
  },
  arcTower: (l) => {
    l.detail.rect(5, 14, 14, 9).fill(CONCRETE);
    l.paint.rect(9, 4, 6, 12).fill(PAINT);
    for (let y = 5; y < 15; y += 3) l.detail.rect(8, y, 8, 1).fill(0xc79a3a);
    l.detail.circle(12, 4, 4).fill(0x9fd8ff);
  },
  samSite: (l, _t, w, h) => {
    slab(l, w, h);
    l.paint.rect(8, 6, 32, 12).fill(PAINT);
    for (const x of [12, 20, 28, 36]) l.detail.rect(x - 2, 4, 4, 14).fill(0xe0e0d4);
  },
  'civilian-house': (l) => {
    l.detail.rect(2, 6, 20, 16).fill(0xc8b48a);
    l.detail.poly([0, 8, 12, 0, 24, 8]).fill(0x8a3a2a);
    l.detail.rect(9, 14, 6, 8).fill(DARK);
  },
  'bridge-hut': (l) => {
    l.detail.rect(4, 6, 16, 14).fill(0x9a8a6a);
    l.detail.rect(10, 12, 4, 8).fill(DARK);
    l.detail.rect(2, 4, 20, 3).fill(0x6a5a3a);
  },
};

/** @typedef {{ paint: import('pixi.js').Texture, detail: import('pixi.js').Texture, turret: { paint: import('pixi.js').Texture, detail: import('pixi.js').Texture } | null, w: number, h: number }} StructureTextures */

/**
 * @param {import('pixi.js').Renderer} renderer
 * @returns {Map<string, StructureTextures>}
 */
export function bakeStructures(renderer) {
  /** @type {Map<string, StructureTextures>} */
  const out = new Map();
  const bake = (/** @type {Graphics} */ g, x0, y0, w, h) => {
    g.rect(x0, y0, w, h).fill({ color: 0, alpha: 0.001 });
    const tex = renderer.generateTexture({ target: g, resolution: 2.5, antialias: true });
    g.destroy();
    return tex;
  };
  for (const def of [...Object.values(STRUCTURES), ...Object.values(NEUTRAL)]) {
    const l = { paint: new Graphics(), detail: new Graphics() };
    const turret = def.id === 'gunTurret' ? { paint: new Graphics(), detail: new Graphics() } : null;
    const kit = KITS[def.id] ?? ((/** @type {Layers} */ x) => slab(x, def.w, def.h));
    kit(l, turret, def.w, def.h);
    const W = def.w * C;
    const H = def.h * C;
    out.set(def.id, {
      paint: bake(l.paint, 0, 0, W, H),
      detail: bake(l.detail, 0, 0, W, H),
      turret: turret ? { paint: bake(turret.paint, -16, -16, 32, 32), detail: bake(turret.detail, -16, -16, 32, 32) } : null,
      w: W,
      h: H,
    });
  }
  return out;
}
