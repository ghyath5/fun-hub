// Mines: no cap on how many a player has down; they go off on the right enemies only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, squad, order, run, live, invariants, spawnUnit } from './harness.mjs';
import { layMine, canMine, minesOf } from '../src/sim/mines.js';
import { SPECIALS } from '../src/data/rules.js';

test('a player may lay any number of mines (no 50 cap)', () => {
  const w = sandbox({ seed: 1, credits: 100000 });
  const layer = spawnUnit(w, 'mineLayer', 0, 3, 3);
  assert.equal(SPECIALS.minesMaxPerPlayer, Infinity);
  let laid = 0;
  for (let y = 10; y < 30; y++) for (let x = 10; x < 20; x++) if (layMine(w, layer, x, y)) laid++;
  assert.equal(laid, 200);
  assert.equal(minesOf(w, 0), 200);
  assert.ok(canMine(w, 0, 25, 25), 'still allowed after 200');
  assert.ok(!canMine(w, 0, 10, 10), 'but one mine per cell');
});

test('a lay-mines order with more than 50 cells is kept whole', () => {
  const w = sandbox({ seed: 2, credits: 100000 });
  const layer = spawnUnit(w, 'mineLayer', 0, 6, 6);
  const cells = [];
  for (let k = 0; k < 70; k++) cells.push([8 + (k % 10), 8 + Math.floor(k / 10)]);
  order(w, 0, 'layMines', [layer.id], { cells });
  run(w, 2);
  assert.equal(layer.task?.type, 'layMines');
  assert.ok(layer.task.cells.length >= 69, `${layer.task.cells.length} cells queued`);
  assert.equal(run(w, 15 * 120, invariants), null);
  assert.ok(minesOf(w, 0) > 50, `laid ${minesOf(w, 0)}`);
});

test('each mine costs money; a Mine Layer lays as many as are paid for, with no load limit', () => {
  const w = sandbox({ seed: 3, credits: 10000 });
  const layer = spawnUnit(w, 'mineLayer', 0, 6, 6);
  const cells = [];
  for (let k = 0; k < 60; k++) cells.push([10 + (k % 10), 10 + Math.floor(k / 10)]);
  const before = w.players[0].cash + w.players[0].stored;
  order(w, 0, 'layMines', [layer.id], { cells });
  assert.equal(run(w, 15 * 150, invariants), null);
  assert.equal(minesOf(w, 0), 60, 'the whole field');
  assert.equal(before - (w.players[0].cash + w.players[0].stored), 60 * SPECIALS.mineCost, 'paid for each');
  assert.equal(layer.task, null, 'done');
});

test('out of money, the Mine Layer stops and says so', () => {
  const w = sandbox({ seed: 9, credits: SPECIALS.mineCost * 4 + 10 });
  const layer = spawnUnit(w, 'mineLayer', 0, 6, 6);
  const broke = [];
  w.events.on('insufficientFunds', (e) => broke.push(e.data.owner));
  const cells = [];
  for (let k = 0; k < 10; k++) cells.push([10 + k, 10]);
  order(w, 0, 'layMines', [layer.id], { cells });
  assert.equal(run(w, 15 * 40, (wd) => { wd.events.flush(); return invariants(wd); }), null);
  assert.deepEqual(broke, [0], '"Insufficient funds" once');
  assert.equal(minesOf(w, 0), 4, 'laid what it could pay for');
  assert.equal(w.players[0].cash + w.players[0].stored, 10, 'never into debt');
  assert.equal(layer.task, null, 'stopped');
});

test('several Mine Layers share one field side by side', () => {
  const w = sandbox({ seed: 6, credits: 10000 });
  const a = spawnUnit(w, 'mineLayer', 0, 6, 6);
  const b = spawnUnit(w, 'mineLayer', 0, 6, 8);
  const cells = [];
  for (let k = 0; k < 40; k++) cells.push([12 + (k % 8), 12 + Math.floor(k / 8)]);
  order(w, 0, 'layMines', [a.id, b.id], { cells });
  run(w, 1);
  assert.ok(a.task.cells.length === 20 && b.task.cells.length === 20, 'split, not doubled');
  assert.equal(run(w, 15 * 60, invariants), null);
  assert.equal(minesOf(w, 0), 40, 'the whole field');
});

test('shareCells: even runs in pick order, the spare ones to the first layers', async () => {
  const { shareCells } = await import('../src/sim/commands.js');
  const cells = Array.from({ length: 7 }, (_, k) => [k, 0]);
  const parts = shareCells([{ id: 1 }, { id: 2 }, { id: 3 }], cells);
  assert.deepEqual(parts.map(([u, c]) => [u.id, c.map((p) => p[0])]), [[1, [0, 1, 2]], [2, [3, 4]], [3, [5, 6]]]);
  assert.deepEqual(shareCells([{ id: 1 }, { id: 2 }], [[0, 0]]).map(([u]) => u.id), [1], 'one cell, one layer');
});

test('anti-tank mines (coalition) stop enemy vehicles, spare infantry and friends', () => {
  const w = sandbox({ seed: 4 });
  const layer = spawnUnit(w, 'mineLayer', 0, 3, 3);
  for (const x of [20, 21, 22]) layMine(w, layer, x, 12);
  const friend = spawnUnit(w, 'lightTank', 0, 18, 12);
  const foe = spawnUnit(w, 'heavyTank', 1, 18, 14);
  const foot = spawnUnit(w, 'rifleman', 1, 18, 16);
  // Nobody shoots: only the mines may hurt anyone here.
  for (const e of [friend, foe, foot]) e.stance = 'holdFire';
  order(w, 0, 'move', [friend.id], { x: 24, y: 12 });
  run(w, 200);
  assert.ok(!friend.dead && friend.hp === friend.maxHp, 'own tank drives over its mines');
  order(w, 1, 'move', [foot.id], { x: 21, y: 12 });
  run(w, 200);
  assert.ok(foot.hp === foot.maxHp, 'enemy infantry does not set off an anti-tank mine');
  order(w, 1, 'move', [foe.id], { x: 20, y: 12 });
  assert.equal(run(w, 300, invariants), null);
  assert.ok(foe.dead || foe.hp < foe.maxHp, 'enemy tank hit');
});

test('anti-personnel mines (union) hit enemy infantry, not vehicles', () => {
  const w = sandbox({ seed: 5 });
  const layer = spawnUnit(w, 'mineLayer', 1, 50, 40);
  for (const x of [20, 21, 22]) layMine(w, layer, x, 12);
  const tank = spawnUnit(w, 'lightTank', 0, 18, 14);
  const foot = squad(w, 0, ['rifleman'], 1, 18, 12)[0];
  for (const e of [tank, w.entities.get(foot), layer]) e.stance = 'holdFire';
  order(w, 0, 'move', [tank.id], { x: 21, y: 12 });
  run(w, 200);
  assert.equal(tank.hp, tank.maxHp, 'vehicles roll over anti-personnel mines');
  order(w, 0, 'move', [foot], { x: 22, y: 12 });
  assert.equal(run(w, 300, invariants), null);
  const f = w.entities.get(foot);
  assert.ok(!f || f.dead || f.hp < f.maxHp, 'the rifleman stepped on one');
});
