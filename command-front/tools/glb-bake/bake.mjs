// Render every job in jobs.mjs (or only the ids given) into out/:
//   units      <id>-body.png, <id>-turret.png
//   structures <id>-color.png, <id>-model.png
// plus out/meta.json with each job and its image metrics. pack.py turns
// these into atlas pages for the game.
// usage: node bake.mjs [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { JOBS } from './jobs.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'out');
fs.mkdirSync(out, { recursive: true });
const only = new Set(process.argv.slice(2));
// STL models are 3D-only (export.mjs): the Classic 2D view keeps its sprites for those buildings.
const jobs = JOBS.filter((j) => !j.stl && (!only.size || only.has(j.id)));

// Served from the game's folder: the procedural models live in src/render3d/.
const srv = await serve(path.resolve(root, '../..'));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page:', e.message));
await page.goto(srv.url + 'tools/glb-bake/studio.html');
await page.waitForFunction(() => window.studio?.ready);

const metaFile = path.join(out, 'meta.json');
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
const save = (name, url) => fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
for (const job of jobs) {
  const t = Date.now();
  const res = await page.evaluate((j) => window.studio.render(j), job);
  for (const [k, v] of Object.entries(res)) if (k !== 'meta') save(`${job.id}-${k}.png`, v);
  meta[job.id] = { ...job, ...(res.meta ?? {}), images: Object.keys(res).filter((k) => k !== 'meta') };
  console.log(`${job.id.padEnd(28)} ${Date.now() - t} ms`);
}
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
await browser.close();
srv.close();
