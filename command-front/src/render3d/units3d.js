// @ts-check
/**
 * Units in 3D. Reads the world each frame (never writes it): every visible
 * unit's model parts go to the instancer at its interpolated position and
 * facing; turrets turn on their own, rotors spin, aircraft fly above their
 * shadows. Selection marks and health bars are drawn in the 2D overlay,
 * placed over the model's top.
 */
import * as THREE from 'three';
import { Graphics } from 'pixi.js';
import { UNITS } from '../data/units.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { RENDER, SIM } from '../data/rules.js';
import { healthBand } from '../sim/formulas/combat.js';
import { CELL, LIFT, ALTITUDE, SQUASH } from './view.js';

const PX_PER_LEPTON = RENDER.cellPx / SIM.leptonsPerCell;
const TAU = Math.PI * 2;
const BAND_COLOR = { green: 0x7fd04a, amber: 0xe0a43a, red: 0xd0543a };
/** Rotor speed, radians per ms. */
const ROTOR_SPEED = 0.03;

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
  /** Per-unit cosmetic state: rotor angle. @type {Map<number, { rotor: number }>} */
  const state = new Map();
  let lastFrame = performance.now();
  const m = new THREE.Matrix4();
  const base = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const S = new THREE.Matrix4().makeScale(CELL, CELL, CELL);

  /** What a unit looks like to the viewer: a Spy shows enemies one of their own Riflemen (section 10). */
  function lookOf(/** @type {any} */ world, /** @type {any} */ e, /** @type {number} */ viewer) {
    if (viewer >= 0 && e.type === 'spy' && !world.allied(e.owner, viewer)) return { type: 'rifleman', color: world.players[viewer].color };
    return { type: e.type, color: world.players[e.owner].color };
  }

  return {
    marks,
    /** World-px radius of a unit type (hit testing). @param {string} type */
    radiusOf: (type) => Math.max(5, lib.get(type).radius * CELL * 0.9),
    /** World-px height of a unit type. @param {string} type */
    heightOf: (type) => lib.get(type).height * CELL,
    /**
     * @param {any} world @param {number} alpha  interpolation between ticks
     * @param {Set<number>} selected @param {number} viewScale
     * @param {(e: any) => boolean} visible @param {number} viewer
     * @param {{ x0: number, y0: number, x1: number, y1: number }} view  world px on screen (with margin)
     */
    sync(world, alpha, selected, viewScale, visible, viewer, view) {
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
        const def = lib.get(look.type);
        const d = UNITS[look.type];
        const flying = d.loco === 'air' && !e.landed;
        const y = flying ? ALTITUDE : 0;
        const color = teamColor(look.color);
        // Submerged subs and disguised Mirage Tanks show see-through to their own side.
        const ghost = !!(e.submerged || (e.detect !== undefined && e.detect !== -1 && d.tags.includes('disguise')));
        let st = state.get(e.id);
        if (!st) { st = { rotor: Math.random() * TAU }; state.set(e.id, st); }
        st.rotor += dt * ROTOR_SPEED * (flying ? 1 : 0.12);
        base.makeTranslation(x, y, z);
        const facing = (-e.facing / 256) * TAU;
        for (const p of def.parts) {
          const turn = p.role === 'turret' ? (-(e.turret ?? e.facing) / 256) * TAU : facing;
          m.copy(base).multiply(rot.makeRotationY(turn)).multiply(S).multiply(part.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z));
          if (p.orient) m.multiply(rot.makeRotationFromQuaternion(p.orient));
          if (p.role === 'rotor') m.multiply(rot.makeRotationY(st.rotor));
          inst.add(p, m, color, 1, ghost);
        }

        const isSel = selected.has(e.id);
        const hurt = e.hp < e.maxHp;
        if (!isSel && !hurt) continue;
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
        const bw = Math.max(10, r * 2);
        const bh = 2.6 / Math.max(viewScale, 0.6) / SQUASH;
        const by = top - 6;
        marks.rect(x - bw / 2, by, bw, bh).fill({ color: 0x0e0f0b, alpha: 0.8 });
        marks.rect(x - bw / 2, by, (bw * e.hp) / e.maxHp, bh).fill(BAND_COLOR[healthBand(e.hp, e.maxHp)]);
      }
      if (state.size > 64 && Math.random() < 0.02) for (const id of state.keys()) if (!world.entities.get(id)) state.delete(id);
    },
  };
}
