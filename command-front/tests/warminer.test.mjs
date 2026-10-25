// The Union's harvester (Red Alert 2's War Miner) carries a machine gun and uses it while it works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, openMap, order, run, invariants, spawnUnit, placeStructure, TPS } from './harness.mjs';
import { weaponsOf } from '../src/sim/targeting.js';
import { snapshot, restore } from '../src/save/serialize.js';

/** Union (player 1) with a Refinery beside an ore field, and a harvester at work. */
function oreBase(seed) {
  const map = openMap();
  for (let y = 18; y < 24; y++) for (let x = 24; x < 30; x++) map.bales[y * map.width + x] = 6;
  const w = sandbox({ seed, map, credits: 0 });
  placeStructure(w, 'powerPlant', 1, 34, 12, { buildUp: false });
  placeStructure(w, 'refinery', 1, 33, 16, { buildUp: false });
  const h = spawnUnit(w, 'harvester', 1, 31, 20);
  return { w, h };
}

test('only the Union harvester is armed', () => {
  const w = sandbox({ seed: 1 });
  const c = spawnUnit(w, 'harvester', 0, 5, 5);
  const u = spawnUnit(w, 'harvester', 1, 9, 9);
  assert.deepEqual(weaponsOf(c), []);
  assert.deepEqual(weaponsOf(u), ['minerGun']);
  assert.equal(u.weapons.length, 1);
});

test('it shoots infantry that come near while it keeps harvesting, without chasing them', () => {
  const { w, h } = oreBase(2);
  for (let t = 0; t < 20 * TPS && h.harv.state !== 'harvesting'; t++) run(w, 1);
  assert.equal(h.harv.state, 'harvesting', 'at work');
  const raider = spawnUnit(w, 'rifleman', 0, h.cx - 3, h.cy);
  raider.stance = 'holdFire';
  const states = new Set();
  let far = 0;
  const ok = run(w, 12 * TPS, (wd) => {
    states.add(h.harv.state);
    const d = Math.max(Math.abs(h.cx - 27), Math.abs(h.cy - 21));
    far = Math.max(far, d);
    return invariants(wd);
  });
  assert.equal(ok, null);
  assert.ok(!w.entities.get(raider.id), 'the rifleman is shot dead');
  assert.ok(far <= 8, 'it never left its work to chase');
  assert.ok(h.harv.auto, 'still on automatic');
  assert.ok(h.harv.ore + h.harv.gem > 0 || w.players[1].cash + w.players[1].stored > 0, 'and it kept mining');
});

test('it fires on the move, its turret turning to the target', () => {
  const w = sandbox({ seed: 6 });
  const h = spawnUnit(w, 'harvester', 1, 10, 10);
  const man = spawnUnit(w, 'rifleman', 0, 16, 13);
  man.stance = 'holdFire';
  order(w, 1, 'move', [h.id], { x: 26, y: 10 });
  let movingShots = 0;
  w.events.on('shot', (e) => { if (e.data.shooter === h.id && h.next) movingShots++; });
  assert.equal(run(w, 25 * TPS, (wd) => { wd.events.flush(); return invariants(wd); }), null);
  assert.ok(movingShots > 0, `${movingShots} shots while driving`);
  assert.ok(!w.entities.get(man.id) || man.hp < man.maxHp, 'hit him');
  assert.equal(h.cx, 26, 'and drove on to where it was sent');
});

test('it does not go after enemies out of its reach', () => {
  const { w, h } = oreBase(3);
  run(w, 8 * TPS);
  const raider = spawnUnit(w, 'rifleman', 0, h.cx - 8, h.cy);
  raider.stance = 'holdFire';
  run(w, 6 * TPS, invariants);
  assert.equal(raider.hp, raider.maxHp, 'left alone');
  assert.notEqual(h.target, raider.id);
});

test('ordered to attack, it fights like any unit', () => {
  const { w, h } = oreBase(4);
  const raider = spawnUnit(w, 'rifleman', 0, 18, 20);
  raider.stance = 'holdFire';
  order(w, 1, 'attack', [h.id], { id: raider.id });
  assert.equal(run(w, 25 * TPS, invariants), null);
  assert.ok(!w.entities.get(raider.id), 'hunted down');
});

test('a captured War Miner keeps its gun, through a save and load', () => {
  const w = sandbox({ seed: 5 });
  const u = spawnUnit(w, 'harvester', 1, 9, 9);
  u.owner = 0;
  const back = restore(JSON.parse(JSON.stringify(snapshot(w))));
  assert.deepEqual(weaponsOf(back.entities.get(u.id)), ['minerGun']);
});
