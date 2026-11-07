// The skill ladder: plays computer players of different skills against each
// other on every bundled map, both factions each way round, and prints how
// often the stronger one wins, how long games last and how each level plays.
// A well-tuned ladder has every level beating the one two below it most of
// the time — but not always.
//
//   node tools/ai-bench/ladder.mjs [--pairs 10-8,8-6,6-4,4-2,2-0] [--seeds 3,11] [--maps duel-canyon,twin-rivers,crossroads] [--minutes 40] [--jobs 4] [--out ladder.json]
import { parseArgs } from 'node:util';
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { values: o } = parseArgs({
  options: {
    pairs: { type: 'string', default: '10-8,8-6,6-4,4-2,2-0,10-5,5-0' },
    seeds: { type: 'string', default: '3,11' },
    maps: { type: 'string', default: 'duel-canyon,twin-rivers,crossroads' },
    minutes: { type: 'string', default: '40' },
    jobs: { type: 'string', default: String(availableParallelism()) },
    out: { type: 'string' },
    patch: { type: 'string' },  // e.g. 10:raidSense=0.3;10:routeSense=0.5 — play levels with changed values
    worker: { type: 'boolean', default: false },
  },
});

if (o.worker) {
  // A child: play the matches it is sent, one at a time.
  const { playMatch } = await import('./match.mjs');
  process.on('message', (/** @type {any} */ spec) => process.send?.(playMatch(spec)));
} else {
  const pairs = o.pairs.split(',').map((p) => p.split('-').map(Number));
  /** @type {Record<number, Record<string, number>>} */
  const patch = {};
  for (const item of (o.patch ?? '').split(';').filter(Boolean)) {
    const [level, kv] = item.split(':');
    const [key, value] = kv.split('=');
    (patch[Number(level)] ??= {})[key] = Number(value);
  }
  /** @type {any[]} */
  const specs = [];
  for (const [hi, lo] of pairs) for (const map of o.maps.split(',')) for (const seed of o.seeds.split(',').map(Number)) {
    for (const factions of [['coalition', 'union'], ['union', 'coalition']]) specs.push({ map, seed, skills: [hi, lo], factions, minutes: Number(o.minutes), patch });
  }
  const results = await runAll(specs, Math.max(1, Number(o.jobs)));
  if (o.out) writeFileSync(o.out, JSON.stringify(results));
  report(pairs, results);
}

/** Play specs on a pool of child processes. @param {any[]} specs @param {number} jobs @returns {Promise<any[]>} */
function runAll(specs, jobs) {
  return new Promise((resolve) => {
    const results = [];
    let next = 0;
    let busy = 0;
    const self = fileURLToPath(import.meta.url);
    const feed = (/** @type {import('node:child_process').ChildProcess} */ child) => {
      if (next >= specs.length) { child.kill(); if (!busy) resolve(results); return; }
      busy++;
      child.send(specs[next++]);
    };
    for (let k = 0; k < Math.min(jobs, specs.length); k++) {
      const child = fork(self, ['--worker']);
      child.on('message', (r) => {
        results.push(r);
        busy--;
        process.stderr.write(`\r${results.length}/${specs.length} matches`);
        feed(child);
      });
      feed(child);
    }
  });
}

/** Print the ladder. @param {number[][]} pairs @param {any[]} results */
function report(pairs, results) {
  process.stderr.write('\n');
  console.log('pair      higher wins  lower wins  unfinished  median min');
  for (const [hi, lo] of pairs) {
    const games = results.filter((r) => r.players[0].skill === hi && r.players[1].skill === lo);
    const up = games.filter((r) => r.winners.length === 1 && r.winners[0] === hi).length;
    const down = games.filter((r) => r.winners.length === 1 && r.winners[0] === lo).length;
    const mins = games.map((r) => r.minutes).sort((a, b) => a - b);
    console.log(`${`${hi} vs ${lo}`.padEnd(10)}${String(up).padStart(11)}${String(down).padStart(12)}${String(games.length - up - down).padStart(12)}${String(mins[mins.length >> 1] ?? '-').padStart(12)}`);
  }
  /** @type {Map<number, any[]>} */
  const byLevel = new Map();
  for (const r of results) for (const p of r.players) byLevel.set(p.skill, [...(byLevel.get(p.skill) ?? []), p]);
  console.log('\nskill  harvested@10min  peak army  attacks  retreats  wiped  raids  K/D');
  for (const [skill, ps] of [...byLevel].sort((a, b) => a[0] - b[0])) {
    const mean = (/** @type {(p: any) => number} */ f) => (ps.reduce((a, p) => a + f(p), 0) / ps.length).toFixed(1);
    const h10 = mean((p) => p.timeline.find((/** @type {any} */ t) => t.min === 10)?.harvested ?? p.harvested);
    console.log(`${String(skill).padStart(5)}${h10.padStart(17)}${mean((p) => p.peakArmy).padStart(11)}${mean((p) => p.stats.waves ?? 0).padStart(9)}${mean((p) => p.stats.retreat ?? 0).padStart(10)}${mean((p) => p.stats.wiped ?? 0).padStart(7)}${mean((p) => p.stats.raids ?? 0).padStart(7)}${mean((p) => p.killed / Math.max(1, p.lost)).padStart(5)}`);
  }
}
