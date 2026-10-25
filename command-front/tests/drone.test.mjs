// Terror Drones: they leap inside enemy vehicles and shred them from within.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, order, run, invariants, spawnUnit, placeStructure, hashWorld, TPS } from './harness.mjs';
import { snapshot, restore } from '../src/save/serialize.js';
import { detonate } from '../src/sim/systems/projectiles.js';

/** Run until `done()` or `limit` ticks; returns the tick it happened at (-1 if not), failing on a broken invariant. */
function until(w, limit, done) {
  for (let t = 0; t < limit; t++) {
    const bad = run(w, 1, invariants);
    assert.equal(bad, null);
    if (done()) return t;
  }
  return -1;
}

test('a drone gets inside a tank that is shooting at it and destroys it from within', () => {
  const w = sandbox({ seed: 1 });
  const drone = spawnUnit(w, 'terrorDrone', 1, 10, 10);
  const tank = spawnUnit(w, 'heavyTank', 0, 16, 10);
  order(w, 1, 'attack', [drone.id], { id: tank.id });
  const inAt = until(w, 10 * TPS, () => !!tank.infested);
  assert.ok(inAt >= 0, 'got in');
  assert.equal(drone.inside, tank.id);
  assert.equal(w.occ.veh[drone.cy * w.map.width + drone.cx], tank.id, 'the drone holds no cell of its own');
  const hp = drone.hp;
  const deadAt = until(w, 15 * TPS, () => tank.dead || !w.entities.get(tank.id));
  assert.ok(deadAt >= 0, 'the tank is destroyed');
  assert.ok(deadAt < 8 * TPS, `in ${(deadAt / TPS).toFixed(1)} s`);
  assert.ok(!w.entities.get(drone.id), 'the drone goes down with it');
  assert.ok(hp > 0);
});

test('nothing can shoot a drone inside; splash does not reach it', () => {
  const w = sandbox({ seed: 2 });
  const drone = spawnUnit(w, 'terrorDrone', 1, 10, 10);
  const host = spawnUnit(w, 'harvester', 0, 12, 10);
  const guard = spawnUnit(w, 'rifleman', 0, 13, 12);
  order(w, 1, 'attack', [drone.id], { id: host.id });
  assert.ok(until(w, 8 * TPS, () => !!host.infested) >= 0, 'in');
  const hp = drone.hp;
  // Told to shoot the drone inside, a rifleman cannot; a blast on the harvester does not reach it either.
  order(w, 0, 'attack', [guard.id], { id: drone.id });
  detonate(w, { weapon: 'mirageGun', tx: host.x, ty: host.y, target: host.id, direct: true, shooter: 0, owner: 0 });
  run(w, 2 * TPS, invariants);
  assert.equal(drone.hp, hp, 'untouchable inside');
  assert.ok(host.hp < host.maxHp, 'chewing');
});

test('a Service Depot cuts the drone out and the vehicle lives', () => {
  const w = sandbox({ seed: 3, credits: 5000 });
  placeStructure(w, 'powerPlant', 0, 4, 4, { buildUp: false });
  const depot = placeStructure(w, 'serviceDepot', 0, 20, 20, { buildUp: false });
  const tank = spawnUnit(w, 'titanTank', 0, 21, 24);
  tank.stance = 'holdFire';
  const drone = spawnUnit(w, 'terrorDrone', 1, 25, 25);
  order(w, 1, 'attack', [drone.id], { id: tank.id });
  assert.ok(until(w, 8 * TPS, () => !!tank.infested) >= 0, 'in');
  order(w, 0, 'depot', [tank.id], { id: depot.id });
  const outAt = until(w, 10 * TPS, () => !tank.infested);
  assert.ok(outAt >= 0, 'cut out');
  assert.ok(tank.hp > 0, `still ${tank.hp} hp`);
  assert.ok(!w.entities.get(drone.id), 'the drone is destroyed');
  assert.ok(!tank.dead && w.entities.get(tank.id), 'the tank survived');
  assert.equal(w.players[0].stats.unitsKilled, 1, 'the depot gets the kill');
});

test('other drones leave an infested vehicle and go for the next one', () => {
  const w = sandbox({ seed: 4 });
  const a = spawnUnit(w, 'terrorDrone', 1, 10, 10);
  const b = spawnUnit(w, 'terrorDrone', 1, 10, 12);
  const t1 = spawnUnit(w, 'lightTank', 0, 14, 11);
  const t2 = spawnUnit(w, 'lightTank', 0, 13, 14);
  t1.stance = t2.stance = 'holdFire';
  assert.ok(until(w, 12 * TPS, () => !!t1.infested && !!t2.infested) >= 0, 'one drone in each tank');
  assert.notEqual(t1.infested, t2.infested);
  assert.deepEqual([a.inside, b.inside].sort(), [t1.id, t2.id].sort());
});

test('drones claw infantry but cannot get into infantry, aircraft, ships or buildings', () => {
  const w = sandbox({ seed: 5 });
  const drone = spawnUnit(w, 'terrorDrone', 1, 10, 10);
  const man = spawnUnit(w, 'rifleman', 0, 13, 10);
  man.stance = 'holdFire';
  order(w, 1, 'attack', [drone.id], { id: man.id });
  assert.ok(until(w, 8 * TPS, () => !w.entities.get(man.id)) >= 0, 'the rifleman is killed');
  assert.ok(!drone.inside, 'and the drone stays out');
  const yard = placeStructure(w, 'powerPlant', 0, 20, 20, { buildUp: false });
  order(w, 1, 'attack', [drone.id], { id: yard.id });
  run(w, 5 * TPS, invariants);
  assert.equal(yard.hp, yard.maxHp, 'buildings are safe');
});

test('saved mid-chew, the game loads and plays on the same', () => {
  const w = sandbox({ seed: 6 });
  const drone = spawnUnit(w, 'terrorDrone', 1, 10, 10);
  const tank = spawnUnit(w, 'mediumTank', 0, 15, 10);
  order(w, 1, 'attack', [drone.id], { id: tank.id });
  assert.ok(until(w, 8 * TPS, () => !!tank.infested) >= 0, 'in');
  run(w, TPS);
  const back = restore(JSON.parse(JSON.stringify(snapshot(w))));
  assert.equal(hashWorld(back), hashWorld(w), 'same state after loading');
  run(w, 3 * TPS);
  run(back, 3 * TPS, invariants);
  assert.equal(hashWorld(back), hashWorld(w), 'and plays the same');
  assert.ok(back.entities.get(tank.id).hp < tank.maxHp);
});

test('a host taken over by the drone\'s side lets the drone climb out', async () => {
  const { infestSystem } = await import('../src/sim/infest.js');
  const w = sandbox({ seed: 7 });
  const drone = spawnUnit(w, 'terrorDrone', 1, 10, 10);
  const tank = spawnUnit(w, 'lightTank', 0, 13, 10);
  tank.stance = 'holdFire';
  order(w, 1, 'attack', [drone.id], { id: tank.id });
  assert.ok(until(w, 8 * TPS, () => !!tank.infested) >= 0, 'in');
  tank.owner = 1; // as if mind-controlled by the drone's side
  infestSystem(w);
  assert.equal(drone.inside, 0, 'out again');
  assert.equal(tank.infested, 0);
  assert.equal(run(w, TPS, invariants), null);
});
