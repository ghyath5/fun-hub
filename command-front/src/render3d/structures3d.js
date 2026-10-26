// @ts-check
/**
 * Structures in 3D: models on their footprints, rising out of the ground as
 * they are built and sinking as they are sold, turrets aiming, dishes
 * turning, dimmed when the power is low; walls joining their neighbours;
 * enemy buildings remembered under the fog. Selection outlines, health bars,
 * rally lines, the repair wrench, smoke and the yard's flag are 2D overlays.
 * Reads the world; never writes it.
 */
import * as THREE from 'three';
import { Container, Graphics } from 'pixi.js';
import { createFlagpole } from '../render/flagpole.js';
import { RENDER, SIM, PRODUCTION, SELL } from '../data/rules.js';
import { STRUCTURES } from '../data/structures.js';
import { healthBand } from '../sim/formulas/combat.js';
import { drawPips } from '../render/healthPips.js';
import { CELL, LIFT, SQUASH } from './view.js';
import { teamColor } from './units3d.js';
import { buildingSize } from '../render/readability.js';

const C = RENDER.cellPx;
const TAU = Math.PI * 2;
const BUILD_TICKS = Math.round(PRODUCTION.buildUpSeconds * SIM.ticksPerSecond);
const SELL_TICKS = Math.round(SELL.seconds * SIM.ticksPerSecond);
const NEUTRAL = new THREE.Color(0xb8b4a6);
/** Radar dishes and other `spin` parts, radians per ms. */
const SPIN_SPEED = 0.0012;
/** Neighbour offsets for wall joints: east, south, west, north. */
const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * @param {import('./library.js').Library} lib
 * @param {import('./instances.js').Instancer} inst
 */
export function createStructures3D(lib, inst) {
  const marks = new Graphics();
  const smoke = new Graphics();
  const flags = new Container();
  /** @type {Map<number, { spin: number, flag?: ReturnType<typeof createFlagpole> | null, flagId?: string }>} */
  const state = new Map();
  /** Fog of war: enemy structures as last seen (section 12). @type {Map<number, { type: string, key: string, cx: number, cy: number, w: number, h: number, color: THREE.Color }>} */
  const memory = new Map();
  /** @type {{ x: number, y: number, vx: number, vy: number, life: number, max: number, fire: boolean }[]} */
  let puffs = [];
  let last = performance.now();
  const m = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();

  /** Model key: the owner's faction look first. @param {any} s */
  const keyOf = (s) => (s.faction ? `${s.type}@${s.faction}` : s.type);

  /**
   * Put a model's parts on a footprint corner, drawn at the building size chosen in Settings
   * (grown about the footprint's middle, standing on the ground).
   * @param {import('./library.js').ModelDef} def @param {number} cx @param {number} cy
   * @param {THREE.Color} color @param {{ rise?: number, bright?: number, ghost?: boolean, turret?: number, spin?: number, w?: number, h?: number, wall?: boolean }} o
   *   w, h: the footprint in cells (1×1 when left out); wall: life size, so its arms meet the next wall's
   */
  function place(def, cx, cy, color, o = {}) {
    const rise = Math.max(0.02, o.rise ?? 1);
    const k = o.wall ? 1 : buildingSize();
    const hw = (o.w ?? 1) / 2;
    const hh = (o.h ?? 1) / 2;
    for (const p of def.parts) {
      m.makeTranslation((cx + hw) * C, 0, (cy + hh) * C).multiply(tmp.makeScale(CELL * k, CELL * rise * k, CELL * k))
        .multiply(tmp.makeTranslation(p.pivot.x - hw, p.pivot.y, p.pivot.z - hh));
      if (p.orient) m.multiply(tmp.makeRotationFromQuaternion(p.orient));
      if (p.role === 'turret' && o.turret !== undefined) m.multiply(tmp.makeRotationY((-o.turret / 256) * TAU));
      if (p.role === 'spin' || p.role === 'rotor') m.multiply(tmp.makeRotationY(o.spin ?? 0));
      inst.add(p, m, color, o.bright ?? 1, !!o.ghost);
    }
  }

  /** Wall arms toward neighbouring walls of the same kind. @param {any} world @param {any} s @param {THREE.Color} color */
  function wallArms(world, s, color) {
    const arm = lib.get(`${s.type}:arm`);
    const W = world.map.width;
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = SIDES[k];
      const x = s.cx + dx, y = s.cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= world.map.height) continue;
      const id = world.occ.bld[y * W + x];
      const n = id ? world.entities.get(id) : null;
      if (!n || n.type !== s.type) continue;
      for (const p of arm.parts) {
        m.makeTranslation((s.cx + 0.5) * C, 0, (s.cy + 0.5) * C).multiply(tmp.makeRotationY((-k * Math.PI) / 2)).multiply(tmp.makeScale(CELL, CELL, CELL));
        inst.add(p, m, color, 1, false);
      }
    }
  }

  return {
    marks,
    smoke,
    /** Flags fly over everything on the ground. */
    flags,
    /** World-px height of a structure's model. @param {string} key */
    heightOf: (key) => lib.get(key).height * CELL,
    /**
     * @param {any} world @param {Set<number>} selected @param {number} selectedStructure @param {number} viewScale
     * @param {(e: any) => boolean} visible
     * @param {{ viewer: number, seen: (x: number, y: number) => boolean, explored: (x: number, y: number) => boolean } | undefined} eyes
     * @param {{ x0: number, y0: number, x1: number, y1: number }} view  world px on screen (with margin)
     * @param {number} [hover]  the entity under the mouse: its health shows
     */
    sync(world, selected, selectedStructure, viewScale, visible, eyes, view, hover = 0) {
      const fog = !!eyes && world.settings.fog;
      const anyCell = (/** @type {{ cx: number, cy: number, w: number, h: number }} */ f, /** @type {(x: number, y: number) => boolean} */ test) => {
        for (let y = f.cy; y < f.cy + f.h; y++) for (let x = f.cx; x < f.cx + f.w; x++) if (test(x, y)) return true;
        return false;
      };
      const onScreen = (/** @type {{ cx: number, cy: number, w: number, h: number }} */ f) => (f.cx + f.w) * C >= view.x0 && f.cx * C <= view.x1 && (f.cy + f.h) * C >= view.y0 && f.cy * C <= view.y1;
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      marks.clear();
      flags.removeChildren();
      const alive = new Set();
      for (const s of world.entities.all()) {
        if (s.dead || s.kind !== 'structure') continue;
        alive.add(s.id);
        const owner = s.owner >= 0 ? world.players[s.owner] : null;
        const color = owner ? teamColor(owner.color) : NEUTRAL;
        const vis = visible(s);
        if (vis && fog && eyes && !world.allied(s.owner, eyes.viewer)) memory.set(s.id, { type: s.type, key: keyOf(s), cx: s.cx, cy: s.cy, w: s.w, h: s.h, color });
        if (!vis) continue; // remembered ones are drawn below
        if (!onScreen(s)) continue;
        let st = state.get(s.id);
        if (!st) { st = { spin: Math.random() * TAU }; state.set(s.id, st); }
        const def = lib.get(keyOf(s));
        // Build-up rises from the ground; selling sinks back into it.
        let k = 1;
        if (s.buildUp > 0) k = 1 - s.buildUp / BUILD_TICKS;
        if (s.selling > 0) k = s.selling / SELL_TICKS;
        const sd = /** @type {any} */ (STRUCTURES[s.type]);
        const dim = !!(owner && owner.power.low && sd && (sd.tags.includes('radar') || sd.tags.includes('powered')));
        if (!dim && k === 1) st.spin += dt * SPIN_SPEED;
        place(def, s.cx, s.cy, color, { rise: k, bright: dim ? 0.6 : 1, turret: s.turret, spin: st.spin, w: s.w, h: s.h, wall: sd?.role === 'wall' });
        if (sd?.role === 'wall' && k === 1) wallArms(world, s, color);

        const x0 = s.cx * C;
        const y0 = s.cy * C;
        const H = s.h * C;
        const top = y0 - def.height * CELL * k * (sd?.role === 'wall' ? 1 : buildingSize()) * LIFT;
        // The owner's flag flies over each Construction Yard (and changes hands with it).
        const flagWanted = s.type === 'constructionYard' && owner?.country ? owner.country : '';
        if (st.flagId !== flagWanted) {
          st.flag?.destroy();
          st.flag = flagWanted ? createFlagpole(flagWanted) : null;
          st.flagId = flagWanted;
        }
        if (st.flag && k === 1) {
          st.flag.update(now);
          st.flag.view.position.set(x0 + C * 0.3, y0 + C * 0.55);
          st.flag.view.scale.set(0.8, 0.8 / SQUASH);
          flags.addChild(st.flag.view);
        }

        const band = healthBand(s.hp, s.maxHp);
        if (band === 'red' && Math.random() < dt / 120) {
          const fx = x0 + Math.random() * s.w * C;
          const fy = y0 + H * (0.2 + Math.random() * 0.6) - def.height * CELL * LIFT * (0.4 + Math.random() * 0.5);
          puffs.push({ x: fx, y: fy, vx: (Math.random() - 0.5) * 0.004, vy: -0.016, life: 0, max: 900 + Math.random() * 600, fire: Math.random() < 0.4 });
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
        if (isSel || s.hp < s.maxHp || s.id === hover) {
          const bh = 2.8 / Math.max(viewScale, 0.6) / SQUASH;
          drawPips(marks, x0 + 3, top - 8, s.w * C - 6, bh, s.hp, s.maxHp);
        }
        if (s.primary && owner && sd && ['barracks', 'factory', 'helipad', 'airfield', 'navalyard'].includes(sd.role) && isSel) {
          marks.poly([x0 + 4, top - 2, x0 + 10, top - 2, x0 + 7, top + 5]).fill(0xe0a43a);
        }
        if (s.repairing && (!s.repairBlocked || Math.floor(now / 300) % 2 === 0)) {
          const cx = x0 + (s.w * C) / 2;
          const cy = (y0 + H / 2 + top) / 2;
          marks.ellipse(cx, cy, 6, 6 / SQUASH).fill({ color: 0x1b1d16, alpha: 0.8 }).stroke({ width: 1, color: 0x9fdc6a });
          marks.rect(cx - 3, cy - 0.8 / SQUASH, 6, 1.6 / SQUASH).fill(0x9fdc6a);
          marks.rect(cx - 0.8, cy - 3 / SQUASH, 1.6, 6 / SQUASH).fill(0x9fdc6a);
        }
      }
      // Remembered enemy buildings: drawn see-through, frozen as last seen,
      // until their cells are seen again (destroyed or not).
      for (const [id, g] of memory) {
        const live = world.entities.get(id);
        if (live && !live.dead && visible(live)) continue;
        if (!fog || !eyes) { memory.delete(id); continue; }
        if (!live || live.dead) { if (anyCell(g, eyes.seen)) { memory.delete(id); continue; } }
        if (!anyCell(g, eyes.explored) || !onScreen(g)) continue;
        place(lib.get(g.key), g.cx, g.cy, g.color, { ghost: true, w: g.w, h: g.h });
      }
      for (const [id, st] of state) {
        if (alive.has(id)) continue;
        st.flag?.destroy();
        state.delete(id);
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
    /**
     * The ghost of a building being placed. @param {string} type @param {string} faction
     * @param {number} cx @param {number} cy @param {number} tint  player colour
     */
    ghost(type, faction, cx, cy, tint) {
      const fp = /** @type {any} */ (STRUCTURES[type]);
      place(lib.get(faction ? `${type}@${faction}` : type), cx, cy, new THREE.Color(tint), { ghost: true, w: fp?.w, h: fp?.h });
    },
  };
}
