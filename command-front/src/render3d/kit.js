// @ts-check
/**
 * The modelling kit: every procedural 3D model in the game is built from
 * these few primitives and parts, in one consistent scale. Conventions:
 *   - one unit is one map cell; the base sits on y = 0;
 *   - units face north (−Z) and are centred on their pivot (the renderer
 *     rescales them to their size);
 *   - structures span their footprint, x ∈ [0, w], z ∈ [0, h], south (+Z)
 *     facing the camera;
 *   - a group named `turret` turns with the unit's turret, `rotorN` spins
 *     around its own centre, `spin` turns slowly (radar dishes).
 * Materials are only colour tokens: the renderer bakes each mesh's colour
 * into its vertices and drops the material, so a model costs one draw call
 * per part however many pieces it is made of. `team` surfaces take the
 * player's colour; `glow` ones light themselves.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * A colour token. @param {number} hex sRGB colour
 * @param {{ team?: boolean, glow?: number }} [o]
 */
export function paint(hex, o = {}) {
  const m = new THREE.MeshBasicMaterial({ color: hex });
  m.userData = { team: !!o.team, glow: o.glow ?? 0 };
  return m;
}

/** The palette shared by every model. */
export const M = {
  team: paint(0xc4362c, { team: true }),
  teamDark: paint(0x8e2620, { team: true }),
  steel: paint(0x7a7e78),
  dark: paint(0x2f312d),
  rubber: paint(0x1f1f1d),
  light: paint(0xb9bcb2),
  olive: paint(0x5a6040),
  khaki: paint(0x8a8160),
  sand: paint(0xa59a78),
  concrete: paint(0x9a978e),
  concreteDark: paint(0x6f6c64),
  tarmac: paint(0x4a4b4e),
  white: paint(0xe8e8e2),
  yellow: paint(0xe0b030),
  hazard: paint(0xd8a020),
  glass: paint(0x7fc6e8, { glow: 0.35 }),
  glassDark: paint(0x2c4a5a, { glow: 0.1 }),
  chrono: paint(0x5fd8ff, { glow: 0.8 }),
  psi: paint(0xb070ff, { glow: 0.8 }),
  rad: paint(0x8cff3a, { glow: 0.8 }),
  tesla: paint(0x7ab8ff, { glow: 0.9 }),
  prism: paint(0xd8f4ff, { glow: 0.7 }),
  lamp: paint(0xfff0b0, { glow: 1 }),
  redLamp: paint(0xff5a40, { glow: 1 }),
  fire: paint(0xff9a30, { glow: 1 }),
  skin: paint(0xc99d7a),
  cloth: paint(0x4d5340),
  black: paint(0x161616),
  brick: paint(0x8a5a44),
  roof: paint(0x5d5f63),
  wood: paint(0x7a5a3a),
  copper: paint(0xb87a4a),
  ore: paint(0xd9a63a, { glow: 0.15 }),
  gem: paint(0x58d8e8, { glow: 0.35 }),
  leaf: paint(0x3f6a2e),
  leafDark: paint(0x2e5226),
  pine: paint(0x2d4f2c),
  bark: paint(0x5a4330),
  rock: paint(0x837d72),
  rockDark: paint(0x625d55),
  water: paint(0x3a6d8a),
  crimson: paint(0xc0302a),
  fur: paint(0x6a4a30),
  suit: paint(0x2a2c30),
  navy: paint(0x55606a),
  hull: paint(0x3c4046),
};

/** Curve detail: 1 on desktops, lower on small devices (set before models are built). */
let detail = 1;
/** @param {number} k */
export const setDetail = (k) => { detail = k; };
const seg = (/** @type {number} */ n) => Math.max(5, Math.round(n * detail));

/** @param {string} name */
export const group = (name = '') => { const g = new THREE.Group(); g.name = name; return g; };

/**
 * @param {THREE.Object3D} g @param {THREE.BufferGeometry} geo @param {THREE.Material} mat
 * @param {number} x @param {number} y @param {number} z
 */
function add(g, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** A box by its centre; `r` rounds its edges. */
export function box(g, w, h, d, mat, x = 0, y = 0, z = 0, r = 0) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  return add(g, geo, mat, x, y, z);
}

/** A box standing on the ground at (x, z): its base at y0. */
export const block = (g, w, h, d, mat, x = 0, z = 0, y0 = 0, r = 0) => box(g, w, h, d, mat, x, y0 + h / 2, z, r);

/** A cylinder by its centre, along `axis`. */
export function cyl(g, rt, rb, h, mat, x = 0, y = 0, z = 0, axis = 'y', n = 14) {
  const m = add(g, new THREE.CylinderGeometry(rt, rb, h, seg(n)), mat, x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  return m;
}

export function sphere(g, r, mat, x = 0, y = 0, z = 0, sy = 1, n = 14) {
  const m = add(g, new THREE.SphereGeometry(r, seg(n), seg(Math.max(6, n * 0.6))), mat, x, y, z);
  m.scale.y = sy;
  return m;
}

/** Upper half of a sphere, its flat side at y. */
export function dome(g, r, mat, x = 0, y = 0, z = 0, sy = 1, n = 16) {
  const m = add(g, new THREE.SphereGeometry(r, seg(n), seg(Math.max(5, n * 0.4)), 0, Math.PI * 2, 0, Math.PI / 2), mat, x, y, z);
  m.scale.y = sy;
  return m;
}

export function cone(g, r, h, mat, x = 0, y = 0, z = 0, n = 12) {
  return add(g, new THREE.ConeGeometry(r, h, seg(n)), mat, x, y, z);
}

/** A ring lying flat (axis 'y') or standing. */
export function torus(g, R, r, mat, x = 0, y = 0, z = 0, axis = 'y', n = 24) {
  const m = add(g, new THREE.TorusGeometry(R, r, 6, seg(n)), mat, x, y, z);
  if (axis === 'y') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.y = Math.PI / 2;
  return m;
}

/** A flat plate from a polygon in the ground plane (x, z), `t` thick, its top at y. */
export function plate(g, pts, t, mat, y) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return add(g, geo, mat, 0, y - t, 0);
}

/**
 * A prism from a profile in the (x, y) plane extruded along z — roofs,
 * wedges, ramps. `pts` are [x, y]; the prism is centred on z.
 */
export function prism(g, pts, depth, mat, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return add(g, geo, mat, x, y, z);
}

/** A gabled roof over a w × d rectangle, ridge along z, eaves at y. */
export const gable = (g, w, d, rise, mat, x, y, z) => prism(g, [[-w / 2, 0], [w / 2, 0], [0, rise]], d, mat, x, y, z);

/** A straight pipe between two points. */
export function pipe(g, a, b, r, mat, n = 8) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = add(g, new THREE.CylinderGeometry(r, r, len, seg(n)), mat, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return m;
}

/** A child group at a position. */
export function sub(g, name, x = 0, y = 0, z = 0) {
  const s = group(name);
  s.position.set(x, y, z);
  g.add(s);
  return s;
}

// ── Vehicles ────────────────────────────────────────────────────

/** Tracked hull: length along z, team-painted upper hull. Returns the deck height. */
export function trackedHull(g, len, wid, h, o = {}) {
  const tw = wid * 0.22;
  for (const s of [-1, 1]) {
    box(g, tw, h * 0.75, len, M.rubber, s * (wid / 2 - tw / 2), h * 0.38, 0, h * 0.2);
    for (let k = 0; k < 4; k++) cyl(g, h * 0.24, h * 0.24, tw * 1.02, M.dark, s * (wid / 2 - tw / 2), h * 0.26, -len * 0.36 + (k * len * 0.72) / 3, 'x', 10);
    box(g, tw * 1.05, h * 0.08, len * 0.96, M.steel, s * (wid / 2 - tw / 2), h * 0.78, 0);
  }
  box(g, wid - tw * 1.6, h * 0.62, len * 0.92, o.hull ?? M.team, 0, h * 0.62, 0, h * 0.12);
  for (let k = 0; k < 4; k++) box(g, wid * 0.5, h * 0.06, len * 0.025, M.dark, 0, h * 0.95, len * 0.27 + k * len * 0.05);
  for (const s of [-1, 1]) cyl(g, h * 0.07, h * 0.07, h * 0.2, M.dark, s * wid * 0.22, h * 0.95, len * 0.44, 'z', 8);
  box(g, wid * 0.62, h * 0.06, len * 0.1, o.glacis ?? M.teamDark, 0, h * 0.9, -len * 0.42, 0.02);
  return h * 0.93;
}

/** Wheeled chassis. Returns the deck height. */
export function wheeledHull(g, len, wid, h, axles = 2, o = {}) {
  for (let a = 0; a < axles; a++) {
    const z = -len * 0.34 + (a * len * 0.68) / Math.max(1, axles - 1);
    for (const s of [-1, 1]) cyl(g, h * 0.36, h * 0.36, wid * 0.16, M.rubber, s * wid * 0.44, h * 0.36, z, 'x', 12);
  }
  box(g, wid * 0.78, h * 0.5, len, o.hull ?? M.team, 0, h * 0.68, 0, h * 0.12);
  return h * 0.93;
}

/** A turret group (named `turret`) at height y. @param {(t: THREE.Group) => void} build */
export function turret(g, y, build, z = 0) {
  const t = sub(g, 'turret', 0, y, z);
  build(t);
  return t;
}

/** A gun barrel pointing north from (x, y, z0). */
export function barrel(t, len, r, x = 0, y = 0, z0 = 0, mat = M.steel) {
  cyl(t, r, r * 1.1, len, mat, x, y, z0 - len / 2, 'z', 10);
  cyl(t, r * 1.4, r * 1.4, len * 0.12, M.dark, x, y, z0 - len + len * 0.06, 'z', 10);
}

/** A box of missile tubes facing north. */
export function pod(t, w, h, d, x, y, z, rows = 2, cols = 2, mat = M.teamDark) {
  box(t, w, h, d, mat, x, y, z, 0.02);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    cyl(t, Math.min(w / cols, h / rows) * 0.3, Math.min(w / cols, h / rows) * 0.3, 0.02, M.black, x - w / 2 + (j + 0.5) * (w / cols), y - h / 2 + (i + 0.5) * (h / rows), z - d / 2, 'z', 8);
  }
}

// ── Aircraft ────────────────────────────────────────────────────

/** A jet (len along z, flying at y = 0.12). */
export function jet(g, { len, span, body = M.team, wing = M.teamDark, canopy = M.glass, tailSpan = 0.42, twin = false, delta = false, bombBay = false }) {
  const f = cyl(g, len * 0.055, len * 0.075, len * 0.86, body, 0, 0.12, 0.02, 'z', 12);
  f.scale.x = 1.15;
  const nose = cone(g, len * 0.055, len * 0.2, body, 0, 0.12, -len * 0.53, 12);
  nose.rotation.x = -Math.PI / 2;
  sphere(g, len * 0.05, canopy, 0, 0.12 + len * 0.045, -len * 0.25, 0.7).scale.z = 2.4;
  const w = span / 2;
  const wing1 = delta
    ? [[0, -len * 0.18], [w, len * 0.26], [w * 0.92, len * 0.32], [0, len * 0.24]]
    : [[0, -len * 0.06], [w, len * 0.12], [w, len * 0.2], [0, len * 0.16]];
  for (const s of [-1, 1]) plate(g, wing1.map(([x, z]) => [s * x, z]), 0.025, wing, 0.13);
  const tw = span * tailSpan * 0.5;
  for (const s of [-1, 1]) plate(g, [[0, len * 0.3], [s * tw, len * 0.42], [s * tw, len * 0.46], [0, len * 0.44]], 0.018, wing, 0.13);
  for (const x of twin ? [-len * 0.05, len * 0.05] : [0]) {
    const fin = box(g, 0.02, len * 0.14, len * 0.14, body, x, 0.12 + len * 0.08, len * 0.36);
    fin.rotation.x = -0.35;
  }
  cyl(g, len * 0.04, len * 0.04, 0.02, M.fire, 0, 0.12, len * 0.46, 'z');
  if (bombBay) for (const s of [-1, 1]) cyl(g, len * 0.03, len * 0.03, len * 0.22, M.steel, s * w * 0.42, 0.08, len * 0.06, 'z', 8);
  else for (const s of [-1, 1]) cyl(g, len * 0.018, len * 0.018, len * 0.18, M.light, s * w * 0.62, 0.09, len * 0.08, 'z', 6);
}

/** A rotor (group `name`) of `blades` blades. */
export function rotor(name, radius, blades = 2) {
  const r = group(name);
  for (let k = 0; k < blades; k++) {
    const b = box(r, radius * 2, 0.014, radius * 0.1, M.dark);
    b.rotation.y = (k * Math.PI) / blades;
  }
  cyl(r, radius * 0.12, radius * 0.12, 0.04, M.steel);
  return r;
}

// ── Infantry ────────────────────────────────────────────────────

/**
 * A soldier standing on y = 0, facing north: team-coloured coat, helmet,
 * weapon held forward.
 */
export function soldier(g, { helmet = M.cloth, coat = M.team, legs = M.cloth, weapon = 'rifle', pack = null, extra = null, hat = null } = {}) {
  const body = add(g, new THREE.CapsuleGeometry(0.11, 0.18, 3, seg(8)), coat, 0, 0.32, 0);
  body.scale.set(1.25, 1, 0.8);
  for (const s of [-1, 1]) cyl(g, 0.05, 0.045, 0.24, legs, s * 0.06, 0.12, 0, 'y', 6);
  for (const s of [-1, 1]) cyl(g, 0.035, 0.035, 0.2, coat, s * 0.15, 0.33, -0.05, 'y', 6).rotation.x = -0.6;
  sphere(g, 0.075, M.skin, 0, 0.54, -0.01, 1, 10);
  if (hat) hat(g); else sphere(g, 0.085, helmet, 0, 0.57, 0, 0.55, 10);
  if (weapon === 'rifle') box(g, 0.035, 0.035, 0.36, M.black, 0.09, 0.36, -0.15);
  if (weapon === 'smg') box(g, 0.04, 0.04, 0.22, M.black, 0.09, 0.36, -0.1);
  if (weapon === 'pistol') box(g, 0.03, 0.03, 0.1, M.black, 0.13, 0.36, -0.12);
  if (weapon === 'big') { box(g, 0.06, 0.06, 0.42, M.steel, 0.1, 0.36, -0.17); cyl(g, 0.035, 0.035, 0.1, M.dark, 0.1, 0.36, -0.4, 'z'); }
  if (weapon === 'tube') { cyl(g, 0.045, 0.045, 0.5, M.olive, 0.12, 0.46, -0.05, 'z', 8); cyl(g, 0.05, 0.05, 0.04, M.black, 0.12, 0.46, -0.31, 'z', 8); }
  if (pack) box(g, 0.2, 0.18, 0.1, pack, 0, 0.34, 0.12, 0.03);
  if (extra) extra(g);
}

// ── Ships ───────────────────────────────────────────────────────

/** A hull floating on y = 0: pointed bow north. Returns the deck height. */
export function shipHull(g, len, wid, h, mat = M.team) {
  const half = wid / 2;
  plate(g, [[-half, len * 0.5], [half, len * 0.5], [half, -len * 0.2], [0, -len * 0.5], [-half, -len * 0.2]], h, mat, h * 0.7);
  plate(g, [[-half * 0.92, len * 0.47], [half * 0.92, len * 0.47], [half * 0.92, -len * 0.18], [0, -len * 0.45], [-half * 0.92, -len * 0.18]], 0.02, M.concreteDark, h * 0.72);
  box(g, wid * 1.01, 0.02, len * 0.7, M.dark, 0, 0.02, len * 0.14);
  return h * 0.72;
}

// ── Buildings ───────────────────────────────────────────────────

/** A concrete pad covering a footprint (w × h cells), slightly inset. */
export function foundation(g, w, h, mat = M.concrete, t = 0.08) {
  box(g, w - 0.06, t, h - 0.06, mat, w / 2, t / 2, h / 2, 0.03);
  box(g, w - 0.02, 0.02, h - 0.02, M.concreteDark, w / 2, 0.01, h / 2);
}

/** A storage tank: cylinder with a domed top. */
export function tank(g, r, h, mat, x, z, y0 = 0) {
  cyl(g, r, r, h, mat, x, y0 + h / 2, z, 'y', 16);
  dome(g, r, mat, x, y0 + h, z, 0.4, 14);
  torus(g, r * 1.01, 0.012, M.dark, x, y0 + h * 0.66, z);
}

/** A smokestack. */
export function stack(g, r, h, mat, x, z, y0 = 0) {
  cyl(g, r * 0.85, r, h, mat, x, y0 + h / 2, z, 'y', 12);
  cyl(g, r * 0.92, r * 0.92, h * 0.08, M.dark, x, y0 + h * 0.96, z, 'y', 12);
}

/** A radar dish (bowl tilted toward the south) in a `spin` group. */
export function dish(g, r, x, y, z, mat = M.light) {
  const s = sub(g, 'spin', x, y, z);
  cyl(s, 0.03, 0.05, 0.12, M.steel, 0, 0.06, 0, 'y', 8);
  const bowl = add(s, new THREE.SphereGeometry(r, seg(16), seg(6), 0, Math.PI * 2, 0, Math.PI / 2.6), mat, 0, 0.14 + r * 0.4, 0);
  bowl.rotation.x = 2.2;
  cyl(s, 0.012, 0.012, r * 0.9, M.dark, 0, 0.14 + r * 0.55, r * 0.3, 'y', 6).rotation.x = 0.9;
  return s;
}

/** Big doors (on the south face, z = zFace) w wide, h high. */
export function bayDoor(g, w, h, x, zFace, mat = M.dark) {
  box(g, w, h, 0.04, mat, x, h / 2, zFace);
  for (let k = 1; k < 5; k++) box(g, w * 0.96, 0.015, 0.05, M.steel, x, (k * h) / 5, zFace);
  box(g, w + 0.08, 0.06, 0.06, M.hazard, x, h + 0.03, zFace);
}

/** A thin antenna mast with a light on top. */
export function mast(g, h, x, z, y0 = 0) {
  cyl(g, 0.015, 0.025, h, M.steel, x, y0 + h / 2, z, 'y', 5);
  sphere(g, 0.03, M.redLamp, x, y0 + h, z, 1, 6);
}

/** A row of small windows along x on the south face. */
export function windows(g, n, w, y, zFace, x0, x1, mat = M.glass) {
  for (let k = 0; k < n; k++) box(g, w, w * 0.7, 0.02, mat, x0 + ((k + 0.5) * (x1 - x0)) / n, y, zFace);
}
