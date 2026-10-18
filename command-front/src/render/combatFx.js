// @ts-check
/**
 * Combat visuals: projectiles in flight (read from the world each frame),
 * muzzle flashes, tracers, beams, explosions, smoke and scorch marks (from
 * sim events). Cosmetic only: real time and Math.random are fine here.
 */
import { Container, Graphics } from 'pixi.js';
import { WEAPONS } from '../data/weapons.js';
import { UNITS } from '../data/units.js';
import { RENDER, SIM } from '../data/rules.js';

const PX = RENDER.cellPx / SIM.leptonsPerCell;
const MAX_PARTICLES = 500;
const SCORCH_MS = 20000;

/** Visual family of a weapon. @param {string} id */
/** Beam colours by warhead. */
const BEAMS = /** @type {Record<string, { color: number, ms: number, width: number, jagged: boolean }>} */ ({
  Arc: { color: 0x9fd8ff, ms: 180, width: 2, jagged: true },
  Laser: { color: 0xfff4d8, ms: 240, width: 2.6, jagged: false },
  Rad: { color: 0x9cff4a, ms: 320, width: 3, jagged: false },
  Chrono: { color: 0x7fe9ff, ms: 300, width: 2.4, jagged: false },
  Psi: { color: 0xc58aff, ms: 260, width: 1.8, jagged: true },
});

export function lookOf(id) {
  const w = WEAPONS[id];
  if (!w.warhead) return 'heal';
  if (w.warhead === 'Fire') return 'flame';
  if (w.warhead === 'Bite') return 'bite';
  if (w.projectile === 'beam') return 'beam';
  if (w.warhead === 'HollowPoint') return 'snipe';
  if (w.projectile === 'instant' || w.projectile === 'strafe') return 'tracer';
  if (w.projectile === 'homing' || w.projectile === 'missile' || w.projectile === 'torpedo') return 'missile';
  if (w.projectile === 'arc') return 'arc';
  return 'shell';
}

/**
 * @typedef {{ x: number, y: number, vx: number, vy: number, life: number, max: number, color: number, size: number, grow: number, alpha: number }} Particle
 */

export function createCombatFx() {
  const layer = new Container();
  const scorch = new Graphics();
  const live = new Graphics();
  const flying = new Graphics();
  layer.addChild(live, flying);
  /** @type {Particle[]} */
  let particles = [];
  /** @type {{ x0: number, y0: number, x1: number, y1: number, t0: number, ms: number, color: number, width: number, jagged: boolean }[]} */
  let lines = [];
  /** @type {{ x: number, y: number, r: number, t0: number }[]} */
  let scorches = [];
  let scorchDirty = false;
  let last = performance.now();
  let budget = 1;

  /** @param {Partial<Particle> & { x: number, y: number }} p */
  const add = (p) => {
    if (particles.length >= MAX_PARTICLES * budget) return;
    particles.push({ vx: 0, vy: 0, life: 0, max: 400, color: 0xffd27a, size: 2, grow: 0, alpha: 1, ...p });
  };

  /** @param {number} x @param {number} y @param {number} radiusPx */
  function explosion(x, y, radiusPx) {
    const n = Math.min(26, 6 + Math.round(radiusPx));
    add({ x, y, max: 180, color: 0xfff1c0, size: radiusPx * 0.7, grow: radiusPx * 2 });
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.02 + Math.random() * 0.06) * (radiusPx / 8 + 0.5);
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: 300 + Math.random() * 300, color: k % 3 ? 0xf08a2a : 0xffd27a, size: 1.5 + Math.random() * 2.5 });
    }
    for (let k = 0; k < Math.ceil(n / 3); k++) {
      add({ x: x + (Math.random() - 0.5) * radiusPx, y: y + (Math.random() - 0.5) * radiusPx, vx: (Math.random() - 0.5) * 0.01, vy: -0.01 - Math.random() * 0.01, max: 900 + Math.random() * 600, color: 0x3a3833, size: 2 + Math.random() * 3, grow: 6, alpha: 0.6 });
    }
  }

  /** @param {number} x @param {number} y @param {number} r */
  function addScorch(x, y, r) {
    scorches.push({ x, y, r, t0: performance.now() });
    if (scorches.length > 60) scorches.shift();
    scorchDirty = true;
  }

  return {
    /** Above units: flashes, tracers, explosions, projectiles. */
    layer,
    /** Below units: scorch marks. */
    ground: scorch,
    /** Turn a sim event into visuals. @param {{ type: string, data: any }} e @param {(id: number) => any} entity */
    onEvent(e, entity) {
      const d = e.data;
      const now = performance.now();
      if (e.type === 'shot') {
        const look = lookOf(d.weapon);
        const x0 = d.x * PX;
        const y0 = d.y * PX;
        const x1 = d.tx * PX;
        const y1 = d.ty * PX;
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const mx = x0 + ((x1 - x0) / len) * 6;
        const my = y0 + ((y1 - y0) / len) * 6;
        if (look === 'tracer' || look === 'snipe') {
          lines.push({ x0: mx, y0: my, x1, y1, t0: now, ms: look === 'snipe' ? 140 : 70, color: look === 'snipe' ? 0xf4f4ea : 0xffe08a, width: look === 'snipe' ? 1 : 0.8, jagged: false });
          add({ x: mx, y: my, max: 60, color: 0xfff1c0, size: 1.6 });
        } else if (look === 'beam') {
          // Arc and psychic beams crackle; lasers, radiation and chrono rays are straight.
          const wh = WEAPONS[d.weapon].warhead ?? '';
          const style = BEAMS[wh] ?? BEAMS.Laser;
          lines.push({ x0, y0, x1, y1, t0: now, ms: style.ms, color: style.color, width: style.width, jagged: style.jagged });
        } else if (look === 'flame') {
          for (let k = 0; k < 12; k++) {
            const f = Math.random();
            add({ x: mx + (x1 - mx) * f * 0.3, y: my + (y1 - my) * f * 0.3, vx: ((x1 - mx) / len) * (0.05 + Math.random() * 0.06), vy: ((y1 - my) / len) * (0.05 + Math.random() * 0.06), max: 250 + Math.random() * 200, color: Math.random() < 0.5 ? 0xff9a2a : 0xffd04a, size: 2 + Math.random() * 2, grow: 4 });
          }
        } else if (look === 'heal') {
          for (let k = 0; k < 5; k++) add({ x: x1 + (Math.random() - 0.5) * 8, y: y1 + (Math.random() - 0.5) * 8, vy: -0.02, max: 500, color: 0x8af07a, size: 1.4 });
        } else if (look !== 'bite') {
          add({ x: mx, y: my, max: 90, color: 0xfff1c0, size: look === 'arc' ? 3.5 : 2.5 });
          add({ x: mx, y: my, vx: (Math.random() - 0.5) * 0.01, vy: -0.01, max: 700, color: 0x5a5850, size: 2, grow: 5, alpha: 0.5 });
        }
      } else if (e.type === 'impact') {
        const w = WEAPONS[d.weapon];
        const look = lookOf(d.weapon);
        const x = d.x * PX;
        const y = d.y * PX;
        if (d.weapon === 'stormBolt') {
          // A bolt out of the sky: a jagged white line down to the strike, then the blast.
          lines.push({ x0: x + (Math.random() - 0.5) * 40, y0: y - 260, x1: x, y1: y, t0: performance.now(), ms: 260, color: 0xeef3ff, width: 3.2, jagged: true });
        }
        if (w.splash > 0 && look !== 'flame') {
          const r = Math.max(4, w.splash * RENDER.cellPx * 0.5);
          explosion(x, y, r);
          if (w.splash >= 1) addScorch(x, y, r * 0.8);
        } else if (look === 'shell' || look === 'missile') {
          explosion(x, y, 3);
        } else if (look === 'tracer') {
          add({ x, y, vx: (Math.random() - 0.5) * 0.02, vy: -0.015, max: 220, color: 0x9a8f78, size: 1.2 });
        }
      } else if (e.type === 'unitDied') {
        const x = d.x * PX;
        const y = d.y * PX;
        if (UNITS[d.type].loco === 'foot') {
          for (let k = 0; k < 6; k++) add({ x, y, vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.02, max: 600, color: 0x8a7f66, size: 1.6, grow: 3, alpha: 0.7 });
        } else {
          explosion(x, y, 12);
          addScorch(x, y, 9);
        }
      } else if (e.type === 'charge') {
        const s = entity(d.shooter);
        if (s) for (let k = 0; k < 6; k++) add({ x: s.x * PX + (Math.random() - 0.5) * 10, y: s.y * PX + (Math.random() - 0.5) * 10, max: 700, color: 0x9fd8ff, size: 1.3 });
      }
    },

    /** Share of the particle cap in use, 0.3–1 (the performance monitor lowers it on slow devices). @param {number} k */
    setBudget(k) { budget = Math.max(0.3, Math.min(1, k)); },
    /**
     * Draw everything for this frame.
     * @param {any} world @param {number} viewScale
     */
    update(world, viewScale) {
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;

      flying.clear();
      for (const p of world.projectiles) {
        const look = lookOf(p.weapon);
        if (look === 'tracer' || look === 'snipe' || look === 'beam' || look === 'flame' || look === 'heal' || look === 'bite') continue;
        const x = p.x * PX;
        let y = p.y * PX;
        if (look === 'arc') {
          const total = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1;
          const left = Math.hypot(p.tx - p.x, p.ty - p.y);
          const t = 1 - left / total;
          const h = Math.sin(Math.PI * t) * Math.min(40, total * PX * 0.35);
          flying.circle(x, y, 1.6).fill({ color: 0x000000, alpha: 0.3 });
          y -= h;
          flying.circle(x, y, 2).fill(0xf6e7b0);
        } else if (look === 'missile') {
          const a = Math.atan2(p.ty - p.y, p.tx - p.x);
          flying.moveTo(x - Math.cos(a) * 4, y - Math.sin(a) * 4).lineTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2).stroke({ width: 1.6, color: 0xe8e8dc });
          if (Math.random() < 0.6) add({ x: x - Math.cos(a) * 4, y: y - Math.sin(a) * 4, max: 500, color: 0x8a8880, size: 1.2, grow: 3, alpha: 0.5 });
        } else {
          flying.circle(x, y, 1.4).fill(0xffe9a8);
        }
      }

      live.clear();
      lines = lines.filter((l) => now - l.t0 < l.ms);
      for (const l of lines) {
        const a = 1 - (now - l.t0) / l.ms;
        if (l.jagged) {
          live.moveTo(l.x0, l.y0);
          for (let k = 1; k < 6; k++) {
            const f = k / 6;
            live.lineTo(l.x0 + (l.x1 - l.x0) * f + (Math.random() - 0.5) * 6, l.y0 + (l.y1 - l.y0) * f + (Math.random() - 0.5) * 6);
          }
          live.lineTo(l.x1, l.y1).stroke({ width: l.width / Math.max(viewScale, 0.5), color: l.color, alpha: a });
        } else {
          live.moveTo(l.x0, l.y0).lineTo(l.x1, l.y1).stroke({ width: l.width, color: l.color, alpha: a });
        }
      }
      const next = [];
      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.max) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
        const f = p.life / p.max;
        live.circle(p.x, p.y, p.size + p.grow * f).fill({ color: p.color, alpha: p.alpha * (1 - f) });
        next.push(p);
      }
      particles = next;

      const before = scorches.length;
      scorches = scorches.filter((s) => now - s.t0 < SCORCH_MS);
      if (scorchDirty || before !== scorches.length || (scorches.length && Math.floor(now / 500) !== Math.floor((now - dt) / 500))) {
        scorch.clear();
        for (const s of scorches) scorch.circle(s.x, s.y, s.r).fill({ color: 0x1a1812, alpha: 0.45 * (1 - (now - s.t0) / SCORCH_MS) });
        scorchDirty = false;
      }
    },
  };
}
