// @ts-check
/**
 * Unit art drawn in code and baked once into textures (section 19). Every
 * unit is drawn facing north, centred on (0, 0), in world pixels (1 cell = 24).
 * Two layers per part: `paint` is drawn light grey and tinted with the team
 * colour at runtime; `detail` keeps its own colours. Turreted units get a
 * separate turret part that rotates on its own.
 */
import { Graphics } from 'pixi.js';
import { UNITS } from '../data/units.js';

const PAINT = 0xdedad0;
const PAINT_SHADE = 0xb0aca2;
const DARK = 0x2a2a24;
const STEEL = 0x55574d;
const LIGHT = 0xbfc2b0;

/** @typedef {{ paint: Graphics, detail: Graphics }} Layers */
/** @typedef {(body: Layers, turret: Layers | null) => void} Kit */

/** Tracked hull: two tracks and a hull between. */
function trackedHull(/** @type {Layers} */ b, len, wid, trackW = 3) {
  b.detail.rect(-wid / 2, -len / 2, trackW, len).fill(DARK);
  b.detail.rect(wid / 2 - trackW, -len / 2, trackW, len).fill(DARK);
  for (let y = -len / 2 + 1; y < len / 2; y += 3) {
    b.detail.rect(-wid / 2, y, trackW, 1).fill(STEEL);
    b.detail.rect(wid / 2 - trackW, y, trackW, 1).fill(STEEL);
  }
  b.paint.roundRect(-wid / 2 + trackW - 0.5, -len / 2 + 1, wid - trackW * 2 + 1, len - 2, 1.5).fill(PAINT);
  b.paint.rect(-wid / 2 + trackW, len / 2 - 4, wid - trackW * 2, 2).fill(PAINT_SHADE);
}

/** Four wheels and a body. */
function wheeledHull(/** @type {Layers} */ b, len, wid) {
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.detail.roundRect(x * (wid / 2) - (x > 0 ? 3 : 0), y * (len / 2 - 4) - 2.5, 3, 5, 1).fill(DARK);
  }
  b.paint.roundRect(-wid / 2 + 1.5, -len / 2, wid - 3, len, 2).fill(PAINT);
}

/** Round turret with one or two barrels. */
function gunTurret(/** @type {Layers} */ t, r, barrel, twin = false, barrelW = 1.6) {
  const offs = twin ? [-1.6, 1.6] : [0];
  for (const o of offs) t.detail.rect(o - barrelW / 2, -r - barrel, barrelW, barrel + r * 0.5).fill(STEEL);
  t.paint.circle(0, 0, r).fill(PAINT);
  t.detail.circle(0, 0, r).stroke({ width: 0.8, color: DARK, alpha: 0.6 });
  t.detail.circle(0, r * 0.3, r * 0.35).fill({ color: DARK, alpha: 0.35 });
}

/** Infantry: shoulders and pack in team paint, head and weapon in detail. */
function soldier(/** @type {Layers} */ b, weaponLen = 4, extra = (/** @type {Layers} */ _l) => {}) {
  b.paint.ellipse(0, 0.5, 3.2, 2.4).fill(PAINT);
  b.detail.rect(1.2, -weaponLen - 0.5, 1, weaponLen + 1).fill(DARK);
  b.detail.circle(0, -0.2, 1.5).fill(0xc9a27e);
  extra(b);
}

/** @type {Record<string, Kit>} */
const KITS = {
  // Infantry
  rifleman: (b) => soldier(b),
  rocketTrooper: (b) => soldier(b, 5, (l) => l.detail.rect(0.6, -5.5, 2, 6).fill(STEEL)),
  engineer: (b) => soldier(b, 0, (l) => l.detail.circle(0, -0.2, 1.6).fill(0xe0b030)),
  grenadier: (b) => soldier(b, 2, (l) => l.detail.circle(-1.8, 1.2, 1).fill(STEEL)),
  flameTrooper: (b) => soldier(b, 3, (l) => l.detail.roundRect(-2, 1, 4, 2.4, 1).fill(0xa0402a)),
  hound: (b) => {
    b.paint.ellipse(0, 0.5, 1.8, 4).fill(PAINT);
    b.detail.ellipse(0, -3.6, 1.3, 1.6).fill(0x4a3a2a);
    b.detail.rect(-0.4, 4, 0.8, 2).fill(0x4a3a2a);
  },
  medic: (b) => soldier(b, 0, (l) => {
    l.detail.rect(-0.5, -2, 1, 3.2).fill(0xffffff);
    l.detail.rect(-1.6, -0.9, 3.2, 1).fill(0xffffff);
  }),
  spy: (b) => soldier(b, 0, (l) => l.detail.ellipse(0, -0.2, 2.2, 1.1).fill(0x2a2a2a)),
  thief: (b) => soldier(b, 0, (l) => l.detail.circle(-1.6, 1.4, 1.2).fill(0x6a5a3a)),
  commando: (b) => soldier(b, 5, (l) => l.detail.rect(-1.5, -1, 3, 0.7).fill(0xb02a2a)),

  // Vehicles
  harvester: (b) => {
    trackedHull(b, 22, 18, 4);
    b.detail.rect(-7, -12, 14, 3).fill(STEEL);
    b.detail.rect(-5, -4, 10, 9).fill({ color: 0xd9a83a, alpha: 0.85 });
    b.detail.rect(-5, -4, 10, 9).stroke({ width: 0.8, color: DARK });
  },
  mcv: (b) => {
    wheeledHull(b, 22, 16);
    b.detail.rect(-5.5, -10, 11, 5).fill({ color: 0x9fb4c0, alpha: 0.9 });
    b.detail.rect(-6, -3, 12, 11).stroke({ width: 1, color: DARK, alpha: 0.6 });
    b.detail.circle(0, 2.5, 3).stroke({ width: 1, color: DARK, alpha: 0.6 });
  },
  mineLayer: (b) => {
    trackedHull(b, 16, 13);
    for (let k = 0; k < 3; k++) b.detail.circle(-3 + k * 3, 4, 1.1).fill(STEEL);
  },
  ranger: (b, t) => {
    wheeledHull(b, 14, 10);
    b.detail.rect(-3.5, -6, 7, 3).fill({ color: 0x9fb4c0, alpha: 0.9 });
    if (t) gunTurret(t, 2.2, 5, false, 1.1);
  },
  apc: (b, t) => {
    trackedHull(b, 18, 13);
    b.detail.rect(-3, 4, 6, 3).stroke({ width: 0.8, color: DARK, alpha: 0.6 });
    if (t) gunTurret(t, 2.4, 5, false, 1.1);
  },
  lightTank: (b, t) => { trackedHull(b, 16, 13); if (t) gunTurret(t, 3.6, 7); },
  mediumTank: (b, t) => { trackedHull(b, 18, 14); if (t) gunTurret(t, 4.2, 8, false, 1.9); },
  artillery: (b) => {
    wheeledHull(b, 15, 11);
    b.detail.rect(-1.2, -16, 2.4, 14).fill(STEEL);
    b.detail.circle(0, 1, 3).fill(STEEL);
  },
  heavyTank: (b, t) => { trackedHull(b, 20, 16, 3.5); if (t) gunTurret(t, 4.8, 8, true); },
  titanTank: (b, t) => {
    trackedHull(b, 22, 20, 4.5);
    if (t) {
      gunTurret(t, 5.6, 9, true, 2);
      for (const s of [-1, 1]) {
        t.paint.rect(s * 6.5 - 1.8, -3, 3.6, 7).fill(PAINT_SHADE);
        t.detail.rect(s * 6.5 - 1.2, -3.5, 2.4, 1.2).fill(0xb03a2a);
      }
    }
  },
  ballisticLauncher: (b) => {
    wheeledHull(b, 18, 11);
    b.detail.roundRect(-1.8, -9, 3.6, 15, 1.8).fill(LIGHT);
    b.detail.poly([-1.8, -9, 0, -12, 1.8, -9]).fill(0xb03a2a);
  },

  // Aircraft (milestone 6 refines these)
  transportHeli: (b) => {
    b.paint.ellipse(0, 1, 4, 8).fill(PAINT);
    b.detail.rect(-0.6, 6, 1.2, 7).fill(STEEL);
    b.detail.circle(0, 0, 10).stroke({ width: 0.8, color: DARK, alpha: 0.4 });
  },
  attackHeli: (b) => {
    b.paint.ellipse(0, 0, 3.2, 7).fill(PAINT);
    b.detail.rect(-0.6, 5, 1.2, 7).fill(STEEL);
    b.detail.rect(-6, -1, 12, 1.4).fill(STEEL);
    b.detail.circle(0, 0, 9).stroke({ width: 0.8, color: DARK, alpha: 0.4 });
  },
  attackPlane: (b) => { b.paint.poly([0, -10, 9, 6, 0, 3, -9, 6]).fill(PAINT); b.detail.rect(-0.6, -9, 1.2, 4).fill(DARK); },
  supportPlane: (b) => {
    b.paint.poly([0, -12, 3, -4, 13, 0, 13, 3, 3, 2, 2, 9, 5, 12, -5, 12, -2, 9, -3, 2, -13, 3, -13, 0, -3, -4]).fill(PAINT);
    b.detail.rect(-1, -10, 2, 18).fill(DARK).circle(0, -8, 1.4).fill(0x9fb4c0);
  },
  strikeJet: (b) => { b.paint.poly([0, -11, 7, 8, 0, 5, -7, 8]).fill(PAINT); b.detail.poly([0, -11, 2, -4, -2, -4]).fill(0x9fb4c0); },

  // Ships (milestone 6 refines these)
  gunboat: (b, t) => { b.paint.poly([0, -11, 5, -4, 5, 10, -5, 10, -5, -4]).fill(PAINT); if (t) gunTurret(t, 2.4, 5); },
  destroyer: (b, t) => { b.paint.poly([0, -14, 6, -5, 6, 13, -6, 13, -6, -5]).fill(PAINT); if (t) gunTurret(t, 3, 6, true); },
  cruiser: (b, t) => { b.paint.poly([0, -18, 8, -6, 8, 17, -8, 17, -8, -6]).fill(PAINT); if (t) gunTurret(t, 4.5, 9, true, 2.2); },
  submarine: (b) => { b.paint.ellipse(0, 0, 3.5, 12).fill(PAINT); b.detail.roundRect(-1.5, -3, 3, 5, 1).fill(STEEL); },
  navalTransport: (b) => { b.paint.roundRect(-7, -12, 14, 24, 3).fill(PAINT); b.detail.rect(-4.5, -6, 9, 14).stroke({ width: 1, color: DARK, alpha: 0.6 }); },
};

/** Fallback for any type without a kit: a labelled box, so nothing is ever invisible. */
const fallback = (/** @type {Layers} */ b) => { b.paint.rect(-6, -6, 12, 12).fill(PAINT); b.detail.rect(-1, -8, 2, 4).fill(DARK); };

/**
 * @typedef {object} UnitTextures
 * @property {import('pixi.js').Texture} paint
 * @property {import('pixi.js').Texture} detail
 * @property {{ paint: import('pixi.js').Texture, detail: import('pixi.js').Texture } | null} turret
 * @property {number} radius  World px, for hit testing and selection marks
 */

/**
 * Bake every unit type once. The invisible square fixes each texture's bounds
 * so its centre is the unit's centre.
 * @param {import('pixi.js').Renderer} renderer
 * @param {string[]} [only]  bake just these types (the rest come from the atlas)
 * @returns {Map<string, UnitTextures>}
 */
export function bakeUnits(renderer, only) {
  const HALF = 24;
  const bake = (/** @type {Graphics} */ g) => {
    g.rect(-HALF, -HALF, HALF * 2, HALF * 2).fill({ color: 0, alpha: 0.001 });
    const tex = renderer.generateTexture({ target: g, resolution: 3, antialias: true });
    g.destroy();
    return tex;
  };
  const layers = () => ({ paint: new Graphics(), detail: new Graphics() });
  /** @type {Map<string, UnitTextures>} */
  const out = new Map();
  for (const def of Object.values(UNITS)) {
    if (only && !only.includes(def.id)) continue;
    const body = layers();
    const turret = def.turret ? layers() : null;
    (KITS[def.id] ?? fallback)(body, turret);
    const b = body.paint.getLocalBounds();
    const radius = Math.max(4, Math.max(-b.minX, b.maxX, -b.minY, b.maxY) * 0.8);
    out.set(def.id, {
      paint: bake(body.paint),
      detail: bake(body.detail),
      turret: turret ? { paint: bake(turret.paint), detail: bake(turret.detail) } : null,
      radius,
    });
  }
  return out;
}
