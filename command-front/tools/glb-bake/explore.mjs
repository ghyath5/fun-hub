// Contact sheet of every mesh node of a GLB, to choose turret nodes and orientation.
// usage: node explore.mjs <file.glb> <out-dir> [rotX rotY rotZ]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';

const [src, outDir, ...rot] = process.argv.slice(2);
const root = path.dirname(new URL(import.meta.url).pathname);
const srv = await serve(root);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(srv.url + 'studio.html');
await page.waitForFunction(() => window.studio?.ready);
const shots = await page.evaluate(([s, r]) => window.studio.explore(s, r), [src, rot.map(Number)]);
fs.mkdirSync(outDir, { recursive: true });
shots.forEach((s, i) => {
  for (const k of ['top', 'side']) fs.writeFileSync(path.join(outDir, `${String(i).padStart(2, '0')}-${k}.png`), Buffer.from(s[k].split(',')[1], 'base64'));
});
fs.writeFileSync(path.join(outDir, 'names.json'), JSON.stringify(shots.map((s) => s.name), null, 1));
await browser.close();
srv.close();
