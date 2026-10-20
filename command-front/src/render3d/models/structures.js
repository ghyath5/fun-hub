// @ts-check
/**
 * Structure and scenery models, built from the kit (../kit.js). Structures
 * are modelled on their footprint (x ∈ [0, w], z ∈ [0, h], cells), front to
 * the south; `id@faction` is a look only that faction's buildings use.
 * GLB-based looks (Tesla Reactor, Soviet refinery, Tesla Coil, …) are baked
 * models and need no entry here.
 */
import * as THREE from 'three';
import {
  M, box, block, cyl, sphere, dome, cone, torus, prism, gable, pipe, sub,
  foundation, tank, stack, dish, bayDoor, mast, windows, turret, barrel, pod,
} from '../kit.js';

/** @typedef {{ build: (g: THREE.Group) => void, fill?: number }} StructureModel */

/**
 * A Quonset-style arched hall (half a cylinder on its side, ends closed),
 * running north–south; `alongX` turns it east–west.
 */
function arch(g, len, r, mat, x, z, y0 = 0, alongX = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14, 1, false, 0, Math.PI), mat);
  m.rotation.z = Math.PI / 2;
  if (!alongX) m.rotation.y = Math.PI / 2;
  m.position.set(x, y0, z);
  g.add(m);
  return m;
}

/** A construction crane: mast and a jib that slowly swings (a `spin` group). */
function crane(g, x, z, h, jib) {
  for (const dx of [-0.05, 0.05]) for (const dz of [-0.05, 0.05]) cyl(g, 0.012, 0.012, h, M.yellow, x + dx, h / 2, z + dz, 'y', 4);
  for (let k = 1; k < 6; k++) box(g, 0.12, 0.012, 0.12, M.yellow, x, (k * h) / 6, z);
  const s = sub(g, 'spin', x, h, z);
  box(s, jib, 0.05, 0.06, M.yellow, jib * 0.3, 0.04, 0);
  box(s, 0.14, 0.1, 0.1, M.concreteDark, -jib * 0.18, 0.02, 0);
  box(s, 0.08, 0.08, 0.08, M.team, 0, -0.02, 0);
  cyl(s, 0.006, 0.006, 0.36, M.dark, jib * 0.7, -0.16, 0, 'y', 3);
  return s;
}

/** A sloped sawtooth factory roof over [x0, x1] × [z0, z1] at height y. */
function sawtooth(g, x0, x1, z0, z1, y, teeth, mat) {
  const d = (z1 - z0) / teeth;
  for (let k = 0; k < teeth; k++) {
    const z = z0 + k * d;
    prism(g, [[z, 0], [z + d, 0], [z + d, d * 0.55]], x1 - x0, mat, (x0 + x1) / 2, y, 0).rotation.y = -Math.PI / 2;
    box(g, x1 - x0, d * 0.5, 0.02, M.glassDark, (x0 + x1) / 2, y + d * 0.27, z + d);
  }
}

/** A gun turret on a ring (group `turret`, aiming), barrels north. */
function gunMount(g, x, z, y, r, len, barrels = 1, mat = M.team) {
  return turret(g, y, (t) => {
    cyl(t, r, r * 1.1, r * 0.7, mat, 0, r * 0.35, 0, 'y', 12);
    dome(t, r * 0.8, M.teamDark, 0, r * 0.7, 0.02, 0.5, 12);
    for (let k = 0; k < barrels; k++) barrel(t, len, r * 0.16, (k - (barrels - 1) / 2) * r * 0.45, r * 0.45, -r * 0.6);
  }).position.set(x, y, z);
}

/** Sandbags in a ring around (x, z). */
function sandbags(g, x, z, r, n = 10, y0 = 0) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const b = box(g, 0.16, 0.08, 0.09, M.sand, x + Math.cos(a) * r, y0 + 0.04, z + Math.sin(a) * r, 0.03);
    b.rotation.y = -a + Math.PI / 2;
  }
}

/** Glowing vat: a glass cylinder with something inside. */
function vat(g, x, z, h, mat = M.chrono) {
  cyl(g, 0.16, 0.18, 0.06, M.steel, x, 0.11, z, 'y', 12);
  cyl(g, 0.13, 0.13, h, mat, x, 0.14 + h / 2, z, 'y', 12);
  cyl(g, 0.16, 0.16, 0.05, M.steel, x, 0.16 + h, z, 'y', 12);
}

/** @type {Record<string, StructureModel>} */
export const STRUCTURE_MODELS = {
  // ── Base ───────────────────────────────────────────────────
  constructionYard: {
    build(g) {
      foundation(g, 3, 3);
      block(g, 1.9, 0.62, 1.3, M.light, 1.25, 1.15, 0.08, 0.04);
      block(g, 1.95, 0.08, 1.35, M.team, 1.25, 1.15, 0.7);
      block(g, 0.7, 0.42, 0.6, M.light, 0.85, 1.0, 0.78, 0.03);
      block(g, 0.72, 0.1, 0.62, M.glass, 0.85, 1.0, 1.0);
      block(g, 0.74, 0.04, 0.64, M.dark, 0.85, 1.0, 1.1);
      bayDoor(g, 1.0, 0.5, 1.45, 1.81);
      windows(g, 4, 0.12, 0.5, 1.81, 0.35, 0.95);
      crane(g, 2.55, 0.65, 1.3, 1.1);
      dish(g, 0.16, 1.75, 0.78, 0.7);
      mast(g, 0.4, 0.4, 0.75, 0.78);
      for (const x of [0.45, 1.05, 1.65, 2.25]) box(g, 0.4, 0.02, 0.1, M.hazard, x, 0.09, 2.75);
      block(g, 0.5, 0.26, 0.5, M.concreteDark, 2.5, 2.4, 0.08, 0.03);
      block(g, 0.52, 0.05, 0.52, M.team, 2.5, 2.4, 0.34);
    },
  },
  'constructionYard@union': {
    build(g) {
      foundation(g, 3, 3, M.concreteDark);
      block(g, 1.8, 0.7, 1.4, M.brick, 1.2, 1.1, 0.08, 0.03);
      gable(g, 1.46, 1.86, 0.36, M.team, 1.2, 0.78, 1.1).rotation.y = Math.PI / 2;
      block(g, 0.8, 0.95, 0.6, M.brick, 0.7, 1.3, 0.08, 0.03);
      block(g, 0.84, 0.08, 0.64, M.team, 0.7, 1.3, 1.03);
      windows(g, 3, 0.12, 0.8, 1.61, 0.36, 1.04, M.lamp);
      bayDoor(g, 0.8, 0.5, 1.6, 1.81);
      stack(g, 0.1, 1.3, M.concreteDark, 2.05, 0.65);
      crane(g, 2.6, 1.6, 1.25, 1.0);
      for (const x of [0.45, 1.05, 1.65, 2.25]) box(g, 0.4, 0.02, 0.1, M.hazard, x, 0.09, 2.75);
      tank(g, 0.22, 0.4, M.steel, 2.45, 2.45, 0.08);
    },
  },
  powerPlant: {
    build(g) {
      foundation(g, 2, 2);
      block(g, 1.3, 0.46, 0.9, M.light, 0.9, 1.25, 0.08, 0.04);
      block(g, 1.34, 0.06, 0.94, M.team, 0.9, 1.25, 0.54);
      windows(g, 4, 0.1, 0.36, 1.71, 0.35, 1.45);
      // Two turbine housings with fans on top.
      for (const x of [0.6, 1.3]) {
        cyl(g, 0.3, 0.34, 0.5, M.concrete, x, 0.33, 0.55, 'y', 16);
        torus(g, 0.32, 0.03, M.team, x, 0.5, 0.55, 'y', 20);
        const fan = sub(g, 'spin', x, 0.6, 0.55);
        for (let k = 0; k < 4; k++) { const b = box(fan, 0.5, 0.012, 0.08, M.dark); b.rotation.y = (k * Math.PI) / 4; }
        cyl(fan, 0.06, 0.06, 0.04, M.steel);
      }
      pipe(g, [0.25, 0.3, 1.7], [0.25, 0.3, 0.3], 0.04, M.steel);
      mast(g, 0.3, 1.75, 1.7, 0.08);
    },
  },
  advPowerPlant: {
    build(g) {
      foundation(g, 3, 3);
      // Two cooling towers and the reactor hall.
      for (const [x, z] of [[0.75, 0.8], [1.75, 0.65]]) {
        cyl(g, 0.34, 0.46, 0.7, M.concrete, x, 0.43, z, 'y', 18);
        cyl(g, 0.38, 0.34, 0.45, M.concrete, x, 1.0, z, 'y', 18);
        cyl(g, 0.33, 0.33, 0.02, M.dark, x, 1.22, z, 'y', 18);
        torus(g, 0.4, 0.025, M.team, x, 0.78, z, 'y', 20);
      }
      block(g, 1.5, 0.5, 0.9, M.light, 1.6, 1.95, 0.08, 0.04);
      dome(g, 0.42, M.light, 2.3, 0.58, 1.95, 0.8);
      torus(g, 0.42, 0.03, M.team, 2.3, 0.58, 1.95, 'y', 20);
      block(g, 1.54, 0.06, 0.94, M.team, 1.6, 1.95, 0.58);
      windows(g, 5, 0.1, 0.4, 2.41, 0.95, 2.25, M.lamp);
      pipe(g, [0.75, 0.25, 1.2], [1.0, 0.25, 1.7], 0.05, M.steel);
      pipe(g, [1.75, 0.25, 1.05], [1.75, 0.25, 1.5], 0.05, M.steel);
      for (const x of [0.4, 0.9]) tank(g, 0.16, 0.3, M.steel, x, 2.5, 0.08);
    },
  },
  refinery: {
    build(g) {
      foundation(g, 3, 3);
      block(g, 1.5, 0.7, 1.1, M.light, 1.0, 0.8, 0.08, 0.04);
      gable(g, 1.14, 1.54, 0.28, M.team, 1.0, 0.78, 0.8).rotation.y = Math.PI / 2;
      windows(g, 4, 0.1, 0.55, 1.36, 0.35, 1.65);
      for (const [x, z] of [[2.15, 0.45], [2.6, 0.45], [2.38, 0.95]]) tank(g, 0.22, 0.75, M.concrete, x, z, 0.08);
      for (const x of [2.15, 2.6]) torus(g, 0.23, 0.025, M.team, x, 0.6, 0.45, 'y', 16);
      // Unloading dock: dark pad with hazard edges where the harvester backs in.
      box(g, 1.3, 0.04, 1.0, M.tarmac, 1.1, 0.1, 2.2);
      for (const z of [1.72, 2.68]) box(g, 1.3, 0.02, 0.06, M.hazard, 1.1, 0.13, z);
      box(g, 0.5, 0.36, 0.3, M.concreteDark, 1.1, 0.26, 1.5, 0.03);
      pipe(g, [1.75, 0.5, 0.8], [2.2, 0.5, 0.95], 0.05, M.steel);
      stack(g, 0.07, 0.6, M.dark, 0.4, 0.5, 0.78);
    },
  },
  silo: {
    build(g) {
      foundation(g, 1, 1);
      tank(g, 0.32, 0.5, M.light, 0.5, 0.5, 0.08);
      torus(g, 0.33, 0.04, M.team, 0.5, 0.42, 0.5, 'y', 18);
      for (let k = 0; k < 5; k++) box(g, 0.08, 0.012, 0.02, M.dark, 0.5, 0.16 + k * 0.09, 0.83);
      sphere(g, 0.06, M.ore, 0.5, 0.74, 0.5, 0.6, 8);
    },
  },
  barracks: {
    build(g) {
      foundation(g, 2, 2);
      arch(g, 1.5, 0.48, M.team, 0.95, 0.85, 0.08, true);
      box(g, 0.04, 0.3, 0.3, M.dark, 1.71, 0.23, 0.85);
      box(g, 0.4, 0.34, 0.3, M.light, 0.5, 0.25, 1.48, 0.03);
      box(g, 0.24, 0.26, 0.02, M.dark, 0.5, 0.21, 1.64);
      sandbags(g, 1.45, 1.55, 0.25, 9, 0.08);
      mast(g, 0.9, 1.85, 0.25, 0.08);
      box(g, 0.24, 0.14, 0.01, M.team, 1.97, 0.88, 0.25);
    },
  },
  'barracks@union': {
    build(g) {
      foundation(g, 2, 2, M.concreteDark);
      block(g, 1.5, 0.5, 1.0, M.brick, 0.95, 0.85, 0.08, 0.03);
      block(g, 1.56, 0.08, 1.06, M.team, 0.95, 0.85, 0.58);
      block(g, 0.5, 0.75, 0.5, M.brick, 0.5, 0.95, 0.08, 0.03);
      block(g, 0.54, 0.08, 0.54, M.team, 0.5, 0.95, 0.83);
      windows(g, 3, 0.1, 0.42, 1.36, 0.9, 1.6, M.lamp);
      box(g, 0.24, 0.3, 0.02, M.dark, 0.5, 0.23, 1.21);
      sandbags(g, 1.45, 1.6, 0.24, 9, 0.08);
      mast(g, 0.6, 0.5, 0.95, 0.91);
    },
  },
  warFactory: {
    build(g) {
      foundation(g, 3, 3);
      block(g, 2.4, 0.78, 2.0, M.light, 1.35, 1.2, 0.08, 0.04);
      gable(g, 2.44, 2.04, 0.4, M.team, 1.35, 0.86, 1.2);
      bayDoor(g, 1.2, 0.62, 1.35, 2.21, M.dark);
      windows(g, 6, 0.1, 0.72, 2.21, 0.2, 2.5);
      block(g, 0.5, 0.5, 0.8, M.concrete, 2.72, 0.7, 0.08, 0.03);
      stack(g, 0.08, 0.7, M.dark, 2.72, 0.5, 0.58);
      mast(g, 0.3, 0.3, 0.4, 0.86);
      for (const x of [0.6, 2.1]) sphere(g, 0.04, M.lamp, x, 0.78, 2.22, 1, 6);
      box(g, 1.3, 0.02, 0.5, M.tarmac, 1.35, 0.09, 2.62);
    },
  },
  'warFactory@union': {
    build(g) {
      foundation(g, 3, 3, M.concreteDark);
      block(g, 2.5, 0.85, 2.0, M.brick, 1.35, 1.15, 0.08, 0.03);
      sawtooth(g, 0.12, 2.58, 0.16, 2.14, 0.93, 4, M.team);
      bayDoor(g, 1.2, 0.66, 1.35, 2.16, M.dark);
      windows(g, 5, 0.12, 0.75, 2.16, 0.2, 2.5, M.lamp);
      for (const x of [0.4, 2.3]) stack(g, 0.09, 1.4, M.concreteDark, x, 0.4);
      box(g, 1.3, 0.02, 0.6, M.tarmac, 1.35, 0.09, 2.6);
    },
  },
  radarDome: {
    build(g) {
      foundation(g, 2, 2);
      block(g, 1.2, 0.4, 0.8, M.light, 0.75, 1.3, 0.08, 0.04);
      block(g, 1.24, 0.05, 0.84, M.team, 0.75, 1.3, 0.48);
      windows(g, 3, 0.1, 0.32, 1.71, 0.3, 1.2);
      cyl(g, 0.38, 0.4, 0.18, M.concrete, 1.25, 0.17, 0.7, 'y', 16);
      dome(g, 0.42, M.white, 1.25, 0.26, 0.7, 1.0, 18);
      torus(g, 0.41, 0.025, M.team, 1.25, 0.28, 0.7, 'y', 20);
      dish(g, 0.18, 0.45, 0.56, 1.25);
      mast(g, 0.4, 1.7, 1.5, 0.08);
    },
  },
  'radarDome@union': {
    build(g) {
      foundation(g, 2, 2, M.concreteDark);
      block(g, 1.1, 0.42, 0.8, M.brick, 0.7, 1.3, 0.08, 0.03);
      block(g, 1.14, 0.06, 0.84, M.team, 0.7, 1.3, 0.5);
      // A lattice tower with a big dish.
      for (const dx of [-0.12, 0.12]) for (const dz of [-0.12, 0.12]) cyl(g, 0.016, 0.03, 0.9, M.steel, 1.4 + dx, 0.53, 0.7 + dz, 'y', 4);
      for (let k = 1; k < 5; k++) box(g, 0.28, 0.015, 0.28, M.steel, 1.4, 0.08 + k * 0.18, 0.7);
      dish(g, 0.36, 1.4, 0.95, 0.7, M.light);
      windows(g, 3, 0.1, 0.34, 1.71, 0.3, 1.1, M.lamp);
    },
  },
  serviceDepot: {
    build(g) {
      foundation(g, 3, 3);
      // The repair pad: a ring of hazard paint on a dark disc, arms over it.
      cyl(g, 1.05, 1.05, 0.04, M.tarmac, 1.5, 0.1, 1.6, 'y', 28);
      torus(g, 0.95, 0.035, M.hazard, 1.5, 0.13, 1.6, 'y', 32);
      for (const s of [-1, 1]) {
        block(g, 0.18, 0.7, 0.18, M.light, 1.5 + s * 1.15, 1.6, 0.08, 0.03);
        const arm = box(g, 0.7, 0.06, 0.1, M.yellow, 1.5 + s * 0.85, 0.8, 1.6);
        arm.rotation.z = s * 0.1;
        cyl(g, 0.012, 0.012, 0.3, M.dark, 1.5 + s * 0.6, 0.63, 1.6, 'y', 4);
      }
      block(g, 1.0, 0.36, 0.42, M.light, 1.5, 0.3, 0.08, 0.03);
      block(g, 1.04, 0.05, 0.46, M.team, 1.5, 0.3, 0.44);
      box(g, 0.8, 0.1, 0.02, M.glass, 1.5, 0.32, 0.52);
      mast(g, 0.3, 2.3, 0.3, 0.49);
    },
  },
  techCenter: {
    build(g) {
      foundation(g, 2, 2);
      block(g, 1.5, 0.4, 1.3, M.light, 1.0, 1.05, 0.08, 0.05);
      block(g, 1.54, 0.05, 1.34, M.team, 1.0, 1.05, 0.48);
      dome(g, 0.5, M.glass, 1.0, 0.53, 1.0, 0.8, 18);
      torus(g, 0.5, 0.03, M.team, 1.0, 0.53, 1.0, 'y', 22);
      cyl(g, 0.03, 0.03, 0.5, M.steel, 1.0, 1.1, 1.0, 'y', 6);
      sphere(g, 0.06, M.chrono, 1.0, 1.36, 1.0, 1, 8);
      windows(g, 5, 0.1, 0.3, 1.71, 0.35, 1.65, M.lamp);
      for (const x of [0.35, 1.65]) mast(g, 0.35, x, 0.5, 0.48);
    },
  },
  kennel: {
    build(g) {
      foundation(g, 1, 1, M.concreteDark, 0.05);
      block(g, 0.5, 0.26, 0.42, M.wood, 0.45, 0.42, 0.05, 0.02);
      gable(g, 0.48, 0.58, 0.16, M.team, 0.45, 0.31, 0.42).rotation.y = Math.PI / 2;
      box(g, 0.16, 0.16, 0.02, M.black, 0.45, 0.13, 0.64);
      for (let k = 0; k < 6; k++) cyl(g, 0.012, 0.012, 0.18, M.steel, 0.1 + k * 0.16, 0.14, 0.92, 'y', 4);
      box(g, 0.84, 0.015, 0.015, M.steel, 0.5, 0.2, 0.92);
      cyl(g, 0.07, 0.07, 0.03, M.steel, 0.82, 0.07, 0.72, 'y', 8);
    },
  },
  helipad: {
    build(g) {
      foundation(g, 2, 2);
      cyl(g, 0.82, 0.82, 0.03, M.tarmac, 1.0, 0.1, 1.0, 'y', 28);
      torus(g, 0.74, 0.03, M.white, 1.0, 0.12, 1.0, 'y', 28);
      for (const x of [0.78, 1.22]) box(g, 0.08, 0.012, 0.5, M.white, x, 0.125, 1.0);
      box(g, 0.44, 0.012, 0.08, M.white, 1.0, 0.125, 1.0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; sphere(g, 0.03, k % 2 ? M.lamp : M.team, 1 + Math.cos(a) * 0.86, 0.12, 1 + Math.sin(a) * 0.86, 1, 5); }
      block(g, 0.3, 0.26, 0.26, M.light, 1.78, 0.2, 0.08, 0.03);
      box(g, 0.24, 0.06, 0.02, M.glass, 1.78, 0.26, 0.34);
      block(g, 0.32, 0.04, 0.28, M.team, 1.78, 0.2, 0.34);
    },
  },
  navalYard: {
    build(g) {
      // On water: piers around a berth, a crane and the dock office.
      for (const x of [0.25, 2.75]) box(g, 0.4, 0.14, 2.8, M.concrete, x, 0.07, 1.5, 0.02);
      box(g, 3.0, 0.14, 0.5, M.concrete, 1.5, 0.07, 0.3, 0.02);
      for (const x of [0.25, 2.75]) box(g, 0.42, 0.02, 0.1, M.hazard, x, 0.15, 2.85);
      block(g, 1.0, 0.42, 0.42, M.light, 1.0, 0.3, 0.14, 0.03);
      block(g, 1.04, 0.05, 0.46, M.team, 1.0, 0.3, 0.56);
      windows(g, 4, 0.1, 0.4, 0.52, 0.55, 1.45);
      crane(g, 2.7, 0.5, 1.1, 1.0);
      for (const z of [0.9, 1.6, 2.3]) for (const x of [0.48, 2.52]) cyl(g, 0.04, 0.04, 0.08, M.dark, x, 0.18, z, 'y', 6);
    },
  },
  subPen: {
    build(g) {
      for (const x of [0.3, 2.7]) box(g, 0.5, 0.3, 2.6, M.concreteDark, x, 0.15, 1.6, 0.03);
      block(g, 3.0, 0.62, 1.2, M.concreteDark, 1.5, 0.6, 0, 0.04);
      arch(g, 0.04, 0.42, M.black, 1.5, 1.215, 0.02);
      block(g, 3.04, 0.08, 1.24, M.team, 1.5, 0.6, 0.62);
      prism(g, [[-1.5, 0], [1.5, 0], [1.2, 0.25], [-1.2, 0.25]], 1.0, M.concreteDark, 1.5, 0.7, 0.6);
      for (const x of [0.6, 2.4]) sphere(g, 0.04, M.lamp, x, 0.5, 1.22, 1, 6);
    },
  },

  // ── Special ────────────────────────────────────────────────
  phaseShifter: {
    build(g) {
      foundation(g, 2, 2);
      cyl(g, 0.8, 0.86, 0.16, M.concrete, 1.0, 0.16, 1.0, 'y', 24);
      torus(g, 0.82, 0.04, M.team, 1.0, 0.24, 1.0, 'y', 28);
      // The great ring, turning around its glowing core.
      const ring = sub(g, 'spin', 1.0, 0.82, 1.0);
      torus(ring, 0.55, 0.06, M.steel, 0, 0, 0, 'z', 30);
      torus(ring, 0.42, 0.03, M.chrono, 0, 0, 0, 'z', 26);
      for (const s of [-1, 1]) box(g, 0.1, 0.62, 0.14, M.light, 1.0 + s * 0.66, 0.55, 1.0, 0.03);
      sphere(g, 0.16, M.chrono, 1.0, 0.82, 1.0, 1, 12);
    },
  },
  oreProcessor: {
    build(g) {
      foundation(g, 2, 2);
      block(g, 1.4, 0.4, 1.0, M.light, 0.85, 1.2, 0.08, 0.04);
      block(g, 1.44, 0.05, 1.04, M.team, 0.85, 1.2, 0.48);
      cyl(g, 0.24, 0.3, 0.7, M.steel, 1.45, 0.43, 0.55, 'y', 14);
      cyl(g, 0.16, 0.16, 0.5, M.ore, 1.45, 0.62, 0.55, 'y', 12);
      cone(g, 0.3, 0.24, M.steel, 1.45, 0.92, 0.55, 14);
      for (const x of [0.4, 0.8]) cone(g, 0.16, 0.24, M.concrete, x, 0.66, 0.9, 10).rotation.x = Math.PI;
      windows(g, 4, 0.1, 0.34, 1.71, 0.3, 1.4, M.lamp);
    },
  },
  industrialPlant: {
    build(g) {
      foundation(g, 3, 2, M.concreteDark);
      block(g, 2.6, 0.55, 1.4, M.brick, 1.4, 1.05, 0.08, 0.03);
      sawtooth(g, 0.1, 2.7, 0.35, 1.75, 0.63, 3, M.team);
      for (const x of [0.5, 1.05, 1.6]) stack(g, 0.08, 1.35, M.concreteDark, x, 0.35);
      windows(g, 6, 0.12, 0.4, 1.76, 0.2, 2.6, M.lamp);
      tank(g, 0.2, 0.42, M.steel, 2.6, 0.4, 0.08);
    },
  },
  cloneLab: {
    build(g) {
      foundation(g, 2, 2);
      block(g, 1.6, 0.5, 0.7, M.light, 1.0, 0.5, 0.08, 0.04);
      block(g, 1.64, 0.06, 0.74, M.team, 1.0, 0.5, 0.58);
      for (const x of [0.45, 1.0, 1.55]) {
        vat(g, x, 1.35, 0.5, M.rad);
        sphere(g, 0.05, M.skin, x, 0.5, 1.35, 1.6, 6);
      }
      windows(g, 4, 0.1, 0.4, 0.86, 0.3, 1.7, M.lamp);
    },
  },
  stormGenerator: {
    build(g) {
      foundation(g, 2, 2);
      cyl(g, 0.7, 0.8, 0.22, M.concrete, 1.0, 0.19, 1.0, 'y', 20);
      cyl(g, 0.12, 0.22, 1.3, M.light, 1.0, 0.95, 1.0, 'y', 12);
      for (const y of [0.55, 0.85, 1.15]) torus(g, 0.36 - y * 0.12, 0.03, M.team, 1.0, y, 1.0, 'y', 20);
      const top = sub(g, 'spin', 1.0, 1.6, 1.0);
      for (let k = 0; k < 3; k++) { const b = box(top, 0.9, 0.03, 0.08, M.steel, 0, 0, 0); b.rotation.y = (k * Math.PI) / 3; }
      sphere(g, 0.14, M.tesla, 1.0, 1.66, 1.0, 1, 12);
      for (const s of [-1, 1]) box(g, 0.14, 0.4, 0.14, M.light, 1.0 + s * 0.6, 0.38, 1.0, 0.03);
    },
  },
  missileSilo: {
    build(g) {
      foundation(g, 2, 1, M.concreteDark);
      box(g, 1.3, 0.06, 0.74, M.concrete, 0.8, 0.11, 0.5, 0.03);
      for (const s of [-1, 1]) {
        const door = box(g, 0.6, 0.05, 0.66, M.team, 0.8 + s * 0.31, 0.16, 0.5, 0.02);
        door.rotation.z = s * 0.06;
        box(g, 0.56, 0.012, 0.06, M.hazard, 0.8 + s * 0.31, 0.19, 0.2);
      }
      block(g, 0.3, 0.42, 0.4, M.light, 1.75, 0.5, 0.08, 0.03);
      mast(g, 0.3, 1.75, 0.4, 0.5);
    },
  },

  // ── Walls and defences ─────────────────────────────────────
  sandbagWall: {
    build(g) { for (let k = 0; k < 2; k++) box(g, 0.4, 0.13, 0.4, M.sand, 0.5, 0.07 + k * 0.13, 0.5, 0.06); },
  },
  concreteWall: {
    build(g) {
      box(g, 0.42, 0.46, 0.42, M.concrete, 0.5, 0.23, 0.5, 0.03);
      box(g, 0.46, 0.05, 0.46, M.concreteDark, 0.5, 0.47, 0.5, 0.02);
    },
  },
  pillbox: {
    build(g) {
      cyl(g, 0.4, 0.44, 0.26, M.concrete, 0.5, 0.13, 0.5, 'y', 8);
      cyl(g, 0.36, 0.4, 0.06, M.concreteDark, 0.5, 0.29, 0.5, 'y', 8);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; box(g, 0.12, 0.03, 0.04, M.black, 0.5 + Math.cos(a) * 0.4, 0.19, 0.5 + Math.sin(a) * 0.4).rotation.y = -a; }
      box(g, 0.14, 0.04, 0.14, M.team, 0.5, 0.33, 0.5, 0.02);
      box(g, 0.03, 0.03, 0.2, M.black, 0.5, 0.2, 0.1);
    },
  },
  camoPillbox: {
    build(g) {
      cyl(g, 0.4, 0.44, 0.24, M.olive, 0.5, 0.12, 0.5, 'y', 8);
      for (const [x, z, r] of [[0.35, 0.4, 0.18], [0.62, 0.45, 0.16], [0.5, 0.65, 0.15], [0.42, 0.6, 0.12]]) sphere(g, r, M.leaf, x, 0.27, z, 0.6, 7);
      box(g, 0.12, 0.03, 0.04, M.black, 0.5, 0.17, 0.1);
      box(g, 0.08, 0.02, 0.08, M.team, 0.6, 0.36, 0.5);
    },
  },
  gunTurret: {
    build(g) {
      cyl(g, 0.36, 0.42, 0.16, M.concrete, 0.5, 0.08, 0.5, 'y', 10);
      gunMount(g, 0.5, 0.5, 0.16, 0.22, 0.42, 1);
    },
  },
  aaGun: {
    build(g) {
      cyl(g, 0.36, 0.42, 0.14, M.concrete, 0.5, 0.07, 0.5, 'y', 10);
      turret(g, 0.14, (t) => {
        cyl(t, 0.16, 0.18, 0.1, M.team, 0, 0.05, 0, 'y', 10);
        const rack = sub(t, '', 0, 0.22, 0);
        rack.rotation.x = 0.6;
        for (const x of [-0.12, 0.12]) pod(rack, 0.14, 0.14, 0.4, x, 0, 0, 2, 2, M.light);
      }).position.set(0.5, 0.14, 0.5);
    },
  },
  shroudGenerator: {
    build(g) {
      cyl(g, 0.34, 0.4, 0.16, M.concreteDark, 0.5, 0.08, 0.5, 'y', 10);
      cyl(g, 0.12, 0.18, 0.6, M.dark, 0.5, 0.46, 0.5, 'y', 10);
      torus(g, 0.16, 0.025, M.team, 0.5, 0.5, 0.5, 'y', 14);
      const top = sub(g, 'spin', 0.5, 0.8, 0.5);
      cone(top, 0.26, 0.2, M.steel, 0, 0, 0, 12).rotation.x = Math.PI;
      sphere(top, 0.07, M.psi, 0, 0.08, 0, 1, 8);
    },
  },
  flameTower: {
    build(g) {
      cyl(g, 0.34, 0.42, 0.2, M.concreteDark, 0.5, 0.1, 0.5, 'y', 8);
      cyl(g, 0.2, 0.26, 0.5, M.brick, 0.5, 0.45, 0.5, 'y', 8);
      cyl(g, 0.24, 0.24, 0.06, M.team, 0.5, 0.72, 0.5, 'y', 8);
      for (const x of [0.28, 0.72]) cyl(g, 0.07, 0.07, 0.34, M.hazard, x, 0.37, 0.72, 'y', 8);
      box(g, 0.06, 0.06, 0.24, M.dark, 0.5, 0.6, 0.24);
      sphere(g, 0.04, M.fire, 0.5, 0.6, 0.12, 1, 6);
    },
  },
  longGun: {
    build(g) {
      foundation(g, 2, 2, M.concreteDark);
      cyl(g, 0.72, 0.84, 0.3, M.concrete, 1.0, 0.23, 1.0, 'y', 12);
      torus(g, 0.74, 0.03, M.team, 1.0, 0.36, 1.0, 'y', 22);
      turret(g, 0.38, (t) => {
        box(t, 0.7, 0.34, 0.8, M.team, 0, 0.17, 0.08, 0.08);
        box(t, 0.5, 0.06, 0.5, M.teamDark, 0, 0.36, 0.14, 0.03);
        barrel(t, 1.0, 0.07, 0, 0.18, -0.3);
        cyl(t, 0.11, 0.11, 0.16, M.dark, 0, 0.18, -0.36, 'z', 10);
      }).position.set(1.0, 0.38, 1.0);
    },
  },
  samSite: {
    build(g) {
      foundation(g, 2, 1, M.concreteDark);
      for (const x of [0.55, 1.45]) {
        cyl(g, 0.2, 0.24, 0.12, M.concrete, x, 0.12, 0.5, 'y', 10);
        const r = sub(g, '', x, 0.26, 0.5);
        r.rotation.x = 0.7;
        pod(r, 0.3, 0.16, 0.5, 0, 0, 0, 2, 3, M.team);
      }
      sandbags(g, 1.0, 0.5, 0.12, 6, 0.08);
    },
  },

  // ── Neutral ────────────────────────────────────────────────
  'civilian-house': {
    build(g) {
      block(g, 0.66, 0.36, 0.56, M.sand, 0.5, 0.5, 0, 0.02);
      gable(g, 0.62, 0.74, 0.22, M.brick, 0.5, 0.36, 0.5).rotation.y = Math.PI / 2;
      box(g, 0.14, 0.2, 0.02, M.wood, 0.4, 0.1, 0.79);
      windows(g, 2, 0.1, 0.22, 0.79, 0.5, 0.82);
      stack(g, 0.04, 0.2, M.brick, 0.68, 0.38, 0.36);
    },
  },
  bridgeHut: {
    build(g) {
      block(g, 0.56, 0.3, 0.5, M.concrete, 0.5, 0.5, 0, 0.03);
      block(g, 0.6, 0.05, 0.54, M.concreteDark, 0.5, 0.5, 0.3);
      box(g, 0.14, 0.2, 0.02, M.dark, 0.5, 0.1, 0.76);
      mast(g, 0.4, 0.66, 0.36, 0.35);
    },
  },
  oreMine: {
    build(g) {
      cyl(g, 0.3, 0.38, 0.12, M.rockDark, 0.5, 0.06, 0.5, 'y', 9);
      for (const a of [0, 2.1, 4.2]) pipe(g, [0.5 + Math.cos(a) * 0.3, 0.06, 0.5 + Math.sin(a) * 0.3], [0.5, 0.62, 0.5], 0.025, M.steel, 5);
      cyl(g, 0.06, 0.06, 0.5, M.dark, 0.5, 0.3, 0.5, 'y', 6);
      for (const [x, z] of [[0.36, 0.42], [0.62, 0.58], [0.48, 0.66]]) sphere(g, 0.08, M.ore, x, 0.14, z, 0.7, 7);
    },
  },
  gemMine: {
    build(g) {
      cyl(g, 0.3, 0.38, 0.12, M.rockDark, 0.5, 0.06, 0.5, 'y', 9);
      for (const a of [0, 2.1, 4.2]) pipe(g, [0.5 + Math.cos(a) * 0.3, 0.06, 0.5 + Math.sin(a) * 0.3], [0.5, 0.62, 0.5], 0.025, M.steel, 5);
      cyl(g, 0.06, 0.06, 0.5, M.dark, 0.5, 0.3, 0.5, 'y', 6);
      for (const [x, z] of [[0.36, 0.42], [0.62, 0.58], [0.48, 0.66]]) cone(g, 0.06, 0.18, M.gem, x, 0.2, z, 5);
    },
  },

  airfield: {
    build(g) {
      // 4 × 3 cells: concrete apron, four marked parking pads, a control tower.
      box(g, 4.0, 0.06, 3.0, M.concrete, 2, 0.03, 1.5, 0.03);
      box(g, 3.96, 0.012, 0.12, M.hazard, 2, 0.066, 0.06);
      for (const [x, z] of [[1, 0.95], [3, 0.95], [1, 2.1], [3, 2.1]]) {
        cyl(g, 0.66, 0.66, 0.02, M.tarmac, x, 0.07, z, 'y', 28);
        torus(g, 0.58, 0.035, M.white, x, 0.085, z, 'y', 32);
        box(g, 0.06, 0.012, 0.42, M.yellow, x, 0.085, z);
        box(g, 0.3, 0.012, 0.06, M.team, x, 0.086, z + 0.36);
      }
      for (let k = 0; k < 6; k++) box(g, 0.05, 0.012, 0.22, M.white, 2, 0.07, 0.3 + k * 0.45);
      for (let k = 0; k < 9; k++) sphere(g, 0.025, k % 2 ? M.glass : M.yellow, 0.05 + k * 0.4875, 0.1, 2.95, 1, 6);
      cyl(g, 0.14, 0.18, 0.9, M.light, 2, 0.5, 1.52);
      cyl(g, 0.28, 0.2, 0.18, M.team, 2, 1.02, 1.52, 'y', 8);
      cyl(g, 0.26, 0.26, 0.12, M.glass, 2, 1.17, 1.52, 'y', 8);
      cyl(g, 0.3, 0.3, 0.04, M.dark, 2, 1.25, 1.52, 'y', 8);
      mast(g, 0.3, 2.05, 1.52, 1.27);
      for (const z of [0.55, 2.5]) cyl(g, 0.12, 0.12, 0.2, M.light, 1.82, 0.16, z);
      dish(g, 0.14, 2.2, 0.06, 2.55);
    },
  },
};

/**
 * Scenery and pieces: trees, boulders, crates, wall joints. `size` is the
 * ground extent in cells (the renderer scales again per instance).
 * @type {Record<string, { size?: number, raw?: boolean, build: (g: THREE.Group) => void, footprint?: { w: number, h: number, fill?: number } }>}
 */
export const SCENERY_MODELS = {
  'tree:pine': {
    size: 0.8,
    build(g) {
      cyl(g, 0.05, 0.07, 0.3, M.bark, 0, 0.15, 0, 'y', 6);
      cone(g, 0.36, 0.5, M.pine, 0, 0.45, 0, 8);
      cone(g, 0.28, 0.42, M.pine, 0, 0.72, 0, 8);
      cone(g, 0.18, 0.34, M.leafDark, 0, 0.96, 0, 8);
    },
  },
  'tree:round': {
    size: 0.9,
    build(g) {
      cyl(g, 0.05, 0.08, 0.34, M.bark, 0, 0.17, 0, 'y', 6);
      sphere(g, 0.32, M.leaf, 0, 0.56, 0, 0.9, 9);
      sphere(g, 0.22, M.leafDark, 0.14, 0.48, 0.12, 0.9, 8);
      sphere(g, 0.2, M.leaf, -0.14, 0.66, -0.06, 0.9, 8);
    },
  },
  'tree:birch': {
    size: 0.75,
    build(g) {
      cyl(g, 0.035, 0.05, 0.5, M.light, 0, 0.25, 0, 'y', 6);
      sphere(g, 0.24, M.leaf, 0, 0.66, 0, 1.3, 8);
      sphere(g, 0.16, M.leafDark, 0.1, 0.52, 0.08, 1.1, 7);
    },
  },
  'rock:a': {
    size: 0.7,
    build(g) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), M.rock);
      r.scale.set(1.1, 0.7, 0.9);
      r.position.y = 0.16;
      g.add(r);
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), M.rockDark);
      s.position.set(0.24, 0.08, 0.14);
      g.add(s);
    },
  },
  'rock:b': {
    size: 0.6,
    build(g) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), M.rockDark);
      r.scale.set(1, 0.8, 1.2);
      r.rotation.y = 0.6;
      r.position.y = 0.14;
      g.add(r);
    },
  },
  crate: {
    size: 1,
    build(g) {
      box(g, 0.8, 0.6, 0.8, M.wood, 0, 0.3, 0, 0.04);
      for (const s of [-1, 1]) box(g, 0.84, 0.08, 0.1, M.dark, 0, 0.3, s * 0.3);
      box(g, 0.1, 0.62, 0.82, M.yellow, 0, 0.31, 0);
    },
  },
  // Wall joints: the post is the wall structure itself; an arm runs east to the cell edge
  // and is turned toward each neighbouring wall.
  'sandbagWall:arm': {
    raw: true,
    build(g) { for (let k = 0; k < 2; k++) box(g, 0.5, 0.13, 0.36, M.sand, 0.25, 0.07 + k * 0.13, 0, 0.05); },
  },
  'concreteWall:arm': {
    raw: true,
    build(g) { box(g, 0.5, 0.42, 0.3, M.concrete, 0.25, 0.21, 0, 0.02); box(g, 0.5, 0.04, 0.34, M.concreteDark, 0.25, 0.44, 0); },
  },
};
