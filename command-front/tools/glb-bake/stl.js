// STL sources (3D-print models): one bare, uncoloured solid each. Here they
// become game-ready meshes: welded, re-assembled when the print layout put a
// part beside its base (`stl.move`), painted per vertex — concrete, a darker
// base plate, metal, and the surfaces that take the player's colour (`stl.team`
// rules) — and shaded with ambient occlusion baked into the colours, so
// grooves, seams and the hex floor tiles read as texture on a phone.
//
// Job fields (all optional except `stl.file`):
//   stl: {
//     file: 'War_Factory.stl',
//     yaw: 90,                       // degrees about the vertical, before anything else
//     move: [{ box, h, by }],        // cut a region (box in u, v, h fractions) and move it by [dx, dy, dz] (model units)
//          [{ box, h, turret: true, to, rotX }]  // …or make it the turret: bottom centre onto `to`, tilted rotX degrees
//     team: [rule…], metal: [rule…], dark: [rule…], glow: [rule…],
//     plate: 0.08,                   // height fraction under which the base plate is
//   }
// A rule matches a vertex by its place in the model's bounds (u west→east,
// v north→south, h ground→top, each 0–1) and its normal's y (up: 1):
//   { box: [u0, u1, v0, v1], h: [h0, h1], ny: [min, max] }
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

const COLORS = {
  concrete: new THREE.Color('#a19f97'),
  plate: new THREE.Color('#6c6a64'),
  metal: new THREE.Color('#7b8087'),
  dark: new THREE.Color('#4a4d52'),
  team: new THREE.Color('#e4e4e4'), // the shader keeps its brightness and takes the hue
  glow: new THREE.Color('#ffd877'),
};
/** Metalness, roughness per paint. */
const PBR = { concrete: [0.02, 0.85], plate: [0.02, 0.92], metal: [0.55, 0.45], dark: [0.35, 0.6], team: [0.25, 0.5], glow: [0, 0.4] };

/** Ambient occlusion: rays per vertex, reach as a fraction of the model's size, strength. */
const AO = { rays: 40, reach: 0.2, strength: 0.8 };

const loader = new STLLoader();

/** Does a rule match? */
function hit(rule, u, v, h, ny) {
  const [u0, u1, v0, v1] = rule.box ?? [0, 1, 0, 1];
  const [h0, h1] = rule.h ?? [0, 1];
  const [n0, n1] = rule.ny ?? [-1, 1];
  return u >= u0 && u <= u1 && v >= v0 && v <= v1 && h >= h0 && h <= h1 && ny >= n0 && ny <= n1;
}

/** Fractions of a point inside a box. */
function frac(b, size, p) {
  return [(p.x - b.min.x) / size.x, (p.z - b.min.z) / size.z, (p.y - b.min.y) / size.y];
}

/** Move the triangles inside a region (non-indexed geometry). */
function moveRegion(geo, rule) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const size = b.getSize(new THREE.Vector3());
  const pos = geo.attributes.position;
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  const [dx, dy, dz] = rule.by;
  for (let t = 0; t < pos.count; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(p.fromBufferAttribute(pos, t + k));
    c.divideScalar(3);
    const [u, v, h] = frac(b, size, c);
    if (!hit({ box: rule.box, h: rule.h }, u, v, h, 0)) continue;
    for (let k = 0; k < 3; k++) pos.setXYZ(t + k, pos.getX(t + k) + dx, pos.getY(t + k) + dy, pos.getZ(t + k) + dz);
  }
  pos.needsUpdate = true;
}

/** Split a non-indexed geometry by a triangle test into [rest, taken]. */
function splitBy(geo, test) {
  const pos = geo.attributes.position;
  const keep = [];
  const take = [];
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(p.fromBufferAttribute(pos, t + k));
    (test(c.divideScalar(3)) ? take : keep).push(t);
  }
  const pick = (list) => {
    const arr = new Float32Array(list.length * 9);
    list.forEach((t, i) => arr.set(pos.array.subarray(t * 3, t * 3 + 9), i * 9));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  };
  return [pick(keep), pick(take)];
}

/**
 * Paint and shade one welded geometry in the frame of the whole model's bounds.
 * @param {THREE.BufferGeometry} geo  indexed, with normals
 * @param {MeshBVH} bvh  the whole model (parts shade each other)
 * @param {THREE.Box3} b @param {any} spec
 */
function paint(geo, bvh, b, spec) {
  const size = b.getSize(new THREE.Vector3());
  const reach = size.length() * AO.reach;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const n = pos.count;
  const ao = new Float32Array(n);
  const ray = new THREE.Ray();
  const p = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const d = new THREE.Vector3();
  // A fixed set of cosine-weighted directions (same for every vertex: no noise between neighbours).
  const dirs = [];
  for (let i = 0; i < AO.rays; i++) {
    const r = Math.sqrt((i + 0.5) / AO.rays);
    const a = i * 2.399963; // golden angle
    dirs.push([r * Math.cos(a), r * Math.sin(a), Math.sqrt(Math.max(0, 1 - r * r))]);
  }
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    nv.fromBufferAttribute(nor, i).normalize();
    t1.set(Math.abs(nv.y) < 0.9 ? 0 : 1, Math.abs(nv.y) < 0.9 ? 1 : 0, 0).cross(nv).normalize();
    t2.crossVectors(nv, t1);
    let occ = 0;
    for (const [x, y, z] of dirs) {
      d.copy(t1).multiplyScalar(x).addScaledVector(t2, y).addScaledVector(nv, z).normalize();
      ray.origin.copy(p).addScaledVector(nv, reach * 0.004);
      ray.direction.copy(d);
      const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, reach);
      if (h) occ += 1 - h.distance / reach;
    }
    ao[i] = 1 - AO.strength * Math.min(1, occ / AO.rays * 1.6);
  }
  // Paint.
  const col = new Float32Array(n * 4);
  const pbr = new Float32Array(n * 2);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const ny = nor.getY(i);
    const [u, v, h] = frac(b, size, p);
    let kind = h < (spec.plate ?? 0.06) ? 'plate' : 'concrete';
    if (spec.metal?.some((r) => hit(r, u, v, h, ny))) kind = 'metal';
    if (spec.dark?.some((r) => hit(r, u, v, h, ny))) kind = 'dark';
    if (spec.team?.some((r) => hit(r, u, v, h, ny))) kind = 'team';
    if (spec.glow?.some((r) => hit(r, u, v, h, ny))) kind = 'glow';
    c.copy(COLORS[kind]).multiplyScalar(kind === 'glow' ? 1 : ao[i]);
    col.set([c.r, c.g, c.b, kind === 'team' ? 1 : 0], i * 4);
    pbr.set(PBR[kind], i * 2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('pbr', new THREE.BufferAttribute(pbr, 2));
}

/**
 * Load an STL job as a group of named meshes (`body`, and `turret` when a
 * moved region is marked as one), in the STL's own units, Y up.
 * @param {any} job
 */
export async function stlModel(job) {
  const spec = job.stl;
  let geo = await loader.loadAsync(`./stl/${spec.file}`);
  geo.deleteAttribute('normal');
  if (spec.yaw) geo.rotateY(THREE.MathUtils.degToRad(spec.yaw));
  // Re-assemble print layouts; a moved region marked `turret` becomes the turret part.
  let turret = null;
  for (const m of spec.move ?? []) {
    if (m.turret) {
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      const size = b.getSize(new THREE.Vector3());
      [geo, turret] = splitBy(geo, (c) => { const [u, v, h] = frac(b, size, c); return hit({ box: m.box, h: m.h }, u, v, h, 0); });
      // Stand it up: its bottom centre to the origin, tilted, then onto its mount.
      turret.computeBoundingBox();
      const tb = turret.boundingBox;
      turret.translate(-(tb.min.x + tb.max.x) / 2, -tb.min.y, -(tb.min.z + tb.max.z) / 2);
      if (m.rotX) turret.rotateX(THREE.MathUtils.degToRad(m.rotX));
      turret.translate(...m.to);
    } else moveRegion(geo, m);
  }
  const weld = (g) => { const w = mergeVertices(g, 1e-4); w.computeVertexNormals(); return w; };
  const body = weld(geo);
  const top = turret ? weld(turret) : null;
  // One BVH over everything, so a turret shades its base and the other way round.
  const all = top ? mergeVertices(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([...geo.attributes.position.array, ...turret.attributes.position.array]), 3)), 1e-4) : body;
  const bvh = new MeshBVH(all);
  all.computeBoundingBox();
  const b = all.boundingBox.clone();
  paint(body, bvh, b, spec);
  if (top) paint(top, bvh, b, spec);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1 });
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(body, material);
  mesh.name = 'body';
  root.add(mesh);
  if (top) {
    const t = new THREE.Group();
    t.name = 'turret';
    const tm = new THREE.Mesh(top, material);
    tm.name = 'turret-mesh';
    t.add(tm);
    root.add(t);
  }
  return root;
}
