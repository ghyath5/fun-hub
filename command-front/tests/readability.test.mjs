// Reading the battle on a small screen: units grow as the view zooms out; attack spots and the arrows to them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unitBoost, aidStrength, setObjectSize, buildingSize } from '../src/render/readability.js';
import { createThreats } from '../src/ui/threats.js';
import { THREATS, READABILITY } from '../src/data/ui.js';

test('units are life size close up, grow as cells shrink, and never past the cap', () => {
  setObjectSize(1);
  assert.equal(unitBoost('track', 60), 1);
  assert.equal(unitBoost('foot', 60), 1);
  const mid = unitBoost('track', 20);
  assert.ok(mid > 1 && mid < READABILITY.maxBoost.vehicle, `vehicles at 20 px a cell: ${mid}`);
  assert.equal(unitBoost('track', 5), READABILITY.maxBoost.vehicle);
  assert.equal(unitBoost('foot', 5), READABILITY.maxBoost.infantry);
  assert.ok(unitBoost('foot', 20) > unitBoost('track', 20), 'soldiers grow more: they are the smallest');
  let last = 0;
  for (let px = 60; px >= 4; px -= 2) { const b = unitBoost('wheel', px); assert.ok(b >= last); last = b; }
});

test('the size chosen in Settings scales units fully and buildings partly, within limits', () => {
  setObjectSize(READABILITY.defaultObjectSize);
  assert.equal(unitBoost('track', 60), READABILITY.defaultObjectSize, 'a little bigger by default');
  assert.ok(buildingSize() > 1 && buildingSize() < READABILITY.defaultObjectSize);
  setObjectSize(1.45);
  assert.equal(unitBoost('foot', 60), 1.45);
  assert.equal(buildingSize(), READABILITY.maxBuildingSize, 'buildings stay near their footprint');
  setObjectSize(7);
  assert.equal(unitBoost('track', 60), READABILITY.defaultObjectSize, 'an unknown size falls back to the default');
  setObjectSize(1);
  assert.equal(buildingSize(), 1);
});

test('team marks fade in only when zoomed out', () => {
  assert.equal(aidStrength(READABILITY.aidFromCellPx + 5), 0);
  assert.equal(aidStrength(READABILITY.aidFullCellPx - 1), 1);
  const m = aidStrength((READABILITY.aidFromCellPx + READABILITY.aidFullCellPx) / 2);
  assert.ok(m > 0.3 && m < 0.7);
});

test('attack spots: nearby hits join one spot, far ones make another, and they fade', () => {
  let now = 0;
  const th = createThreats(() => now);
  const a = th.hit({ x: 10, y: 10 }, 'harvester');
  now = 500;
  const b = th.hit({ x: 12, y: 11 }, 'base');
  assert.equal(a, b, 'joined');
  assert.equal(a.kind, 'base', 'the base outranks a harvester');
  assert.deepEqual([a.x, a.y], [12, 11], 'follows the latest hit');
  now = 900;
  th.hit({ x: 40, y: 40 }, 'base');
  assert.equal(th.active().length, 2);
  assert.deepEqual([th.latest().x, th.latest().y], [40, 40], 'newest first');
  now = 500 + THREATS.holdMs + 1;
  assert.deepEqual(th.active().map((s) => s.x), [40], 'the first spot went quiet');
  now = 900 + THREATS.holdMs + 1;
  assert.equal(th.latest(), null);
});

test('arrows sit on the edge of the view, pointing at fights off screen only', async () => {
  // threatArrows.js touches the DOM only when created; arrowPlace is pure.
  const { arrowPlace } = await import('../src/ui/threatArrows.js');
  const area = { x0: 0, y0: 40, x1: 800, y1: 400 };
  const inset = { x: 30, y: 30 };
  assert.equal(arrowPlace({ x: 400, y: 200 }, area, inset), null, 'in view: no arrow');
  const right = arrowPlace({ x: 2000, y: 220 }, area, inset);
  assert.ok(Math.abs(right.x - 770) < 1e-6 && right.y > 200 && right.y < 240, JSON.stringify(right));
  assert.ok(Math.abs(right.angle) < 0.1, 'points right');
  const up = arrowPlace({ x: 400, y: -500 }, area, inset);
  assert.ok(Math.abs(up.y - 70) < 1e-6 && Math.abs(up.x - 400) < 1e-6);
  assert.ok(Math.abs(up.angle + Math.PI / 2) < 1e-6, 'points up');
  assert.equal(arrowPlace({ x: 10, y: 45 }, area, inset), null, 'in view by the edge: the glow shows it');
  const corner = arrowPlace({ x: -900, y: 900 }, area, { x: 64, y: 32 });
  assert.ok(corner.x >= 64 - 1e-6 && corner.y <= 368 + 1e-6, 'stays clear of the sides');
});
