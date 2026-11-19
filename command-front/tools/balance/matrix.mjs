// Every combat unit against every other at equal cost (both ways round so
// neither side gets the left-hand start), on a pool of processes. Prints each
// unit's power score — its average lead in value left over the whole field
// (+1: always wins untouched, -1: always loses without a scratch). Single
// fights and sieges: tools/balance/fight.mjs.
//
//   node tools/balance/matrix.mjs [--budget 3000] [--jobs 2] [--out matrix.json]
import { parseArgs } from 'node:util';
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UNITS } from '../../src/data/units.js';
import { isCombatType } from '../../src/ai/common.js';

const { values: o } = parseArgs({
  options: {
    budget: { type: 'string', default: '3000' },
    jobs: { type: 'string', default: String(availableParallelism()) },
    out: { type: 'string' },
    units: { type: 'string' },
    worker: { type: 'boolean', default: false },
  },
});

/** Ground and air combat units the matrix covers (not ships, which cannot reach land). */
export const FIELD = Object.keys(UNITS).filter((t) => isCombatType(t) && UNITS[t].cost > 0 && UNITS[t].loco !== 'float');

if (o.worker) {
  const { duel } = await import('./fight.mjs');
  process.on('message', (/** @type {any} */ job) => process.send?.(duel(job.a, job.b, job.budget, job.seed)));
} else {
  const field = o.units ? o.units.split(',') : FIELD;
  const jobs = [];
  for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
    jobs.push({ a: field[i], b: field[j], budget: Number(o.budget), seed: 1 });
    jobs.push({ a: field[j], b: field[i], budget: Number(o.budget), seed: 2 });
  }
  const results = await pool(jobs, Number(o.jobs));
  if (o.out) writeFileSync(o.out, JSON.stringify(results));
  /** @type {Map<string, number[]>} */
  const score = new Map(field.map((t) => [t, []]));
  for (const r of results) {
    score.get(r.a)?.push(r.aLeft - r.bLeft);
    score.get(r.b)?.push(r.bLeft - r.aLeft);
  }
  const rows = [...score].map(([t, s]) => ({ t, s: s.reduce((a, x) => a + x, 0) / Math.max(1, s.length) })).sort((a, b) => b.s - a.s);
  console.log('power score (average lead over the field, equal cost)');
  for (const r of rows) console.log(`${r.t.padEnd(18)} ${UNITS[r.t].line.padEnd(9)} ${String(UNITS[r.t].cost).padStart(5)}  ${r.s >= 0 ? '+' : ''}${r.s.toFixed(2)}`);
}

/** Run jobs on child processes. @param {any[]} jobs @param {number} n @returns {Promise<any[]>} */
function pool(jobs, n) {
  return new Promise((resolve) => {
    const out = [];
    let next = 0;
    let busy = 0;
    const self = fileURLToPath(import.meta.url);
    const feed = (/** @type {any} */ child) => {
      if (next >= jobs.length) { child.kill(); if (!busy) resolve(out); return; }
      busy++;
      child.send(jobs[next++]);
    };
    for (let k = 0; k < Math.min(n, jobs.length); k++) {
      const child = fork(self, ['--worker']);
      child.on('message', (r) => { out.push(r); busy--; process.stderr.write(`\r${out.length}/${jobs.length}`); feed(child); });
      feed(child);
    }
  });
}
