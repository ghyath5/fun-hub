// Random maps: always valid, most with a sea that reaches every base, mountains on every one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, createMatch, step, invariants, TPS, UNITS } from './harness.mjs';
import './importmap.mjs';
import { T } from '../src/data/terrain.js';

const { generateMap } = await import('../src/map/generator.js');
const { validateMap, describe } = await import('../src/map/validator.js');

/** Nearest water cell to a start, by Chebyshev rings. */
function waterNear(map, s, r = 8) {
  for (let d = 0; d <= r; d++) for (let y = s.y - d; y <= s.y + d; y++) for (let x = s.x - d; x <= s.x + d; x++) {
    if (Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) !== d || x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    if (map.terrain[y * map.width + x] === T.water) return { x, y };
  }
  return null;
}

test('generated maps are valid on the first seeds, have mountains, and most have a sea reaching every base', () => {
  let maps = 0;
  let seas = 0;
  for (const size of [48, 64, 96, 128]) {
    for (const players of [2, 4]) {
      for (let seed = 1; seed <= 10; seed++) {
        const g = generateMap({ seed: seed * 37, size, players });
        assert.ok(g, `size ${size}, ${players} players, seed ${seed * 37}: no valid map`);
        const report = validateMap(g.map);
        assert.ok(report.ok, describe(report.errors));
        maps++;
        const rock = g.map.terrain.reduce((n, t) => n + (t === T.rock ? 1 : 0), 0);
        assert.ok(rock > 0, `size ${size} seed ${g.seed}: no mountains`);
        // A sea: water within 8 cells of every base, all of it one body.
        const near = g.map.starts.map((s) => waterNear(g.map, s));
        if (near.some((c) => !c)) continue;
        const w = sandbox({ map: g.map });
        const bodies = new Set(near.map((c) => w.nav.component('float', c.x, c.y)));
        if (bodies.size === 1) seas++;
      }
    }
  }
  assert.ok(seas >= maps * 0.5, `${seas} of ${maps} maps have a sea reaching every base`);
});

test('the same seed gives the same map', () => {
  const a = generateMap({ seed: 99, size: 64, players: 2 });
  const b = generateMap({ seed: 99, size: 64, players: 2 });
  assert.deepEqual([...a.map.terrain], [...b.map.terrain]);
  assert.deepEqual(a.map.starts, b.map.starts);
});

test('the AI plays a generated sea map without breaking anything, and builds a navy', () => {
  let g = null;
  for (let seed = 1; seed < 40 && !g; seed++) {
    const c = generateMap({ seed, size: 64, players: 2 });
    if (c && c.map.starts.every((s) => waterNear(c.map, s))) g = c;
  }
  assert.ok(g, 'a sea map');
  const w = createMatch(g.map, {
    seed: 5,
    players: g.map.starts.map((_, i) => ({ faction: i % 2 ? 'union' : 'coalition', color: ['blue', 'red'][i], human: false, difficulty: 'hard', start: i })),
    settings: { victory: true },
  });
  let bad = null;
  let yards = 0;
  /** Warships each side launched. @type {Record<string, Set<string>>} */
  const ships = { coalition: new Set(), union: new Set() };
  for (let t = 0; t < 25 * 60 * TPS && !w.result && !bad; t++) {
    step(w);
    if (t % 5 === 0) bad = invariants(w);
    if (t % 300 === 0) yards = Math.max(yards, w.entities.all().filter((e) => e.kind === 'structure' && !e.dead && (e.type === 'navalYard' || e.type === 'subPen')).length);
    if (t % 30 === 0) for (const e of w.entities.all()) if (e.kind === 'unit' && e.owner >= 0 && UNITS[e.type].line === 'naval') ships[w.players[e.owner].faction].add(e.type);
  }
  assert.equal(bad, null);
  assert.ok(yards >= 1, 'a naval yard went up by the sea');
  assert.ok(ships.union.has('seaScorpion'), `the Union's fleet: ${[...ships.union]}`);
});
