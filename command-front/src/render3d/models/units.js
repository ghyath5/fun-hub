// @ts-check
/**
 * Unit models, built from the kit (../kit.js). `size` is the model's longest
 * ground extent in cells; the library scales each model to it. Units with a
 * GLB source (Titan Tank, Rotary Tank, Sentinel IFV, Ballistic Launcher) are
 * baked models and need no entry here.
 */
import {
  M, box, cyl, sphere, dome, cone, torus, plate, prism, sub, stack, dish, mast,
  trackedHull, wheeledHull, turret, barrel, pod, jet, rotor, soldier, shipHull,
} from '../kit.js';

/** @typedef {{ size: number, build: (g: import('three').Group) => void, pivot?: [number, number], rot?: number }} UnitModel */

/** A four-legged attack dog facing north. @param {import('three').Group} g */
function dog(g) {
  const body = cyl(g, 0.09, 0.1, 0.42, M.fur, 0, 0.26, 0.02, 'z', 8);
  body.scale.x = 0.9;
  sphere(g, 0.09, M.fur, 0, 0.36, -0.24, 0.9, 8);
  box(g, 0.07, 0.06, 0.12, M.fur, 0, 0.33, -0.34, 0.02);
  sphere(g, 0.02, M.black, 0, 0.35, -0.4, 1, 5);
  for (const s of [-1, 1]) cone(g, 0.03, 0.08, M.fur, s * 0.05, 0.46, -0.22, 5);
  for (const [x, z] of [[-0.06, -0.14], [0.06, -0.14], [-0.06, 0.17], [0.06, 0.17]]) cyl(g, 0.025, 0.02, 0.22, M.fur, x, 0.11, z, 'y', 5);
  cyl(g, 0.015, 0.025, 0.2, M.fur, 0, 0.32, 0.28, 'z', 5).rotation.x = 1.0;
  torus(g, 0.07, 0.018, M.team, 0, 0.33, -0.2, 'x', 10);
}

/** A soft-top cab at the front of a truck. */
function cab(g, w, h, z, y0, mat = M.team) {
  box(g, w, h, 0.3, mat, 0, y0 + h / 2, z, 0.05);
  box(g, w * 0.8, h * 0.4, 0.02, M.glass, 0, y0 + h * 0.66, z - 0.16);
}

/** @type {Record<string, UnitModel>} */
export const UNIT_MODELS = {
  // ── Infantry ───────────────────────────────────────────────
  rifleman: { size: 0.46, build(g) { soldier(g, { helmet: M.olive, weapon: 'rifle', pack: M.khaki }); } },
  // The sandbag ring round a dug-in Rifleman (drawn with him, not a unit of its own); open at the back.
  sandbagNest: {
    size: 0.62,
    build(g) {
      for (let k = 0; k < 11; k++) {
        const a = (k / 14) * Math.PI * 2 + Math.PI * 0.72;
        for (const [y, r] of [[0.04, 0.27], [0.11, 0.26]]) {
          if (y > 0.1 && k % 2) continue;
          const b = box(g, 0.14, 0.07, 0.08, M.sand, Math.cos(a) * r, y, Math.sin(a) * r, 0.03);
          b.rotation.y = -a + Math.PI / 2;
        }
      }
    },
  },
  rocketTrooper: { size: 0.5, build(g) { soldier(g, { helmet: M.olive, weapon: 'tube', pack: M.khaki }); } },
  engineer: {
    size: 0.42,
    build(g) {
      soldier(g, { helmet: M.yellow, weapon: 'none', pack: M.yellow, extra: (s) => box(s, 0.12, 0.08, 0.06, M.steel, 0.14, 0.24, -0.06, 0.02) });
    },
  },
  grenadier: {
    size: 0.44,
    build(g) {
      soldier(g, { helmet: M.dark, weapon: 'none', pack: M.khaki, extra: (s) => {
        for (const x of [-0.1, -0.03, 0.04]) sphere(s, 0.035, M.olive, x, 0.26, -0.1, 1, 6);
        sphere(s, 0.04, M.olive, 0.16, 0.5, -0.06, 1, 6);
      } });
    },
  },
  flameTrooper: {
    size: 0.5,
    build(g) {
      soldier(g, { helmet: M.dark, weapon: 'big', extra: (s) => {
        for (const x of [-0.07, 0.07]) cyl(s, 0.06, 0.06, 0.3, M.hazard, x, 0.36, 0.14, 'y', 8);
        sphere(s, 0.03, M.fire, 0.1, 0.36, -0.42, 1, 5);
      } });
    },
  },
  hound: { size: 0.5, build: dog },
  medic: {
    size: 0.42,
    build(g) {
      soldier(g, { helmet: M.white, weapon: 'none', pack: M.white, extra: (s) => {
        box(s, 0.08, 0.025, 0.025, M.crimson, 0, 0.36, 0.175);
        box(s, 0.025, 0.08, 0.025, M.crimson, 0, 0.36, 0.175);
        box(s, 0.06, 0.012, 0.018, M.crimson, 0, 0.61, 0);
      } });
    },
  },
  spy: {
    size: 0.42,
    build(g) {
      soldier(g, { coat: M.suit, legs: M.suit, weapon: 'pistol', hat: (s) => {
        cyl(s, 0.12, 0.12, 0.015, M.suit, 0, 0.6, 0, 'y', 10);
        cyl(s, 0.07, 0.075, 0.08, M.suit, 0, 0.65, 0, 'y', 10);
        cyl(s, 0.076, 0.076, 0.02, M.team, 0, 0.62, 0, 'y', 10);
      }, extra: (s) => box(s, 0.03, 0.14, 0.02, M.team, 0, 0.38, -0.09) });
    },
  },
  thief: {
    size: 0.42,
    build(g) {
      soldier(g, { coat: M.team, legs: M.suit, weapon: 'none', hat: (s) => {
        sphere(s, 0.08, M.suit, 0, 0.57, 0, 0.7, 8);
        box(s, 0.08, 0.012, 0.08, M.suit, 0, 0.58, -0.08);
      }, extra: (s) => sphere(s, 0.13, M.khaki, 0.02, 0.36, 0.16, 1, 8) });
    },
  },
  guardTrooper: {
    size: 0.52,
    build(g) {
      soldier(g, { helmet: M.steel, weapon: 'tube', pack: M.steel, extra: (s) => {
        for (const x of [-1, 1]) box(s, 0.08, 0.06, 0.16, M.steel, x * 0.16, 0.46, 0, 0.02);
      } });
    },
  },
  marksman: {
    size: 0.6,
    build(g) {
      soldier(g, { weapon: 'none', pack: M.khaki, hat: (s) => sphere(s, 0.085, M.team, 0.02, 0.6, 0, 0.45, 8), extra: (s) => {
        box(s, 0.03, 0.03, 0.62, M.black, 0.09, 0.38, -0.22);
        cyl(s, 0.02, 0.02, 0.12, M.dark, 0.09, 0.42, -0.08, 'z', 6);
      } });
    },
  },
  shockTrooper: {
    size: 0.56,
    build(g) {
      soldier(g, { helmet: M.dark, weapon: 'big', pack: M.dark, extra: (s) => {
        for (const x of [-1, 1]) sphere(s, 0.09, M.teamDark, x * 0.17, 0.46, 0, 0.8, 8);
        cyl(s, 0.04, 0.06, 0.24, M.copper, 0, 0.52, 0.14, 'y', 8);
        for (const y of [0.46, 0.54, 0.62]) torus(s, 0.06, 0.012, M.tesla, 0, y, 0.14, 'y', 10);
        sphere(s, 0.035, M.tesla, 0.1, 0.38, -0.42, 1, 6);
      } });
    },
  },
  flakTrooper: {
    size: 0.52,
    build(g) {
      soldier(g, { helmet: M.olive, weapon: 'big', pack: M.olive, extra: (s) => cyl(s, 0.05, 0.05, 0.08, M.dark, 0.1, 0.38, -0.44, 'z', 8) });
    },
  },
  commando: {
    size: 0.46,
    build(g) {
      soldier(g, { coat: M.team, legs: M.khaki, weapon: 'none', hat: (s) => {
        sphere(s, 0.08, M.black, 0, 0.58, 0.02, 0.8, 8);
        cyl(s, 0.025, 0.015, 0.16, M.black, 0, 0.5, 0.1, 'y', 5).rotation.x = 0.5;
      }, extra: (s) => {
        for (const x of [-1, 1]) box(s, 0.03, 0.04, 0.12, M.black, x * 0.15, 0.4, -0.16);
        box(s, 0.26, 0.03, 0.2, M.dark, 0, 0.24, 0);
      } });
    },
  },

  // ── Vehicles ───────────────────────────────────────────────
  harvester: {
    size: 1.3,
    build(g) {
      const t = trackedHull(g, 1.25, 0.82, 0.34, { hull: M.teamDark });
      cab(g, 0.5, 0.3, -0.44, t);
      // The ore hopper: an open bin with ore heaped inside.
      box(g, 0.74, 0.38, 0.72, M.team, 0, t + 0.19, 0.2, 0.06);
      box(g, 0.62, 0.03, 0.6, M.dark, 0, t + 0.36, 0.2);
      for (const [x, z] of [[-0.15, 0.1], [0.12, 0.28], [0, 0.18], [0.16, 0.05]]) sphere(g, 0.12, M.ore, x, t + 0.37, z, 0.5, 8);
      for (const s of [-1, 1]) box(g, 0.04, 0.4, 0.74, M.steel, s * 0.39, t + 0.2, 0.2);
      box(g, 0.56, 0.1, 0.14, M.steel, 0, 0.14, -0.66, 0.03);
    },
  },
  mcv: {
    size: 1.08,
    build(g) {
      const t = wheeledHull(g, 1.05, 0.66, 0.36, 3);
      cab(g, 0.56, 0.32, -0.38, t);
      box(g, 0.62, 0.4, 0.62, M.team, 0, t + 0.2, 0.18, 0.06);
      box(g, 0.5, 0.05, 0.5, M.teamDark, 0, t + 0.42, 0.18);
      // Folded crane and a radar dish on the roof.
      box(g, 0.08, 0.08, 0.78, M.yellow, 0.18, t + 0.48, 0.02);
      box(g, 0.1, 0.14, 0.1, M.yellow, 0.18, t + 0.5, 0.38);
      cyl(g, 0.1, 0.12, 0.05, M.light, -0.16, t + 0.47, 0.3, 'y', 10);
      dome(g, 0.1, M.light, -0.16, t + 0.49, 0.3, 0.4);
      box(g, 0.66, 0.04, 0.1, M.hazard, 0, t + 0.04, 0.48);
    },
  },
  mineLayer: {
    size: 0.76,
    build(g) {
      const t = trackedHull(g, 0.78, 0.6, 0.28);
      box(g, 0.42, 0.2, 0.44, M.team, 0, t + 0.1, -0.04, 0.05);
      box(g, 0.32, 0.06, 0.02, M.glass, 0, t + 0.13, -0.265);
      // Mine rack at the back.
      box(g, 0.44, 0.12, 0.16, M.dark, 0, t + 0.06, 0.32, 0.02);
      for (const x of [-0.12, 0, 0.12]) cyl(g, 0.05, 0.05, 0.03, M.olive, x, t + 0.135, 0.32, 'y', 8);
    },
  },
  ranger: {
    size: 0.64,
    build(g) {
      const t = wheeledHull(g, 0.66, 0.46, 0.26, 2);
      // A jeep: bonnet, windscreen, seats, roll bar and a pintle machine gun.
      box(g, 0.34, 0.05, 0.22, M.teamDark, 0, t + 0.02, -0.2, 0.02);
      const screen = box(g, 0.34, 0.12, 0.015, M.glass, 0, t + 0.08, -0.08);
      screen.rotation.x = -0.35;
      for (const x of [-0.08, 0.08]) box(g, 0.12, 0.08, 0.1, M.dark, x, t + 0.04, 0.0, 0.02);
      for (const x of [-0.17, 0.17]) cyl(g, 0.012, 0.012, 0.18, M.steel, x, t + 0.09, 0.08, 'y', 5);
      box(g, 0.36, 0.02, 0.02, M.steel, 0, t + 0.18, 0.08);
      turret(g, t + 0.06, (tt) => {
        cyl(tt, 0.02, 0.02, 0.12, M.steel, 0, 0.06, 0, 'y', 6);
        box(tt, 0.05, 0.05, 0.1, M.black, 0, 0.14, 0);
        box(tt, 0.025, 0.025, 0.22, M.black, 0, 0.14, -0.14);
        box(tt, 0.12, 0.08, 0.015, M.steel, 0, 0.15, -0.06);
      }, 0.18);
    },
  },
  apc: {
    size: 0.82,
    build(g) {
      const t = trackedHull(g, 0.84, 0.62, 0.3);
      box(g, 0.5, 0.2, 0.56, M.team, 0, t + 0.1, 0.08, 0.05);
      const nose = box(g, 0.48, 0.03, 0.2, M.teamDark, 0, t + 0.07, -0.26);
      nose.rotation.x = -0.55;
      box(g, 0.3, 0.17, 0.02, M.dark, 0, t + 0.09, 0.365);
      turret(g, t + 0.2, (tt) => {
        cyl(tt, 0.09, 0.1, 0.07, M.teamDark, 0, 0.035, 0, 'y', 10);
        box(tt, 0.035, 0.035, 0.24, M.black, 0, 0.05, -0.14);
      }, -0.04);
    },
  },
  lightTank: {
    size: 0.78,
    build(g) {
      const t = trackedHull(g, 0.78, 0.6, 0.28);
      turret(g, t, (tt) => {
        cyl(tt, 0.17, 0.19, 0.12, M.team, 0, 0.06, 0.02, 'y', 12);
        dome(tt, 0.12, M.teamDark, 0.02, 0.12, 0.06, 0.4, 10);
        barrel(tt, 0.36, 0.025, 0, 0.07, -0.14);
      });
    },
  },
  mediumTank: {
    size: 0.86,
    build(g) {
      const t = trackedHull(g, 0.86, 0.64, 0.3);
      turret(g, t, (tt) => {
        prism(tt, [[-0.2, 0], [0.2, 0], [0.16, 0.14], [-0.16, 0.14]], 0.4, M.team, 0, 0, 0.04);
        box(tt, 0.18, 0.04, 0.14, M.teamDark, 0.04, 0.16, 0.08, 0.02);
        cyl(tt, 0.04, 0.04, 0.03, M.dark, -0.08, 0.16, 0.06, 'y', 8);
        barrel(tt, 0.44, 0.03, 0, 0.07, -0.16);
      });
    },
  },
  heavyTank: {
    size: 0.96,
    build(g) {
      const t = trackedHull(g, 0.96, 0.74, 0.34);
      turret(g, t, (tt) => {
        box(tt, 0.46, 0.18, 0.5, M.team, 0, 0.09, 0.04, 0.08);
        box(tt, 0.3, 0.06, 0.26, M.teamDark, 0, 0.2, 0.08, 0.03);
        cyl(tt, 0.05, 0.05, 0.04, M.dark, 0.12, 0.22, 0.14, 'y', 8);
        barrel(tt, 0.56, 0.036, 0, 0.1, -0.18);
        box(tt, 0.1, 0.07, 0.1, M.dark, 0, 0.1, -0.2);
      });
    },
  },
  artillery: {
    size: 1.1,
    pivot: [0.5, 0.55],
    build(g) {
      const t = wheeledHull(g, 0.9, 0.56, 0.3, 3);
      cab(g, 0.46, 0.24, -0.34, t);
      box(g, 0.34, 0.12, 0.4, M.teamDark, 0, t + 0.06, 0.2, 0.04);
      for (const s of [-1, 1]) box(g, 0.03, 0.16, 0.12, M.steel, s * 0.1, t + 0.18, 0.28);
      // The howitzer on its trunnions, raised toward the front.
      const a = 0.35;
      const b = cyl(g, 0.045, 0.055, 0.9, M.steel, 0, t + 0.24 + 0.4 * Math.sin(a), 0.3 - 0.4 * Math.cos(a), 'z', 10);
      b.rotation.x = Math.PI / 2 - a;
      const brake = cyl(g, 0.065, 0.065, 0.1, M.dark, 0, t + 0.24 + 0.85 * Math.sin(a), 0.3 - 0.85 * Math.cos(a), 'z', 10);
      brake.rotation.x = Math.PI / 2 - a;
      cyl(g, 0.07, 0.07, 0.2, M.dark, 0, t + 0.24, 0.3, 'x', 10);
      for (const s of [-1, 1]) box(g, 0.04, 0.04, 0.4, M.dark, s * 0.24, 0.06, 0.48).rotation.y = s * 0.25;
    },
  },
  laserTank: {
    size: 0.86,
    build(g) {
      const t = trackedHull(g, 0.86, 0.64, 0.3, { hull: M.light });
      turret(g, t, (tt) => {
        cyl(tt, 0.18, 0.2, 0.1, M.team, 0, 0.05, 0.04, 'y', 10);
        // The prism: a glowing crystal on a stalk, and the emitter facing forward.
        cyl(tt, 0.03, 0.05, 0.14, M.steel, 0, 0.17, 0.02, 'y', 6);
        sphere(tt, 0.1, M.prism, 0, 0.3, 0.02, 1.5, 6);
        box(tt, 0.05, 0.05, 0.26, M.steel, 0, 0.1, -0.2);
        sphere(tt, 0.035, M.prism, 0, 0.1, -0.34, 1, 6);
      });
    },
  },
  salvoLauncher: {
    size: 0.86,
    build(g) {
      const t = wheeledHull(g, 0.86, 0.52, 0.3, 3);
      cab(g, 0.46, 0.24, -0.3, t);
      box(g, 0.3, 0.08, 0.3, M.dark, 0, t + 0.04, 0.16, 0.02);
      const rack = sub(g, '', 0, t + 0.2, 0.16);
      rack.rotation.x = 0.35;
      pod(rack, 0.44, 0.2, 0.5, 0, 0, 0, 3, 4);
    },
  },
  flakTrack: {
    size: 0.8,
    build(g) {
      // Half-track: wheels at the front, tracks at the back.
      for (const s of [-1, 1]) {
        cyl(g, 0.1, 0.1, 0.08, M.rubber, s * 0.24, 0.1, -0.26, 'x', 10);
        box(g, 0.1, 0.18, 0.4, M.rubber, s * 0.24, 0.1, 0.16, 0.06);
      }
      box(g, 0.44, 0.16, 0.8, M.team, 0, 0.26, 0, 0.04);
      box(g, 0.36, 0.14, 0.24, M.teamDark, 0, 0.41, -0.26, 0.03);
      box(g, 0.3, 0.05, 0.02, M.glass, 0, 0.44, -0.385);
      for (const s of [-1, 1]) box(g, 0.03, 0.1, 0.4, M.team, s * 0.21, 0.39, 0.14);
      turret(g, 0.34, (tt) => {
        cyl(tt, 0.1, 0.12, 0.06, M.dark, 0, 0.03, 0, 'y', 10);
        box(tt, 0.14, 0.1, 0.12, M.steel, 0, 0.11, 0, 0.02);
        for (const x of [-0.04, 0.04]) { const b = cyl(tt, 0.018, 0.018, 0.3, M.black, x, 0.2, -0.12, 'z', 6); b.rotation.x = Math.PI / 2 - 0.5; }
      }, 0.14);
    },
  },
  arcTank: {
    size: 0.9,
    build(g) {
      const t = trackedHull(g, 0.9, 0.68, 0.32);
      turret(g, t, (tt) => {
        cyl(tt, 0.2, 0.22, 0.12, M.team, 0, 0.06, 0.04, 'y', 10);
        for (const x of [-0.09, 0.09]) {
          cyl(tt, 0.035, 0.05, 0.22, M.copper, x, 0.22, 0.02, 'y', 8);
          for (const y of [0.16, 0.24, 0.32]) torus(tt, 0.05, 0.012, M.dark, x, y, 0.02, 'y', 10);
          sphere(tt, 0.045, M.tesla, x, 0.36, 0.02, 1, 8);
        }
        box(tt, 0.08, 0.06, 0.2, M.dark, 0, 0.08, -0.2, 0.02);
      });
    },
  },

  // ── Aircraft ───────────────────────────────────────────────
  transportHeli: {
    size: 1.1,
    build(g) {
      const b = cyl(g, 0.16, 0.16, 0.96, M.team, 0, 0.32, 0, 'z', 12);
      b.scale.x = 0.95;
      sphere(g, 0.16, M.team, 0, 0.32, -0.48, 1, 10);
      sphere(g, 0.1, M.glass, 0, 0.38, -0.54, 0.7, 8);
      box(g, 0.2, 0.22, 0.2, M.teamDark, 0, 0.48, 0.42, 0.04);
      box(g, 0.14, 0.12, 0.16, M.teamDark, 0, 0.5, -0.36, 0.03);
      for (const s of [-1, 1]) box(g, 0.06, 0.08, 0.5, M.dark, s * 0.17, 0.2, 0.06, 0.02);
      for (const s of [-1, 1]) for (const z of [-0.3, 0.3]) cyl(g, 0.012, 0.012, 0.14, M.dark, s * 0.12, 0.1, z, 'y', 4);
      const front = rotor('rotor0', 0.48, 3); front.position.set(0, 0.6, -0.36); g.add(front);
      const back = rotor('rotor1', 0.48, 3); back.position.set(0, 0.64, 0.42); g.add(back);
    },
  },
  attackHeli: {
    size: 1.16,
    build(g) {
      const b = cyl(g, 0.1, 0.13, 0.62, M.team, 0, 0.3, -0.04, 'z', 10);
      b.scale.x = 0.85;
      sphere(g, 0.1, M.glass, 0, 0.38, -0.2, 0.8, 8).scale.z = 1.8;
      box(g, 0.05, 0.06, 0.62, M.team, 0, 0.36, 0.5, 0.02);
      box(g, 0.2, 0.02, 0.06, M.teamDark, 0, 0.38, 0.78);
      box(g, 0.02, 0.14, 0.08, M.teamDark, 0, 0.44, 0.8);
      for (const s of [-1, 1]) {
        box(g, 0.26, 0.03, 0.1, M.teamDark, s * 0.2, 0.28, 0.02);
        cyl(g, 0.04, 0.04, 0.2, M.dark, s * 0.3, 0.24, 0.0, 'z', 8);
        cyl(g, 0.035, 0.035, 0.16, M.steel, s * 0.12, 0.2, -0.04, 'z', 8);
      }
      box(g, 0.02, 0.06, 0.12, M.black, 0, 0.16, -0.32);
      const r = rotor('rotor0', 0.56, 4); r.position.set(0, 0.52, -0.02); g.add(r);
    },
  },
  attackPlane: {
    size: 1.16,
    build(g) {
      jet(g, { len: 1.0, span: 1.06, tailSpan: 0.45, twin: true });
      for (const s of [-1, 1]) cyl(g, 0.06, 0.06, 0.24, M.dark, s * 0.1, 0.2, 0.28, 'z', 10);
      for (const s of [-1, 1]) for (const x of [0.22, 0.34]) cyl(g, 0.02, 0.02, 0.14, M.steel, s * x, 0.08, 0.04, 'z', 6);
    },
  },
  strikeJet: { size: 1.22, build(g) { jet(g, { len: 1.1, span: 0.78, tailSpan: 0.38 }); } },
  siegeAirship: {
    size: 2.0,
    build(g) {
      // The Kirov: a vast envelope, a gondola full of bombs, fins and propellers.
      const env = sphere(g, 0.42, M.team, 0, 0.9, 0, 0.82, 18);
      env.scale.z = 2.2;
      for (let k = -2; k <= 2; k++) torus(g, 0.42 * Math.sqrt(1 - (k * 0.32) ** 2 / 1.1), 0.012, M.teamDark, 0, 0.9, k * 0.32, 'z', 20).scale.y = 0.82;
      box(g, 0.24, 0.18, 0.62, M.dark, 0, 0.5, 0.04, 0.05);
      box(g, 0.16, 0.08, 0.2, M.glass, 0, 0.47, -0.26, 0.03);
      for (const s of [-1, 1]) {
        plate(g, [[s * 0.1, 0.62], [s * 0.42, 0.86], [s * 0.42, 0.98], [s * 0.1, 0.9]], 0.02, M.teamDark, 0.92);
        const p = rotor(`rotor${s < 0 ? 0 : 1}`, 0.14, 3);
        p.rotation.x = Math.PI / 2;
        p.position.set(s * 0.32, 0.62, 0.62);
        g.add(p);
        cyl(g, 0.05, 0.05, 0.16, M.steel, s * 0.32, 0.62, 0.54, 'z', 8);
      }
      box(g, 0.02, 0.36, 0.3, M.teamDark, 0, 1.3, 0.82);
    },
  },
  supportPlane: {
    size: 1.66,
    build(g) {
      const f = cyl(g, 0.1, 0.11, 1.3, M.light, 0, 0.18, 0, 'z', 12);
      f.scale.y = 1.1;
      sphere(g, 0.1, M.light, 0, 0.18, -0.65, 1.1, 10);
      sphere(g, 0.06, M.glass, 0, 0.24, -0.62, 0.6, 8);
      plate(g, [[-0.82, -0.08], [0.82, -0.08], [0.78, 0.08], [-0.78, 0.08]], 0.03, M.team, 0.3);
      plate(g, [[-0.32, 0.5], [0.32, 0.5], [0.3, 0.6], [-0.3, 0.6]], 0.02, M.team, 0.26);
      box(g, 0.02, 0.28, 0.2, M.team, 0, 0.42, 0.56);
      for (const [k, x] of [-0.56, -0.3, 0.3, 0.56].entries()) {
        cyl(g, 0.05, 0.05, 0.22, M.dark, x, 0.26, -0.06, 'z', 8);
        const p = rotor(`rotor${k}`, 0.1, 3);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, 0.26, -0.18);
        g.add(p);
      }
    },
  },

  // ── Ships ──────────────────────────────────────────────────
  gunboat: {
    size: 0.96,
    build(g) {
      const d = shipHull(g, 0.96, 0.36, 0.16);
      box(g, 0.2, 0.14, 0.24, M.light, 0, d + 0.07, 0.12, 0.03);
      box(g, 0.16, 0.04, 0.02, M.glass, 0, d + 0.1, -0.005);
      mast(g, 0.22, 0, 0.2, d + 0.14);
      turret(g, d, (t) => {
        cyl(t, 0.07, 0.08, 0.06, M.steel, 0, 0.03, 0, 'y', 10);
        barrel(t, 0.2, 0.02, 0, 0.05, -0.06);
      }, -0.22);
    },
  },
  destroyer: {
    size: 1.36,
    build(g) {
      const d = shipHull(g, 1.36, 0.42, 0.2);
      box(g, 0.24, 0.18, 0.4, M.light, 0, d + 0.09, 0.12, 0.03);
      box(g, 0.18, 0.12, 0.16, M.light, 0, d + 0.24, 0.04, 0.03);
      box(g, 0.16, 0.04, 0.02, M.glass, 0, d + 0.26, -0.045);
      stack(g, 0.05, 0.16, M.dark, 0, 0.34, d + 0.18);
      mast(g, 0.3, 0, 0.12, d + 0.3);
      cyl(g, 0.04, 0.05, 0.08, M.steel, 0, d + 0.04, 0.5, 'y', 8);
      turret(g, d, (t) => {
        box(t, 0.14, 0.08, 0.16, M.steel, 0, 0.04, 0.02, 0.03);
        for (const x of [-0.03, 0.03]) barrel(t, 0.24, 0.016, x, 0.05, -0.06);
      }, -0.36);
    },
  },
  cruiser: {
    size: 1.86,
    build(g) {
      const d = shipHull(g, 1.86, 0.5, 0.22);
      box(g, 0.3, 0.2, 0.6, M.light, 0, d + 0.1, 0.2, 0.04);
      box(g, 0.24, 0.16, 0.24, M.light, 0, d + 0.28, 0.06, 0.03);
      box(g, 0.2, 0.05, 0.02, M.glass, 0, d + 0.31, -0.065);
      for (const z of [0.36, 0.52]) stack(g, 0.05, 0.16, M.dark, 0, z, d + 0.2);
      mast(g, 0.36, 0, 0.18, d + 0.36);
      dish(g, 0.08, 0.1, d + 0.36, 0.24);
      // Missile cells aft.
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(g, 0.05, 0.02, 0.05, M.dark, -0.06 + j * 0.12, d + 0.01, 0.62 + i * 0.07);
      turret(g, d, (t) => {
        box(t, 0.2, 0.1, 0.22, M.steel, 0, 0.05, 0.02, 0.04);
        for (const x of [-0.05, 0, 0.05]) barrel(t, 0.32, 0.018, x, 0.06, -0.08);
      }, -0.52);
    },
  },
  seaScorpion: {
    size: 1.0,
    build(g) {
      const d = shipHull(g, 1.0, 0.34, 0.15);
      box(g, 0.22, 0.1, 0.22, M.light, 0, d + 0.05, 0.14, 0.03);
      box(g, 0.15, 0.05, 0.11, M.concreteDark, 0, d + 0.12, 0.15, 0.02);
      mast(g, 0.14, 0, 0.17, d + 0.14);
      for (const x of [-0.08, 0.08]) box(g, 0.07, 0.05, 0.1, M.dark, x, d + 0.025, 0.4, 0.01);
      turret(g, d, (t) => {
        cyl(t, 0.07, 0.08, 0.06, M.team, 0, 0.03, 0, 'y', 10);
        for (const x of [-0.026, 0.026]) barrel(t, 0.2, 0.012, x, 0.06, -0.05);
      }, -0.2);
    },
  },
  dreadnought: {
    size: 2.0,
    build(g) {
      const d = shipHull(g, 2.0, 0.5, 0.24);
      box(g, 0.34, 0.18, 0.48, M.light, 0, d + 0.09, -0.2, 0.04);
      box(g, 0.26, 0.14, 0.3, M.light, 0, d + 0.25, -0.24, 0.03);
      box(g, 0.2, 0.05, 0.02, M.glass, 0, d + 0.28, -0.395);
      mast(g, 0.3, 0, -0.2, d + 0.32);
      stack(g, 0.08, 0.26, M.dark, 0, 0.1, d);
      // Two launchers aft, each with a pair of heavy missiles raised toward the bow.
      const lift = 0.5;
      for (const z of [0.42, 0.72]) {
        box(g, 0.34, 0.06, 0.24, M.steel, 0, d + 0.03, z, 0.02);
        for (const x of [-0.075, 0.075]) {
          cyl(g, 0.05, 0.05, 0.34, M.light, x, d + 0.14, z).rotation.x = Math.PI / 2 + lift;
          const nose = cone(g, 0.05, 0.09, M.team, x, d + 0.14 + Math.sin(lift) * 0.215, z - Math.cos(lift) * 0.215, 10);
          nose.rotation.x = -(Math.PI / 2 - lift);
        }
      }
    },
  },
  submarine: {
    size: 1.24,
    build(g) {
      const h = cyl(g, 0.15, 0.15, 1.0, M.hull, 0, 0.08, 0, 'z', 12);
      h.scale.x = 1.2;
      sphere(g, 0.15, M.hull, 0, 0.08, -0.5, 1, 10).scale.x = 1.2;
      cone(g, 0.15, 0.3, M.hull, 0, 0.08, 0.64, 10).rotation.x = Math.PI / 2;
      box(g, 0.1, 0.18, 0.26, M.team, 0, 0.26, -0.06, 0.04);
      box(g, 0.24, 0.02, 0.06, M.team, 0, 0.3, -0.06);
      for (const s of [-1, 1]) box(g, 0.14, 0.02, 0.06, M.hull, s * 0.18, 0.08, 0.64);
      box(g, 0.02, 0.14, 0.08, M.hull, 0, 0.16, 0.68);
      cyl(g, 0.01, 0.01, 0.14, M.steel, 0.02, 0.4, -0.08, 'y', 4);
    },
  },
  navalTransport: {
    size: 1.1,
    build(g) {
      // A hovercraft: rubber skirt, cargo deck, bow ramp, cab and two fans.
      box(g, 0.56, 0.12, 1.0, M.rubber, 0, 0.06, 0, 0.06);
      box(g, 0.5, 0.12, 0.92, M.team, 0, 0.18, 0, 0.04);
      box(g, 0.4, 0.02, 0.6, M.dark, 0, 0.245, 0.06);
      box(g, 0.44, 0.05, 0.16, M.teamDark, 0, 0.22, -0.46).rotation.x = -0.4;
      box(g, 0.16, 0.16, 0.14, M.light, 0.16, 0.32, 0.34, 0.03);
      box(g, 0.12, 0.04, 0.02, M.glass, 0.16, 0.36, 0.265);
      for (const s of [-1, 1]) {
        cyl(g, 0.1, 0.1, 0.06, M.dark, s * 0.14, 0.34, 0.5, 'z', 12);
        const p = rotor(`rotor${s < 0 ? 0 : 1}`, 0.09, 3);
        p.rotation.x = Math.PI / 2;
        p.position.set(s * 0.14, 0.34, 0.52);
        g.add(p);
      }
    },
  },

  // ── Tanks and vehicles added with the Red Alert 2 roster ──────
  // ── Tanks and vehicles added with the Red Alert 2 roster ──────
  tankDestroyer: {
    size: 0.94,
    build(g) {
      const t = trackedHull(g, 1.0, 0.7, 0.32);
      box(g, 0.46, 0.18, 0.5, M.team, 0, t + 0.09, -0.06, 0.06);
      box(g, 0.3, 0.08, 0.24, M.teamDark, 0, t + 0.21, 0.04, 0.03);
      barrel(g, 0.62, 0.035, 0, t + 0.1, -0.3);
    },
  },
  mirageTank: {
    size: 0.86,
    build(g) {
      const t = trackedHull(g, 0.9, 0.66, 0.3);
      turret(g, t, (tt) => {
        box(tt, 0.4, 0.15, 0.42, M.team, 0, 0.075, 0.02, 0.07);
        sphere(tt, 0.11, M.chrono, 0, 0.15, 0.06, 0.6);
        barrel(tt, 0.36, 0.028, 0, 0.08, -0.18);
      });
      for (const s of [-1, 1]) box(g, 0.08, 0.05, 0.3, M.chrono, s * 0.22, t + 0.02, 0.24, 0.02);
    },
  },
  robotTank: {
    size: 0.8,
    build(g) {
      // Hover skirts instead of tracks.
      box(g, 0.7, 0.16, 0.86, M.dark, 0, 0.14, 0, 0.07);
      for (const s of [-1, 1]) box(g, 0.12, 0.12, 0.8, M.steel, s * 0.34, 0.2, 0, 0.05);
      box(g, 0.5, 0.18, 0.7, M.team, 0, 0.31, 0.02, 0.08);
      turret(g, 0.4, (tt) => {
        box(tt, 0.3, 0.12, 0.3, M.light, 0, 0.06, 0, 0.05);
        sphere(tt, 0.06, M.glass, 0, 0.13, -0.08);
        for (const s of [-1, 1]) barrel(tt, 0.3, 0.02, s * 0.06, 0.05, -0.12);
      });
    },
  },
  battleFortress: {
    size: 1.32,
    pivot: [0.5, 0.5],
    build(g) {
      const t = trackedHull(g, 1.25, 0.95, 0.42);
      box(g, 0.74, 0.34, 1.0, M.team, 0, t + 0.17, 0.02, 0.1);
      box(g, 0.6, 0.06, 0.82, M.teamDark, 0, t + 0.37, 0.04, 0.03);
      // Firing ports with guns along the sides.
      for (const [x, z] of [[-0.37, -0.3], [0.37, -0.3], [-0.37, 0.05], [0.37, 0.05], [-0.37, 0.38], [0.37, 0.38]]) {
        cyl(g, 0.04, 0.04, 0.05, M.dark, x, t + 0.18, z, 'x', 8);
        box(g, 0.14, 0.022, 0.022, M.black, x + Math.sign(x) * 0.08, t + 0.18, z);
      }
      turret(g, t + 0.4, (tt) => {
        cyl(tt, 0.13, 0.15, 0.1, M.steel, 0, 0.05, 0, 'y', 10);
        barrel(tt, 0.32, 0.02, -0.04, 0.06, -0.08);
        barrel(tt, 0.32, 0.02, 0.04, 0.06, -0.08);
      }, -0.28);
    },
  },
  terrorDrone: {
    size: 0.44,
    build(g) {
      sphere(g, 0.18, M.team, 0, 0.26, 0.02, 0.6);
      sphere(g, 0.09, M.dark, 0, 0.28, -0.18, 0.8);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const a = -0.9 + k * 0.6;
          const leg = box(g, 0.34, 0.03, 0.03, M.steel, s * 0.22 * Math.cos(a * 0.4), 0.15, Math.sin(a) * 0.2);
          leg.rotation.y = s * a * 0.6;
          leg.rotation.z = s * 0.45;
        }
      }
      sphere(g, 0.03, M.rad, -0.04, 0.32, -0.25);
      sphere(g, 0.03, M.rad, 0.04, 0.32, -0.25);
    },
  },
  demoTruck: {
    size: 0.92,
    build(g) {
      const t = wheeledHull(g, 0.92, 0.56, 0.3, 3);
      box(g, 0.46, 0.28, 0.24, M.team, 0, t + 0.14, -0.33, 0.06);
      box(g, 0.36, 0.08, 0.02, M.glass, 0, t + 0.2, -0.455);
      // Cargo: a big drum with hazard bands.
      cyl(g, 0.22, 0.22, 0.56, M.light, 0, t + 0.2, 0.14, 'z', 16);
      for (const z of [-0.06, 0.14, 0.34]) cyl(g, 0.225, 0.225, 0.05, M.hazard, 0, t + 0.2, z, 'z', 16);
      sphere(g, 0.05, M.black, 0, t + 0.44, 0.14);
    },
  },

  // ── Aircraft ───────────────────────────────────────────────
  siegeChopper: {
    size: 1.24,
    build(g) {
      const b = sphere(g, 0.24, M.team, 0, 0.36, 0.02, 0.7);
      b.scale.z = 1.8;
      sphere(g, 0.15, M.glass, 0, 0.42, -0.26, 0.7);
      box(g, 0.06, 0.08, 0.7, M.team, 0, 0.42, 0.6, 0.02);
      box(g, 0.24, 0.02, 0.06, M.teamDark, 0, 0.44, 0.92);
      for (const s of [-1, 1]) {
        box(g, 0.22, 0.04, 0.12, M.dark, s * 0.28, 0.32, 0.02);
        cyl(g, 0.05, 0.05, 0.28, M.steel, s * 0.38, 0.3, -0.04, 'z');
      }
      barrel(g, 0.32, 0.03, 0, 0.24, -0.42);
      for (const s of [-1, 1]) box(g, 0.02, 0.02, 0.5, M.dark, s * 0.18, 0.1, 0.02);
      const r = rotor('rotor0', 0.78, 4);
      r.position.set(0, 0.62, 0.04);
      g.add(r);
    },
  },
  migFighter: { size: 1.04, build(g) { jet(g, { len: 1.0, span: 0.82, twin: true }); } },
  migInterceptor: { size: 1.06, build(g) { jet(g, { len: 1.05, span: 0.6, delta: true, tailSpan: 0.3 }); } },
  migBomber: { size: 1.24, build(g) { jet(g, { len: 1.1, span: 1.05, bombBay: true, tailSpan: 0.5 }); } },
  harrier: {
    size: 0.98,
    build(g) {
      jet(g, { len: 0.95, span: 0.72, tailSpan: 0.4 });
      for (const s of [-1, 1]) cyl(g, 0.07, 0.07, 0.12, M.dark, s * 0.11, 0.1, -0.02, 'x');
    },
  },
  eagleJet: { size: 1.04, build(g) { jet(g, { len: 1.0, span: 0.86, delta: true, twin: true, body: M.team, wing: M.dark, tailSpan: 0.35 }); } },

  // ── Infantry ───────────────────────────────────────────────
  seal: { size: 0.44, build(g) { soldier(g, { helmet: M.black, weapon: 'smg', pack: M.dark, extra: (s) => box(s, 0.06, 0.04, 0.1, M.hazard, -0.1, 0.38, 0.1) }); } },
  chronoTrooper: { size: 0.46, build(g) { soldier(g, { helmet: M.chrono, weapon: 'big', pack: M.steel, extra: (s) => { sphere(s, 0.07, M.chrono, 0, 0.44, 0.16); } }); } },
  rocketeer: {
    size: 0.5,
    build(g) {
      soldier(g, { helmet: M.steel, weapon: 'smg', pack: M.steel, extra: (s) => {
        for (const x of [-0.08, 0.08]) cyl(s, 0.05, 0.05, 0.22, M.light, x, 0.36, 0.15);
        for (const x of [-1, 1]) box(s, 0.22, 0.015, 0.08, M.teamDark, x * 0.2, 0.44, 0.12);
        for (const x of [-0.08, 0.08]) cone(s, 0.04, 0.12, M.fire, x, 0.2, 0.15).rotation.x = Math.PI;
      } });
    },
  },
  desolator: { size: 0.48, build(g) { soldier(g, { helmet: M.olive, weapon: 'big', pack: M.rad, extra: (s) => sphere(s, 0.05, M.rad, 0.1, 0.38, -0.42) }); } },
  ivan: {
    size: 0.42,
    build(g) {
      soldier(g, { helmet: M.cloth, weapon: 'none', pack: M.dark, extra: (s) => {
        for (const [x, z] of [[-0.12, -0.06], [0.12, -0.06], [0, -0.16]]) cyl(s, 0.035, 0.035, 0.12, M.hazard, x, 0.38, z, 'y', 8);
      } });
    },
  },
  psiCommander: {
    size: 0.4,
    build(g) {
      soldier(g, { helmet: M.psi, weapon: 'none', extra: (s) => { torus(s, 0.15, 0.015, M.psi, 0, 0.64, 0); } });
    },
  },
  hero: { size: 0.46, build(g) { soldier(g, { helmet: M.dark, weapon: 'rifle', pack: M.olive, extra: (s) => box(s, 0.24, 0.03, 0.04, M.black, 0, 0.44, -0.02) }); } },
};
