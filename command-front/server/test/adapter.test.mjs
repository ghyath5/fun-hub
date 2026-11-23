// The lobby server over real sockets, using the game's own client: the Node adapter always, and the
// Cloudflare Worker too when WORKER_URL points at one (`npm run dev:worker`, then WORKER_URL=ws://localhost:8787).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startServer } from '../node.mjs';
import { createLobbyClient } from '../../src/net/online/lobbyClient.js';
import { openOnlineRoom } from '../../src/net/online/room.js';

const FAST = { connectTimeoutMs: 600, backoffMs: [50, 100], pingMs: 200, silenceMs: 1500, resendMs: 300, ackMs: 30, peerPingMs: 150 };
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(10); }
  assert.fail(`timed out waiting for: ${what}`);
}

/** @param {string} label @param {() => Promise<{ ws: string, http: string, stop: () => Promise<any>, drop?: () => void }>} boot */
function suite(label, boot) {
  test(`${label}: two players meet, relay both ways, survive a cut, and the head-count is served over http`, async (t) => {
    const srv = await boot();
    const a = createLobbyClient({ urls: [srv.ws], name: 'Amal', build: 59, timing: FAST });
    const b = createLobbyClient({ urls: ['ws://127.0.0.1:1', srv.ws], name: 'Bashir', build: 59, timing: FAST }); // first address is dead: the client moves on
    t.after(async () => { a.close(); b.close(); await srv.stop(); });
    await until(() => a.state === 'online' && b.state === 'online', 'both online');

    b.subscribe(true);
    const { lobby } = await a.host({ name: 'Real sockets', public: true, info: { map: 'Duel Canyon', ais: 1, speed: 'normal', credits: 5000 } });
    await until(() => b.lobbies.some((l) => l.id === lobby.id), 'listed');
    const stats = await (await fetch(`${srv.http}/stats`)).json();
    assert.equal(stats.open >= 1 && stats.online >= 2, true);

    const host = openOnlineRoom({ client: a, role: 'host', peer: null, RTC: null, timing: FAST });
    const seat = await b.quick();
    assert.equal(seat.lobby.id, lobby.id);
    const guest = openOnlineRoom({ client: b, role: 'guest', peer: seat.peer, RTC: null, timing: FAST });
    /** @type {any[]} */ const hostGot = []; /** @type {any[]} */ const guestGot = [];
    host.listen((m) => hostGot.push(m));
    guest.listen((m) => guestGot.push(m));
    t.after(() => { host.close(); guest.close(); });
    await until(() => host.state === 'open' && guest.state === 'open', 'paired');

    for (let i = 0; i < 100; i++) { host.send({ i }); guest.send({ i: -i }); }
    const blob = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 7) & 255);
    /** @type {Uint8Array | null} */ let gotBlob = null;
    guest.onBlob((_k, bytes) => { gotBlob = bytes; });
    host.sendBlob('sync', blob);
    await until(() => guestGot.length === 100 && hostGot.length === 100 && gotBlob, 'all delivered');
    assert.deepEqual(guestGot.map((m) => m.i), Array.from({ length: 100 }, (_, i) => i));
    assert.deepEqual(gotBlob, blob);

    if (srv.drop) {
      srv.drop();
      host.send({ i: 'during' });
      await until(() => guestGot.at(-1)?.i === 'during', 'a message sent across a cut still arrives');
      await until(() => host.state === 'open' && guest.state === 'open', 'both back');
      assert.equal(guestGot.filter((m) => m.i === 'during').length, 1);
    }
    await until(() => host.stats().rtt !== null, 'round trip measured');
  });
}

suite('node', async () => {
  const s = await startServer({ port: 0, quiet: true });
  return { ws: `ws://127.0.0.1:${s.port}`, http: `http://127.0.0.1:${s.port}`, stop: s.close, drop: s.dropAll };
});

test('node: a page from another site is refused when origins are set', async (t) => {
  const s = await startServer({ port: 0, quiet: true, origins: ['https://funhub.super-dar.com'] });
  t.after(() => s.close());
  const outcome = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
    ws.onopen = () => resolve('open');
    ws.onerror = () => resolve('refused');
  });
  assert.equal(outcome, 'refused');
});

if (process.env.WORKER_URL) {
  const ws = process.env.WORKER_URL;
  suite('cloudflare worker', async () => ({ ws, http: ws.replace(/^ws/, 'http'), stop: async () => {} }));
}
