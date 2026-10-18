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

/** World-px offset of a unit's shadow (south-east, away from the sun), on the ground and in flight. */
const SHADOW = { x: 2.2, y: 3, alpha: 0.45, flyingX: 5, flyingY: 6 };
/** Rotor speed, radians per ms. */
const ROTOR_SPEED = 0.045;

/** Paint + detail sprites, centred; paint takes the team tint. @param {{ paint: any, detail: any }} t @param {number} tint */
function layered(t, tint) {
  const c = new Container();
  const paint = new Sprite(t.paint);
  paint.anchor.set(0.5);
  paint.tint = tint;
  const detail = new Sprite(t.detail);
  detail.anchor.set(0.5);
  c.addChild(paint, detail);
  return c;
}

/**
 * @param {import('pixi.js').Renderer} renderer
 * @param {Map<string, import('./art.js').UnitArt> | null} [art]  pre-rendered art; code-drawn when absent
 */
export function createUnitLayer(renderer, art = null) {
  // Pre-rendered art where the atlas has it; any type it lacks is drawn in code, so nothing is ever missing.
  /** @type {Map<string, any>} */
  const textures = new Map(art ?? []);
  const missing = Object.keys(UNITS).filter((id) => !textures.has(id));
  if (missing.length) for (const [id, t] of bakeUnits(renderer, missing)) textures.set(id, t);
  const layer = new Container();
  layer.sortableChildren = true;
  const marks = new Graphics();
  /** @type {Map<number, { root: Container, body: Container, turret: Container | null, shadow: Container, rotors: Container[], look: string }>} */
  const views = new Map();
  let lastFrame = performance.now();

  /** @param {string} type @param {number} tint @param {string} look */
  function make(type, tint, look) {
    const tex = textures.get(type);
    const root = new Container();
    /** @type {Container} */
    let shadow;
    if (tex.art) {
      // The unit's own silhouette, darkened: the shadow has the right shape at every facing.
      shadow = layered(tex, 0x000000);
      for (const s of shadow.children) /** @type {Sprite} */ (s).tint = 0x000000;
      shadow.alpha = SHADOW.alpha;
    } else {
      shadow = new Graphics().ellipse(1.5, 2, tex.radius * 0.9, tex.radius * 0.7).fill({ color: 0x000000, alpha: 0.28 });
    }
    const body = layered(tex, tint);
    root.addChild(shadow, body);
    const turret = tex.turret ? layered(tex.turret, tint) : null;
    if (turret) root.addChild(turret);
    /** @type {Container[]} */
    const rotors = [];
    for (const r of tex.rotors ?? []) {
      const c = layered(r, tint);
      c.position.set(r.x, r.y);
      c.alpha = 0.85;
      body.addChild(c);
      rotors.push(c);
    }
    layer.addChild(root);
    return { root, body, turret, shadow, rotors, look };
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
      const now = performance.now();
      const dt = Math.min(100, now - lastFrame);
      lastFrame = now;
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
        // Submerged subs and disguised Mirage Tanks show see-through to their own side.
        const hidden = e.submerged || (e.detect !== undefined && e.detect !== -1 && UNITS[e.type].tags.includes('disguise'));
        v.root.alpha = hidden ? 0.45 : 1;
        const x = (e.px + (e.x - e.px) * alpha) * PX_PER_LEPTON;
        const y = (e.py + (e.y - e.py) * alpha) * PX_PER_LEPTON;
        v.root.position.set(x, y);
        // Aircraft in flight sit above their shadow and over everything on the ground.
        const flying = UNITS[e.type].loco === 'air' && !e.landed;
        const lift = flying ? ALTITUDE_PX : 0;
        v.body.position.y = -lift;
        if (v.turret) v.turret.position.y = -lift;
        v.root.zIndex = y + (flying ? 10000 : 0);
        const frames = framesFor(look.type);
        v.body.rotation = rotationOf(e.facing, frames);
        if (v.turret) v.turret.rotation = rotationOf(e.turret, FACING_FRAMES.turret);
        if (v.shadow instanceof Graphics) v.shadow.alpha = flying ? 0.6 : 1;
        else {
          v.shadow.rotation = v.body.rotation;
          v.shadow.position.set(flying ? SHADOW.flyingX : SHADOW.x, flying ? SHADOW.flyingY : SHADOW.y); // on the ground, below a lifted body
          v.shadow.alpha = flying ? SHADOW.alpha * 0.7 : SHADOW.alpha;
        }
        // Rotors turn while flying and idle down once landed.
        for (const r of v.rotors) r.rotation += dt * ROTOR_SPEED * (flying ? 1 : 0.15);

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
