// @ts-check
/**
 * Build-menu icons drawn from the 3D models (section 14): each unit and
 * structure lit like the battlefield, seen from the front three-quarters in
 * the player's colour, on the same dark tile the 2D icons used. Rendered
 * once per match into a small offscreen target and read back into data URLs.
 */
import * as THREE from 'three';
import { UNITS } from '../data/units.js';
import { STRUCTURES } from '../data/structures.js';
import { createInstancer } from './instances.js';

const SIZE = 56;
const RES = 2;
const SS = 2; // supersampling
const PX = SIZE * RES * SS;

const linearToSrgb = (/** @type {number} */ c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const LUT = Uint8ClampedArray.from({ length: 256 }, (_, i) => Math.round(255 * linearToSrgb(i / 255)));

/**
 * @param {THREE.WebGLRenderer} renderer  the battlefield's renderer (shared context)
 * @param {import('./library.js').Library} lib
 * @param {number} tint  player colour
 * @param {string} faction  the viewer's faction: its own building looks
 * @param {() => void} restore  hand the context back to PixiJS
 * @returns {Promise<Record<string, string>>}
 */
export async function makeIcons3D(renderer, lib, tint, faction, restore) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x5a5040, 2.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-1, 1.6, 1.2);
  scene.add(sun);
  const holder = new THREE.Group();
  scene.add(holder);
  const inst = createInstancer(holder, { shadows: false, receive: false });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  // Front three-quarter view from above, like the game's cameos.
  camera.position.set(4, 5, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const rt = new THREE.WebGLRenderTarget(PX, PX, { samples: 0, depthBuffer: true });
  const pixels = new Uint8Array(PX * PX * 4);
  const color = new THREE.Color(tint);
  const m = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  const shot = document.createElement('canvas');
  shot.width = shot.height = PX;
  const sg = /** @type {CanvasRenderingContext2D} */ (shot.getContext('2d'));
  const tile = document.createElement('canvas');
  tile.width = tile.height = SIZE * RES;
  const tg = /** @type {CanvasRenderingContext2D} */ (tile.getContext('2d'));
  const img = sg.createImageData(PX, PX);

  /** @type {[string, string, boolean][]} */
  const jobs = [];
  for (const type of Object.keys(STRUCTURES)) jobs.push([type, faction ? `${type}@${faction}` : type, true]);
  for (const type of Object.keys(UNITS)) jobs.push([type, type, false]);

  /** @type {Record<string, string>} */
  const out = {};
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  try {
    for (const [type, key, isStructure] of jobs) {
      // The context is shared with PixiJS, which may have drawn frames since the last icon.
      renderer.resetState();
      const def = lib.get(key);
      inst.begin();
      // Structures centred on their footprint; units turned to show their side.
      const s = /** @type {any} */ (STRUCTURES)[type];
      const turn = isStructure ? -0.35 : 2.4;
      for (const p of def.parts) {
        m.makeRotationY(turn);
        if (isStructure) m.multiply(tmp.makeTranslation(-s.w / 2, 0, -s.h / 2));
        m.multiply(tmp.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z));
        if (p.orient) m.multiply(tmp.makeRotationFromQuaternion(p.orient));
        inst.add(p, m, color);
      }
      inst.end();
      // Fit the view to the model's corners as the camera sees them.
      box.makeEmpty();
      const r = isStructure ? Math.hypot(s.w, s.h) / 2 : Math.max(def.radius, 0.2);
      for (const y of [0, def.height]) for (let a = 0; a < 8; a++) {
        v.set(Math.cos((a / 8) * Math.PI * 2) * r, y, Math.sin((a / 8) * Math.PI * 2) * r).applyMatrix4(camera.matrixWorldInverse);
        box.expandByPoint(v);
      }
      const half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2 * 1.04;
      const cx = (box.min.x + box.max.x) / 2;
      const cy = (box.min.y + box.max.y) / 2;
      camera.left = cx - half; camera.right = cx + half; camera.top = cy + half; camera.bottom = cy - half;
      camera.updateProjectionMatrix();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, PX, PX, pixels);
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.resetState();
      restore();
      // Flip rows (GL is bottom-up), linear → sRGB, straight alpha.
      for (let y = 0; y < PX; y++) {
        const src = (PX - 1 - y) * PX * 4;
        const dst = y * PX * 4;
        for (let x = 0; x < PX * 4; x += 4) {
          const a = pixels[src + x + 3];
          img.data[dst + x] = LUT[pixels[src + x]];
          img.data[dst + x + 1] = LUT[pixels[src + x + 1]];
          img.data[dst + x + 2] = LUT[pixels[src + x + 2]];
          img.data[dst + x + 3] = a;
        }
      }
      sg.putImageData(img, 0, 0);
      const T = SIZE * RES;
      tg.fillStyle = '#23261c';
      tg.fillRect(0, 0, T, T);
      tg.fillStyle = '#3a3e2c';
      tg.fillRect(0, T - 3 * RES, T, 3 * RES);
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(shot, 4 * RES, 4 * RES, T - 8 * RES, T - 8 * RES);
      out[type] = tile.toDataURL('image/png');
      // Give the page a breath every few icons.
      if (Object.keys(out).length % 12 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    inst.dispose();
    rt.dispose();
    renderer.resetState();
    restore();
  }
  return out;
}
