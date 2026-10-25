// Traffic: units must not get stuck on each other — columns meeting in a
// pass sort themselves into lanes (keep right), and as a last resort squeeze
// past; nobody dances round anybody forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, openMap, squad, order, run, live, invariants, loadMap, createMatch, spawnUnit, removeUnit, TPS } from './harness.mjs';
import { T } from '../src/data/terrain.js';

/** A rock wall with a pass `width` cells wide, 30 long, across the middle of an open map. */
function pass(width) {
  const map = openMap(56, 44);
  const y0 = 22 - Math.floor(width / 2);
  for (let y = 0; y < map.height; y++) for (let x = 13; x < 43; x++) if (y < y0 || y >= y0 + width) map.terrain[y * map.width + x] = T.rock;
  return map;
}

/** Run, checking invariants; returns units that failed to arrive (still moving, or stopped > 2 cells short). */
function failures(w, ids, seconds) {
  const dest = new Map();
  let bad = null;
  for (let t = 0; t < seconds * TPS && !bad; t++) {
    run(w, 1);
    for (const id of ids) { const e = w.entities.get(id); if (e?.order && !dest.has(id)) dest.set(id, { x: e.order.dx, y: e.order.dy }); }
    if (t % 5 === 0) bad = invariants(w);
  }
  assert.equal(bad, null);
  return live(w, ids).filter((e) => {
    const d = dest.get(e.id);
    return e.order || (d && Math.max(Math.abs(e.cx - d.x), Math.abs(e.cy - d.y)) > 2);
  });
}

function headOn(seed, width, typesA, typesB, n) {
  const w = sandbox({ seed, map: pass(width) });
  const a = squad(w, 0, typesA, n, 2 + (seed % 3), 16 + (seed % 4), 4);
  const b = squad(w, 0, typesB, n, 49 - (seed % 3), 17 + ((seed * 7) % 4), 4);
  order(w, 0, 'move', a, { x: 52, y: 20 + (seed % 5) });
  order(w, 0, 'move', b, { x: 4, y: 19 + (seed % 5) });
  return failures(w, [...a, ...b], 150);
}

for (const width of [2, 3]) {
  test(`two tank columns meeting head-on in a ${width}-wide pass both get through`, () => {
    for (const seed of [1, 2, 3, 4]) {
      const f = headOn(seed, width, ['lightTank', 'mediumTank'], ['lightTank', 'mediumTank'], 8);
      assert.equal(f.length, 0, `seed ${seed}: stuck ${f.map((e) => `${e.type}#${e.id}@${e.cx},${e.cy}`).join(' ')}`);
    }
  });
}

test('mixed columns (tanks and infantry) meeting in narrow passes nearly all get through', () => {
  let failed = 0, total = 0;
  for (const width of [2, 3]) for (const seed of [1, 2, 3, 4]) {
    failed += headOn(seed, width, ['lightTank', 'rifleman', 'rifleman'], ['mediumTank', 'rocketTrooper', 'rifleman'], 12).length;
    total += 24;
  }
  // The original movement lost ~30 % of these to jams.
  assert.ok(failed / total <= 0.1, `${failed}/${total} stuck`);
});

/** Two armies swapping ends on a real map (holding fire). */
function swap(mapId, seed, from, to, n) {
  const map = loadMap(mapId);
  const w = createMatch(map, { seed, players: [{ faction: 'coalition', color: 'blue', human: true, start: 0 }, { faction: 'union', color: 'red', human: true, start: 1 }], settings: { victory: false, revealMap: true } });
  for (const e of w.entities.all()) if (e.kind === 'unit') removeUnit(w, e);
  const mk = (owner, at, types) => {
    const ids = [];
    for (let k = 0; ids.length < n && k < 300; k++) {
      const u = spawnUnit(w, types[k % types.length], owner, at.x + (k % 5) - 2, at.y + Math.floor(k / 5) - 2);
      if (u) { u.stance = 'holdFire'; ids.push(u.id); }
    }
    return ids;
  };
  const a = mk(0, from, ['lightTank', 'rifleman', 'mediumTank', 'rifleman']);
  const b = mk(1, to, ['heavyTank', 'rifleman', 'flakTrack', 'rocketTrooper']);
  order(w, 0, 'move', a, to);
  order(w, 1, 'move', b, from);
  return failures(w, [...a, ...b], 200);
}

test('armies crossing the Twin Rivers bridge both ways all get across', () => {
  for (const seed of [1, 2, 3]) assert.equal(swap('twin-rivers', seed, { x: 24, y: 16 }, { x: 40, y: 17 }, 12).length, 0, `seed ${seed}`);
});

test('armies swapping ends of Duel Canyon all get there', () => {
  const [s0, s1] = loadMap('duel-canyon').starts;
  for (const seed of [1, 2]) assert.equal(swap('duel-canyon', seed, s0, s1, 14).length, 0, `seed ${seed}`);
});

test('four groups crossing through each other all arrive', () => {
  for (const seed of [1, 2, 3]) {
    const w = sandbox({ seed });
    const t = ['lightTank', 'mediumTank', 'rifleman'];
    const g = [squad(w, 0, t, 9, 25, 2, 3), squad(w, 0, t, 9, 25, 38, 3), squad(w, 0, t, 9, 50, 19, 3), squad(w, 0, t, 9, 2, 19, 3)];
    order(w, 0, 'move', g[0], { x: 26, y: 40 });
    order(w, 0, 'move', g[1], { x: 26, y: 3 });
    order(w, 0, 'move', g[2], { x: 3, y: 20 });
    order(w, 0, 'move', g[3], { x: 51, y: 20 });
    assert.equal(failures(w, g.flat(), 150).length, 0, `seed ${seed}`);
  }
});

test('a column drives through parked friends, who make way', () => {
  const w = sandbox({ seed: 3 });
  squad(w, 0, ['heavyTank', 'lightTank'], 30, 20, 14, 10);
  const movers = squad(w, 0, ['mediumTank'], 8, 4, 18, 2);
  order(w, 0, 'move', movers, { x: 48, y: 18 });
  assert.equal(failures(w, movers, 90).length, 0);
});

test('units arriving together settle — nobody dances round anybody', () => {
  for (const seed of [1, 2, 3]) {
    const w = sandbox({ seed });
    const ids = squad(w, 0, ['lightTank', 'mediumTank', 'rifleman'], 24, 6, 8, 6);
    order(w, 0, 'move', ids, { x: 40, y: 30 });
    run(w, 150 * TPS); // a mixed group marches at its soldiers' pace: ~35 cells
    const moving = live(w, ids).filter((e) => e.order || e.next);
    assert.equal(moving.length, 0, `seed ${seed}: still moving ${moving.map((e) => `#${e.id}`).join(' ')}`);
  }
});
