// @ts-check
/**
 * Structure sprites: team-tinted art, build-up and sell animations, turret
 * aim, fire and smoke when red, selection outline, health bar, rally line,
 * primary marker and the repair wrench. Reads the world; never writes it.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { bakeStructures } from './structureBaker.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { RENDER, SIM, PRODUCTION, SELL } from '../data/rules.js';
import { STRUCTURES } from '../data/structures.js';
import { healthBand } from '../sim/formulas/combat.js';

const C = RENDER.cellPx;
const PX = C / SIM.leptonsPerCell;
const TAU = Math.PI * 2;
const BUILD_TICKS = Math.round(PRODUCTION.buildUpSeconds * SIM.ticksPerSecond);
const SELL_TICKS = Math.round(SELL.seconds * SIM.ticksPerSecond);
const BAND = { green: 0x7fd04a, amber: 0xe0a43a, red: 0xd0543a };
const NEUTRAL_TINT = 0xb8b4a6;

/** Radar dishes and other `spin` parts, radians per ms. */
const SPIN_SPEED = 0.0012;

/**
 * @param {import('pixi.js').Renderer} renderer
 * @param {Map<string, import('./art.js').StructureArt> | null} [art]  pre-rendered art; code-drawn when absent
 */
export function createStructureLayer(renderer, art = null) {
  /** @type {Map<string, any>} */
  const textures = new Map(bakeStructures(renderer));
  // Pre-rendered art replaces the code-drawn art type by type; anything not in the atlas keeps its drawing.
  if (art) for (const [id, t] of art) textures.set(id, t);
  const layer = new Container();
  layer.sortableChildren = true;
  const marks = new Graphics();
  const smoke = new Graphics();
  /** @type {Map<number, { root: Container, body: Container, turret: Container | null, paint: Sprite, tinted: Sprite[], spinners: Container[] }>} */
  const views = new Map();
  /** @type {{ x: number, y: number, vx: number, vy: number, life: number, max: number, fire: boolean }[]} */
  let puffs = [];
  /** Fog of war: enemy structures as last seen, by id (section 12). @type {Map<number, { cx: number, cy: number, w: number, h: number }>} */
  const memory = new Map();
  let last = performance.now();

  /** @param {any} s @param {number} tint */
  function make(s, tint) {
    const tex = /** @type {any} */ (textures.get(s.type));
    const root = new Container();
    const body = new Container();
    const paint = new Sprite(tex.paint);
    paint.tint = tint;
    const detail = new Sprite(tex.detail);
    // Pre-rendered buildings rise above their footprint: the image starts at (ox, oy).
    paint.position.set(tex.ox ?? 0, tex.oy ?? 0);
    detail.position.set(tex.ox ?? 0, tex.oy ?? 0);
    body.addChild(paint, detail);
    root.addChild(body);
    /** Every team-tinted sprite, so a capture recolours the whole building. */
    const tinted = [paint];
    /** @type {Container[]} */
    const spinners = [];
    let turret = null;
    for (const part of tex.parts ?? []) {
      const c = new Container();
      const pp = new Sprite(part.paint);
      pp.anchor.set(0.5);
      pp.tint = tint;
      const pd = new Sprite(part.detail);
      pd.anchor.set(0.5);
      c.addChild(pp, pd);
      c.position.set(part.x, part.y);
      body.addChild(c);
      tinted.push(pp);
      if (part.role === 'turret') turret = c; else spinners.push(c);
    }
    if (tex.turret) {
      turret = new Container();
      const tp = new Sprite(tex.turret.paint);
      tp.anchor.set(0.5);
      tp.tint = tint;
      const td = new Sprite(tex.turret.detail);
      td.anchor.set(0.5);
      turret.addChild(tp, td);
      turret.position.set(tex.w / 2, tex.h / 2);
      root.addChild(turret);
      tinted.push(tp);
    }
    layer.addChild(root);
    return { root, body, turret, paint, tinted, spinners };
  }

  return {
    layer,
    marks,
    smoke,
    textures,
    /**
     * @param {any} world @param {Set<number>} selected @param {number} selectedStructure @param {number} viewScale
     * @param {(e: any) => boolean} [visible]  Hide structures the player cannot see (shroud)
     * @param {{ viewer: number, seen: (x: number, y: number) => boolean, explored: (x: number, y: number) => boolean }} [eyes]
     *   Fog mode: enemy structures out of sight stay drawn as last seen until their cells are seen again
     */
    sync(world, selected, selectedStructure, viewScale, visible = () => true, eyes) {
      const fog = !!eyes && world.settings.fog;
      const anyCell = (/** @type {{ cx: number, cy: number, w: number, h: number }} */ f, /** @type {(x: number, y: number) => boolean} */ test) => {
        for (let y = f.cy; y < f.cy + f.h; y++) for (let x = f.cx; x < f.cx + f.w; x++) if (test(x, y)) return true;
        return false;
      };
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      marks.clear();
      const seen = new Set();
      for (const s of world.entities.all()) {
        if (s.dead || s.kind !== 'structure') continue;
        let v = views.get(s.id);
        const vis = visible(s);
        if (vis && fog && eyes && !world.allied(s.owner, eyes.viewer)) memory.set(s.id, { cx: s.cx, cy: s.cy, w: s.w, h: s.h });
        if (!vis) {
          if (!(fog && eyes && v && memory.has(s.id) && anyCell(s, eyes.explored))) { if (v) v.root.visible = false; continue; }
          // Remembered: drawn dimmed, frozen as last seen.
          seen.add(s.id);
          v.root.visible = true;
          v.root.alpha = 0.5;
          continue;
        }
        seen.add(s.id);
        const owner = s.owner >= 0 ? world.players[s.owner] : null;
        const tint = owner ? PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (owner.color)].main : NEUTRAL_TINT;
        if (!v) { v = make(s, tint); views.set(s.id, v); }
        v.root.visible = true;
        for (const sp of v.tinted) sp.tint = tint; // ownership changes on capture
        const x0 = s.cx * C;
        const y0 = s.cy * C;
        const H = s.h * C;
        v.root.position.set(x0, y0);
        v.root.zIndex = y0 + H;
        // Build-up rises from the ground; selling sinks back into it.
        let k = 1;
        if (s.buildUp > 0) k = 1 - s.buildUp / BUILD_TICKS;
        if (s.selling > 0) k = s.selling / SELL_TICKS;
        v.body.scale.y = 0.3 + 0.7 * k;
        v.body.position.y = H * (1 - v.body.scale.y);
        v.root.alpha = 0.55 + 0.45 * k;
        const def = /** @type {any} */ (STRUCTURES[s.type]);
        const dim = owner && owner.power.low && def && (def.tags.includes('radar') || def.tags.includes('powered'));
        v.body.tint = dim ? 0x9a9a9a : 0xffffff;
        if (v.turret) v.turret.rotation = (Math.round(s.turret / 8) * 8 * TAU) / 256;
        // Dishes turn while the building works (powered, built, not being sold).
        if (v.spinners.length && !dim && k === 1) for (const sp of v.spinners) sp.rotation += dt * SPIN_SPEED;

        const band = healthBand(s.hp, s.maxHp);
        if (band === 'red' && Math.random() < dt / 120) {
          const fx = x0 + Math.random() * s.w * C;
          const fy = y0 + Math.random() * H * 0.7;
          puffs.push({ x: fx, y: fy, vx: (Math.random() - 0.5) * 0.004, vy: -0.012, life: 0, max: 900 + Math.random() * 600, fire: Math.random() < 0.4 });
        }
        const isSel = s.id === selectedStructure;
        if (isSel) {
          const w = 1.5 / viewScale;
          marks.rect(x0 - 1, y0 - 1, s.w * C + 2, H + 2).stroke({ width: w, color: 0xf0f0e0, alpha: 0.9 });
          if (s.rally) {
            const rx = (s.rally.x + 0.5) * C;
            const ry = (s.rally.y + 0.5) * C;
            marks.moveTo(x0 + (s.w * C) / 2, y0 + H).lineTo(rx, ry).stroke({ width: w, color: 0x9fdc6a, alpha: 0.7 });
            marks.circle(rx, ry, 4).stroke({ width: w, color: 0x9fdc6a });
          }
        }
        if (isSel || s.hp < s.maxHp) {
          const bw = s.w * C - 4;
          const bh = 2.6 / Math.max(viewScale, 0.6);
          marks.rect(x0 + 2, y0 - 5, bw, bh).fill({ color: 0x0e0f0b, alpha: 0.8 });
          marks.rect(x0 + 2, y0 - 5, (bw * s.hp) / s.maxHp, bh).fill(BAND[band]);
        }
        if (s.primary && owner && def && ['barracks', 'factory', 'helipad', 'airfield', 'navalyard'].includes(def.role) && isSel) {
          marks.poly([x0 + 4, y0 + 3, x0 + 10, y0 + 3, x0 + 7, y0 + 8]).fill(0xe0a43a);
        }
        if (s.repairing && (!s.repairBlocked || Math.floor(now / 300) % 2 === 0)) {
          const cx = x0 + (s.w * C) / 2;
          const cy = y0 + H / 2;
          marks.circle(cx, cy, 6).fill({ color: 0x1b1d16, alpha: 0.8 }).stroke({ width: 1, color: 0x9fdc6a });
          marks.rect(cx - 3, cy - 0.8, 6, 1.6).fill(0x9fdc6a);
          marks.rect(cx - 0.8, cy - 3, 1.6, 6).fill(0x9fdc6a);
        }
      }
      for (const [id, v] of views) {
        if (seen.has(id)) continue;
        const ghost = fog && eyes ? memory.get(id) : undefined;
        if (ghost && !world.entities.get(id)) {
          // Destroyed out of sight: the ghost stays until its cells are seen again.
          if (!anyCell(ghost, eyes.seen)) { v.root.visible = true; v.root.alpha = 0.5; continue; }
          memory.delete(id);
        }
        if (world.entities.get(id)) continue;
        memory.delete(id);
        v.root.destroy({ children: true });
        views.delete(id);
      }
      smoke.clear();
      puffs = puffs.filter((p) => (p.life += dt) < p.max);
      for (const p of puffs) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const f = p.life / p.max;
        if (p.fire && f < 0.35) smoke.circle(p.x, p.y, 2 + f * 4).fill({ color: f < 0.15 ? 0xffd04a : 0xf07a2a, alpha: 0.9 - f * 2 });
        else smoke.circle(p.x, p.y, 2 + f * 7).fill({ color: 0x3a3833, alpha: 0.5 * (1 - f) });
      }
    },
    /** Rendered footprint size of a type, px. @param {string} type */
    sizeOf: (type) => textures.get(type),
  };
}
