// Give a bundled map a sea round its edge, so every base has a coast and
// ships can sail from any base to any other.
//
//   node tools/maps/sea.mjs <map-id> ring <n>   turn the outer n schematic rows and columns to water
//   node tools/maps/sea.mjs <map-id> pad <n>    add n schematic rows and columns of water round the map
//                                               (everything on it moves by n × schematicScale cells)
//   node tools/maps/sea.mjs <map-id> start <k> <x> <y>   move start k to cell (x, y)
//
// Works on maps written as a `schematic`. It refuses to drown a start, a
// neutral object or a bridge. Writes maps/<map-id>.json in place, then runs the
// map validator (the setup screen refuses maps that fail it) and reports what fails.
import fs from 'node:fs';
import path from 'node:path';
import { parseMap } from '../../src/map/loader.js';
import { validateMap, describe } from '../../src/map/validator.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const WATER = '~';

/** @param {any} doc @param {number} n */
export function ring(doc, n) {
  const rows = doc.schematic.map((/** @type {string} */ r) => [...r]);
  const H = rows.length, W = rows[0].length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < n || y < n || x >= W - n || y >= H - n) rows[y][x] = WATER;
  }
  const edge = n * doc.schematicScale;
  const wet = (/** @type {number} */ x, /** @type {number} */ y) => x < edge || y < edge || x >= doc.width - edge || y >= doc.height - edge;
  for (const s of doc.starts) if (wet(s.x, s.y)) throw new Error(`start ${s.x},${s.y} would be under water`);
  for (const o of doc.neutral ?? []) if (wet(o.x, o.y)) throw new Error(`${o.type} at ${o.x},${o.y} would be under water`);
  for (const b of doc.bridges ?? []) if (b.cells.some(([x, y]) => wet(x, y))) throw new Error('a bridge would be under water');
  return { ...doc, schematic: rows.map((r) => r.join('')) };
}

/** @param {any} doc @param {number} n */
export function pad(doc, n) {
  const W = doc.schematic[0].length + 2 * n;
  const sea = WATER.repeat(W);
  const side = WATER.repeat(n);
  const by = n * doc.schematicScale;
  const shift = (/** @type {{ x: number, y: number }} */ p) => ({ ...p, x: p.x + by, y: p.y + by });
  return {
    ...doc,
    width: doc.width + 2 * by,
    height: doc.height + 2 * by,
    schematic: [...Array(n).fill(sea), ...doc.schematic.map((/** @type {string} */ r) => side + r + side), ...Array(n).fill(sea)],
    starts: doc.starts.map(shift),
    neutral: (doc.neutral ?? []).map(shift),
    ore: (doc.ore ?? []).map(shift),
    gems: (doc.gems ?? []).map(shift),
    bridges: (doc.bridges ?? []).map((/** @type {any} */ b) => ({ ...b, cells: b.cells.map(([x, y]) => [x + by, y + by]), ...(b.hut ? { hut: [b.hut[0] + by, b.hut[1] + by] } : {}) })),
  };
}

/** A value on one line, spaced like the hand-written maps. @param {any} v */
const inline = (v) => (typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v).replace(/"([^"]+)":/g, '"$1": ').replace(/,(?=["{[\d-])/g, ', '));

/** The map as JSON: one key per line, one schematic row or object per line. @param {any} doc */
export function format(doc) {
  const keys = Object.keys(doc);
  const lines = keys.map((k, i) => {
    const v = doc[k];
    const comma = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(v) && v.length > 2) return `  "${k}": [\n${v.map((e) => `    ${inline(e)}`).join(',\n')}\n  ]${comma}`;
    return `  "${k}": ${inline(v)}${comma}`;
  });
  return `{\n${lines.join('\n')}\n}\n`;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [id, op, ...args] = process.argv.slice(2);
  const file = path.join(ROOT, 'maps', `${id}.json`);
  let doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(doc.schematic)) throw new Error('only schematic maps');
  if (op === 'ring') doc = ring(doc, Number(args[0]));
  else if (op === 'pad') doc = pad(doc, Number(args[0]));
  else if (op === 'start') doc.starts[Number(args[0])] = { x: Number(args[1]), y: Number(args[2]) };
  else throw new Error(`unknown operation ${op}`);
  fs.writeFileSync(file, format(doc));
  console.log(`${id}: ${doc.width}×${doc.height}`);
  // The setup screen refuses maps that fail the validator: say so now, not at the next match.
  const report = validateMap(parseMap(doc));
  if (!report.ok) { console.error(`${id} no longer passes the map validator:\n${describe(report.errors)}`); process.exitCode = 1; }
}
