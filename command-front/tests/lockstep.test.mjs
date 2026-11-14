// Two phones in lockstep: a speed change lands on the same tick on both, and the input delay follows it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, step as stepWorld } from './harness.mjs';

const { createNetMatch } = await import('../src/net/netMatch.js');
const { delayTicksFor } = await import('../src/net/lockstep.js');

const SPEEDS = { slow: { ticksPerSecond: 10 }, normal: { ticksPerSecond: 15 }, superFast: { ticksPerSecond: 75 } };

/** Two net matches joined by an in-memory link; each phone records what its sim was given per tick. */
function pair() {
  /** @type {any[]} */ const rooms = [];
  /** @type {any[][]} */ const inbox = [[], []];
  for (const i of [0, 1]) {
    let listener = /** @type {((m: any) => void) | null} */ (null);
    rooms.push({
      role: i === 0 ? 'host' : 'guest', state: 'open',
      send: (/** @type {any} */ m) => inbox[1 - i].push(structuredClone(m)),
      listen: (/** @type {any} */ fn) => { listener = fn; },
      deliver: () => { for (const m of inbox[i].splice(0)) listener?.(m); },
      onState: () => () => {}, onResume: () => () => {}, probe() {},
    });
  }
  const phones = [0, 1].map((i) => {
    const world = sandbox();
    /** @type {string[]} */ const seen = [];
    /** @type {{ tick: number, speed: string }[]} */ const changes = [];
    const net = createNetMatch({
      room: rooms[i], me: i, them: 1 - i, speeds: SPEEDS, speed: 'normal', epoch: 0, startTick: 0,
      step: (/** @type {any} */ w) => { for (const c of w.queue) seen.push(`${w.tick}:${c.playerId}:${c.type}`); stepWorld(w); },
      onDesync: () => assert.fail('desync'), onResyncAsked: () => {},
    });
    net.onSpeed((speed) => changes.push({ tick: world.tick, speed }));
    return { world, seen, net, changes, room: rooms[i] };
  });
  /** Run both phones until they have each stepped `ticks` more ticks. */
  const run = (/** @type {number} */ ticks) => {
    const goal = phones[0].world.tick + ticks;
    for (let guard = 0; guard < ticks * 20 && phones.some((p) => p.world.tick < goal); guard++) {
      for (const p of phones) { p.room.deliver(); if (p.world.tick < goal && p.net.ready(p.world)) p.net.step(p.world); }
    }
    assert.ok(phones.every((p) => p.world.tick === goal), `both phones reach tick ${goal} (no stall)`);
  };
  const stop = () => phones.forEach((p) => p.net.destroy());
  return { phones, run, stop };
}

for (const [from, to] of [['normal', 'superFast'], ['superFast', 'slow']]) {
  test(`speed ${from} → ${to}: same tick on both phones, no stall, commands keep their order`, (t) => {
    const { phones, run, stop } = pair();
    t.after(stop);
    const [a, b] = phones;
    if (from !== 'normal') { a.net.setSpeed(from); run(40); }
    a.changes.length = b.changes.length = 0;

    b.net.setSpeed(to);
    a.net.submit({ type: 'move', entityIds: [1], target: { x: 1, y: 1 } });
    run(5);
    // Orders given right around the change must not be lost or doubled.
    for (let k = 0; k < 30; k++) { a.net.submit({ type: 'stop', entityIds: [1], target: null }); b.net.submit({ type: 'scatter', entityIds: [2], target: null }); run(1); }
    run(3 * delayTicksFor(SPEEDS.superFast.ticksPerSecond));

    assert.deepEqual(a.changes, b.changes, 'the change is applied at the same tick');
    assert.equal(a.changes.length, 1);
    assert.equal(a.changes[0].speed, to);
    assert.deepEqual(a.seen, b.seen, 'both sims were given the same commands on the same ticks');
    assert.equal(a.seen.filter((s) => s.endsWith(':stop')).length, 30);
    assert.equal(a.seen.filter((s) => s.endsWith(':scatter')).length, 30);
    assert.ok(!a.seen.some((s) => s.endsWith(':speed')), 'the speed request never reaches the sim');
  });
}

test('an unknown speed is ignored', (t) => {
  const { phones, run, stop } = pair();
  t.after(stop);
  phones[0].net.setSpeed('warp');
  run(20);
  assert.equal(phones[0].changes.length + phones[1].changes.length, 0);
});
