// Export every GLB job in jobs.mjs as a 3D model for the game's renderer:
// exporter.js (headless Chromium) normalises, merges and builds the texture
// atlas; here each part is welded, simplified to a phone-friendly triangle
// budget (meshoptimizer), quantised and appended to assets/models/models.bin,
// indexed by assets/models/models.json. Atlases become WebP via Pillow
// (`exact`, so the RGB under the team-weight alpha survives).
// usage: node export.mjs [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { MeshoptSimplifier } from 'meshoptimizer';
import { serve } from './serve.mjs';
import { JOBS } from './jobs.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const dest = path.resolve(root, '../../assets/models');
fs.mkdirSync(dest, { recursive: true });
const only = new Set(process.argv.slice(2));
const jobs = JOBS.filter((j) => (j.src || j.stl) && (!only.size || only.has(j.id)));

/** Triangle budget for a whole model: what a phone can draw by the dozen. */
const budget = (job) => job.budget ?? (job.kind === 'unit' ? 4500 : job.w * job.h <= 1 ? 5000 : 9000);

const b64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };

/** Merge vertices with the same position, uv and colour (normals are rebuilt after simplifying). */
function weld(p) {
  const n = p.pos.length / 3;
  const key = new Map();
  const remap = new Uint32Array(n);
  const keep = [];
  for (let i = 0; i < n; i++) {
    const k = [
      ...Array.from(p.pos.subarray(i * 3, i * 3 + 3), (v) => Math.round(v * 1e4)),
      ...Array.from(p.uv.subarray(i * 2, i * 2 + 2), (v) => Math.round(v * 4096)),
      ...p.col.subarray(i * 4, i * 4 + 4),
      ...p.mr.subarray(i * 2, i * 2 + 2),
      p.gl ? p.gl[i] : 0,
    ].join(',');
    let j = key.get(k);
    if (j === undefined) { j = keep.length; key.set(k, j); keep.push(i); }
    remap[i] = j;
  }
  const pick = (a, s) => { const o = new a.constructor(keep.length * s); keep.forEach((i, j) => o.set(a.subarray(i * s, i * s + s), j * s)); return o; };
  return { pos: pick(p.pos, 3), nrm: pick(p.nrm, 3), uv: pick(p.uv, 2), col: pick(p.col, 4), mr: pick(p.mr, 2), gl: p.gl ? pick(p.gl, 1) : null, idx: p.idx.map((i) => remap[i]) };
}

/** Drop vertices no triangle uses. */
function compact(p) {
  const used = new Int32Array(p.pos.length / 3).fill(-1);
  let n = 0;
  for (const i of p.idx) if (used[i] < 0) used[i] = n++;
  const pick = (a, s) => { const o = new a.constructor(n * s); used.forEach((j, i) => { if (j >= 0) o.set(a.subarray(i * s, i * s + s), j * s); }); return o; };
  return { pos: pick(p.pos, 3), nrm: pick(p.nrm, 3), uv: pick(p.uv, 2), col: pick(p.col, 4), mr: pick(p.mr, 2), gl: p.gl ? pick(p.gl, 1) : null, idx: p.idx.map((i) => used[i]) };
}

/**
 * Creased normals: each triangle corner averages the faces around its
 * position that bend less than `crease` from its own face, so hard edges stay
 * hard and curved surfaces stay smooth. Corners that end up identical are
 * merged again.
 */
function creaseNormals(p, crease = 44) {
  const cos = Math.cos((crease * Math.PI) / 180);
  const tris = p.idx.length / 3;
  const fn = new Float32Array(tris * 3);
  const P = (i, a) => p.pos[i * 3 + a];
  // Corners grouped by position (not by vertex: uv seams must not split smoothing).
  const posKey = (i) => `${Math.round(P(i, 0) * 1e4)},${Math.round(P(i, 1) * 1e4)},${Math.round(P(i, 2) * 1e4)}`;
  const groups = new Map();
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = [p.idx[t * 3], p.idx[t * 3 + 1], p.idx[t * 3 + 2]];
    const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2);
    const vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
    fn[t * 3] = uy * vz - uz * vy; fn[t * 3 + 1] = uz * vx - ux * vz; fn[t * 3 + 2] = ux * vy - uy * vx;
    for (const v of [a, b, c]) { const k = posKey(v); let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(t); }
  }
  const unit = (t) => { const l = Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1; return [fn[t * 3] / l, fn[t * 3 + 1] / l, fn[t * 3 + 2] / l]; };
  const key = new Map();
  const out = { pos: [], nrm: [], uv: [], col: [], mr: [], gl: [], idx: [] };
  for (let t = 0; t < tris; t++) {
    const me = unit(t);
    for (let k = 0; k < 3; k++) {
      const v = p.idx[t * 3 + k];
      let nx = 0, ny = 0, nz = 0;
      for (const o of groups.get(posKey(v))) {
        const n = unit(o);
        if (n[0] * me[0] + n[1] * me[1] + n[2] * me[2] < cos) continue;
        nx += fn[o * 3]; ny += fn[o * 3 + 1]; nz += fn[o * 3 + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const id = `${v},${Math.round(nx * 60)},${Math.round(ny * 60)},${Math.round(nz * 60)}`;
      let j = key.get(id);
      if (j === undefined) {
        j = out.pos.length / 3;
        key.set(id, j);
        out.pos.push(P(v, 0), P(v, 1), P(v, 2));
        out.nrm.push(nx, ny, nz);
        out.uv.push(p.uv[v * 2], p.uv[v * 2 + 1]);
        out.col.push(...p.col.subarray(v * 4, v * 4 + 4));
        out.mr.push(...p.mr.subarray(v * 2, v * 2 + 2));
        out.gl.push(p.gl ? p.gl[v] : 0);
      }
      out.idx.push(j);
    }
  }
  return { pos: new Float32Array(out.pos), nrm: new Float32Array(out.nrm), uv: new Float32Array(out.uv), col: new Uint8Array(out.col), mr: new Uint8Array(out.mr), gl: p.gl ? new Uint8Array(out.gl) : null, idx: out.idx };
}

/** Quantise one part into the binary blob; returns its index entry. */
function writePart(p, pivot, chunks, offset, textured = true) {
  const n = p.pos.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const v = p.pos[i * 3 + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
  const span = max.map((v, a) => Math.max(v - min[a], 1e-6));
  const pos = new Uint16Array(n * 4);
  const nrm = new Int8Array(n * 4);
  const uv = new Uint16Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      pos[i * 4 + a] = Math.round(((p.pos[i * 3 + a] - min[a]) / span[a]) * 65535);
      nrm[i * 4 + a] = Math.round(Math.max(-1, Math.min(1, p.nrm[i * 3 + a])) * 127);
    }
    uv[i * 2] = Math.round(Math.min(1, Math.max(0, p.uv[i * 2])) * 65535);
    uv[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, p.uv[i * 2 + 1])) * 65535);
  }
  const idx = n < 65536 ? Uint16Array.from(p.idx) : Uint32Array.from(p.idx);
  const entry = { pivot: pivot.map((v) => +v.toFixed(5)), min: min.map((v) => +v.toFixed(5)), max: max.map((v) => +v.toFixed(5)), vertices: n, indices: idx.length, wide: idx instanceof Uint32Array };
  // `gl` (glow, one byte per vertex) only for parts that light themselves.
  // Untextured models need no uv (the game only reads it with an atlas).
  for (const [name, arr] of [['pos', pos], ['nrm', nrm], ['uv', textured ? uv : null], ['col', p.col], ['mr', p.mr], ['gl', p.gl], ['idx', idx]]) {
    if (!arr) continue;
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    entry[name] = offset.at;
    chunks.push(buf);
    offset.at += buf.length;
    const pad = (4 - (offset.at % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset.at += pad; }
  }
  return entry;
}

/**
 * Gamma (≤ 1) that lifts a model's mean brightness (max channel, sRGB) to
 * TARGET, from its atlas texels and its untextured vertex colours.
 */
const TARGET = 0.3;
function lift(rgba, cols) {
  let sum = 0, n = 0;
  if (rgba) for (let i = 0; i < rgba.length; i += 16) { sum += Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255; n++; }
  for (const c of cols) for (let i = 0; i < c.length; i += 4) {
    if (c[i] === 255 && c[i + 1] === 255 && c[i + 2] === 255) continue; // textured vertex
    sum += Math.max(c[i], c[i + 1], c[i + 2]) / 255; n++;
  }
  const mean = n ? sum / n : TARGET;
  if (mean >= TARGET) return 1;
  return Math.max(0.45, Math.log(TARGET) / Math.log(Math.max(mean, 0.02)));
}

await MeshoptSimplifier.ready;
// Served from the game's folder, like the studio (prep.js reaches src/render3d/).
const srv = await serve(path.resolve(root, '../..'));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(srv.url + 'tools/glb-bake/export.html');
await page.waitForFunction(() => window.exporter?.ready);

const indexFile = path.join(dest, 'models.json');
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { version: 1, models: {} };
// Keep models not re-exported this run: their bytes are copied from the old blob.
const oldBin = fs.existsSync(path.join(dest, 'models.bin')) ? fs.readFileSync(path.join(dest, 'models.bin')) : Buffer.alloc(0);
const chunks = [];
const offset = { at: 0 };
const models = {};
for (const [id, m] of Object.entries(index.models)) {
  if (jobs.some((j) => j.id === id)) continue;
  const parts = {};
  for (const [name, e] of Object.entries(m.parts)) {
    const copy = { ...e };
    const sizes = { pos: e.vertices * 8, nrm: e.vertices * 4, uv: e.vertices * 4, col: e.vertices * 4, mr: e.vertices * 2, gl: e.vertices, idx: e.indices * (e.wide ? 4 : 2) };
    for (const k of ['pos', 'nrm', 'uv', 'col', 'mr', 'gl', 'idx']) {
      if (e[k] === undefined) continue;
      copy[k] = offset.at;
      chunks.push(oldBin.subarray(e[k], e[k] + sizes[k]));
      offset.at += sizes[k];
      const pad = (4 - (offset.at % 4)) % 4;
      if (pad) { chunks.push(Buffer.alloc(pad)); offset.at += pad; }
    }
    parts[name] = copy;
  }
  models[id] = { ...m, parts };
}

for (const job of jobs) {
  const t = Date.now();
  const res = await page.evaluate((j) => window.exporter.exportJob(j), job);
  const raw = Object.fromEntries(Object.entries(res.parts).map(([k, p]) => [k, {
    pivot: p.pivot, pitch: p.pitch, pos: b64(p.pos, Float32Array), nrm: b64(p.nrm, Float32Array), uv: b64(p.uv, Float32Array), col: b64(p.col, Uint8Array), mr: b64(p.mr, Uint8Array), idx: b64(p.idx, Uint32Array),
    gl: p.gl ? b64(p.gl, Uint8Array) : null,
  }]));
  // Brighten dark PBR textures for the game's simple lighting: one gamma for
  // the atlas and the vertex colours, bringing the model's mean brightness up.
  const atlasRgba = res.atlas ? Buffer.from(res.atlas.rgba, 'base64') : null;
  const gamma = lift(atlasRgba, Object.values(raw).map((p) => p.col));
  if (gamma < 1) {
    const lut = Uint8Array.from({ length: 256 }, (_, i) => Math.round(255 * Math.pow(i / 255, gamma)));
    if (atlasRgba) for (let i = 0; i < atlasRgba.length; i += 4) { atlasRgba[i] = lut[atlasRgba[i]]; atlasRgba[i + 1] = lut[atlasRgba[i + 1]]; atlasRgba[i + 2] = lut[atlasRgba[i + 2]]; }
    for (const p of Object.values(raw)) for (let i = 0; i < p.col.length; i += 4) { p.col[i] = lut[p.col[i]]; p.col[i + 1] = lut[p.col[i + 1]]; p.col[i + 2] = lut[p.col[i + 2]]; }
  }
  const total = Object.values(raw).reduce((s, p) => s + p.idx.length / 3, 0);
  // Each part's share of the budget: by its size, but a turret (what the eye
  // follows) keeps at least a third.
  const share = {};
  for (const [name, p] of Object.entries(raw)) share[name] = p.idx.length / 3 / total;
  if (share.turret !== undefined && share.turret < 0.33) {
    const rest = 1 - share.turret;
    for (const k of Object.keys(share)) share[k] = k === 'turret' ? 0.33 : (share[k] / rest) * 0.67;
  }
  const parts = {};
  let tris = 0;
  for (const [name, p] of Object.entries(raw)) {
    let w = weld(p);
    const want = Math.floor(budget(job) * share[name]);
    if (want < w.idx.length / 3) {
      const target = Math.max(36, want * 3);
      // Gentle first (keeps uv seams), then across seams, then sloppy as a last resort.
      const src = Uint32Array.from(w.idx);
      let [idx] = MeshoptSimplifier.simplify(src, w.pos, 3, target, 0.02, ['Prune']);
      if (process.env.DEBUG) console.log(' gentle', idx.length / 3);
      if (idx.length > target * 1.3) [idx] = MeshoptSimplifier.simplify(src, w.pos, 3, target, 0.03, ['Prune', 'Permissive']);
      if (process.env.DEBUG) console.log(' permissive', idx.length / 3);
      if (idx.length > target * 1.3) {
        // Sloppy overshoots; search the error bound that lands nearest the target.
        let best = idx;
        for (const err of [0.004, 0.008, 0.015, 0.03]) {
          const [s2] = MeshoptSimplifier.simplifySloppy(src, w.pos, 3, null, target, err);
          if (process.env.DEBUG) console.log(' sloppy', err, s2.length / 3);
          if (Math.abs(s2.length - target) < Math.abs(best.length - target)) best = s2;
        }
        idx = best;
      }
      if (process.env.DEBUG) console.log(name, w.idx.length / 3, "->", idx.length / 3, "target", target / 3);
      w = compact({ ...w, idx: Array.from(idx) });
    }
    w = creaseNormals(w);
    tris += w.idx.length / 3;
    parts[name] = writePart(w, p.pivot, chunks, offset, !!res.atlas);
    if (p.pitch) parts[name].pitch = +p.pitch.toFixed(5);
  }
  let atlas = null;
  if (res.atlas) {
    const rawFile = path.join(root, 'out', `${job.id}.rgba`);
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, atlasRgba);
    atlas = `${job.id.replace('@', '-')}.webp`;
    execFileSync('python3', ['-c', `
import sys
from PIL import Image
w, h = int(sys.argv[2]), int(sys.argv[3])
im = Image.frombytes('RGBA', (w, h), open(sys.argv[1], 'rb').read())
im.save(sys.argv[4], 'WEBP', quality=82, alpha_quality=90, method=6, exact=True)
`, rawFile, String(res.atlas.w), String(res.atlas.h), path.join(dest, atlas)]);
  }
  models[job.id] = { kind: job.kind, atlas, parts };
  console.log(`γ ${gamma.toFixed(2)} ${job.id.padEnd(22)} ${String(Math.round(total)).padStart(7)} → ${String(tris).padStart(5)} tris  ${atlas ? `${res.atlas.w}×${res.atlas.h}` : 'no texture'}  ${Date.now() - t} ms`);
}
fs.writeFileSync(path.join(dest, 'models.bin'), Buffer.concat(chunks));
fs.writeFileSync(indexFile, JSON.stringify({ version: 1, models }, null, 1));
console.log(`models.bin ${(offset.at / 1024).toFixed(0)} KB`);
await browser.close();
srv.close();
