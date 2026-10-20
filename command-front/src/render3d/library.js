// @ts-check
/**
 * Model library: every unit, structure and piece of scenery as ready-to-draw
 * geometry, one merged BufferGeometry per moving part.
 *
 * Two sources, one result:
 *   - baked models (assets/models/: the GLB files, normalised, simplified and
 *     quantised offline by tools/glb-bake/export.mjs), with a texture atlas
 *     whose alpha is the team-colour weight;
 *   - procedural models (models/*.js), built from the kit on first use.
 *
 * Every part's geometry carries `position`, `normal`, `tint` (linear colour
 * + team weight) and `glow`; textured ones add `uv`. Sizes are in cells:
 * the renderer scales by the cell size when it places instances.
 */
import * as THREE from 'three';
import { UNIT_MODELS } from './models/units.js';
import { STRUCTURE_MODELS, SCENERY_MODELS } from './models/structures.js';
import { setDetail } from './kit.js';
import { STRUCTURES, NEUTRAL } from '../data/structures.js';

const BASE = './assets/models/';

/**
 * @typedef {object} Part
 * @property {string} name        body, turret, rotor0…, spin0…
 * @property {'body' | 'turret' | 'rotor' | 'spin'} role
 * @property {THREE.BufferGeometry} geometry
 * @property {THREE.Vector3} pivot  where the part turns, in the model's frame (cells)
 * @property {THREE.Quaternion} [orient]  the part's own frame (a propeller stands on edge): it spins about its local y
 * @property {THREE.Texture | null} map
 * @property {boolean} [pbr]  lit physically (baked models carry metalness and roughness)
 */
/**
 * @typedef {object} ModelDef
 * @property {string} id
 * @property {Part[]} parts
 * @property {number} height   top of the model, cells
 * @property {number} radius   ground extent from the origin, cells
 */

const srgbToLinear = (/** @type {number} */ c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const SRGB_LUT = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

// ── Procedural → parts ──────────────────────────────────────────

/** Which part a mesh belongs to: its nearest named ancestor. @param {THREE.Object3D} o @param {THREE.Object3D} root */
function partNode(o, root) {
  for (let n = o.parent; n && n !== root; n = n.parent) {
    if (n.name === 'turret' || n.name === 'spin' || /^rotor\d+$/.test(n.name)) return n;
  }
  return root;
}

/**
 * Merge meshes into one geometry with baked colours, in the frame of `pivot`
 * turned by `orient` (the part's own axes).
 * @param {THREE.Mesh[]} meshes @param {THREE.Vector3} pivot @param {THREE.Quaternion} [orient]
 */
function merge(meshes, pivot, orient) {
  const undo = orient ? orient.clone().invert() : null;
  const P = [], N = [], T = [], G = [], I = [];
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const m of meshes) {
    const geo = m.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const mat = /** @type {any} */ (m.material);
    const c = mat.color ?? new THREE.Color(1, 1, 1);
    const team = mat.userData?.team ? 1 : 0;
    const glow = mat.userData?.glow ?? 0;
    // Team surfaces keep only their brightness: the player's colour replaces the hue.
    const grey = Math.max(c.r, c.g, c.b);
    const rgb = team ? [grey, grey, grey] : [c.r, c.g, c.b];
    nm.getNormalMatrix(m.matrixWorld);
    const base = P.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(pivot);
      if (undo) v.applyQuaternion(undo);
      P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      if (undo) v.applyQuaternion(undo);
      N.push(v.x, v.y, v.z);
      T.push(rgb[0], rgb[1], rgb[2], team);
      G.push(glow);
    }
    const flip = m.matrixWorld.determinant() < 0;
    if (geo.index) {
      for (let t = 0; t < geo.index.count; t += 3) {
        const a = geo.index.getX(t), b = geo.index.getX(t + 1), d = geo.index.getX(t + 2);
        if (flip) I.push(base + a, base + d, base + b); else I.push(base + a, base + b, base + d);
      }
    } else {
      for (let t = 0; t < pos.count; t += 3) {
        if (flip) I.push(base + t, base + t + 2, base + t + 1); else I.push(base + t, base + t + 1, base + t + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('tint', new THREE.Float32BufferAttribute(T, 4));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(G, 1));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  return g;
}

/**
 * Build and normalise a procedural model.
 * @param {string} id
 * @param {{ build: (g: THREE.Group) => void, size?: number, rot?: number, pivot?: [number, number], height?: number, raw?: boolean }} spec
 * @param {{ w: number, h: number, fill?: number } | null} footprint  structures: scaled to fit it
 * @returns {ModelDef}
 */
function buildProcedural(id, spec, footprint) {
  const root = new THREE.Group();
  spec.build(root);
  if (spec.rot) root.rotation.y = THREE.MathUtils.degToRad(spec.rot);
  const holder = new THREE.Group();
  holder.add(root);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let scale = 1;
  if (footprint) {
    // Structures are modelled in cells already; only an over-sized model is shrunk to fit.
    const f = footprint.fill ?? 1;
    scale = Math.min(1, (footprint.w * f) / Math.max(size.x, 1e-3), (footprint.h * f) / Math.max(size.z, 1e-3));
  } else if (spec.size) {
    scale = spec.size / Math.max(size.x, size.z, 1e-3);
  }
  if (spec.height) scale = Math.min(scale, spec.height / size.y);
  root.scale.multiplyScalar(scale);
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  if (spec.raw) {
    // Pieces placed by the renderer itself (wall joints) keep their modelled origin.
  } else if (footprint) {
    // Centre on the footprint, base on the ground.
    holder.position.set(footprint.w / 2 - (b.min.x + b.max.x) / 2, -b.min.y, footprint.h / 2 - (b.min.z + b.max.z) / 2);
  } else {
    // Units: the turret ring (or the explicit pivot, or the middle) at the origin.
    /** @type {THREE.Object3D | undefined} */
    let tur;
    root.traverse((o) => { if (o.name === 'turret' && !tur) tur = o; });
    const c = b.getCenter(new THREE.Vector3());
    if (tur) { const p = tur.getWorldPosition(new THREE.Vector3()); c.x = p.x; c.z = p.z; }
    if (spec.pivot) { c.x = b.min.x + (b.max.x - b.min.x) * spec.pivot[0]; c.z = b.min.z + (b.max.z - b.min.z) * spec.pivot[1]; }
    holder.position.set(-c.x, -b.min.y, -c.z);
  }
  holder.updateMatrixWorld(true);

  /** @type {Map<THREE.Object3D, THREE.Mesh[]>} */
  const groups = new Map();
  root.traverse((o) => {
    if (!(/** @type {any} */ (o).isMesh)) return;
    const n = partNode(o, root);
    if (!groups.has(n)) groups.set(n, []);
    /** @type {THREE.Mesh[]} */ (groups.get(n)).push(/** @type {THREE.Mesh} */ (o));
  });
  /** @type {Part[]} */
  const parts = [];
  let spins = 0;
  for (const [node, meshes] of groups) {
    const role = node === root ? 'body' : node.name === 'turret' ? 'turret' : node.name === 'spin' ? 'spin' : 'rotor';
    const pivot = role === 'body' ? new THREE.Vector3() : node.getWorldPosition(new THREE.Vector3());
    const q = node.getWorldQuaternion(new THREE.Quaternion());
    const orient = role === 'body' || Math.abs(q.w) > 0.9999 ? undefined : q;
    const name = role === 'spin' ? `spin${spins++}` : node === root ? 'body' : node.name;
    parts.push({ name, role, geometry: merge(meshes, pivot, orient), pivot, map: null, orient });
  }
  for (const m of groups.values()) for (const mesh of m) mesh.geometry.dispose();
  parts.sort((a, z) => (a.role === 'body' ? -1 : z.role === 'body' ? 1 : 0));
  return finish(id, parts);
}

/** Height and radius from the parts. @param {string} id @param {Part[]} parts @returns {ModelDef} */
function finish(id, parts) {
  let height = 0;
  let radius = 0;
  const v = new THREE.Vector3();
  for (const p of parts) {
    const pos = p.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (p.orient) v.applyQuaternion(p.orient);
      v.add(p.pivot);
      if (v.y > height) height = v.y;
      const r = Math.hypot(v.x, v.z);
      if (r > radius) radius = r;
    }
    p.geometry.computeBoundingSphere();
  }
  return { id, parts, height, radius };
}

// ── Baked → parts ───────────────────────────────────────────────

/** @param {any} index @param {ArrayBuffer} bin @param {Map<string, THREE.Texture>} maps */
function decodeBaked(index, bin, maps) {
  /** @type {Map<string, ModelDef>} */
  const out = new Map();
  for (const [id, m] of Object.entries(index.models)) {
    /** @type {Part[]} */
    const parts = [];
    const map = m.atlas ? maps.get(m.atlas) ?? null : null;
    for (const [name, e] of Object.entries(/** @type {Record<string, any>} */ (m.parts))) {
      const n = e.vertices;
      const q = new Uint16Array(bin, e.pos, n * 4);
      const nq = new Int8Array(bin, e.nrm, n * 4);
      const col = new Uint8Array(bin, e.col, n * 4);
      const pos = new Float32Array(n * 3);
      const nrm = new Float32Array(n * 3);
      const tint = new Float32Array(n * 4);
      const span = [0, 1, 2].map((a) => e.max[a] - e.min[a]);
      for (let i = 0; i < n; i++) {
        for (let a = 0; a < 3; a++) {
          pos[i * 3 + a] = e.min[a] + (q[i * 4 + a] / 65535) * span[a];
          nrm[i * 3 + a] = nq[i * 4 + a] / 127;
        }
        tint[i * 4] = SRGB_LUT[col[i * 4]];
        tint[i * 4 + 1] = SRGB_LUT[col[i * 4 + 1]];
        tint[i * 4 + 2] = SRGB_LUT[col[i * 4 + 2]];
        tint[i * 4 + 3] = col[i * 4 + 3] / 255;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('tint', new THREE.BufferAttribute(tint, 4));
      g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n), 1));
      if (map) g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(bin, e.uv, n * 2).slice(), 2, true));
      // Metalness and roughness per vertex: baked models are lit physically (material.js).
      if (e.mr !== undefined) g.setAttribute('pbr', new THREE.BufferAttribute(new Uint8Array(bin, e.mr, n * 2).slice(), 2, true));
      g.setIndex(new THREE.BufferAttribute(e.wide ? new Uint32Array(bin, e.idx, e.indices).slice() : new Uint16Array(bin, e.idx, e.indices).slice(), 1));
      const role = name === 'body' ? 'body' : name === 'turret' ? 'turret' : name.startsWith('rotor') ? 'rotor' : 'spin';
      parts.push({ name, role, geometry: g, pivot: new THREE.Vector3(...e.pivot), map, pbr: e.mr !== undefined });
    }
    parts.sort((a, z) => (a.role === 'body' ? -1 : z.role === 'body' ? 1 : 0));
    out.set(id, finish(id, parts));
  }
  return out;
}

/** Fetch the baked models; null (procedural only) when they cannot load. */
async function loadBaked(/** @type {number} */ maxTexture) {
  try {
    const res = await fetch(`${BASE}models.json`);
    if (!res.ok) return null;
    const index = await res.json();
    const binRes = await fetch(`${BASE}models.bin`);
    if (!binRes.ok) return null;
    const bin = await binRes.arrayBuffer();
    const names = [...new Set(Object.values(index.models).map((/** @type {any} */ m) => m.atlas).filter(Boolean))];
    /** @type {Map<string, THREE.Texture>} */
    const maps = new Map();
    await Promise.all(names.map(async (name) => {
      const blob = await (await fetch(BASE + name)).blob();
      // Straight alpha (it is the team weight, not coverage), and small on small devices.
      let bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (bmp.width > maxTexture) {
        const k = maxTexture / bmp.width;
        const full = bmp;
        bmp = await createImageBitmap(full, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: maxTexture, resizeHeight: Math.round(full.height * k), resizeQuality: 'high' });
        full.close();
      }
      const t = new THREE.Texture(bmp);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.premultiplyAlpha = false;
      t.anisotropy = 2;
      t.needsUpdate = true;
      maps.set(name, t);
    }));
    return decodeBaked(index, bin, maps);
  } catch (e) {
    console.warn('[3d] baked models unavailable, using procedural ones', e);
    return null;
  }
}

/** Stand-in for anything without a model: a team-coloured crate. */
function fallback(/** @type {string} */ id, /** @type {{ w: number, h: number } | null} */ fp) {
  return buildProcedural(id, {
    build: (g) => {
      const w = fp ? fp.w * 0.9 : 0.6, d = fp ? fp.h * 0.9 : 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, fp ? 0.6 : 0.3, d), /** @type {any} */ ({ color: new THREE.Color(0xc4362c), userData: { team: true } }));
      m.position.y = fp ? 0.3 : 0.15;
      g.add(m);
    },
    size: fp ? undefined : 0.6,
  }, fp ? { w: fp.w, h: fp.h, fill: 0.9 } : null);
}

/**
 * @param {{ detail?: number, maxTexture?: number }} [opts]
 */
export async function createLibrary(opts = {}) {
  setDetail(opts.detail ?? 1);
  const baked = await loadBaked(opts.maxTexture ?? 1024);
  /** @type {Map<string, ModelDef>} */
  const cache = new Map();

  /** @param {string} key  a unit or structure type, `type@faction`, or a scenery id */
  function build(key) {
    if (baked?.has(key)) return /** @type {ModelDef} */ (baked.get(key));
    const [type] = key.split('@');
    const s = /** @type {any} */ (STRUCTURES)[type] ?? /** @type {any} */ (NEUTRAL)[type];
    if (s) {
      const spec = /** @type {any} */ (STRUCTURE_MODELS)[key] ?? /** @type {any} */ (STRUCTURE_MODELS)[type];
      if (!spec) return fallback(key, { w: s.w, h: s.h });
      return buildProcedural(key, spec, { w: s.w, h: s.h, fill: spec.fill });
    }
    const u = /** @type {any} */ (UNIT_MODELS)[type];
    if (u) return buildProcedural(key, u, null);
    const n = /** @type {any} */ (SCENERY_MODELS)[type];
    if (n) return buildProcedural(key, n, n.footprint ?? null);
    return fallback(key, null);
  }

  return {
    /** The model for a key; built on first use. Faction looks (`refinery@union`) fall back to the shared one. @param {string} key */
    get(key) {
      let m = cache.get(key);
      if (m) return m;
      const [type, faction] = key.split('@');
      const ownLook = !faction || baked?.has(key) || !!(/** @type {any} */ (STRUCTURE_MODELS)[key]);
      m = ownLook ? build(key) : this.get(type);
      cache.set(key, m);
      return m;
    },
    /** Build ahead of time so the first sighting of a model does not stall a frame. @param {string[]} keys */
    warm(keys) { for (const k of keys) this.get(k); },
    dispose() {
      const seen = new Set();
      for (const m of [...cache.values(), ...(baked?.values() ?? [])]) for (const p of m.parts) {
        if (seen.has(p.geometry)) continue;
        seen.add(p.geometry);
        p.geometry.dispose();
        p.map?.dispose();
      }
      cache.clear();
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof createLibrary>>} Library */
