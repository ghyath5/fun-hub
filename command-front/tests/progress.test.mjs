// The loading line's model: tasks, tracked waits and downloads with progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTask, track, fetchBytes, onProgress } from '../src/lib/progress.js';

test('tasks start and end; the line is active while any is running', async () => {
  const seen = [];
  const stop = onProgress((s) => seen.push(s.active));
  const a = startTask();
  const b = startTask();
  a.end();
  b.progress(0.5);
  b.end();
  b.end(); // ending twice is harmless
  await track(Promise.resolve(1));
  stop();
  assert.deepEqual(seen, [false, true, true, true, true, false, true, false]);
});

test('a tracked wait ends even when it fails', async () => {
  let active = null;
  const stop = onProgress((s) => { active = s.active; });
  await assert.rejects(track(Promise.reject(new Error('no'))));
  assert.equal(active, false);
  stop();
});

test('a download reports how far it has got, by its stated size', async () => {
  const chunks = [new Uint8Array(40).fill(1), new Uint8Array(60).fill(2)];
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); },
  }), { headers: { 'content-length': '100' } });
  const fractions = [];
  const stop = onProgress((s) => { for (const t of s.tasks) if (t.fraction !== null) fractions.push(t.fraction); });
  try {
    const buf = await fetchBytes('models.bin');
    assert.equal(buf.byteLength, 100);
    assert.equal(new Uint8Array(buf)[99], 2);
    assert.deepEqual(fractions, [0.4, 1]);
  } finally {
    globalThis.fetch = real;
    stop();
  }
});

test('a download whose stated size is wrong still arrives whole', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array(30).fill(7)); c.enqueue(new Uint8Array(30).fill(8)); c.close(); },
  }), { headers: { 'content-length': '40' } });
  try {
    const buf = await fetchBytes('x');
    assert.equal(buf.byteLength, 60);
    assert.equal(new Uint8Array(buf)[59], 8);
  } finally {
    globalThis.fetch = real;
  }
});

test('the line creeps for unmeasured waits but never shows done early', async () => {
  const { fractionOf } = await import('../src/ui/loadingBar.js');
  const t0 = 1000;
  const unmeasured = { weight: 1, fraction: null, started: t0 };
  assert.equal(fractionOf([unmeasured], t0), 0);
  assert.ok(fractionOf([unmeasured], t0 + 2500) > 0.5);
  assert.ok(fractionOf([unmeasured], t0 + 1e6) <= 0.95);
  const download = { weight: 4, fraction: 0.5, started: t0 };
  assert.ok(Math.abs(fractionOf([download], t0) - 0.5) < 1e-9);
  assert.equal(fractionOf([], t0), 1);
});
