// Balance: every building's toughness comes from one rule (price and size),
// bases take a real siege to fall, units of the same job on either side are
// an even fight, and every gun tower holds against what it is built to stop
// yet falls to its counter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRUCTURES, durability } from '../src/data/structures.js';
import { duel, siege } from '../tools/balance/fight.mjs';

test('every building is as tough as its price and size say', () => {
  for (const s of Object.values(STRUCTURES)) {
    if (s.role === 'neutral' || s.wall || s.id === 'constructionYard') continue;
    assert.equal(s.hp, durability(s.cost, s.w, s.h, s.armor === 'concrete'), s.id);
  }
  // The yard is an unfolded MCV: as tough as a 3000-credit 3×3 building, the toughest in the base.
  assert.equal(STRUCTURES.constructionYard.hp, durability(3000, 3, 3));
  const base = Object.values(STRUCTURES).filter((s) => s.role !== 'neutral' && !s.wall);
  assert.ok(base.every((s) => s.hp <= STRUCTURES.constructionYard.hp));
});

test('a base takes a real siege: 4000 credits need over 20 s for a yard, not a few seconds', () => {
  for (const unit of ['mediumTank', 'heavyTank', 'grenadier', 'artillery', 'ballisticLauncher', 'arcTank']) {
    const r = siege(unit, 'constructionYard');
    assert.ok(r.seconds !== null && r.seconds >= 20, `${unit}: ${r.seconds}s`);
  }
  // …but buildings are not forts: a power plant still falls inside a minute.
  const r = siege('mediumTank', 'powerPlant');
  assert.ok(r.seconds !== null && r.seconds < 60, `power plant: ${r.seconds}s`);
});

test('units with the same job on either side are an even fight at equal cost', () => {
  for (const [a, b] of [['lightTank', 'robotTank'], ['heavyTank', 'tankDestroyer'], ['laserTank', 'arcTank']]) {
    const r = duel(a, b);
    assert.ok(Math.max(r.aLeft, r.bLeft) <= 0.4, `${a} vs ${b}: ${r.aLeft} / ${r.bLeft}`);
  }
});

test('gun towers hold against what they are built to stop and fall to their counter', () => {
  const cost = (/** @type {string} */ b) => STRUCTURES[b].cost;
  for (const [unit, tower] of [['rifleman', 'pillbox'], ['rifleman', 'sentryGun'], ['lightTank', 'gunTurret'], ['mediumTank', 'beamTower'], ['heavyTank', 'arcTower'], ['mediumTank', 'longGun']]) {
    assert.equal(siege(unit, tower, cost(tower) * 1.5).seconds, null, `${tower} holds against 1.5× its price in ${unit}`);
  }
  for (const [unit, tower] of [['mediumTank', 'pillbox'], ['artillery', 'gunTurret'], ['mediumTank', 'beamTower'], ['heavyTank', 'arcTower'], ['mediumTank', 'longGun']]) {
    assert.notEqual(siege(unit, tower, cost(tower) * 3).seconds, null, `${tower} falls to 3× its price in ${unit}`);
  }
});
