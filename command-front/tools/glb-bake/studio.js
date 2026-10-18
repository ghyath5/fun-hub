// Command Front art studio (offline, run by bake.mjs in headless Chromium).
//
// Renders a model — a GLB file or a procedural model from models.js — the
// way the game draws it:
//   units:      straight down, facing north, centred on the unit's pivot
//               (the turret ring when it has a turret); body and turret
//               rendered separately so the game can turn the turret.
//   structures: oblique — the footprint lands exactly on the grid and height
//               rises up the screen by OBLIQUE per cell, with a ground shadow
//               cast to the south-east.
// One world unit is one map cell. Everything returns PNG data URLs; the
// paint/detail split and atlas packing happen in pack.py.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildProcedural } from './models.js';

/** Screen rise per cell of height, matching the game's existing structure art. */
export const OBLIQUE = 0.72;
/** Image margins around a structure footprint, in cells (room for the shadow). */
const MARGIN = { right: 0.625, bottom: 0.5, top: 0.04 };
/** Atlas resolution and supersampling. */
const PX_PER_CELL = 128;
const SUPERSAMPLE = 2;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

// Sun from the north-west, high; soft sky fill.
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4030, 0.9));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.42 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
/** @type {Map<string, THREE.Object3D>} */
const cache = new Map();

async function source(job) {
  const key = job.src ?? `proc:${job.proc}`;
  if (!cache.has(key)) {
    const obj = job.src ? (await loader.loadAsync(`./glb/${job.src}`)).scene : buildProcedural(job.proc);
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
function splitMesh(mesh, frame, region) {
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
function adjustMaterials(root, look) {
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

/** Meshes of the model split into the parts a job asks for. */
function partition(root, job) {
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
function boundsOf(meshes) {
  const b = new THREE.Box3();
  for (const m of meshes) b.expandByObject(m, true);
  return b;
}

/**
 * Put a model in the scene: oriented, scaled to cells, its base on the
 * ground and its pivot at `at`.
 */
async function place(job, at) {
  const root = await source(job);
  const holder = new THREE.Group();
  holder.add(root);
  const [rx = 0, ry = 0, rz = 0] = job.rot ?? [];
  root.rotation.set(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz));
  scene.add(holder);
  holder.updateMatrixWorld(true);
  adjustMaterials(root, job.look);
  const parts = partition(root, job);
  const visible = [...parts.body, ...parts.turret, ...parts.rotors.flat()];
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

/**
 * Camera looking straight down (north up). With `oblique` the view is sheared
 * so that height rises up the screen: screen-down = z − OBLIQUE·y.
 * Bounds are in screen cells: x right, y down.
 */
function camera(x0, x1, y0, y1, oblique) {
  const H = 50;
  const cam = new THREE.OrthographicCamera();
  cam.position.set(0, H, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const ortho = new THREE.Matrix4().makeOrthographic(x0, x1, -y0, -y1, 0.01, 200);
  if (oblique) {
    // View space: x = x, y = −z, z = y − H.  y' = y + k·(z + H) = −z + k·y_world.
    const k = OBLIQUE;
    const shear = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, k, k * H, 0, 0, 1, 0, 0, 0, 0, 1);
    ortho.multiply(shear);
  }
  cam.projectionMatrix.copy(ortho);
  cam.projectionMatrixInverse.copy(ortho).invert();
  return cam;
}

/** Aim the sun's shadow camera at an area (cells). */
function aimSun(cx, cz, radius) {
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx - radius * 3, radius * 5.2, cz - radius * 2.6);
  const s = sun.shadow.camera;
  s.left = -radius * 1.6; s.right = radius * 1.6; s.top = radius * 1.6; s.bottom = -radius * 1.6;
  s.near = 0.1; s.far = radius * 14;
  s.updateProjectionMatrix();
  ground.position.set(cx, 0, cz);
  ground.scale.set(radius * 8, radius * 8, 1);
}

function shoot(cam, wCells, hCells) {
  const w = Math.round(wCells * PX_PER_CELL * SUPERSAMPLE);
  const h = Math.round(hCells * PX_PER_CELL * SUPERSAMPLE);
  renderer.setSize(w, h, false);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
}

function setVisible(meshes, on) { for (const m of meshes) m.visible = on; }

/** Unit: body, (optional) turret and rotors, top-down, square image of side 2r cells. */
async function renderUnit(job) {
  const { holder, parts } = await place(job, { x: 0, z: 0 });
  const r = job.r;
  aimSun(0, 0, r * 1.5);
  ground.visible = false;
  const cam = camera(-r, r, -r, r, false);
  const rotorMeshes = parts.rotors.flat();
  const out = {};
  setVisible(parts.turret, false);
  setVisible(rotorMeshes, false);
  out.body = shoot(cam, 2 * r, 2 * r);
  if (parts.turret.length) {
    setVisible(parts.body, false);
    setVisible(parts.turret, true);
    out.turret = shoot(cam, 2 * r, 2 * r);
  }
  // Rotors: each on its own, centred on its hub; the game spins them.
  const rotors = [];
  parts.rotors.forEach((meshes, k) => {
    if (!meshes.length) return;
    setVisible([...parts.body, ...parts.turret, ...rotorMeshes], false);
    setVisible(meshes, true);
    const c = boundsOf(meshes).getCenter(new THREE.Vector3());
    const rr = job.rotors[k].r;
    out[`rotor${rotors.length}`] = shoot(camera(c.x - rr, c.x + rr, c.z - rr, c.z + rr, false), 2 * rr, 2 * rr);
    rotors.push({ x: +c.x.toFixed(4), z: +c.z.toFixed(4), r: rr });
  });
  scene.remove(holder);
  if (rotors.length) out.meta = { rotors };
  return out;
}

/** Structure: oblique view of the footprint with its shadow, plus the model alone (for the paint mask). */
async function renderStructure(job) {
  const { holder, top } = await place(job, { x: job.w / 2, z: job.h / 2 });
  const fy = top * OBLIQUE + MARGIN.top;
  const iw = job.w + MARGIN.right;
  const ih = fy + job.h + MARGIN.bottom;
  aimSun(job.w / 2, job.h / 2, Math.max(job.w, job.h, top) * 0.9);
  const cam = camera(0, iw, -fy, job.h + MARGIN.bottom, true);
  ground.visible = true;
  const color = shoot(cam, iw, ih);
  ground.visible = false;
  const model = shoot(cam, iw, ih);
  scene.remove(holder);
  return { color, model, meta: { iw, ih, fy } };
}

/** Exploration: each mesh-carrying node on its own, top-down and oblique. */
async function explore(src, rot) {
  const job = { src, kind: 'unit', size: 1, r: 0.6, rot };
  const { holder } = await place(job, { x: 0, z: 0 });
  const meshes = [];
  holder.traverse((o) => { if (o.isMesh) meshes.push(o); });
  aimSun(0, 0, 1);
  ground.visible = false;
  const all = [];
  const top = camera(-0.6, 0.6, -0.6, 0.6, false);
  const side = camera(-0.6, 0.6, -1.0, 0.6, true);
  all.push({ name: 'ALL', top: shoot(top, 1.2, 1.2), side: shoot(side, 1.2, 1.6) });
  for (const m of meshes) {
    setVisible(meshes, false);
    m.visible = true;
    const bb = boundsOf([m]); const sz = bb.getSize(new THREE.Vector3());
    all.push({ name: `${m.parent?.name}/${m.name} ${sz.x.toFixed(2)}x${sz.y.toFixed(2)}x${sz.z.toFixed(2)} @${bb.getCenter(new THREE.Vector3()).toArray().map((v) => v.toFixed(2))}`, top: shoot(top, 1.2, 1.2), side: shoot(side, 1.2, 1.6) });
  }
  scene.remove(holder);
  return all;
}

window.studio = {
  ready: true,
  async render(job) {
    return job.kind === 'unit' ? renderUnit(job) : renderStructure(job);
  },
  explore,
};
