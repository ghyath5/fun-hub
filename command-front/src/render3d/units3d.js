// @ts-check
/**
 * Units in 3D. Reads the world each frame (never writes it): every visible
 * unit's model parts go to the instancer at its interpolated position and
 * facing; turrets turn on their own, rotors spin, aircraft fly above their
 * shadows, track links run round their wheels and a harvester's drum turns
 * while it digs. A side's own look of a unit (`harvester@union`) is used
 * when there is one. Selection marks and health bars are drawn in the 2D
 * overlay, placed over the model's top.
 */
import * as THREE from 'three';
import { Graphics } from 'pixi.js';
import { UNITS } from '../data/units.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { RENDER, SIM } from '../data/rules.js';
import { drawPips } from '../render/healthPips.js';
import { CELL, LIFT, ALTITUDE, SQUASH } from './view.js';

const PX_PER_LEPTON = RENDER.cellPx / SIM.leptonsPerCell;
const TAU = Math.PI * 2;
/** Rotor speed, radians per ms. */
const ROTOR_SPEED = 0.03;
/** Stride of a walking soldier, cells per leg cycle. */
const STRIDE = 0.32;
/** How far a barrel kicks back when it fires, cells; and how fast it returns (per ms). */
const RECOIL = 0.07;
const RECOIL_RETURN = 0.006;
/** A harvesting drum at full speed, radians per ms; how fast it spools up and runs down (per ms). */
const DRUM_SPEED = 0.011;
const DRUM_SPOOL = 0.0025;

/**
 * Cosmetic per-unit state, from what is drawn (never written back): rotor
 * angle, wheel roll, walk phase, how much it is moving, firing kick, and a
 * harvester's drum angle and how fast it turns (0–1).
 * @typedef {{ rotor: number, roll: number, trav: number, walk: number, moving: number, kick: number, drum: number, spool: number, x: number, z: number }} Motion
 */

/** @type {Map<string, THREE.Color>} */
const colorCache = new Map();
/** A player colour as a linear three.js colour. @param {string} id */
export function teamColor(id) {
  let c = colorCache.get(id);
  if (!c) {
    c = new THREE.Color(PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (id)]?.main ?? 0xb8b4a6);
    colorCache.set(id, c);
  }
  return c;
}

/**
 * @param {import('./library.js').Library} lib
 * @param {import('./instances.js').Instancer} inst
 */
export function createUnits3D(lib, inst) {
  const marks = new Graphics();
  /** Per-unit cosmetic state. @type {Map<number, Motion>} */
  const state = new Map();
  let lastFrame = performance.now();
  const m = new THREE.Matrix4();
  const base = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const S = new THREE.Matrix4().makeScale(CELL, CELL, CELL);

  /** What a unit looks like to the viewer: a Spy shows enemies one of their own Riflemen (section 10). */
  function lookOf(/** @type {any} */ world, /** @type {any} */ e, /** @type {number} */ viewer) {
    if (viewer >= 0 && e.type === 'spy' && !world.allied(e.owner, viewer)) return { type: 'rifleman', color: world.players[viewer].color, faction: world.players[viewer].faction };
    return { type: e.type, color: world.players[e.owner].color, faction: world.players[e.owner].faction };
  }

  return {
    marks,
    /** A unit fired (the sim's `shot` event): its barrel kicks back. @param {number} id */
    fired(id) {
      const st = state.get(id);
      if (st) st.kick = 1;
    },
    /** World-px radius of a unit type (hit testing). @param {string} type */
    radiusOf: (type) => Math.max(5, lib.get(type).radius * CELL * 0.9),
    /** World-px height of a unit type. @param {string} type */
    heightOf: (type) => lib.get(type).height * CELL,
    /**
     * @param {any} world @param {number} alpha  interpolation between ticks
     * @param {Set<number>} selected @param {number} viewScale
     * @param {(e: any) => boolean} visible @param {number} viewer
     * @param {{ x0: number, y0: number, x1: number, y1: number }} view  world px on screen (with margin)
     * @param {number} [hover]  the entity under the mouse: its health shows, as in Red Alert 2
     */
    sync(world, alpha, selected, viewScale, visible, viewer, view, hover = 0) {
      const now = performance.now();
      const dt = Math.min(100, now - lastFrame);
      lastFrame = now;
      marks.clear();
      for (const e of world.entities.all()) {
        if (e.dead || e.kind !== 'unit' || e.inside || !visible(e)) continue;
        const x = (e.px + (e.x - e.px) * alpha) * PX_PER_LEPTON;
        const z = (e.py + (e.y - e.py) * alpha) * PX_PER_LEPTON;
        if (x < view.x0 || x > view.x1 || z < view.y0 || z > view.y1) continue;
        const look = lookOf(world, e, viewer);
        const def = lib.get(`${look.type}@${look.faction}`);
        const d = UNITS[look.type];
        const flying = d.loco === 'air' && !e.landed;
        const y = flying ? ALTITUDE : 0;
        const color = teamColor(look.color);
        // Submerged subs and disguised Mirage Tanks show see-through to their own side.
        const ghost = !!(e.submerged || (e.detect !== undefined && e.detect !== -1 && d.tags.includes('disguise')));
        let st = state.get(e.id);
        if (!st) { st = { rotor: Math.random() * TAU, roll: 0, trav: 0, walk: Math.random() * TAU, moving: 0, kick: 0, drum: 0, spool: 0, x, z }; state.set(e.id, st); }
        st.rotor += dt * ROTOR_SPEED * (flying ? 1 : 0.12);
        // Distance drawn since the last frame: wheels roll it, feet walk it.
        const step = Math.min(CELL, Math.hypot(x - st.x, z - st.z)) / CELL;
        st.x = x;
        st.z = z;
        st.roll -= step / 0.06;
        st.trav += step;
        st.walk += (step / STRIDE) * TAU;
        st.moving += ((step > 1e-4 ? 1 : 0) - st.moving) * Math.min(1, dt * 0.012);
        st.kick = Math.max(0, st.kick - dt * RECOIL_RETURN);
        // The drum digs at full speed, idles over as the harvester drives, and runs down when it stops.
        if (e.harv) {
          st.spool += ((e.harv.state === 'harvesting' ? 1 : st.moving * 0.12) - st.spool) * Math.min(1, dt * DRUM_SPOOL);
          st.drum += dt * DRUM_SPEED * st.spool;
        }
        const swing = Math.sin(st.walk) * 0.55 * st.moving;
        // A walking soldier bobs with each step; a vehicle rocks back a little when it fires.
        const bob = d.loco === 'foot' && !flying ? Math.abs(Math.sin(st.walk)) * 0.025 * st.moving * CELL : 0;
        base.makeTranslation(x, y + bob, z);
        const facing = (-e.facing / 256) * TAU;
        // A dug-in Rifleman sits in a sandbag ring that faces where he looks.
        if (e.dug) for (const p of lib.get('sandbagNest').parts) {
          m.copy(base).multiply(rot.makeRotationY(facing)).multiply(S).multiply(part.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z));
          inst.add(p, m, color, 1, ghost);
        }
        const rock = d.loco !== 'foot' && !flying ? st.kick * st.kick * 0.035 : 0;
        // Turrets turn about their own pivot (on the hull, which faces `facing`); barrels ride on the turret.
        const aim = (-(e.turret ?? e.facing) / 256) * TAU - facing;
        const ring = def.parts.find((q) => q.role === 'turret')?.pivot;
        for (const p of def.parts) {
          m.copy(base).multiply(rot.makeRotationY(facing));
          if (rock) m.multiply(rot.makeRotationX(rock));
          m.multiply(S);
          if (p.role === 'turret') m.multiply(part.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z)).multiply(rot.makeRotationY(aim));
          else if (p.role === 'barrel') {
            const r = ring ?? p.pivot;
            m.multiply(part.makeTranslation(r.x, r.y, r.z)).multiply(rot.makeRotationY(aim)).multiply(part.makeTranslation(p.pivot.x - r.x, p.pivot.y - r.y, p.pivot.z - r.z));
          } else m.multiply(part.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z));
          if (p.orient) m.multiply(rot.makeRotationFromQuaternion(p.orient));
          if (p.role === 'rotor') m.multiply(rot.makeRotationY(st.rotor));
          else if (p.role === 'wheel') m.multiply(rot.makeRotationX(st.roll * (0.06 / (p.radius || 0.06))));
          else if (p.role === 'prop') m.multiply(rot.makeRotationZ(st.rotor * 1.5));
          else if (p.role === 'tread') {
            // Links move one pitch and start again: a run slides along itself, a bend turns round its wheel.
            const t = st.trav % /** @type {number} */ (p.pitch);
            if (p.arc) m.multiply(rot.makeRotationX(t / p.arc));
            else if (p.slide) m.multiply(part.makeTranslation(p.slide.x * t, p.slide.y * t, p.slide.z * t));
            else m.multiply(part.makeTranslation(0, 0, -t));
          } else if (p.role === 'drum') m.multiply(rot.makeRotationX(st.drum));
          else if (p.role === 'barrel') m.multiply(part.makeTranslation(0, 0, st.kick * RECOIL));
          else if (p.role === 'limb') m.multiply(rot.makeRotationX(p.name === 'legL' || p.name === 'armR' ? swing : -swing));
          inst.add(p, m, color, 1, ghost);
        }

        const isSel = selected.has(e.id);
        const hurt = e.hp < e.maxHp;
        if (!isSel && !hurt && e.id !== hover) continue;
        const r = Math.max(5, def.radius * CELL * 0.9);
        const top = z - (y + def.height * CELL) * LIFT;
        if (isSel) {
          const w = 1.5 / viewScale;
          if (d.loco === 'foot') {
            marks.ellipse(x, z, r + 2, r + 2).stroke({ width: w, color: 0xf0f0e0, alpha: 0.9 });
          } else {
            // Corner brackets around the model as it appears on screen.
            const x0 = x - r - 2, x1 = x + r + 2, y0 = top - 2, y1 = z - y * LIFT + r + 2;
            const cw = (x1 - x0) * 0.25, ch = (y1 - y0) * 0.25;
            for (const [sx, sy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
              const dx = sx === x0 ? cw : -cw, dy = sy === y0 ? ch : -ch;
              marks.moveTo(sx + dx, sy).lineTo(sx, sy).lineTo(sx, sy + dy);
            }
            marks.stroke({ width: w, color: 0xf0f0e0, alpha: 0.95 });
          }
        }
        const bw = Math.max(12, r * 2);
        const bh = 2.6 / Math.max(viewScale, 0.6) / SQUASH;
        drawPips(marks, x - bw / 2, top - 6, bw, bh, e.hp, e.maxHp);
      }
      if (state.size > 64 && Math.random() < 0.02) for (const id of state.keys()) if (!world.entities.get(id)) state.delete(id);
    },
  };
}
