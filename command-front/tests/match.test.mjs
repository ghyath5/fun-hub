// Whole matches: the AI plays every map to the end with the bookkeeping
// sound on every tick, and the simulation is deterministic (two phones run
// it in lockstep and must agree tick for tick).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMap, createMatch, step, hashWorld, invariants, TPS } from './harness.mjs';

const COLORS = ['blue', 'red', 'green', 'yellow'];

function aiMatch(mapId, seed, difficulty = 'hard') {
  const map = loadMap(mapId);
  return createMatch(map, {
    seed,
    players: map.starts.map((_, i) => ({ faction: i % 2 ? 'union' : 'coalition', color: COLORS[i], human: false, difficulty, start: i })),
    settings: { victory: true },
  });
}

for (const [mapId, seed] of [['duel-canyon', 21], ['crossroads', 21], ['twin-rivers', 21], ['duel-canyon', 4]]) {
  test(`AI match on ${mapId} (seed ${seed}) plays out with sound bookkeeping every tick`, () => {
    const w = aiMatch(mapId, seed);
    let bad = null;
    let most = 0;
    for (let t = 0; t < 45 * 60 * TPS && !w.result; t++) {
      step(w);
      bad = invariants(w);
      if (bad) break;
      if (t % 300 === 0) most = Math.max(most, w.entities.all().filter((e) => e.kind === 'structure' && !e.dead && e.owner >= 0).length);
    }
    assert.equal(bad, null);
    assert.ok(most >= 8, `the AIs built bases (${most} buildings at most)`);
    if (w.result) assert.ok(w.result.winners.length >= 1, 'a winner');
  });
}

test('the same seed gives the same game, tick for tick', () => {
  const a = aiMatch('duel-canyon', 77);
  const b = aiMatch('duel-canyon', 77);
  for (let t = 0; t < 10 * 60 * TPS; t++) {
    step(a);
    step(b);
    if (t % 150 === 0) assert.equal(hashWorld(a), hashWorld(b), `diverged by tick ${a.tick}`);
  }
  assert.equal(hashWorld(a), hashWorld(b));
});

test('a different seed gives a different game', () => {
  const a = aiMatch('duel-canyon', 1);
  const b = aiMatch('duel-canyon', 2);
  for (let t = 0; t < 3 * 60 * TPS; t++) { step(a); step(b); }
  assert.notEqual(hashWorld(a), hashWorld(b));
});

for (const difficulty of ['easy', 'normal']) {
  test(`AI on ${difficulty} plays a sound game`, () => {
    const w = aiMatch('crossroads', 9, difficulty);
    let bad = null;
    for (let t = 0; t < 15 * 60 * TPS && !w.result && !bad; t++) { step(w); bad = invariants(w); }
    assert.equal(bad, null);
  });
}
