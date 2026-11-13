// Placing a READY structure where friendly units stand: it waits for them to clear, and is built at most once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, placeStructure, spawnUnit, order, run, step } from './harness.mjs';

const TYPE = 'powerPlant';
const SPOT = { x: 14, y: 10 };
const OTHER_SPOT = { x: 20, y: 10 };

const credits = (w) => w.players[0].cash + w.players[0].stored;
const built = (w) => w.entities.all().filter((e) => e.type === TYPE && !e.dead).length;

/** A base with a Power Plant READY and one of the player's own units standing on each spot. */
function readyWithUnitsInTheWay() {
  const w = sandbox({ credits: 5000 });
  placeStructure(w, 'constructionYard', 0, 10, 10, { buildUp: false });
  run(w, 5);
  const start = credits(w);
  order(w, 0, 'build', [], { type: TYPE, count: 1 });
  for (let t = 0; t < 3000 && w.players[0].lines.structures?.ready !== TYPE; t++) step(w);
  assert.equal(w.players[0].lines.structures.ready, TYPE);
  spawnUnit(w, 'rifleman', 0, SPOT.x + 1, SPOT.y + 1);
  spawnUnit(w, 'rifleman', 0, OTHER_SPOT.x + 1, OTHER_SPOT.y + 1);
  return { w, start };
}

const placeAt = (w, spot) => { order(w, 0, 'place', [], { type: TYPE, ...spot }); step(w); };

test('a placement that waits for friendly units is built once they clear', () => {
  const { w, start } = readyWithUnitsInTheWay();
  placeAt(w, SPOT);
  assert.equal(w.pendingPlacements.length, 1);
  run(w, 60);
  assert.equal(built(w), 1);
  assert.ok(credits(w) < start, 'the structure was paid for');
});

test('cancelling the READY item while its placement waits refunds it and builds nothing', () => {
  const { w, start } = readyWithUnitsInTheWay();
  placeAt(w, SPOT);
  order(w, 0, 'cancelReady', [], { line: 'structures' });
  run(w, 60);
  assert.equal(credits(w), start, 'refunded in full');
  assert.equal(built(w), 0, 'and not built as well');
  assert.equal(w.pendingPlacements.length, 0);
});

test('one READY item placed on two waiting spots is built once', () => {
  const { w } = readyWithUnitsInTheWay();
  placeAt(w, SPOT);
  placeAt(w, OTHER_SPOT);
  run(w, 60);
  assert.equal(built(w), 1);
});
