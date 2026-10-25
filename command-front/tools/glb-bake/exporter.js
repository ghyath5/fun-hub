// Command Front model exporter (offline, run by export.mjs in headless Chromium).
//
// Turns a GLB job into the compact parts the game's 3D renderer draws:
// normalised exactly like the sprite studio (prep.js — one unit is one map
// cell, units centred on their pivot facing north, structures with their
// footprint on [0, w] × [0, h]), every mesh of a part merged into one
// geometry, and every texture of the model packed into one atlas whose alpha
// channel holds the team-colour weight. pack-models.mjs simplifies, quantises
// and writes the result into assets/models/.
import * as THREE from 'three';
import { place } from './prep.js';

const scene = new THREE.Scene();

/** sRGB 0–1 → team weight 0–1, the same test as pack.py's team_weight. */
function smooth(e0, e1, x) {
  const d = e1 - e0;
  const t = Math.min(1, Math.max(0, (x - e0) / (Math.abs(d) > 1e-6 ? d : 1e-6)));
  return t * t * (3 - 2 * t);
}
export function teamWeight(r, g, b, team) {
  if (!team) return 0;
  if (Array.isArray(team)) return Math.max(...team.map((t) => teamWeight(r, g, b, t)));
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx > 1e-4 ? (mx - mn) / mx : 0;
  if (team.neutral) {
    const n = team.neutral;
    return smooth(n.maxSat + 0.06, n.maxSat - 0.02, sat) * smooth(n.minVal - 0.08, n.minVal + 0.04, mx);
  }
  const delta = Math.max(mx - mn, 1e-6);
  let hue = mx === r ? ((g - b) / delta) % 6 : mx === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = ((hue * 60) % 360 + 360) % 360;
  const dist = Math.abs((((hue - team.hue) + 180) % 360 + 360) % 360 - 180);
  return smooth(team.tol + 8, team.tol - 4, dist) * smooth(team.sat - 0.08, team.sat + 0.08, sat) * smooth(team.val - 0.06, team.val + 0.06, mx);
}

const toB64 = (/** @type {ArrayBufferView} */ a) => {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Pixels of an image (ImageBitmap / HTMLImageElement / canvas), for sampling. */
function pixelsOf(image) {
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}

/** UV bounds of a geometry. */
function uvBounds(uv) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (u < b[0]) b[0] = u; if (v < b[1]) b[1] = v; if (u > b[2]) b[2] = u; if (v > b[3]) b[3] = v;
  }
  return b;
}

/** Mean of one channel of a texture (0–1), sampled small. @type {Map<any, number[]>} */
const means = new Map();
function channelMeans(image) {
  if (!image) return [1, 1, 1];
  let m = means.get(image);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  m = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k] / 255;
  m = m.map((v) => v / (d.length / 4));
  means.set(image, m);
  return m;
}

/** A material's average metalness and roughness, bytes (glTF: metal in blue, rough in green). */
function metalRough(mat) {
  const mr = channelMeans(mat.metalnessMap?.image ?? mat.roughnessMap?.image);
  const metal = (mat.metalness ?? 0) * (mat.metalnessMap ? mr[2] : 1);
  const rough = (mat.roughness ?? 1) * (mat.roughnessMap ? mr[1] : 1);
  return [Math.round(255 * Math.min(1, metal)), Math.round(255 * Math.min(1, Math.max(0.05, rough)))];
}

/** Linear 0–1 → sRGB byte. */
const srgbByte = (x) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)));

/**
 * Export one job: { parts: { name: { pos, nrm, uv, col, idx } as base64, pivot }, atlas: { size, rgba } | null }.
 * @param {any} job
 */
async function exportJob(job) {
  // The 3D model may pick its team surfaces differently from the sprite (which saw them lit).
  const team = job.team3d ?? job.team;
  const at = job.kind === 'unit' ? { x: 0, z: 0 } : { x: job.w / 2, z: job.h / 2 };
  const { holder, parts } = await place(job, at, scene);
  holder.updateMatrixWorld(true);

  // Every mesh of every exported part, with its material.
  const named = { body: parts.body, turret: parts.turret };
  parts.rotors.forEach((m, k) => { if (m.length) named[`rotor${k}`] = m; });
  Object.assign(named, parts.extra ?? {});
  const meshes = Object.values(named).flat();

  // ── Atlas: one tile per textured material, plus a white tile for solid colours.
  const mats = [];
  for (const m of meshes) {
    const mat = m.material;
    if (mat.map?.image && !mats.includes(mat)) mats.push(mat);
  }
  const n = mats.length + 1;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const want = job.kind === 'unit' ? 256 : 384;
  const maxSide = job.kind === 'unit' ? 512 : 1024;
  const T = Math.min(want, Math.floor(maxSide / cols));
  const size = THREE.MathUtils.ceilPowerOfTwo(cols * T);
  const atlasH = THREE.MathUtils.ceilPowerOfTwo(rows * T);
  const PAD = 3;
  let atlas = null;
  /** @type {Map<any, { x: number, y: number }>} */
  const tileOf = new Map();
  if (mats.length) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = atlasH;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, T, T);
    mats.forEach((mat, k) => {
      const x = ((k + 1) % cols) * T;
      const y = Math.floor((k + 1) / cols) * T;
      tileOf.set(mat, { x, y });
      // The image inside the tile; its border pixels stretched over the padding (no mipmap bleed).
      const S = T - 2 * PAD;
      g.drawImage(mat.map.image, x + PAD, y + PAD, S, S);
      g.drawImage(c, x + PAD, y + PAD, S, 1, x + PAD, y, S, PAD);
      g.drawImage(c, x + PAD, y + PAD + S - 1, S, 1, x + PAD, y + PAD + S, S, PAD);
      g.drawImage(c, x + PAD, y, 1, T, x, y, PAD, T);
      g.drawImage(c, x + PAD + S - 1, y, 1, T, x + PAD + S, y, PAD, T);
      // Base colour factor (linear) multiplies the texture.
      const col = mat.color;
      if (col && (col.r < 0.999 || col.g < 0.999 || col.b < 0.999)) {
        g.save();
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = `rgb(${srgbByte(col.r)},${srgbByte(col.g)},${srgbByte(col.b)})`;
        g.fillRect(x, y, T, T);
        g.restore();
      }
    });
    const img = g.getImageData(0, 0, size, atlasH);
    const rgba = new Uint8Array(img.data.length);
    rgba.set(img.data);
    // Alpha = team weight; the white tile is 1 (the vertex weight decides there).
    // `look3d.desaturate` greys what is not team paint (camouflage → gunmetal).
    const grey = job.look3d?.desaturate ?? 0;
    for (let p = 0; p < rgba.length; p += 4) {
      const px = (p / 4) % size;
      const py = Math.floor(p / 4 / size);
      const white = px < T && py < T;
      const w = white ? 1 : teamWeight(rgba[p] / 255, rgba[p + 1] / 255, rgba[p + 2] / 255, team);
      rgba[p + 3] = Math.round(255 * w);
      if (grey && !white) {
        const l = 0.3 * rgba[p] + 0.59 * rgba[p + 1] + 0.11 * rgba[p + 2];
        const k = grey * (1 - w);
        for (let c = 0; c < 3; c++) rgba[p + c] = Math.round(rgba[p + c] + (l - rgba[p + c]) * k);
      }
    }
    atlas = { w: size, h: atlasH, rgba: toB64(rgba) };
  }
  const whiteUV = [(T / 2) / size, (T / 2) / atlasH];
  /** @type {Map<any, any>} */
  const sampled = new Map();

  const out = {};
  const nm = new THREE.Matrix3();
  for (const [name, list] of Object.entries(named)) {
    let pivot = [0, 0, 0];
    const node = parts.nodes?.[name];
    if (node) {
      // Named parts turn about their empty (wheel axle, hip, turret ring, barrel trunnion).
      const p = node.getWorldPosition(new THREE.Vector3());
      pivot = [p.x, p.y, p.z];
    } else if (name.startsWith('rotor') || (name === 'turret' && job.kind === 'structure')) {
      // Rotors, and a structure's turret (its footprint is not centred on it), turn about their own middle.
      const b = new THREE.Box3();
      for (const m of list) b.expandByObject(m, true);
      const c = b.getCenter(new THREE.Vector3());
      pivot = [c.x, 0, c.z];
    }
    const P = [], N = [], U = [], C = [], R = [], G = [], I = [];
    for (const m of list) {
      const geo = m.geometry;
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const uv = geo.attributes.uv;
      const mat = m.material;
      nm.getNormalMatrix(m.matrixWorld);
      const base = P.length / 3;
      const tile = tileOf.get(mat);
      // UDIM-style offsets are whole numbers; a span over one tile means a repeating texture.
      let off = [0, 0], tiled = false;
      if (tile && uv) {
        const b = uvBounds(uv);
        off = [Math.floor(b[0] + 1e-3), Math.floor(b[1] + 1e-3)];
        tiled = b[2] - off[0] > 1.02 || b[3] - off[1] > 1.02;
      }
      if (tiled && !sampled.has(mat)) sampled.set(mat, pixelsOf(mat.map.image));
      const solid = mat.color ?? new THREE.Color(1, 1, 1);
      const [metal, rough] = metalRough(mat);
      // Emissive materials light themselves in game (`glow`, 0–1 of their own colour).
      const em = mat.emissive ? Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b) * (mat.emissiveIntensity ?? 1) : 0;
      const glow = Math.round(255 * Math.min(1, em));
      const solidTeam = teamWeight(srgbByte(solid.r) / 255, srgbByte(solid.g) / 255, srgbByte(solid.b) / 255, team);
      // Painted per vertex (STL sources, stl.js): linear colour, alpha = team weight; metalness, roughness.
      const vcol = mat.vertexColors ? geo.attributes.color : null;
      const vpbr = geo.attributes.pbr;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        P.push(v.x - pivot[0], v.y - pivot[1], v.z - pivot[2]);
        G.push(glow);
        if (vpbr) R.push(Math.round(255 * vpbr.getX(i)), Math.round(255 * Math.max(0.05, vpbr.getY(i))));
        else R.push(metal, rough);
        if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z); } else N.push(0, 1, 0);
        if (tile && uv && !tiled) {
          const u = Math.min(1, Math.max(0, uv.getX(i) - off[0]));
          const w = Math.min(1, Math.max(0, uv.getY(i) - off[1]));
          U.push((tile.x + PAD + u * (T - 2 * PAD)) / size, (tile.y + PAD + w * (T - 2 * PAD)) / atlasH);
          C.push(255, 255, 255, 255);
        } else if (tiled) {
          const px = sampled.get(mat);
          const u = ((uv.getX(i) % 1) + 1) % 1, w = ((uv.getY(i) % 1) + 1) % 1;
          const k = (Math.min(px.h - 1, Math.floor(w * px.h)) * px.w + Math.min(px.w - 1, Math.floor(u * px.w))) * 4;
          const r = px.data[k] * solid.r, g2 = px.data[k + 1] * solid.g, b = px.data[k + 2] * solid.b;
          U.push(...whiteUV);
          C.push(Math.round(r), Math.round(g2), Math.round(b), Math.round(255 * teamWeight(r / 255, g2 / 255, b / 255, team)));
        } else if (vcol) {
          U.push(...whiteUV);
          const a = vcol.itemSize === 4 ? vcol.getW(i) : solidTeam;
          C.push(srgbByte(vcol.getX(i) * solid.r), srgbByte(vcol.getY(i) * solid.g), srgbByte(vcol.getZ(i) * solid.b), Math.round(255 * a));
        } else {
          U.push(...whiteUV);
          C.push(srgbByte(solid.r), srgbByte(solid.g), srgbByte(solid.b), Math.round(255 * solidTeam));
        }
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) I.push(base + geo.index.getX(i));
      else for (let i = 0; i < pos.count; i++) I.push(base + i);
      // Mirrored transforms flip the winding.
      if (m.matrixWorld.determinant() < 0) {
        for (let t = I.length - (geo.index ? geo.index.count : pos.count); t < I.length; t += 3) [I[t + 1], I[t + 2]] = [I[t + 2], I[t + 1]];
      }
    }
    if (!P.length) continue;
    // Treads: the spacing of their links (a Blender custom property, scaled like the model).
    const pitch = node?.userData?.pitch ? node.userData.pitch * node.getWorldScale(new THREE.Vector3()).x : undefined;
    out[name] = {
      pivot, pitch,
      pos: toB64(new Float32Array(P)), nrm: toB64(new Float32Array(N)), uv: toB64(new Float32Array(U)),
      col: toB64(new Uint8Array(C)), mr: toB64(new Uint8Array(R)), idx: toB64(new Uint32Array(I)),
      gl: G.some((g) => g > 0) ? toB64(new Uint8Array(G)) : null,
    };
  }
  scene.remove(holder);
  return { parts: out, atlas, textured: !!atlas };
}

window.exporter = { ready: true, exportJob };
