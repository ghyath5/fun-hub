// @ts-check
/**
 * Unit sprites. Reads the world each frame (never writes it): creates and
 * removes sprites as units appear and die, interpolates positions between the
 * last two ticks, quantises facings to the frames each class is drawn with,
 * and draws selection marks and health bars.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { bakeUnits } from './spriteBaker.js';
import { UNITS, FACING_FRAMES } from '../data/units.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { RENDER, SIM } from '../data/rules.js';
import { healthBand } from '../sim/formulas/combat.js';

const PX_PER_LEPTON = RENDER.cellPx / SIM.leptonsPerCell;
const TAU = Math.PI * 2;
/** How high aircraft in flight are drawn above their shadow, world px. */
const ALTITUDE_PX = 10;
const BAND_COLOR = { green: 0x7fd04a, amber: 0xe0a43a, red: 0xd0543a };

/** Facing (0–255) → rotation, snapped to `frames` directions. */
function rotationOf(facing, frames) {
  const step = 256 / frames;
  return ((Math.round(facing / step) * step) / 256) * TAU;
}

/** @param {string} type */
function framesFor(type) {
  const loco = UNITS[type].loco;
  if (loco === 'foot') return FACING_FRAMES.infantry;
  if (loco === 'air') return FACING_FRAMES.aircraft;
  return FACING_FRAMES.vehicle;
}

/**
 * @param {import('pixi.js').Renderer} renderer
 */
export function createUnitLayer(renderer) {
  const textures = bakeUnits(renderer);
  const layer = new Container();
  layer.sortableChildren = true;
  const marks = new Graphics();
  /** @type {Map<number, { root: Container, body: Container, turret: Container | null, shadow: Graphics, look: string }>} */
  const views = new Map();

  /** @param {string} type @param {number} tint @param {string} look */
  function make(type, tint, look) {
    const tex = /** @type {import('./spriteBaker.js').UnitTextures} */ (textures.get(type));
    const root = new Container();
    const shadow = new Graphics().ellipse(1.5, 2, tex.radius * 0.9, tex.radius * 0.7).fill({ color: 0x000000, alpha: 0.28 });
    const body = new Container();
    const paint = new Sprite(tex.paint);
    paint.anchor.set(0.5);
    paint.tint = tint;
    const detail = new Sprite(tex.detail);
    detail.anchor.set(0.5);
    body.addChild(paint, detail);
    root.addChild(shadow, body);
    let turret = null;
    if (tex.turret) {
      turret = new Container();
      const tp = new Sprite(tex.turret.paint);
      tp.anchor.set(0.5);
      tp.tint = tint;
      const td = new Sprite(tex.turret.detail);
      td.anchor.set(0.5);
      turret.addChild(tp, td);
      root.addChild(turret);
    }
    layer.addChild(root);
    return { root, body, turret, shadow, look };
  }

  /**
   * What a unit looks like to the viewer: a Spy shows enemies one of their own
   * Riflemen in their colour (section 10).
   * @param {any} world @param {any} e @param {number} viewer
   */
  function lookOf(world, e, viewer) {
    if (viewer >= 0 && e.type === 'spy' && !world.allied(e.owner, viewer)) {
      return { type: 'rifleman', color: world.players[viewer].color };
    }
    return { type: e.type, color: world.players[e.owner].color };
  }

  return {
    layer,
    marks,
    textures,
    /** World-px radius of a unit type (hit testing). @param {string} type */
    radiusOf: (type) => textures.get(type)?.radius ?? 8,
    /**
     * @param {any} world
     * @param {number} alpha  Interpolation between the previous and current tick
     * @param {Set<number>} selected
     * @param {number} viewScale  Screen px per world px (keeps marks crisp)
     * @param {(e: any) => boolean} [visible]  Hide what the player cannot see
     * @param {number} [viewer]  Whose eyes (disguises); -1 = see everything as it is
     */
    sync(world, alpha, selected, viewScale, visible = () => true, viewer = -1) {
      const seen = new Set();
      marks.clear();
      for (const e of world.entities.all()) {
        if (e.dead || e.kind !== 'unit') continue;
        let v = views.get(e.id);
        if (e.inside || !visible(e)) { if (v) v.root.visible = false; if (v) seen.add(e.id); continue; }
        seen.add(e.id);
        const look = lookOf(world, e, viewer);
        const lookKey = `${look.type}|${look.color}`;
        if (v && v.look !== lookKey) { v.root.destroy({ children: true }); v = undefined; }
        if (!v) {
          const color = PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (look.color)];
          v = make(look.type, color.main, lookKey);
          views.set(e.id, v);
        }
        v.root.visible = true;
        v.root.alpha = e.submerged ? 0.45 : 1;
        const x = (e.px + (e.x - e.px) * alpha) * PX_PER_LEPTON;
        const y = (e.py + (e.y - e.py) * alpha) * PX_PER_LEPTON;
        v.root.position.set(x, y);
        // Aircraft in flight sit above their shadow and over everything on the ground.
        const flying = UNITS[e.type].loco === 'air' && !e.landed;
        const lift = flying ? ALTITUDE_PX : 0;
        v.body.position.y = -lift;
        if (v.turret) v.turret.position.y = -lift;
        v.shadow.alpha = flying ? 0.6 : 1;
        v.root.zIndex = y + (flying ? 10000 : 0);
        const frames = framesFor(look.type);
        v.body.rotation = rotationOf(e.facing, frames);
        if (v.turret) v.turret.rotation = rotationOf(e.turret, FACING_FRAMES.turret);

        const r = textures.get(look.type)?.radius ?? 8;
        const isSel = selected.has(e.id);
        const hurt = e.hp < e.maxHp;
        if (isSel) {
          const w = 1.5 / viewScale;
          if (UNITS[e.type].loco === 'foot') {
            marks.circle(x, y, r + 2).stroke({ width: w, color: 0xf0f0e0, alpha: 0.9 });
          } else {
            const s = r + 3;
            const c = s * 0.45;
            for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              marks.moveTo(x + sx * s, y + sy * (s - c)).lineTo(x + sx * s, y + sy * s).lineTo(x + sx * (s - c), y + sy * s);
            }
            marks.stroke({ width: w, color: 0xf0f0e0, alpha: 0.95 });
          }
        }
        if (isSel || hurt) {
          const bw = Math.max(10, r * 2);
          const bh = 2.4 / Math.max(viewScale, 0.6);
          const by = y - r - 6 - (UNITS[e.type].loco === 'air' && !e.landed ? ALTITUDE_PX : 0);
          marks.rect(x - bw / 2, by, bw, bh).fill({ color: 0x0e0f0b, alpha: 0.8 });
          marks.rect(x - bw / 2, by, (bw * e.hp) / e.maxHp, bh).fill(BAND_COLOR[healthBand(e.hp, e.maxHp)]);
        }
      }
      for (const [id, v] of views) {
        if (seen.has(id)) continue;
        v.root.destroy({ children: true });
        views.delete(id);
      }
    },
  };
}
