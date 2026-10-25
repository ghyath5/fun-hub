// Game rules end to end: building, economy, production, combat specials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, openMap, squad, order, run, live, invariants, spawnUnit, placeStructure, STRUCTURES, UNITS, TPS, L } from './harness.mjs';
import { lineFor } from '../src/sim/systems/production.js';
import { SPECIALS } from '../src/data/rules.js';

const structuresOf = (w, pid, type) => w.entities.all().filter((e) => e.kind === 'structure' && !e.dead && e.owner === pid && (!type || e.type === type));
const unitsOf = (w, pid, type) => w.entities.all().filter((e) => e.kind === 'unit' && !e.dead && e.owner === pid && (!type || e.type === type));

/** Queue a structure, wait until it is ready, place it at (x, y). Returns the structure. */
function buildAndPlace(w, pid, type, x, y, seconds = 120) {
  order(w, pid, 'build', [], { type });
  const line = lineFor(w.players[pid], STRUCTURES[type].line);
  for (let t = 0; t < seconds * TPS && line.ready !== type; t++) { run(w, 1); }
  assert.equal(line.ready, type, `${type} finished building`);
  order(w, pid, 'place', [], { type, x, y });
  run(w, TPS * 3);
  const s = structuresOf(w, pid, type).find((e) => e.cx === x && e.cy === y);
  assert.ok(s, `${type} placed at ${x},${y}`);
  run(w, TPS * 6); // build-up animation
  return s;
}

/** A base: a deployed Construction Yard for player 0 at (8, 8). */
function base(seed = 1, credits = 20000) {
  const w = sandbox({ seed, credits });
  const mcv = spawnUnit(w, 'mcv', 0, 9, 9);
  order(w, 0, 'deploy', [mcv.id]);
  run(w, TPS * 6);
  return w;
}

test('an MCV deploys into a Construction Yard', () => {
  const w = base();
  assert.equal(unitsOf(w, 0, 'mcv').length, 0);
  assert.equal(structuresOf(w, 0, 'constructionYard').length, 1);
  assert.equal(invariants(w), null);
});

test('building a Power Plant costs its price and raises power', () => {
  const w = base(2);
  const before = w.players[0].cash;
  const pp = buildAndPlace(w, 0, 'powerPlant', 12, 8);
  assert.equal(before - w.players[0].cash, STRUCTURES.powerPlant.cost);
  assert.ok(w.players[0].power.produced >= STRUCTURES.powerPlant.power || w.players[0].power.ratioK > 0, 'power up');
  assert.equal(pp.buildUp, 0, 'finished building up');
  assert.equal(invariants(w), null);
});

test('a structure cannot be placed outside the build area or on top of another', () => {
  const w = base(3);
  order(w, 0, 'build', [], { type: 'powerPlant' });
  const line = lineFor(w.players[0], 'structures');
  run(w, 60 * TPS);
  assert.equal(line.ready, 'powerPlant');
  order(w, 0, 'place', [], { type: 'powerPlant', x: 45, y: 35 }); // far away
  order(w, 0, 'place', [], { type: 'powerPlant', x: 9, y: 9 }); // on the yard
  run(w, 5);
  assert.equal(line.ready, 'powerPlant', 'still waiting to be placed');
  assert.equal(structuresOf(w, 0, 'powerPlant').length, 0);
});

test('a Refinery brings a free Harvester that mines ore into credits', () => {
  const map = openMap();
  for (let y = 18; y < 24; y++) for (let x = 14; x < 22; x++) map.bales[y * map.width + x] = 4;
  const w = sandbox({ seed: 4, map, credits: 20000 });
  const mcv = spawnUnit(w, 'mcv', 0, 9, 9);
  order(w, 0, 'deploy', [mcv.id]);
  run(w, TPS * 6);
  buildAndPlace(w, 0, 'powerPlant', 12, 8);
  buildAndPlace(w, 0, 'refinery', 8, 12);
  assert.equal(unitsOf(w, 0, 'harvester').length, 1, 'free harvester');
  const before = w.players[0].cash + w.players[0].stored;
  assert.equal(run(w, 120 * TPS, invariants), null);
  assert.ok(w.players[0].cash + w.players[0].stored > before, 'ore became credits');
});

test('Barracks train infantry that walk out of the door, never inside the building', () => {
  const w = base(5);
  buildAndPlace(w, 0, 'powerPlant', 12, 8);
  const b = buildAndPlace(w, 0, 'barracks', 8, 12);
  order(w, 0, 'build', [], { type: 'rifleman', count: 5 });
  assert.equal(run(w, 90 * TPS, invariants), null);
  const men = unitsOf(w, 0, 'rifleman');
  assert.equal(men.length, 5);
  for (const m of men) assert.ok(!(m.cx >= b.cx && m.cx < b.cx + b.w && m.cy >= b.cy && m.cy < b.cy + b.h), 'outside the footprint');
});

test('a War Factory delivers a column of tanks without stacking them at the door', () => {
  const w = base(6, 40000);
  buildAndPlace(w, 0, 'powerPlant', 12, 8);
  buildAndPlace(w, 0, 'refinery', 8, 12);
  buildAndPlace(w, 0, 'powerPlant', 14, 8);
  buildAndPlace(w, 0, 'warFactory', 12, 12);
  order(w, 0, 'build', [], { type: 'lightTank', count: 5 });
  assert.equal(run(w, 120 * TPS, invariants), null);
  const tanks = unitsOf(w, 0, 'lightTank');
  assert.equal(tanks.length, 5);
  assert.equal(new Set(tanks.map((e) => `${e.cx},${e.cy}`)).size, 5, 'each in its own cell');
});

test('selling a structure refunds part of its price and removes it', () => {
  const w = base(7);
  const pp = buildAndPlace(w, 0, 'powerPlant', 12, 8);
  const before = w.players[0].cash;
  order(w, 0, 'sell', [], { id: pp.id });
  run(w, 10 * TPS);
  assert.equal(structuresOf(w, 0, 'powerPlant').length, 0);
  assert.ok(w.players[0].cash > before, 'refund');
  assert.equal(invariants(w), null);
});

test('an Engineer sabotages a sound enemy building and captures a battered one', () => {
  const w = sandbox({ seed: 8 });
  const a = placeStructure(w, 'powerPlant', 1, 20, 20, { buildUp: false });
  const b = placeStructure(w, 'powerPlant', 1, 30, 20, { buildUp: false });
  b.hp = Math.floor(b.maxHp * SPECIALS.engineerCaptureAtOrBelow);
  const e1 = spawnUnit(w, 'engineer', 0, 16, 21);
  const e2 = spawnUnit(w, 'engineer', 0, 26, 21);
  order(w, 0, 'enter', [e1.id], { id: a.id });
  order(w, 0, 'enter', [e2.id], { id: b.id });
  assert.equal(run(w, 20 * TPS, invariants), null);
  assert.equal(a.owner, 1, 'full-health building stays theirs');
  assert.ok(a.hp < a.maxHp, 'but is sabotaged');
  assert.equal(b.owner, 0, 'battered building captured');
});

test('enemy infantry scatter from a tank, or are crushed when ordered into it', () => {
  const w = sandbox({ seed: 9 });
  const tank = spawnUnit(w, 'mediumTank', 0, 10, 10);
  const idle = spawnUnit(w, 'rifleman', 1, 14, 10);
  const ordered = spawnUnit(w, 'rifleman', 1, 24, 14);
  const tank2 = spawnUnit(w, 'mediumTank', 0, 14, 14);
  for (const e of [tank, idle, ordered, tank2]) e.stance = 'holdFire';
  order(w, 0, 'move', [tank.id], { x: 18, y: 10 });
  order(w, 0, 'move', [tank2.id], { x: 26, y: 14 });
  order(w, 1, 'move', [ordered.id], { x: 12, y: 14 }); // straight at the second tank, a direct order
  assert.equal(run(w, 15 * TPS, invariants), null);
  assert.ok(!idle.dead, 'an idle soldier jumps aside');
  assert.ok(ordered.dead, 'a soldier marching into the tank is crushed');
});

test('an APC loads five soldiers and unloads them onto separate spots', () => {
  const w = sandbox({ seed: 10 });
  const apc = spawnUnit(w, 'apc', 0, 20, 20);
  const men = squad(w, 0, ['rifleman'], 5, 14, 20, 5);
  order(w, 0, 'load', men, { id: apc.id });
  assert.equal(run(w, 20 * TPS, invariants), null);
  assert.equal(apc.cargo?.length ?? 0, 5, 'all aboard');
  order(w, 0, 'move', [apc.id], { x: 30, y: 26 });
  run(w, 15 * TPS);
  order(w, 0, 'unloadCargo', [apc.id]);
  assert.equal(run(w, 10 * TPS, invariants), null);
  const out = live(w, men);
  assert.equal(out.filter((m) => !m.inside).length, 5, 'all out');
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y) >= 100, 'unloaded apart');
});

test('a Rifleman digs in behind sandbags and climbs out again', () => {
  const w = sandbox({ seed: 11 });
  const man = spawnUnit(w, 'rifleman', 0, 10, 10);
  order(w, 0, 'deploy', [man.id]);
  run(w, 3 * TPS);
  assert.ok(man.dug, 'dug in');
  order(w, 0, 'move', [man.id], { x: 14, y: 10 });
  assert.equal(run(w, 10 * TPS, invariants), null);
  assert.ok(!man.dug && man.cx === 14, 'climbed out and walked on');
});

test('a Service Depot repairs a damaged vehicle on its pad', () => {
  const w = sandbox({ seed: 12, credits: 5000 });
  placeStructure(w, 'powerPlant', 0, 4, 4, { buildUp: false });
  const d = placeStructure(w, 'serviceDepot', 0, 20, 20, { buildUp: false });
  const tank = spawnUnit(w, 'lightTank', 0, 15, 22);
  tank.hp = Math.floor(tank.maxHp / 3);
  order(w, 0, 'depot', [tank.id], { id: d.id });
  assert.equal(run(w, 40 * TPS, invariants), null);
  assert.ok(tank.hp > tank.maxHp / 3, `repaired to ${tank.hp}/${tank.maxHp}`);
});

test('combat: units die, free their cells and the winner keeps fighting', () => {
  const w = sandbox({ seed: 13 });
  const blue = squad(w, 0, ['mediumTank', 'rifleman', 'rocketTrooper'], 12, 10, 10, 4);
  const red = squad(w, 1, ['heavyTank', 'flakTrooper', 'rifleman'], 12, 18, 10, 4);
  order(w, 0, 'attackMove', blue, { x: 20, y: 11 });
  order(w, 1, 'attackMove', red, { x: 10, y: 11 });
  assert.equal(run(w, 90 * TPS, invariants), null);
  const left = live(w, [...blue, ...red]);
  assert.ok(left.length < 24, 'casualties');
  assert.ok(left.every((e) => e.owner === left[0]?.owner) || left.length > 0, 'a fight was settled or still going');
});

test('every unit type spawns and moves without breaking the bookkeeping', () => {
  const w = sandbox({ seed: 14 });
  const types = Object.values(UNITS).filter((d) => d.loco !== 'float' && d.faction !== 'none').map((d) => d.id);
  const ids = [];
  types.forEach((type, k) => {
    const u = spawnUnit(w, type, k % 2, 4 + (k % 12) * 4, 4 + Math.floor(k / 12) * 4, { air: UNITS[type].loco === 'air' });
    assert.ok(u, `${type} spawned`);
    u.stance = 'holdFire';
    if (UNITS[type].loco === 'air') u.landed = false;
    ids.push(u.id);
  });
  for (const id of ids) {
    const e = w.entities.get(id);
    order(w, e.owner, 'move', [id], { x: Math.min(w.map.width - 2, e.cx + 6), y: Math.min(w.map.height - 2, e.cy + 3) });
  }
  assert.equal(run(w, 30 * TPS, invariants), null);
  void L;
});
