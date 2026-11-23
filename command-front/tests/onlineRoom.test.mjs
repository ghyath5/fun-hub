// Online play end to end without a network: two lobby clients and their rooms against the real hub,
// joined by in-memory sockets the test can cut. Covers listing, joining, relaying, drops and resumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHub } from '../server/hub.js';
import { createLobbyClient, LobbyError } from '../src/net/online/lobbyClient.js';
import { openOnlineRoom } from '../src/net/online/room.js';

/** Fast timings so drops and resends happen within a test. */
const FAST = { connectTimeoutMs: 300, backoffMs: [20, 40], pingMs: 50, silenceMs: 200, probeMs: 100, requestTimeoutMs: 400, resendMs: 150, ackMs: 20, peerPingMs: 60, giveUpMs: 600 };

/** A hub and a WebSocket look-alike wired to it. `net.cut()` kills every socket; `net.up = false` refuses new ones. */
function network(config = {}) {
  const hub = createHub({ config: { graceMs: 2000, listFlushMs: 5, ...config } });
  /** @type {Set<any>} */ const sockets = new Set();
  const net = {
    hub, up: true,
    /** Sockets vanish without a close handshake reaching the client (a dead network). */
    blackhole: false,
    cut(/** @type {(s: any) => boolean} */ which = () => true) { for (const s of [...sockets]) if (which(s)) s.die(); },
    WebSocket: class {
      /** @param {string} url */
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        /** @type {any} */ this.onopen = null; /** @type {any} */ this.onmessage = null; /** @type {any} */ this.onclose = null; /** @type {any} */ this.onerror = null;
        /** @type {any} */ this.session = null;
        sockets.add(this);
        queueMicrotask(() => {
          if (this.readyState !== 0) return;
          if (!net.up) { this.die(); return; }
          this.session = hub.connect({ send: (/** @type {string} */ text) => queueMicrotask(() => { if (this.readyState === 1) this.onmessage?.({ data: text }); }), close: (/** @type {number} */ code) => this.die(code) });
          this.readyState = 1;
          this.onopen?.();
        });
      }
      /** @param {string} text */
      send(text) { if (this.readyState === 1 && !net.blackhole) queueMicrotask(() => this.session?.message(text)); }
      close() { this.die(1000); }
      /** @param {number} [code] */
      die(code = 1006) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        sockets.delete(this);
        this.session?.closed();
        if (!net.blackhole) queueMicrotask(() => this.onclose?.({ code }));
      }
    },
  };
  return net;
}

/** @param {ReturnType<typeof network>} net @param {string} name */
const player = (net, name, build = 7) => createLobbyClient({ urls: ['ws://test'], name, build, WebSocketImpl: net.WebSocket, timing: FAST });

/** Wait until `fn` is truthy. @param {() => any} fn @param {string} what */
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(5); }
  assert.fail(`timed out waiting for: ${what}`);
}

/** A host and a guest in one lobby, each with a room collecting what it receives. */
async function paired(t, config = {}) {
  const net = network(config);
  const a = player(net, 'Amal');
  const b = player(net, 'Bashir');
  await until(() => a.state === 'online' && b.state === 'online', 'both online');
  const { lobby } = await a.host({ name: 'Test game', public: true, info: { map: 'Duel Canyon', ais: 1 } });
  const host = openOnlineRoom({ client: a, role: 'host', peer: null, RTC: null, timing: FAST });
  const joined = await b.join(lobby.id);
  const guest = openOnlineRoom({ client: b, role: 'guest', peer: joined.peer, RTC: null, timing: FAST });
  /** @type {any[]} */ const hostGot = []; /** @type {any[]} */ const guestGot = [];
  host.listen((m) => hostGot.push(m));
  guest.listen((m) => guestGot.push(m));
  t.after(() => { host.close(); guest.close(); a.close(); b.close(); });
  await until(() => host.state === 'open' && guest.state === 'open', 'rooms open');
  return { net, a, b, host, guest, hostGot, guestGot, lobby };
}

test('the lobby list and the head-count reach a browsing player', async (t) => {
  const net = network();
  const a = player(net, 'Amal');
  const b = player(net, 'Bashir');
  t.after(() => { a.close(); b.close(); });
  await until(() => b.state === 'online' && a.state === 'online', 'online');
  b.subscribe(true);
  const { lobby } = await a.host({ name: 'Open game', public: true, info: { map: 'Twin Rivers', ais: 0 } });
  await until(() => b.lobbies.length === 1, 'the lobby is listed');
  assert.equal(b.lobbies[0].id, lobby.id);
  assert.equal(b.lobbies[0].host, 'Amal');
  assert.equal(b.lobbies[0].players, 1);
  assert.equal(b.online, 2);
  const c = player(net, 'Camil');
  t.after(() => c.close());
  await until(() => b.online === 3, 'the head-count follows');
});

test('requests fail with the server\'s reason', async (t) => {
  const net = network();
  const a = player(net, 'Amal');
  const b = player(net, 'Bashir', 8);
  t.after(() => { a.close(); b.close(); });
  await until(() => a.state === 'online' && b.state === 'online', 'online');
  await assert.rejects(b.join('NOPE1'), (e) => e instanceof LobbyError && e.code === 'gone');
  await assert.rejects(b.quick(), (e) => e instanceof LobbyError && e.code === 'none');
  const { lobby } = await a.host({ name: 'x', public: true, info: {} });
  await assert.rejects(b.join(lobby.id), (e) => e instanceof LobbyError && e.code === 'build' && e.detail.build === 7);
});

test('messages and blobs cross the relay both ways, in order', async (t) => {
  const { host, guest, hostGot, guestGot } = await paired(t);
  assert.equal(host.peer?.name, 'Bashir');
  assert.equal(guest.peer?.name, 'Amal');
  for (let i = 0; i < 50; i++) { host.send({ k: 'b', t: i }); guest.send({ k: 'x', i }); }
  /** @type {Uint8Array | null} */ let blob = null;
  guest.onBlob((kind, bytes) => { if (kind === 'sync') blob = bytes; });
  const big = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 31) & 255);
  host.sendBlob('sync', big);
  await until(() => guestGot.length === 50 && hostGot.length === 50 && blob, 'everything delivered');
  assert.deepEqual(guestGot.map((m) => m.t), Array.from({ length: 50 }, (_, i) => i));
  assert.deepEqual(hostGot.map((m) => m.i), Array.from({ length: 50 }, (_, i) => i));
  assert.deepEqual(blob, big);
  await until(() => host.stats().rtt !== null && guest.stats().rtt !== null, 'round trip measured');
  assert.equal(host.stats().path, 'relay');
});

test('a dropped connection: the room goes down, comes back by itself, and nothing sent meanwhile is lost or repeated', async (t) => {
  const { net, b, host, guest, guestGot, hostGot } = await paired(t);
  /** @type {string[]} */ const hostStates = []; /** @type {string[]} */ const guestStates = [];
  host.onState((s) => hostStates.push(s));
  guest.onState((s) => guestStates.push(s));
  let hostResumed = 0; let guestResumed = 0;
  host.onResume(() => hostResumed++);
  guest.onResume(() => guestResumed++);

  host.send({ n: 1 });
  await until(() => guestGot.length === 1, 'first message');
  // The guest's network dies and stays dead for a while.
  net.up = false;
  net.cut((s) => isGuestSocket(net, s, b));
  await until(() => guest.state === 'down' && host.state === 'down', 'both see the drop');
  host.send({ n: 2 });
  host.send({ n: 3 });
  guest.send({ n: 'g1' });
  await sleep(120);
  net.up = true;
  await until(() => guest.state === 'open' && host.state === 'open', 'both recover');
  await until(() => guestGot.length === 3 && hostGot.length === 1, 'held messages arrive');
  await sleep(400); // any stray resend would show up as a repeat
  assert.deepEqual(guestGot.map((m) => m.n), [1, 2, 3]);
  assert.deepEqual(hostGot.map((m) => m.n), ['g1']);
  assert.deepEqual(hostStates, ['down', 'open']);
  assert.deepEqual(guestStates, ['down', 'open']);
  assert.equal(hostResumed, 1);
  assert.equal(guestResumed, 1);
});

/** Is this fake socket the one `client` is using? (The clients do not expose theirs; the hub's head-count tells.) */
function isGuestSocket(net, sock, client) {
  // Probe: mark by sending a ping through the client and seeing which socket carries it.
  let hit = false;
  const real = sock.send.bind(sock);
  sock.send = (/** @type {string} */ text) => { hit = true; real(text); };
  client.send({ t: 'ping', n: -1 });
  sock.send = real;
  return hit;
}

test('a network that dies silently is noticed by the heartbeat', async (t) => {
  const { net, host, guest, guestGot } = await paired(t);
  net.blackhole = true; // sockets stay "open" but nothing moves
  await until(() => host.state === 'down' && guest.state === 'down', 'silence is noticed', 2000);
  host.send({ n: 'late' });
  net.blackhole = false;
  net.cut(); // the dead sockets finally go; the clients are already reconnecting
  await until(() => host.state === 'open' && guest.state === 'open', 'recovered');
  await until(() => guestGot.length === 1, 'the held message arrives');
  assert.equal(guestGot[0].n, 'late');
});

test('with no way back the room gives up, and still recovers if the link returns later', async (t) => {
  const { net, host, guest, guestGot } = await paired(t);
  net.up = false;
  net.cut();
  await until(() => host.state === 'gone' && guest.state === 'gone', 'both give up', 3000);
  host.send({ n: 'after' });
  net.up = true;
  host.retry();
  guest.retry();
  await until(() => host.state === 'open' && guest.state === 'open', 'recovered after giving up');
  await until(() => guestGot.some((m) => m.n === 'after'), 'message delivered');
});

test('a guest who leaves says goodbye; the host can wait for the next one', async (t) => {
  const { net, a, host, guest, hostGot, lobby } = await paired(t);
  guest.close();
  await until(() => hostGot.some((m) => m.k === 'bye'), 'goodbye received');
  host.reopen();
  assert.equal(host.state, 'pairing');
  assert.equal(host.peer, null);
  await sleep(600); // the server's own notice arrives late and must not disturb the waiting host
  assert.equal(host.state, 'pairing');

  const c = player(net, 'Camil');
  t.after(() => c.close());
  await until(() => c.state === 'online', 'third player online');
  /** @type {any[]} */ const seen = [];
  host.onPeer((p) => seen.push(p?.name));
  const joined = await c.join(lobby.id);
  const next = openOnlineRoom({ client: c, role: 'guest', peer: joined.peer, RTC: null, timing: FAST });
  t.after(() => next.close());
  /** @type {any[]} */ const nextGot = [];
  next.listen((m) => nextGot.push(m));
  await until(() => host.state === 'open', 'host paired again');
  assert.deepEqual(seen, ['Camil']);
  host.send({ hello: 'again' });
  await until(() => nextGot.length === 1, 'fresh stream with the new guest');
  assert.equal(a.state, 'online');
});

test('a host who leaves closes the lobby for the guest', async (t) => {
  const { host, guest, guestGot } = await paired(t);
  host.close();
  await until(() => guest.state === 'gone', 'guest sees the room end');
  assert.equal(guestGot.filter((m) => m.k === 'bye').length, 1, 'one goodbye, not two');
});

test('a player who vanishes for longer than the server holds the seat is reported gone', async (t) => {
  const { net, b, host, hostGot } = await paired(t, { graceMs: 150 });
  b.close(); // no goodbye, no leave: the tab just closed
  net.cut((s) => isGuestSocket(net, s, b));
  await until(() => host.state === 'gone', 'host told the guest is gone', 3000);
  assert.ok(hostGot.some((m) => m.k === 'bye' && m.reason === 'timeout'));
});

test('a seat the server no longer holds is reported gone after reconnecting', async (t) => {
  const { net, host, guest } = await paired(t, { graceMs: 100 });
  net.up = false;
  net.cut();
  await sleep(300); // longer than the server keeps seats
  net.up = true;
  await until(() => host.state === 'gone' && guest.state === 'gone', 'both learn their seats are gone', 3000);
});

test('with no server configured the client stays offline and says so', async (t) => {
  const c = createLobbyClient({ urls: [], name: 'x', build: 1, timing: FAST });
  t.after(() => c.close());
  await sleep(20);
  assert.equal(c.state, 'offline');
  assert.equal(c.unconfigured, true);
  await assert.rejects(c.quick(), (e) => e instanceof LobbyError && e.code === 'offline');
});
