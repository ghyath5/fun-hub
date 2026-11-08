// Touch gestures: pinch, two-finger box select, one-finger pan, long-press box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecognizer } from '../src/input/gestures.js';

/** A recognizer that records the gestures it emits. */
function recorder() {
  const out = [];
  const rec = createRecognizer((g) => out.push(g));
  const types = () => out.map((g) => g.type);
  return { rec, out, types };
}

/** Two fingers down at a and b, up again without moving. */
function twoFingerTap(rec, t, a = [100, 100], b = [140, 140]) {
  rec.down({ id: 1, x: a[0], y: a[1], t });
  rec.down({ id: 2, x: b[0], y: b[1], t: t + 20 });
  rec.up({ id: 1, x: a[0], y: a[1], t: t + 90 });
  rec.up({ id: 2, x: b[0], y: b[1], t: t + 100 });
}

test('a plain two-finger touch pinches and never draws a box', () => {
  const { rec, types } = recorder();
  rec.down({ id: 1, x: 100, y: 100, t: 0 });
  rec.down({ id: 2, x: 140, y: 140, t: 20 });
  rec.move({ id: 2, x: 220, y: 220, t: 60 });
  rec.up({ id: 1, x: 100, y: 100, t: 200 });
  rec.up({ id: 2, x: 220, y: 220, t: 210 });
  assert.ok(types().includes('pinchStart') && types().includes('pinchMove'));
  assert.ok(!types().some((t) => t.startsWith('box')));
});

test('two-finger tap, then two fingers spread: a box between the fingertips', () => {
  const { rec, out, types } = recorder();
  twoFingerTap(rec, 0);
  const before = out.length;
  rec.down({ id: 3, x: 200, y: 200, t: 250 });
  rec.down({ id: 4, x: 210, y: 210, t: 260 });
  rec.move({ id: 3, x: 120, y: 130, t: 300 });
  rec.move({ id: 4, x: 400, y: 380, t: 320 });
  rec.up({ id: 4, x: 400, y: 380, t: 400 });
  rec.up({ id: 3, x: 120, y: 130, t: 410 });
  const second = types().slice(before);
  assert.deepEqual(second, ['boxStart', 'boxMove', 'boxMove', 'boxEnd']);
  const end = out.at(-1);
  assert.deepEqual([end.x0, end.y0, end.x, end.y], [120, 130, 400, 380]);
  assert.equal(rec.state, 'idle');
});

test('the second two-finger touch too late is a pinch again', () => {
  const { rec, out, types } = recorder();
  twoFingerTap(rec, 0);
  const before = out.length;
  rec.down({ id: 3, x: 200, y: 200, t: 1000 });
  rec.down({ id: 4, x: 210, y: 210, t: 1010 });
  rec.move({ id: 4, x: 300, y: 300, t: 1050 });
  assert.ok(!types().slice(before).some((t) => t.startsWith('box')));
  assert.equal(rec.state, 'pinch');
});

test('a two-finger zoom (fingers moved) does not arm the box', () => {
  const { rec, out, types } = recorder();
  rec.down({ id: 1, x: 100, y: 100, t: 0 });
  rec.down({ id: 2, x: 140, y: 140, t: 20 });
  rec.move({ id: 2, x: 200, y: 200, t: 60 });
  rec.up({ id: 1, x: 100, y: 100, t: 90 });
  rec.up({ id: 2, x: 200, y: 200, t: 100 });
  const before = out.length;
  rec.down({ id: 3, x: 200, y: 200, t: 250 });
  rec.down({ id: 4, x: 210, y: 210, t: 260 });
  assert.ok(!types().slice(before).some((t) => t.startsWith('box')));
});

test('one finger still pans; a cancelled two-finger box hides itself', () => {
  const { rec, types } = recorder();
  rec.down({ id: 1, x: 100, y: 100, t: 0 });
  rec.move({ id: 1, x: 160, y: 100, t: 50 });
  rec.up({ id: 1, x: 160, y: 100, t: 80 });
  assert.deepEqual(types(), ['panStart', 'panEnd']);
  twoFingerTap(rec, 1000);
  rec.down({ id: 3, x: 200, y: 200, t: 1200 });
  rec.down({ id: 4, x: 210, y: 210, t: 1210 });
  rec.cancel();
  assert.ok(types().includes('boxCancel'));
  assert.equal(rec.state, 'idle');
});
