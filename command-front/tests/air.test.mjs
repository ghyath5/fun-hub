// Aircraft: hovering ones never stack, landings take separate cells, planes still fly their passes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, squad, order, run, live, invariants, dist, placeStructure, spawnUnit } from './harness.mjs';

/** Aircraft attacking one sturdy target: closest pair after they settle. */
function attackers(type, count, what, seed = 5) {
  const w = sandbox({ seed });
  const target = what === 'structure' ? placeStructure(w, 'warFactory', 1, 30, 20, { buildUp: false }) : spawnUnit(w, 'heavyTank', 1, 30, 20);
  target.hp = target.maxHp = 1e7;
  const ids = squad(w, 0, [type], count, 6, 8, 4);
  order(w, 0, 'attack', ids, { id: target.id });
  let overlapping = 0;
  const broken = run(w, 700, (w2, t) => {
    const bad = invariants(w2);
    if (bad) return bad;
    if (t < 250) return null;
    const us = live(w2, ids).filter((e) => !e.landed);
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) if (dist(us[i], us[j]) < 96) overlapping++;
    return null;
  });
  return { w, ids, target, overlapping, broken };
}

for (const type of ['attackHeli', 'siegeChopper', 'rocketeer']) {
  for (const what of ['structure', 'unit']) {
    test(`${type}s attacking one ${what} spread out instead of stacking`, () => {
      const r = attackers(type, 6, what);
      assert.equal(r.broken, null);
      assert.ok(r.target.hp < r.target.maxHp, 'they fought');
      assert.ok(r.overlapping < 40, `overlapping pair-ticks ${r.overlapping}`);
    });
  }
}

test('helicopters with no pad land on separate cells', () => {
  const w = sandbox({ seed: 6 });
  placeStructure(w, 'barracks', 0, 8, 8, { buildUp: false });
  const ids = squad(w, 0, ['attackHeli'], 6, 30, 20, 3);
  for (const e of live(w, ids)) e.weapons.forEach((s) => { s.ammo = 0; }); // empty: they head home and land
  assert.equal(run(w, 900, invariants), null);
  const us = live(w, ids);
  assert.ok(us.every((e) => e.landed), 'all landed');
  assert.equal(new Set(us.map((e) => `${e.cx},${e.cy}`)).size, us.length, 'each on its own cell');
});

test('a group of helicopters hovers apart at its destination', () => {
  const w = sandbox({ seed: 7 });
  const ids = squad(w, 0, ['attackHeli', 'transportHeli'], 8, 6, 8, 4);
  order(w, 0, 'move', ids, { x: 36, y: 24 });
  assert.equal(run(w, 600, invariants), null);
  const us = live(w, ids);
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) assert.ok(dist(us[i], us[j]) >= 150, 'apart');
});

test('planes fly their attack runs and keep moving', () => {
  const w = sandbox({ seed: 8 });
  const field = placeStructure(w, 'airfield', 0, 4, 4, { buildUp: false });
  const target = placeStructure(w, 'warFactory', 1, 36, 26, { buildUp: false });
  target.hp = target.maxHp = 1e7;
  const ids = squad(w, 0, ['harrier'], 2, 10, 10, 2);
  order(w, 0, 'attack', ids, { id: target.id });
  assert.equal(run(w, 900, invariants), null);
  assert.ok(target.hp < target.maxHp, 'the runs hit');
  void field;
});
