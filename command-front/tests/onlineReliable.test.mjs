// Online play: messages between two players arrive once and in order over lossy, repeating, reordering paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReliable } from '../src/net/online/reliable.js';
import { lagFor } from '../src/data/online.js';

/** Two ends joined by a wire the test controls. `fate(frame, from)` decides what happens to each frame. */
function wire(fate = (/** @type {any} */ _f, /** @type {number} */ _from) => /** @type {'pass' | 'drop' | 'twice' | 'hold'} */ ('pass')) {
  /** @type {any[][]} */ const got = [[], []];
  /** @type {{ to: number, f: any }[]} */ let held = [];
  /** @type {any[]} */ const ends = [];
  let time = 0;
  for (const i of [0, 1]) {
    ends.push(createReliable({
      transmit: (f) => {
        const what = fate(f, i);
        const copy = structuredClone(f);
        if (what === 'drop') return;
        if (what === 'hold') { held.push({ to: 1 - i, f: copy }); return; }
        ends[1 - i].receive(copy);
        if (what === 'twice') ends[1 - i].receive(structuredClone(copy));
      },
      deliver: (m) => got[i].push(m),
      resendMs: 1000, ackMs: 100,
    }));
  }
  return {
    a: ends[0], b: ends[1], got,
    pass: (/** @type {number} */ ms) => { for (let t = 0; t < ms; t += 50) { time += 50; ends[0].tick(time); ends[1].tick(time); } },
    /** Deliver the held frames, in the order given by `order` (default: reversed). */
    release: (order = (/** @type {any[]} */ h) => h.reverse()) => { const h = order(held); held = []; for (const x of h) ends[x.to].receive(x.f); },
  };
}

test('messages arrive once, in order, and are acknowledged', () => {
  const w = wire();
  for (let i = 1; i <= 5; i++) w.a.send({ n: i });
  w.b.send('hello');
  assert.deepEqual(w.got[1], [1, 2, 3, 4, 5].map((n) => ({ n })));
  assert.deepEqual(w.got[0], ['hello']);
  assert.equal(w.a.pending, 0, "b's own message carried the acknowledgement");
  w.pass(200);
  assert.equal(w.b.pending, 0, 'a acknowledged on its own once nothing else was going out');
});

test('lost frames are sent again after the resend time', () => {
  let losing = true;
  const w = wire((f, from) => (losing && from === 0 && f.s ? 'drop' : 'pass'));
  w.a.send('one');
  w.a.send('two');
  assert.deepEqual(w.got[1], []);
  losing = false;
  w.pass(900);
  assert.deepEqual(w.got[1], [], 'not before the resend time');
  w.pass(200);
  assert.deepEqual(w.got[1], ['one', 'two']);
  w.pass(300);
  assert.equal(w.a.pending, 0);
});

test('a flush resends at once (the path changed)', () => {
  let losing = true;
  const w = wire((f, from) => (losing && from === 0 ? 'drop' : 'pass'));
  w.a.send('x');
  losing = false;
  w.a.flush();
  assert.deepEqual(w.got[1], ['x']);
});

test('repeats are delivered once and re-acknowledged', () => {
  const w = wire((f, from) => (from === 0 && f.s ? 'twice' : 'pass'));
  w.a.send(1);
  w.a.send(2);
  w.a.flush();
  assert.deepEqual(w.got[1], [1, 2]);
  w.pass(200);
  assert.equal(w.a.pending, 0);
});

test('frames that arrive out of order are delivered in order', () => {
  const w = wire((f, from) => (from === 0 ? 'hold' : 'pass'));
  for (let i = 1; i <= 6; i++) w.a.send(i);
  w.release();
  assert.deepEqual(w.got[1], [1, 2, 3, 4, 5, 6]);
});

test('a lost acknowledgement does not cause a second delivery', () => {
  let dropAcks = true;
  const w = wire((f, from) => (dropAcks && from === 1 ? 'drop' : 'pass'));
  w.a.send('once');
  w.pass(1200); // a resends; b has it already
  dropAcks = false;
  w.pass(1200);
  assert.deepEqual(w.got[1], ['once']);
  assert.equal(w.a.pending, 0);
});

test('a random bad link still delivers everything, once, in order, both ways', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const w = wire(() => { const r = rnd(); return r < 0.3 ? 'drop' : r < 0.45 ? 'twice' : r < 0.65 ? 'hold' : 'pass'; });
  const N = 300;
  for (let i = 0; i < N; i++) {
    w.a.send(i);
    if (i % 3 === 0) w.b.send(-i);
    if (i % 7 === 0) w.release((h) => h.sort(() => rnd() - 0.5));
    if (i % 5 === 0) w.pass(400);
  }
  for (let i = 0; i < 200 && (w.a.pending || w.b.pending); i++) { w.pass(1100); w.release(); }
  assert.deepEqual(w.got[1], Array.from({ length: N }, (_, i) => i));
  assert.deepEqual(w.got[0], Array.from({ length: N / 3 }, (_, i) => -i * 3));
  assert.equal(w.a.pending + w.b.pending, 0);
});

test('nonsense frames are ignored', () => {
  const w = wire();
  for (const junk of [null, 'x', 5, {}, { s: 'a' }, { a: 99 }, { s: -1, m: 1 }, { s: 1.5, m: 1 }]) w.b.receive(junk);
  w.a.send('real');
  assert.deepEqual(w.got[1], ['real']);
});

test('input delay grows with the round trip, within bounds, in steps both players agree on', () => {
  assert.equal(lagFor(20), 0.2);
  assert.equal(lagFor(160), 0.2);
  assert.equal(lagFor(300), 0.3);
  assert.equal(lagFor(5000), 0.6);
  assert.equal(lagFor(null), 0.3);
  for (let rtt = 0; rtt < 1200; rtt += 7) {
    const lag = lagFor(rtt);
    assert.ok(lag >= rtt / 2000 || lag === 0.6, `covers half of ${rtt} ms`);
    assert.equal(Math.round(lag * 20), lag * 20);
  }
});
