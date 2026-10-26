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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { place as placeIn, boundsOf } from './prep.js';

const place = (job, at) => placeIn(job, at, scene);

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
  // A named model's barrel turns with its turret, so it is drawn on the turret, not the body.
  const turret = [...parts.turret, ...(parts.extra?.barrel ?? [])];
  const out = {};
  setVisible(turret, false);
  setVisible(rotorMeshes, false);
  out.body = shoot(cam, 2 * r, 2 * r);
  if (turret.length) {
    setVisible(parts.body, false);
    setVisible(turret, true);
    out.turret = shoot(cam, 2 * r, 2 * r);
  }
  // Rotors: each on its own, centred on its hub; the game spins them.
  const rotors = [];
  parts.rotors.forEach((meshes, k) => {
    if (!meshes.length) return;
    setVisible([...parts.body, ...turret, ...rotorMeshes], false);
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
