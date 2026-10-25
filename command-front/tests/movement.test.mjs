// Movement, crowding and stacking: groups arrive, nothing shares a place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, openMap, squad, order, run, live, invariants, stackedPairs, isFoot, dist, MOVEMENT, UNITS, L } from './harness.mjs';
import { T } from '../src/data/terrain.js';

const INF = ['rifleman', 'rocketTrooper', 'engineer'];
const MIX = ['rifleman', 'lightTank', 'rocketTrooper', 'rifleman', 'ranger'];

/** Move groups and watch every tick: invariants, stacking, arrival. */
function groupMove(seed, groups, ticks = 1500) {
  const w = sandbox({ seed });
  const all = [];
  for (const g of groups) {
    const ids = squad(w, g.owner ?? 0, g.types, g.count, g.from[0], g.from[1], g.cols ?? 5);
    all.push(...ids);
    order(w, g.owner ?? 0, g.kind ?? 'move', ids, { x: g.to[0], y: g.to[1] });
  }
  let stacked = 0;
  let arrived = -1;
  const broken = run(w, ticks, (w2, t) => {
    const bad = invariants(w2);
    if (bad) return bad;
    stacked += stackedPairs(live(w2, all));
    if (arrived < 0 && t > 3 && live(w2, all).every((e) => !e.order && !e.next)) arrived = t;
    return null;
  });
  return { w, all, stacked, arrived, broken };
}

test('a group of tanks arrives, one tank per cell', () => {
  const r = groupMove(1, [{ types: ['lightTank', 'mediumTank'], count: 16, from: [6, 8], to: [40, 30] }]);
  assert.equal(r.broken, null);
  assert.ok(r.arrived > 0, 'every tank stopped');
  const us = live(r.w, r.all);
  assert.equal(new Set(us.map((e) => `${e.cx},${e.cy}`)).size, us.length, 'each tank in its own cell');
  for (const e of us) assert.ok(Math.hypot(e.cx - 40, e.cy - 30) < 5, `${e.type}#${e.id} ended near the target (${e.cx},${e.cy})`);
});

test('big vehicles (harvester, fortress, MCV) never overlap in a crowd', () => {
  const r = groupMove(2, [{ types: ['harvester', 'battleFortress', 'mcv'], count: 9, from: [6, 8], to: [36, 24] }]);
  assert.equal(r.broken, null);
  const us = live(r.w, r.all);
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) assert.ok(dist(us[i], us[j]) >= L * 0.7, 'vehicles a cell apart');
});

test('infantry stand in distinct spots, at most three to a cell, never on top of each other', () => {
  const r = groupMove(3, [{ types: INF, count: 30, from: [6, 8], to: [40, 24] }]);
  assert.equal(r.broken, null);
  assert.ok(r.arrived > 0, 'every soldier stopped');
  const us = live(r.w, r.all);
  const perCell = new Map();
  for (const e of us) perCell.set(`${e.cx},${e.cy}`, (perCell.get(`${e.cx},${e.cy}`) ?? 0) + 1);
  for (const [cell, n] of perCell) assert.ok(n <= MOVEMENT.infantrySpots, `${n} soldiers in ${cell}`);
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
    assert.ok(dist(us[i], us[j]) >= 100, `soldiers #${us[i].id} and #${us[j].id} stand ${dist(us[i], us[j]).toFixed(0)} apart`);
  }
});

test('the infantry spots are laid out so no two walking lanes coincide', () => {
  const spots = MOVEMENT.spotOffsets;
  const wrap = (v) => { const m = ((v % L) + L) % L; return Math.min(m, L - m); };
  for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
    const dx = spots[b][0] - spots[a][0], dy = spots[b][1] - spots[a][1];
    const lanes = Math.min(wrap(dx), wrap(dy), wrap(dx - dy) / Math.SQRT2, wrap(dx + dy) / Math.SQRT2);
    assert.ok(lanes >= 36, `spots ${a} and ${b} share a lane (${lanes.toFixed(0)} apart)`);
    assert.ok(Math.hypot(dx, dy) >= 100, `spots ${a} and ${b} too close at rest`);
  }
});

/** Stacking budget across varied group moves: soldiers may brush past, never walk through each other for long. */
test('marching squads (head-on, crossing, mixed, big crowds) hardly ever stack and never deadlock', () => {
  const cases = [
    [{ types: INF, count: 10, from: [6, 10], cols: 4, to: [40, 12] }],
    [{ types: INF, count: 20, from: [6, 6], to: [40, 34] }],
    [{ types: INF, count: 40, from: [10, 4], cols: 8, to: [14, 36] }],
    [{ types: MIX, count: 40, from: [6, 6], cols: 8, to: [40, 24] }],
    [{ types: INF, count: 15, from: [6, 18], cols: 3, to: [46, 19] }, { owner: 0, types: INF, count: 15, from: [46, 18], cols: 3, to: [6, 19] }],
    [{ types: INF, count: 15, from: [6, 18], cols: 3, to: [46, 19] }, { owner: 0, types: INF, count: 15, from: [25, 4], cols: 3, to: [26, 38] }],
    [{ types: INF, count: 60, from: [6, 8], cols: 10, to: [40, 28] }],
  ];
  let stacked = 0, soldierTicks = 0;
  cases.forEach((groups, k) => {
    const r = groupMove(10 + k, groups);
    assert.equal(r.broken, null, `case ${k}: ${r.broken}`);
    assert.ok(r.arrived > 0, `case ${k}: everyone arrived (no deadlock)`);
    stacked += r.stacked;
    soldierTicks += live(r.w, r.all).filter(isFoot).length * r.arrived;
  });
  // The old movement stacked ~3 900 pair-ticks on a similar set; allow a small residue of brushing past.
  assert.ok(stacked < 400, `stacked pair-ticks ${stacked}`);
  assert.ok(stacked / soldierTicks < 0.002, `stacking rate ${(stacked / soldierTicks).toFixed(4)}`);
});

test('vehicles and infantry never share a cell', () => {
  const r = groupMove(20, [{ types: MIX, count: 30, from: [6, 6], cols: 6, to: [30, 22] }, { types: MIX, count: 30, from: [40, 30], cols: 6, to: [10, 10] }]);
  assert.equal(r.broken, null);
});

test('attack-move and guard orders keep the bookkeeping sound', () => {
  const w = sandbox({ seed: 30 });
  const blue = squad(w, 0, MIX, 20, 6, 6, 5);
  const red = squad(w, 1, ['heavyTank', 'rifleman', 'flakTrooper', 'rifleman'], 20, 40, 30, 5);
  order(w, 0, 'attackMove', blue, { x: 40, y: 30 });
  order(w, 1, 'guardArea', red, { x: 40, y: 30 });
  const broken = run(w, 1800, (w2) => invariants(w2));
  assert.equal(broken, null);
  const left = live(w, [...blue, ...red]);
  assert.ok(left.length < 40, 'the fight happened (someone died)');
});

test('stop, scatter and stance orders apply', () => {
  const w = sandbox({ seed: 31 });
  const ids = squad(w, 0, ['lightTank', 'rifleman'], 10, 10, 10);
  order(w, 0, 'move', ids, { x: 40, y: 30 });
  run(w, 30);
  order(w, 0, 'stop', ids);
  assert.equal(run(w, 30, invariants), null);
  for (const e of live(w, ids)) assert.ok(!e.order, 'stopped');
  order(w, 0, 'scatter', ids);
  order(w, 0, 'stance', ids, { stance: 'holdFire' });
  assert.equal(run(w, 120, invariants), null);
  for (const e of live(w, ids)) assert.equal(e.stance, 'holdFire');
});

test('units sent into a walled-off pocket or onto water stop at the nearest reachable cell', () => {
  const map = openMap();
  // A 3 × 3 pocket of grass ringed by rock at (30..34, 20..24), and a lake further on.
  for (let y = 20; y <= 24; y++) for (let x = 30; x <= 34; x++) {
    if (x === 30 || x === 34 || y === 20 || y === 24) map.terrain[y * map.width + x] = T.rock;
  }
  for (let y = 8; y <= 14; y++) for (let x = 40; x <= 48; x++) map.terrain[y * map.width + x] = T.water;
  const w = sandbox({ seed: 32, map });
  const a = squad(w, 0, ['lightTank', 'rifleman'], 6, 6, 6);
  const b = squad(w, 0, ['lightTank', 'rifleman'], 6, 6, 30);
  order(w, 0, 'move', a, { x: 32, y: 22 });
  order(w, 0, 'move', b, { x: 44, y: 11 });
  assert.equal(run(w, 1200, invariants), null);
  for (const e of live(w, [...a, ...b])) {
    assert.ok(!e.order, `${e.type}#${e.id} gave up its order`);
    assert.ok(w.nav.passable(UNITS[e.type].loco, e.cx, e.cy), 'standing somewhere passable');
  }
});
