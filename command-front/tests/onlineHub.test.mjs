// The online lobby hub: head-count, the lobby list, joining, quick match, relaying, held seats and limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub, PROTOCOL, CLOSE, cleanText } from '../server/hub.js';

/** A hub on a hand-wound clock. */
function world(config = {}) {
  let time = 1_000_000;
  /** @type {{ at: number, fn: () => void, dead?: boolean }[]} */ const timers = [];
  const hub = createHub({
    now: () => time,
    setTimer: (fn, ms) => { const t = { at: time + ms, fn }; timers.push(t); return t; },
    clearTimer: (t) => { if (t) t.dead = true; },
    config,
  });
  /** Let `ms` pass, firing what falls due in order. */
  const pass = (/** @type {number} */ ms) => {
    const end = time + ms;
    for (;;) {
      const due = timers.filter((t) => !t.dead && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.dead = true;
      time = due.at;
      due.fn();
    }
    time = end;
  };
  /** A player's socket. */
  const socket = (hello = {}, ip = '') => {
    /** @type {any[]} */ const got = [];
    /** @type {any} */ let session = null;
    const conn = { ip, closed: /** @type {number | null} */ (null), send: (/** @type {string} */ s) => got.push(JSON.parse(s)), close: (/** @type {number} */ code) => { conn.closed = code ?? 1000; session?.closed(); } };
    session = hub.connect(conn);
    const say = (/** @type {any} */ m) => session?.message(JSON.stringify(m));
    if (hello !== null) say({ t: 'hello', v: PROTOCOL, name: 'P', build: 7, ...hello });
    return {
      conn, got, say, session,
      /** The last message of a type. */
      last: (/** @type {string} */ t) => got.findLast((m) => m.t === t),
      all: (/** @type {string} */ t) => got.filter((m) => m.t === t),
      hangUp: () => session?.closed(),
      get me() { const w = got.find((m) => m.t === 'welcome'); return { id: w.id, token: w.token }; },
    };
  };
  return { hub, pass, socket };
}

test('a hello is welcomed with an identity and the head-count', () => {
  const { hub, socket } = world();
  const a = socket({ name: 'Amal' });
  const b = socket({ name: 'Bashir' });
  assert.equal(a.last('welcome').resumed, false);
  assert.equal(b.last('welcome').online, 2);
  assert.notEqual(a.me.id, b.me.id);
  assert.equal(hub.stats().online, 2);
  b.hangUp();
  assert.equal(hub.stats().online, 1);
});

test('a socket that never says hello is closed; another protocol version is refused', () => {
  const { pass, socket } = world();
  const quiet = socket(null);
  pass(11_000);
  assert.equal(quiet.conn.closed, CLOSE.hello);
  const old = socket({ v: PROTOCOL + 1 });
  assert.equal(old.last('error').code, 'version');
  assert.equal(old.conn.closed, CLOSE.protocol);
});

test('hosted lobbies are listed to subscribers with players and the head-count', () => {
  const { pass, socket } = world();
  const host = socket({ name: 'Amal' });
  const watcher = socket({ name: 'Wael' });
  watcher.say({ t: 'list' });
  assert.deepEqual(watcher.last('lobbies').list, []);
  host.say({ t: 'host', name: 'Desert duel', info: { map: 'Duel Canyon', ais: 2, speed: 'normal', credits: 5000 } });
  const id = host.last('hosted').lobby.id;
  assert.match(id, /^[A-HJ-NP-Z2-9]{5}$/);
  pass(300);
  const view = watcher.last('lobbies');
  assert.equal(view.online, 2);
  assert.equal(view.list.length, 1);
  assert.deepEqual(
    { ...view.list[0] },
    { id, name: 'Desert duel', host: 'Amal', players: 1, max: 2, build: 7, state: 'open', public: true, map: 'Duel Canyon', ais: 2, speed: 'normal', credits: 5000 },
  );
});

test('a private lobby is not listed and not offered by quick match, but its link still joins', () => {
  const { pass, socket } = world();
  const host = socket();
  host.say({ t: 'host', name: 'Friends', public: false });
  const id = host.last('hosted').lobby.id;
  const other = socket();
  other.say({ t: 'list' });
  pass(300);
  assert.equal(other.last('lobbies').list.length, 0);
  other.say({ t: 'quick' });
  assert.equal(other.last('error').code, 'none');
  other.say({ t: 'join', id: id.toLowerCase() });
  assert.equal(other.last('joined').lobby.id, id);
});

test('joining seats the guest, tells the host, and fills the lobby', () => {
  const { pass, socket } = world();
  const host = socket({ name: 'Amal' });
  host.say({ t: 'host', name: 'G' });
  const id = host.last('hosted').lobby.id;
  const guest = socket({ name: 'Bashir' });
  guest.say({ t: 'join', id });
  assert.equal(guest.last('joined').peer.name, 'Amal');
  assert.equal(host.last('peer-joined').peer.name, 'Bashir');
  const third = socket();
  third.say({ t: 'join', id });
  assert.equal(third.last('error').code, 'full');
  third.say({ t: 'list' });
  pass(300);
  assert.equal(third.last('lobbies').list[0].players, 2);
  third.say({ t: 'join', id: 'ZZZZZ' });
  assert.equal(third.last('error').code, 'gone');
});

test('only the same build may join; quick match skips other builds', () => {
  const { socket } = world();
  const host = socket({ build: 7 });
  host.say({ t: 'host' });
  const newer = socket({ build: 8 });
  newer.say({ t: 'join', id: host.last('hosted').lobby.id });
  assert.deepEqual({ ...newer.last('error') }, { t: 'error', code: 'build', build: 7 });
  newer.say({ t: 'quick' });
  assert.equal(newer.last('error').code, 'none');
});

test('quick match seats the player in the lobby that has waited longest', () => {
  const { pass, socket } = world();
  const first = socket();
  first.say({ t: 'host', name: 'first' });
  pass(1000);
  const second = socket();
  second.say({ t: 'host', name: 'second' });
  const a = socket();
  a.say({ t: 'quick' });
  assert.equal(a.last('joined').lobby.name, 'first');
  const b = socket();
  b.say({ t: 'quick' });
  assert.equal(b.last('joined').lobby.name, 'second');
  const c = socket();
  c.say({ t: 'quick' });
  assert.equal(c.last('error').code, 'none');
});

test('relay and signalling go to the other player only, untouched', () => {
  const { socket } = world();
  const host = socket();
  host.say({ t: 'host' });
  const guest = socket();
  guest.say({ t: 'join', id: host.last('hosted').lobby.id });
  const stranger = socket();
  host.say({ t: 'relay', d: { s: 1, m: { k: 'form', deep: [1, 2, { x: 'y' }] } } });
  guest.say({ t: 'sig', d: { k: 'answer', sdp: 'v=0' } });
  assert.deepEqual(guest.last('relay').d, { s: 1, m: { k: 'form', deep: [1, 2, { x: 'y' }] } });
  assert.deepEqual(host.last('sig').d, { k: 'answer', sdp: 'v=0' });
  assert.equal(stranger.all('relay').length + stranger.all('sig').length, 0);
  // Nobody to relay to: dropped quietly.
  stranger.say({ t: 'relay', d: 1 });
});

test('a guest leaving reopens the lobby; the host leaving closes it', () => {
  const { pass, socket } = world();
  const host = socket();
  host.say({ t: 'host' });
  const id = host.last('hosted').lobby.id;
  const guest = socket();
  guest.say({ t: 'join', id });
  host.say({ t: 'info', state: 'playing' });
  guest.say({ t: 'leave' });
  assert.deepEqual({ ...host.last('peer-left') }, { t: 'peer-left', reason: 'left', closed: false });
  const next = socket();
  next.say({ t: 'join', id });
  assert.ok(next.last('joined'), 'the seat is free again and the lobby open');
  host.say({ t: 'leave' });
  assert.equal(next.last('peer-left').closed, true);
  next.say({ t: 'list' });
  pass(300);
  assert.equal(next.last('lobbies').list.length, 0);
  next.say({ t: 'host' });
  assert.ok(next.last('hosted'), 'a player whose lobby closed can host');
});

test('a lobby being played is listed as full and cannot be joined', () => {
  const { socket } = world();
  const host = socket();
  host.say({ t: 'host' });
  host.say({ t: 'info', state: 'playing' });
  const other = socket();
  other.say({ t: 'join', id: host.last('hosted').lobby.id });
  assert.equal(other.last('error').code, 'full');
});

test('a dropped socket keeps its seat: the peer is told, and the same identity takes it back', () => {
  const { hub, pass, socket } = world();
  const host = socket({ name: 'Amal' });
  host.say({ t: 'host', name: 'G' });
  const id = host.last('hosted').lobby.id;
  const guest = socket({ name: 'Bashir' });
  guest.say({ t: 'join', id });
  const { id: gid, token } = guest.me;

  guest.hangUp();
  assert.ok(host.last('peer-away'));
  assert.equal(hub.stats().online, 1);
  pass(30_000);
  host.say({ t: 'relay', d: 'lost while away' }); // dropped: the client's own layer resends

  const back = socket({ name: 'Bashir', id: gid, token });
  const w = back.last('welcome');
  assert.equal(w.resumed, true);
  assert.equal(w.id, gid);
  assert.equal(w.role, 'guest');
  assert.equal(w.lobby.id, id);
  assert.deepEqual(w.peer, { name: 'Amal', away: false });
  assert.ok(host.last('peer-back'));
  host.say({ t: 'relay', d: 'after' });
  assert.equal(back.last('relay').d, 'after');
  assert.equal(guest.all('relay').length, 0);
});

test('a wrong token is a new player, not a resume', () => {
  const { socket } = world();
  const host = socket();
  host.say({ t: 'host' });
  const thief = socket({ id: host.me.id, token: 'guess' });
  assert.equal(thief.last('welcome').resumed, false);
  assert.notEqual(thief.me.id, host.me.id);
});

test('a newer socket with the same identity replaces the old one without losing the seat', () => {
  const { hub, socket } = world();
  const host = socket();
  host.say({ t: 'host' });
  const again = socket({ ...host.me });
  assert.equal(host.conn.closed, CLOSE.replaced);
  assert.equal(again.last('welcome').role, 'host');
  assert.equal(hub.stats().online, 1);
  assert.equal(hub.stats().games, 1);
});

test('a seat not taken back within the grace time is given up', () => {
  const { hub, pass, socket } = world({ graceMs: 60_000 });
  const host = socket();
  host.say({ t: 'host' });
  const guest = socket();
  guest.say({ t: 'join', id: host.last('hosted').lobby.id });
  const who = guest.me;
  guest.hangUp();
  pass(61_000);
  assert.deepEqual({ ...host.last('peer-left') }, { t: 'peer-left', reason: 'timeout', closed: false });
  const late = socket({ ...who });
  assert.equal(late.last('welcome').resumed, false);
  host.hangUp();
  pass(61_000);
  assert.equal(hub.stats().games, 0);
});

test('a host that is away is hidden from the list and from quick match until it returns', () => {
  const { pass, socket } = world();
  const host = socket();
  host.say({ t: 'host' });
  const who = host.me;
  const other = socket();
  other.say({ t: 'list' });
  host.hangUp();
  pass(300);
  assert.equal(other.last('lobbies').list.length, 0);
  other.say({ t: 'quick' });
  assert.equal(other.last('error').code, 'none');
  socket({ ...who });
  pass(300);
  assert.equal(other.last('lobbies').list.length, 1);
});

test('names are cleaned: control and direction characters out, length capped', () => {
  assert.equal(cleanText('  Am‮al\u0000  \n x ', 24, 'Player'), 'Amal x');
  assert.equal(cleanText('', 24, 'Player'), 'Player');
  assert.equal(cleanText(42, 24, 'Player'), 'Player');
  assert.equal(cleanText('ي'.repeat(40), 24, 'Player').length, 24);
  const { socket } = world();
  const host = socket({ name: 'x'.repeat(99) });
  host.say({ t: 'host', name: '<b>hi</b>', info: { map: 5, ais: 99, credits: -3, extra: 'no' } });
  const card = host.last('hosted').lobby;
  assert.equal(card.host.length, 24);
  assert.equal(card.name, '<b>hi</b>'); // text, shown as text by the page
  assert.deepEqual([card.map, card.ais, card.credits, card.extra], ['', 7, 0, undefined]);
});

test('limits: connections per address, flooding, oversized messages', () => {
  const { pass, socket } = world({ maxPerIp: 2, rateBurst: 5, ratePerSecond: 1 });
  const a = socket({}, '10.0.0.1');
  socket({}, '10.0.0.1');
  const c = socket({}, '10.0.0.1');
  assert.equal(c.conn.closed, CLOSE.full);
  a.hangUp();
  assert.equal(socket({}, '10.0.0.1').conn.closed, null, 'a freed slot can be used again');

  const noisy = socket({}, '10.0.0.2');
  for (let i = 0; i < 5; i++) noisy.say({ t: 'ping', n: i });
  assert.equal(noisy.all('pong').length, 5);
  noisy.say({ t: 'ping', n: 6 });
  assert.equal(noisy.conn.closed, CLOSE.flood);

  const calm = socket({}, '10.0.0.3');
  for (let i = 0; i < 4; i++) calm.say({ t: 'ping', n: i });
  pass(3000);
  for (let i = 0; i < 3; i++) calm.say({ t: 'ping', n: i });
  assert.equal(calm.conn.closed, null, 'the allowance refills');

  const big = socket({}, '10.0.0.4');
  big.session?.message(JSON.stringify({ t: 'relay', d: 'x'.repeat(200_000) }));
  assert.equal(big.conn.closed, CLOSE.flood);
});

test('garbage is ignored', () => {
  const { socket } = world();
  const a = socket();
  a.session?.message('not json');
  a.session?.message('null');
  a.session?.message(JSON.stringify({ t: 'constructor' }));
  a.session?.message(JSON.stringify({ t: 'info', state: 'playing' }));
  a.say({ t: 'ping', n: 1 });
  assert.equal(a.last('pong').n, 1);
});
