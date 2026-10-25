// Shared by the studio (sprite renders) and the exporter (3D models for the
// game): loads a GLB or procedural model and normalises it — oriented, scaled
// to map cells, base on the ground, pivot at a given point — and splits its
// meshes into the parts the game moves separately (body, turret, rotors).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildProcedural } from './models.js';
import { stlModel } from './stl.js';

const loader = new GLTFLoader();
/** @type {Map<string, THREE.Object3D>} */
const cache = new Map();

export async function source(job) {
  const key = job.src ?? (job.stl ? `stl:${job.id}` : `proc:${job.proc}`);
  if (!cache.has(key)) {
    const obj = job.src ? (await loader.loadAsync(`./glb/${job.src}`)).scene : job.stl ? await stlModel(job) : buildProcedural(job.proc);
    cache.set(key, obj);
  }
  return cache.get(key).clone(true);
}

/** Does a mesh sit under a node whose name matches any pattern? */
function under(mesh, patterns) {
  if (!patterns?.length) return false;
  for (let n = mesh; n; n = n.parent) {
    if (patterns.some((p) => new RegExp(p).test(n.name))) return true;
  }
  return false;
}

/**
 * Split one mesh by triangle: triangles whose centre lies in the region go to
 * a new sibling mesh (returned), the rest stay. `region` takes the centre in
 * model-normalised coordinates: u west→east, v north→south, h ground→top.
 */
export function splitMesh(mesh, frame, region) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const pos = g.attributes.position;
  const keep = [];
  const take = [];
  const a = new THREE.Vector3();
  const size = frame.getSize(new THREE.Vector3());
  for (let t = 0; t < pos.count; t += 3) {
    a.set(0, 0, 0);
    for (let k = 0; k < 3; k++) a.add(new THREE.Vector3().fromBufferAttribute(pos, t + k).applyMatrix4(mesh.matrixWorld));
    a.divideScalar(3);
    const u = (a.x - frame.min.x) / size.x;
    const v = (a.z - frame.min.z) / size.z;
    const h = (a.y - frame.min.y) / size.y;
    (region(u, v, h) ? take : keep).push(t);
  }
  const pick = (tris) => {
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize;
      const arr = new attr.array.constructor(tris.length * 3 * n);
      tris.forEach((t, i) => arr.set(attr.array.subarray(t * n, (t + 3) * n), i * 3 * n));
      out.setAttribute(name, new THREE.BufferAttribute(arr, n, attr.normalized));
    }
    return out;
  };
  if (!take.length) return null;
  const other = new THREE.Mesh(pick(take), mesh.material);
  other.name = `${mesh.name}#split`;
  mesh.geometry = pick(keep);
  mesh.parent.add(other);
  other.position.copy(mesh.position);
  other.quaternion.copy(mesh.quaternion);
  other.scale.copy(mesh.scale);
  other.updateMatrixWorld(true);
  return other;
}

/** Region test for a job's turret split: { above, box: [u0, u1, v0, v1] }. */
function splitRegion(split) {
  const [u0, u1, v0, v1] = split.box ?? [0, 1, 0, 1];
  return (u, v, h) => h >= (split.above ?? 0) && u >= u0 && u <= u1 && v >= v0 && v <= v1;
}

/** Material adjustments: darken, desaturate or calm the shine of a model. */
export function adjustMaterials(root, look) {
  if (!look) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
      const c = m.clone();
      if (look.color && c.color) c.color.multiply(new THREE.Color(look.color));
      if (look.set && c.color) { c.color.set(look.set); c.map = null; }
      if (look.metalness != null && 'metalness' in c) c.metalness = Math.min(c.metalness, look.metalness);
      if (look.roughness != null && 'roughness' in c) c.roughness = Math.max(c.roughness, look.roughness);
      if (look.noTransmission && 'transmission' in c) c.transmission = 0;
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
}

/**
 * Moving parts of a `named` job (the Blender models, tools/blender/): an
 * empty whose name says what it is, placed where the part turns.
 */
export const NAMED_PART = /^(turret|barrel|rotor\d+|wheel\d+|tread\d+|spin\d+|leg[LR]|arm[LR])$/;

/** `named` jobs: each mesh goes to its nearest named ancestor; the empties are the pivots. */
function partitionNamed(root) {
  const parts = { body: [], turret: [], hidden: [], rotors: [], extra: {}, nodes: {} };
  root.traverse((o) => { if (NAMED_PART.test(o.name)) parts.nodes[o.name] = o; });
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    let n = o;
    while (n && n !== root && !NAMED_PART.test(n.name)) n = n.parent;
    const name = n && n !== root ? n.name : 'body';
    if (name === 'body') parts.body.push(o);
    else if (name === 'turret') parts.turret.push(o);
    else (parts.extra[name] ??= []).push(o);
  });
  return parts;
}

/** Meshes of the model split into the parts a job asks for. */
export function partition(root, job) {
  if (job.named) return partitionNamed(root);
  const parts = { body: [], turret: [], hidden: [], rotors: (job.rotors ?? []).map(() => []) };
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const rotor = (job.rotors ?? []).findIndex((r) => under(o, [`^${r.node}$`]));
    if (under(o, job.hide)) parts.hidden.push(o);
    else if (rotor >= 0) parts.rotors[rotor].push(o);
    else if (under(o, job.turret)) parts.turret.push(o);
    else parts.body.push(o);
  }
  for (const m of parts.hidden) m.visible = false;
  if (job.split) {
    const frame = boundsOf(parts.body);
    const region = splitRegion(job.split);
    for (const m of [...parts.body]) {
      const t = splitMesh(m, frame, region);
      if (t) { t.castShadow = true; t.receiveShadow = true; t.frustumCulled = false; parts.turret.push(t); }
    }
  }
  return parts;
}

/** World-space bounds of a set of meshes. */
export function boundsOf(meshes) {
  const b = new THREE.Box3();
  for (const m of meshes) b.expandByObject(m, true);
  return b;
}

/**
 * Put a model in the scene: oriented, scaled to cells, its base on the
 * ground and its pivot at `at`.
 */
export async function place(job, at, parent) {
  const root = await source(job);
  const holder = new THREE.Group();
  holder.add(root);
  const [rx = 0, ry = 0, rz = 0] = job.rot ?? [];
  root.rotation.set(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz));
  parent.add(holder);
  holder.updateMatrixWorld(true);
  adjustMaterials(root, job.look);
  const parts = partition(root, job);
  const visible = [...parts.body, ...parts.turret, ...parts.rotors.flat(), ...Object.values(parts.extra ?? {}).flat()];
  let b = boundsOf(visible);
  const size = b.getSize(new THREE.Vector3());
  let scale;
  if (job.kind === 'unit') scale = job.size / Math.max(size.x, size.z);
  else scale = Math.min((job.w * (job.fill ?? 0.96)) / size.x, (job.h * (job.fill ?? 0.96)) / size.z);
  if (job.height) scale = Math.min(scale, job.height / size.y);
  root.scale.multiplyScalar(scale);
  holder.updateMatrixWorld(true);
  b = boundsOf(visible);
  // Pivot: the turret ring for turreted units, else the footprint centre.
  const pivotFrom = job.kind === 'unit' && parts.turret.length ? boundsOf(parts.turret) : b;
  const c = pivotFrom.getCenter(new THREE.Vector3());
  // A named turret turns about its own empty, not the middle of its meshes (the barrel reaches forward).
  if (job.kind === 'unit' && parts.nodes?.turret) {
    const t = parts.nodes.turret.getWorldPosition(new THREE.Vector3());
    c.x = t.x;
    c.z = t.z;
  }
  if (job.pivot) {
    // Explicit pivot, as a fraction of the whole model's ground extent.
    const s = b.getSize(new THREE.Vector3());
    c.x = b.min.x + s.x * job.pivot[0];
    c.z = b.min.z + s.z * job.pivot[1];
  }
  const [ox = 0, oz = 0] = job.offset ?? [];
  holder.position.set(at.x - c.x + ox, -b.min.y, at.z - c.z + oz);
  holder.updateMatrixWorld(true);
  return { holder, parts, top: boundsOf(visible).max.y };
}

