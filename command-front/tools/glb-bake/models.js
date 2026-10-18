// Procedural 3D models for units and structures that have no GLB source.
// Built from primitives in the same scene as the GLBs, so they share the
// lighting, shadows and paint/detail split. Conventions: front faces north
// (−Z), base on y = 0, sizes roughly in cells (the studio rescales anyway).
// Team-coloured surfaces use TEAM (a pure red pack.py turns into paint);
// everything else avoids red hues.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const std = (color, rough = 0.6, metal = 0.2, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const M = {
  team: std(0xc4362c, 0.55, 0.25),
  teamDark: std(0x8e2620, 0.6, 0.25),
  steel: std(0x6b6f6a, 0.45, 0.65),
  dark: std(0x2b2d2a, 0.7, 0.4),
  rubber: std(0x1d1d1b, 0.9, 0.05),
  light: std(0xb9bcb2, 0.5, 0.35),
  olive: std(0x5a6040, 0.75, 0.15),
  sand: std(0xa59a78, 0.85, 0.05),
  concrete: std(0x8f8d86, 0.95, 0.0),
  tarmac: std(0x45464a, 0.92, 0.0),
  white: std(0xe8e8e2, 0.7, 0.0),
  yellow: std(0xe0b030, 0.6, 0.1),
  glass: std(0x7fc6e8, 0.15, 0.3, { emissive: 0x16384a }),
  chrono: std(0x5fd8ff, 0.2, 0.3, { emissive: 0x1f6f9a }),
  psi: std(0xb070ff, 0.3, 0.2, { emissive: 0x4a1a8a }),
  rad: std(0x8cff3a, 0.4, 0.1, { emissive: 0x2f7a10 }),
  skin: std(0xc99d7a, 0.8, 0.0),
  cloth: std(0x4d5340, 0.9, 0.0),
  black: std(0x141414, 0.6, 0.2),
  hazard: std(0xd8a020, 0.6, 0.1),
};

/** Mesh helpers: everything positioned by its centre unless noted. */
function box(g, w, h, d, mat, x = 0, y = 0, z = 0, r = 0) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function cyl(g, rt, rb, h, mat, x = 0, y = 0, z = 0, axis = 'y', seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function sphere(g, r, mat, x = 0, y = 0, z = 0, sy = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.scale.y = sy;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
/** A flat plate from a polygon in the ground plane (x, z), `t` thick, top at y. */
function plate(g, pts, t, mat, y) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.25, bevelSize: t * 0.25, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y - t;
  g.add(m);
  return m;
}
const group = (name) => { const g = new THREE.Group(); g.name = name; return g; };

// ── Vehicle kit ─────────────────────────────────────────────────

/** Tracked hull: length along z, team-painted upper hull. */
function trackedHull(g, len, wid, h, opts = {}) {
  const tw = wid * 0.22;
  for (const s of [-1, 1]) {
    box(g, tw, h * 0.75, len, M.rubber, s * (wid / 2 - tw / 2), h * 0.38, 0, h * 0.2);
    for (let k = 0; k < 5; k++) cyl(g, h * 0.24, h * 0.24, tw * 1.02, M.dark, s * (wid / 2 - tw / 2), h * 0.26, -len * 0.38 + (k * len * 0.76) / 4, 'x', 14);
    box(g, tw * 1.05, h * 0.08, len * 0.96, M.steel, s * (wid / 2 - tw / 2), h * 0.78, 0);
  }
  box(g, wid - tw * 1.6, h * 0.62, len * 0.92, opts.hull ?? M.team, 0, h * 0.62, 0, h * 0.12);
  // Engine deck: grille slats at the rear, exhausts, a glacis plate at the front.
  for (let k = 0; k < 5; k++) box(g, wid * 0.5, h * 0.06, len * 0.025, M.dark, 0, h * 0.95, len * 0.27 + k * len * 0.04);
  for (const s of [-1, 1]) cyl(g, h * 0.07, h * 0.07, h * 0.2, M.dark, s * wid * 0.22, h * 0.95, len * 0.44, 'z', 10);
  box(g, wid * 0.62, h * 0.06, len * 0.1, M.teamDark, 0, h * 0.9, -len * 0.42, 0.02);
  for (const s of [-1, 1]) box(g, wid * 0.08, h * 0.08, len * 0.22, M.olive, s * wid * 0.26, h * 0.96, -len * 0.05, 0.01);
}

/** Wheeled chassis. */
function wheeledHull(g, len, wid, h, axles = 2, opts = {}) {
  for (let a = 0; a < axles; a++) {
    const z = -len * 0.34 + (a * len * 0.68) / Math.max(1, axles - 1);
    for (const s of [-1, 1]) cyl(g, h * 0.36, h * 0.36, wid * 0.16, M.rubber, s * wid * 0.44, h * 0.36, z, 'x', 18);
  }
  box(g, wid * 0.78, h * 0.5, len, opts.hull ?? M.team, 0, h * 0.68, 0, h * 0.12);
  for (let k = 0; k < 4; k++) box(g, wid * 0.4, h * 0.05, len * 0.03, M.dark, 0, h * 0.94, len * 0.32 + k * len * 0.035);
}

/** A turret named "turret" (the studio renders it separately), at the hull top. */
function turret(g, y, build) {
  const t = group('turret');
  t.position.y = y;
  build(t);
  g.add(t);
  return t;
}

function barrel(t, len, r, x = 0, y = 0, z0 = 0) {
  cyl(t, r, r * 1.1, len, M.steel, x, y, z0 - len / 2, 'z', 14);
  cyl(t, r * 1.4, r * 1.4, len * 0.12, M.dark, x, y, z0 - len + len * 0.06, 'z', 14);
}

// ── Aircraft kit ────────────────────────────────────────────────

function jet(g, { len, span, body = M.team, wing = M.teamDark, canopy = M.glass, tailSpan = 0.42, twin = false, delta = false, bombBay = false }) {
  // Fuselage
  const f = cyl(g, len * 0.055, len * 0.075, len * 0.86, body, 0, 0.12, 0.02, 'z', 18);
  f.scale.x = 1.15;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(len * 0.055, len * 0.2, 18), body);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.12, -len * 0.5);
  g.add(nose);
  sphere(g, len * 0.05, canopy, 0, 0.12 + len * 0.045, -len * 0.25, 0.7).scale.z = 2.4;
  // Wings
  const w = span / 2;
  const wing1 = delta
    ? [[0, -len * 0.18], [w, len * 0.26], [w * 0.92, len * 0.32], [0, len * 0.24]]
    : [[0, -len * 0.06], [w, len * 0.12], [w, len * 0.2], [0, len * 0.16]];
  for (const s of [-1, 1]) plate(g, wing1.map(([x, z]) => [s * x, z]), 0.02, wing, 0.12);
  // Tailplanes and fins
  const tw = span * tailSpan * 0.5;
  for (const s of [-1, 1]) plate(g, [[0, len * 0.3], [s * tw, len * 0.42], [s * tw, len * 0.46], [0, len * 0.44]], 0.015, wing, 0.13);
  const fins = twin ? [-len * 0.05, len * 0.05] : [0];
  for (const x of fins) {
    const fin = box(g, 0.02, len * 0.14, len * 0.14, body, x, 0.12 + len * 0.08, len * 0.36);
    fin.rotation.x = -0.35;
  }
  // Engine glow
  cyl(g, len * 0.04, len * 0.04, 0.02, M.dark, 0, 0.12, len * 0.45, 'z');
  if (bombBay) for (const s of [-1, 1]) cyl(g, len * 0.03, len * 0.03, len * 0.22, M.steel, s * w * 0.42, 0.08, len * 0.06, 'z', 12);
  else for (const s of [-1, 1]) cyl(g, len * 0.018, len * 0.018, len * 0.18, M.light, s * w * 0.62, 0.09, len * 0.08, 'z', 10);
}

function rotor(name, radius, blades = 2) {
  const r = group(name);
  for (let k = 0; k < blades; k++) {
    const b = box(r, radius * 2, 0.012, radius * 0.1, M.dark);
    b.rotation.y = (k * Math.PI) / blades;
  }
  cyl(r, radius * 0.12, radius * 0.12, 0.04, M.steel);
  return r;
}

// ── Infantry kit ────────────────────────────────────────────────

/** A soldier seen from above: shoulders in team paint, helmet, weapon forward. */
function soldier(g, { helmet = M.cloth, coat = M.team, weapon = 'rifle', pack = null, extra = null } = {}) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.18, 6, 12), coat);
  body.position.set(0, 0.28, 0);
  body.scale.set(1.25, 1, 0.8);
  g.add(body);
  for (const s of [-1, 1]) cyl(g, 0.045, 0.045, 0.24, M.cloth, s * 0.06, 0.12, 0, 'y', 8);
  sphere(g, 0.075, M.skin, 0, 0.5, -0.01);
  sphere(g, 0.085, helmet, 0, 0.53, 0.0, 0.55);
  if (weapon === 'rifle') box(g, 0.035, 0.035, 0.36, M.black, 0.09, 0.34, -0.15);
  if (weapon === 'smg') box(g, 0.04, 0.04, 0.22, M.black, 0.09, 0.34, -0.1);
  if (weapon === 'big') { box(g, 0.06, 0.06, 0.42, M.steel, 0.1, 0.34, -0.17); cyl(g, 0.035, 0.035, 0.1, M.dark, 0.1, 0.34, -0.4, 'z'); }
  if (pack) box(g, 0.2, 0.18, 0.1, pack, 0, 0.32, 0.12, 0.03);
  if (extra) extra(g);
}

// ── Models ──────────────────────────────────────────────────────

const BUILDERS = {
  tankDestroyer(g) {
    trackedHull(g, 1.0, 0.7, 0.32);
    // Casemate gun: fixed, long, low.
    box(g, 0.46, 0.18, 0.5, M.team, 0, 0.66, -0.06, 0.06);
    box(g, 0.3, 0.1, 0.24, M.teamDark, 0, 0.78, 0.04, 0.04);
    barrel(g, 0.62, 0.035, 0, 0.66, -0.3);
  },
  mirageTank(g) {
    trackedHull(g, 0.9, 0.66, 0.3);
    turret(g, 0.62, (t) => {
      box(t, 0.4, 0.16, 0.42, M.team, 0, 0.06, 0.02, 0.07);
      // Light-bending emitter dome
      sphere(t, 0.11, M.chrono, 0, 0.16, 0.06, 0.6);
      barrel(t, 0.36, 0.028, 0, 0.07, -0.18);
    });
    for (const s of [-1, 1]) box(g, 0.08, 0.06, 0.3, M.chrono, s * 0.22, 0.95, 0.24, 0.02);
  },
  robotTank(g) {
    // Hover skirts instead of tracks.
    box(g, 0.7, 0.16, 0.86, M.dark, 0, 0.14, 0, 0.07);
    for (const s of [-1, 1]) box(g, 0.12, 0.12, 0.8, M.steel, s * 0.34, 0.2, 0, 0.05);
    box(g, 0.5, 0.18, 0.7, M.team, 0, 0.32, 0.02, 0.08);
    turret(g, 0.42, (t) => {
      box(t, 0.3, 0.12, 0.3, M.light, 0, 0.04, 0, 0.05);
      sphere(t, 0.06, M.glass, 0, 0.12, -0.08);
      for (const s of [-1, 1]) barrel(t, 0.3, 0.02, s * 0.06, 0.04, -0.12);
    });
  },
  battleFortress(g) {
    trackedHull(g, 1.25, 0.95, 0.42);
    box(g, 0.74, 0.34, 1.0, M.team, 0, 0.98, 0.02, 0.1);
    box(g, 0.6, 0.06, 0.82, M.teamDark, 0, 1.17, 0.04, 0.03);
    // Firing ports with guns around the deck.
    for (const [x, z] of [[-0.3, -0.36], [0.3, -0.36], [-0.3, 0.1], [0.3, 0.1], [-0.3, 0.42], [0.3, 0.42]]) {
      cyl(g, 0.05, 0.05, 0.06, M.dark, x, 1.22, z);
      barrel(g, 0.16, 0.014, x * 1.3, 1.22, z);
    }
    turret(g, 1.2, (t) => {
      cyl(t, 0.12, 0.14, 0.12, M.steel, 0, 0.04, -0.3);
      barrel(t, 0.3, 0.02, -0.04, 0.06, -0.36);
      barrel(t, 0.3, 0.02, 0.04, 0.06, -0.36);
    });
  },
  terrorDrone(g) {
    // A spider: round body and eight legs.
    sphere(g, 0.18, M.team, 0, 0.26, 0.02, 0.6);
    sphere(g, 0.09, M.dark, 0, 0.28, -0.18, 0.8);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const a = -0.9 + k * 0.6;
        const leg = box(g, 0.34, 0.03, 0.03, M.steel, s * 0.22 * Math.cos(a * 0.4), 0.18, Math.sin(a) * 0.2);
        leg.rotation.y = s * a * 0.6;
        leg.rotation.z = s * 0.45;
      }
    }
    sphere(g, 0.03, M.rad, -0.04, 0.32, -0.25);
    sphere(g, 0.03, M.rad, 0.04, 0.32, -0.25);
  },
  demoTruck(g) {
    wheeledHull(g, 0.92, 0.56, 0.3, 3);
    box(g, 0.46, 0.3, 0.24, M.team, 0, 0.86, -0.33, 0.06);
    box(g, 0.36, 0.08, 0.06, M.glass, 0, 0.92, -0.46);
    // Cargo: a big drum with hazard bands.
    cyl(g, 0.22, 0.22, 0.56, M.light, 0, 0.98, 0.14, 'z', 22);
    for (const z of [-0.06, 0.14, 0.34]) cyl(g, 0.225, 0.225, 0.05, M.hazard, 0, 0.98, z, 'z', 22);
    sphere(g, 0.05, M.black, 0, 1.22, 0.14);
  },
  siegeChopper(g) {
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
  migFighter(g) { jet(g, { len: 1.0, span: 0.82, twin: true }); },
  migInterceptor(g) { jet(g, { len: 1.05, span: 0.6, delta: true, tailSpan: 0.3 }); },
  migBomber(g) { jet(g, { len: 1.1, span: 1.05, bombBay: true, tailSpan: 0.5 }); },
  harrier(g) {
    jet(g, { len: 0.95, span: 0.72, tailSpan: 0.4 });
    for (const s of [-1, 1]) cyl(g, 0.07, 0.07, 0.12, M.dark, s * 0.11, 0.1, -0.02, 'x');
  },
  eagleJet(g) { jet(g, { len: 1.0, span: 0.86, delta: true, twin: true, body: M.team, wing: M.dark, tailSpan: 0.35 }); },

  // Infantry
  seal(g) { soldier(g, { helmet: M.black, coat: M.team, weapon: 'smg', pack: M.dark, extra: (s) => box(s, 0.06, 0.04, 0.1, M.hazard, -0.1, 0.36, 0.1) }); },
  chronoTrooper(g) {
    soldier(g, { helmet: M.chrono, coat: M.team, weapon: 'big', pack: M.steel, extra: (s) => { sphere(s, 0.07, M.chrono, 0, 0.42, 0.16); } });
  },
  rocketeer(g) {
    soldier(g, { helmet: M.steel, coat: M.team, weapon: 'smg', pack: M.steel, extra: (s) => {
      for (const x of [-0.08, 0.08]) cyl(s, 0.05, 0.05, 0.22, M.light, x, 0.34, 0.15);
      for (const x of [-1, 1]) box(s, 0.22, 0.015, 0.08, M.teamDark, x * 0.2, 0.42, 0.12);
    } });
  },
  desolator(g) {
    soldier(g, { helmet: M.olive, coat: M.team, weapon: 'big', pack: M.rad, extra: (s) => sphere(s, 0.05, M.rad, 0.1, 0.36, -0.42) });
  },
  ivan(g) {
    soldier(g, { helmet: M.cloth, coat: M.team, weapon: 'none', pack: M.dark, extra: (s) => {
      for (const [x, z] of [[-0.12, -0.06], [0.12, -0.06], [0, -0.16]]) cyl(s, 0.035, 0.035, 0.12, M.hazard, x, 0.36, z, 'y', 10);
    } });
  },
  psiCommander(g) {
    soldier(g, { helmet: M.psi, coat: M.team, weapon: 'none', extra: (s) => {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 28), M.psi);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.6;
      s.add(halo);
    } });
  },
  hero(g) {
    soldier(g, { helmet: M.dark, coat: M.team, weapon: 'rifle', pack: M.olive, extra: (s) => box(s, 0.24, 0.03, 0.04, M.black, 0, 0.42, -0.02) });
  },

  // Structures
  airfield(g) {
    // 4 × 3 cells: concrete apron, four marked parking pads, a control tower and a hangar.
    box(g, 4.0, 0.06, 3.0, M.concrete, 2, 0.03, 1.5, 0.03);
    box(g, 3.96, 0.012, 0.12, M.hazard, 2, 0.066, 0.06);
    for (const [x, z] of [[1, 0.95], [3, 0.95], [1, 2.1], [3, 2.1]]) {
      cyl(g, 0.66, 0.66, 0.02, M.tarmac, x, 0.07, z, 'y', 36);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 6, 40), M.white);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.085, z);
      g.add(ring);
      box(g, 0.06, 0.012, 0.42, M.yellow, x, 0.085, z);
      box(g, 0.3, 0.012, 0.06, M.team, x, 0.086, z + 0.36);
    }
    // Taxi line down the middle and edge lights.
    for (let k = 0; k < 6; k++) box(g, 0.05, 0.012, 0.22, M.white, 2, 0.07, 0.3 + k * 0.45);
    for (let k = 0; k < 9; k++) sphere(g, 0.025, k % 2 ? M.glass : M.yellow, 0.05 + k * 0.4875, 0.1, 2.95);
    // Control tower in the middle.
    cyl(g, 0.14, 0.18, 0.9, M.light, 2, 0.5, 1.52);
    cyl(g, 0.28, 0.2, 0.18, M.team, 2, 1.02, 1.52, 'y', 8);
    cyl(g, 0.26, 0.26, 0.12, M.glass, 2, 1.17, 1.52, 'y', 8);
    cyl(g, 0.3, 0.3, 0.04, M.dark, 2, 1.25, 1.52, 'y', 8);
    box(g, 0.02, 0.24, 0.02, M.steel, 2.05, 1.38, 1.52);
    // Fuel tanks and a radar dish by the tower.
    for (const z of [0.55, 2.5]) cyl(g, 0.12, 0.12, 0.2, M.light, 1.82, 0.16, z);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), M.light);
    dish.rotation.x = 0.8;
    dish.position.set(2.2, 0.3, 2.55);
    g.add(dish);
  },
};

export function buildProcedural(name) {
  const make = BUILDERS[name];
  if (!make) throw new Error(`no procedural model ${name}`);
  const g = group(name);
  make(g);
  return g;
}
