// One scale for units and buildings (src/render/readability.js): the size
// chosen in Settings times a gentle growth as the view zooms out, the same
// for both so a tank never looks as big as a power plant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectScale, zoomBoost, aidStrength, setObjectSize } from '../src/render/readability.js';
import { READABILITY } from '../src/data/ui.js';

test('zoomed in, things are life size times the chosen size; zoomed out they grow gently, never past the cap', () => {
  setObjectSize(1);
  assert.equal(zoomBoost(60), 1);
  assert.equal(objectScale(60), 1);
  const mid = zoomBoost(24);
  assert.ok(mid > 1 && mid < READABILITY.maxZoomBoost, `24 px a cell: ${mid}`);
  assert.equal(zoomBoost(READABILITY.minCellPx), READABILITY.maxZoomBoost);
  let last = 0;
  for (let px = 60; px >= 4; px -= 2) { const b = objectScale(px); assert.ok(b >= last); last = b; }
});

test('the size setting scales units and buildings alike, and unknown sizes fall back to the default', () => {
  setObjectSize(READABILITY.defaultObjectSize);
  assert.equal(objectScale(60), READABILITY.defaultObjectSize, 'a little bigger by default');
  setObjectSize(1.3);
  assert.equal(objectScale(60), 1.3);
  assert.equal(objectScale(READABILITY.minCellPx), 1.3 * READABILITY.maxZoomBoost);
  setObjectSize(1.45); // a size from an older version
  assert.equal(objectScale(60), READABILITY.defaultObjectSize);
  setObjectSize(1);
});

test('the largest drawing stays believable: a 3-wide building overhangs its footprint by under a cell', () => {
  const most = Math.max(...READABILITY.objectSizes) * READABILITY.maxZoomBoost;
  assert.ok(((most - 1) * 3) / 2 < 1, `overhang ${((most - 1) * 3) / 2} cells`);
});

test('team discs fade in as cells shrink', () => {
  assert.equal(aidStrength(40), 0);
  assert.equal(aidStrength(READABILITY.aidFullCellPx), 1);
  const a = aidStrength(18);
  assert.ok(a > 0 && a < 1);
});
