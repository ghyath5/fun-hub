// @ts-check
/**
 * Command Front lobby hub: who is online, which games are open, and the
 * link between the two players of a game.
 *
 * One hub holds every connected player. A player may host one lobby or sit
 * in someone else's; the hub lists the public lobbies, counts who is
 * connected, and passes two kinds of traffic between the two players of a
 * lobby without reading it:
 *   relay — game messages (the fallback path, and the only one where a
 *           direct connection cannot be made);
 *   sig   — WebRTC signalling, so the two browsers can connect directly.
 *
 * A dropped socket does not end anything: the seat is held for `graceMs`,
 * the other player is told the peer is away, and a reconnect with the same
 * id and token takes the seat back.
 *
 * Pure logic: no sockets, no clock of its own. An adapter (node.mjs for
 * Node, worker.js for Cloudflare) feeds it connections; tests feed it fakes.
 *
 * Wire format: JSON objects with a `t` (type) field.
 *   client → hub  hello, list, host, info, join, quick, relay, sig, leave, ping
 *   hub → client  welcome, lobbies, hosted, joined, peer-joined, peer-left,
 *                 peer-away, peer-back, relay, sig, pong, error
 */

export const PROTOCOL = 1;

export const DEFAULTS = Object.freeze({
  /** A seat is held this long after its socket drops (ms). */
  graceMs: 90_000,
  /** A socket must say hello within this (ms). */
  helloMs: 10_000,
  /** Lobby-list pushes are batched over this window (ms). */
  listFlushMs: 250,
  /** Most lobbies sent in one list. */
  listMax: 100,
  maxClients: 5000,
  maxPerIp: 16,
  maxLobbies: 1000,
  /** Longest relay or signalling message (characters of JSON). A resync snapshot travels in 48 KiB chunks. */
  maxRelayChars: 96 * 1024,
  /** Longest message of any other type. */
  maxControlChars: 4096,
  /** Token bucket per connection: burst, and refill per second. Super-fast speed sends about 80 messages a second. */
  rateBurst: 800,
  ratePerSecond: 400,
  /** Humans per lobby. The match is a two-player lockstep; AI players live inside the simulation. */
  seats: 2,
});

/** Close codes the client understands. */
export const CLOSE = Object.freeze({ replaced: 4001, flood: 4008, protocol: 4002, full: 4003, hello: 4004 });

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1: read aloud and typed without mistakes
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** @param {number} n @param {string} alphabet */
function randomString(n, alphabet) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

/** Printable text of at most `max` characters, or `fallback`. @param {unknown} v @param {number} max @param {string} fallback */
export function cleanText(v, max, fallback) {
  if (typeof v !== 'string') return fallback;
  // Control and invisible formatting characters out (a name must not reorder or hide the text around it).
  const s = [...v.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
  return s || fallback;
}

/** What a host may publish about its match. @param {any} v */
function cleanInfo(v) {
  const o = v && typeof v === 'object' ? v : {};
  const int = (/** @type {unknown} */ x, /** @type {number} */ lo, /** @type {number} */ hi) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.trunc(/** @type {number} */ (x)))) : lo);
  return {
    map: cleanText(o.map, 40, ''),
    ais: int(o.ais, 0, 7),
    speed: cleanText(o.speed, 16, ''),
    credits: int(o.credits, 0, 1_000_000),
  };
}

/**
 * @typedef {{ send: (text: string) => void, close: (code?: number, reason?: string) => void, ip?: string }} Conn
 * @typedef {{ id: string, token: string, name: string, build: number, conn: Conn | null, lobby: string | null,
 *   listing: boolean, grace: any, tokens: number, refilledAt: number }} Client
 * @typedef {{ id: string, name: string, host: string, guest: string | null, public: boolean, build: number,
 *   state: 'open' | 'playing', info: ReturnType<typeof cleanInfo>, created: number }} Lobby
 */

/**
 * @param {{
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (handle: any) => void,
 *   config?: Partial<typeof DEFAULTS>,
 *   log?: (line: string) => void,
 * }} [o]
 */
export function createHub({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, config = {}, log = () => {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };
  /** @type {Map<string, Client>} */ const clients = new Map();
  /** @type {Map<string, Lobby>} */ const lobbies = new Map();
  /** @type {Map<string, number>} */ const perIp = new Map();
  const startedAt = now();
  let connected = 0;
  /** @type {any} */ let listTimer = null;

  // ---- Sending.
  const send = (/** @type {Client | null | undefined} */ c, /** @type {any} */ msg) => {
    if (!c?.conn) return false;
    try { c.conn.send(JSON.stringify(msg)); return true; } catch { return false; }
  };
  const fail = (/** @type {Client} */ c, /** @type {string} */ code, extra = {}) => send(c, { t: 'error', code, ...extra });

  // ---- Lobbies.
  const peerOf = (/** @type {Client} */ c) => {
    const l = c.lobby ? lobbies.get(c.lobby) : null;
    if (!l) return null;
    const id = l.host === c.id ? l.guest : l.host;
    return id ? clients.get(id) ?? null : null;
  };
  const playersIn = (/** @type {Lobby} */ l) => 1 + (l.guest ? 1 : 0);
  const hostName = (/** @type {Lobby} */ l) => clients.get(l.host)?.name ?? '';
  /** The public card of a lobby. @param {Lobby} l */
  const card = (l) => ({
    id: l.id, name: l.name, host: hostName(l), players: playersIn(l), max: cfg.seats,
    build: l.build, state: l.state, public: l.public, ...l.info,
  });
  /** May a newcomer take the free seat right now? @param {Lobby} l */
  const joinable = (l) => !l.guest && l.state === 'open' && !!clients.get(l.host)?.conn;

  function listView() {
    const all = [...lobbies.values()].filter((l) => l.public && clients.get(l.host)?.conn);
    // Open seats first, then the newest.
    all.sort((a, b) => (Number(joinable(b)) - Number(joinable(a))) || (b.created - a.created));
    return { t: 'lobbies', list: all.slice(0, cfg.listMax).map(card), online: connected, games: lobbies.size };
  }
  function flushList() {
    listTimer = null;
    const view = listView();
    for (const c of clients.values()) if (c.listing) send(c, view);
  }
  /** The list or the head-count changed: tell the subscribers, batched. */
  const dirty = () => { listTimer ??= setTimer(flushList, cfg.listFlushMs); };

  function newLobbyId() {
    for (let i = 0; i < 20; i++) {
      const id = randomString(5, ID_ALPHABET);
      if (!lobbies.has(id)) return id;
    }
    return randomString(8, ID_ALPHABET);
  }

  /** Take a client out of its lobby; the other player is told. @param {Client} c @param {'left' | 'timeout'} reason */
  function leaveLobby(c, reason) {
    const l = c.lobby ? lobbies.get(c.lobby) : null;
    c.lobby = null;
    if (!l) return;
    const peer = clients.get((l.host === c.id ? l.guest : l.host) ?? '');
    if (l.host === c.id) {
      // The host owns the lobby: it closes with them.
      lobbies.delete(l.id);
      if (peer) { peer.lobby = null; send(peer, { t: 'peer-left', reason, closed: true }); }
    } else {
      l.guest = null;
      l.state = 'open';
      send(peer, { t: 'peer-left', reason, closed: false });
    }
    dirty();
  }

  /** Seat a client in a lobby as its guest. @param {Client} c @param {Lobby} l */
  function seat(c, l) {
    const host = /** @type {Client} */ (clients.get(l.host));
    l.guest = c.id;
    c.lobby = l.id;
    c.listing = false;
    send(c, { t: 'joined', lobby: card(l), peer: { name: host.name } });
    send(host, { t: 'peer-joined', peer: { name: c.name } });
    dirty();
  }

  /** Remove a client entirely. @param {Client} c */
  function drop(c) {
    clearTimer(c.grace);
    leaveLobby(c, 'timeout');
    clients.delete(c.id);
  }

  // ---- Messages.
  /** @type {Record<string, (c: Client, m: any) => void>} */
  const handlers = {
    list(c, m) {
      c.listing = m.on !== false;
      if (c.listing) send(c, listView());
    },
    host(c, m) {
      if (c.lobby) return void fail(c, 'busy');
      if (lobbies.size >= cfg.maxLobbies) return void fail(c, 'crowded');
      /** @type {Lobby} */
      const l = {
        id: newLobbyId(), name: cleanText(m.name, 32, c.name), host: c.id, guest: null,
        public: m.public !== false, build: c.build, state: 'open', info: cleanInfo(m.info), created: now(),
      };
      lobbies.set(l.id, l);
      c.lobby = l.id;
      c.listing = false;
      send(c, { t: 'hosted', lobby: card(l) });
      dirty();
    },
    info(c, m) {
      const l = c.lobby ? lobbies.get(c.lobby) : null;
      if (!l || l.host !== c.id) return;
      if (typeof m.name === 'string') l.name = cleanText(m.name, 32, l.name);
      if (typeof m.public === 'boolean') l.public = m.public;
      if (m.state === 'open' || m.state === 'playing') l.state = m.state;
      if (m.info) l.info = cleanInfo(m.info);
      send(peerOf(c), { t: 'lobby', lobby: card(l) });
      dirty();
    },
    join(c, m) {
      if (c.lobby) return void fail(c, 'busy');
      const l = lobbies.get(String(m.id ?? '').toUpperCase());
      if (!l) return void fail(c, 'gone');
      if (l.build !== c.build) return void fail(c, 'build', { build: l.build });
      if (!joinable(l)) return void fail(c, l.guest || l.state !== 'open' ? 'full' : 'gone');
      seat(c, l);
    },
    quick(c) {
      if (c.lobby) return void fail(c, 'busy');
      const open = [...lobbies.values()].filter((l) => l.public && l.build === c.build && joinable(l));
      if (!open.length) return void fail(c, 'none');
      // The lobby that has waited longest gets the next player.
      open.sort((a, b) => a.created - b.created);
      seat(c, open[0]);
    },
    relay(c, m) { send(peerOf(c), { t: 'relay', d: m.d }); },
    sig(c, m) { send(peerOf(c), { t: 'sig', d: m.d }); },
    leave(c) { leaveLobby(c, 'left'); },
    ping(c, m) { send(c, { t: 'pong', n: m.n, online: connected }); },
  };

  /** Spend one token; false when the connection is flooding. @param {Client} c */
  function allowed(c) {
    const t = now();
    c.tokens = Math.min(cfg.rateBurst, c.tokens + ((t - c.refilledAt) / 1000) * cfg.ratePerSecond);
    c.refilledAt = t;
    if (c.tokens < 1) return false;
    c.tokens -= 1;
    return true;
  }

  /** @param {Conn} conn @param {any} m @returns {Client | null} */
  function hello(conn, m) {
    if (m.v !== PROTOCOL) { try { conn.send(JSON.stringify({ t: 'error', code: 'version', v: PROTOCOL })); } catch { /* gone */ } conn.close(CLOSE.protocol, 'protocol'); return null; }
    const name = cleanText(m.name, 24, 'Player');
    const build = Number.isInteger(m.build) ? m.build : 0;
    const known = typeof m.id === 'string' ? clients.get(m.id) : undefined;
    if (known && typeof m.token === 'string' && known.token === m.token) {
      // The same player on a new socket: the seat was held for them.
      const old = known.conn;
      clearTimer(known.grace);
      known.grace = null;
      known.conn = conn;
      known.name = name;
      known.tokens = cfg.rateBurst;
      known.refilledAt = now();
      if (old) { try { old.close(CLOSE.replaced, 'replaced'); } catch { /* already gone */ } } else connected++;
      const l = known.lobby ? lobbies.get(known.lobby) : null;
      const peer = peerOf(known);
      send(known, {
        t: 'welcome', id: known.id, token: known.token, resumed: true, online: connected,
        lobby: l ? card(l) : null, role: l ? (l.host === known.id ? 'host' : 'guest') : null,
        peer: peer ? { name: peer.name, away: !peer.conn } : null,
      });
      send(peer, { t: 'peer-back' });
      dirty();
      return known;
    }
    if (clients.size >= cfg.maxClients) { conn.close(CLOSE.full, 'full'); return null; }
    /** @type {Client} */
    const c = { id: randomString(12, TOKEN_ALPHABET), token: randomString(24, TOKEN_ALPHABET), name, build, conn, lobby: null, listing: false, grace: null, tokens: cfg.rateBurst, refilledAt: now() };
    clients.set(c.id, c);
    connected++;
    send(c, { t: 'welcome', id: c.id, token: c.token, resumed: false, online: connected, lobby: null, role: null, peer: null });
    dirty();
    return c;
  }

  return {
    /**
     * A socket opened. Returns what the adapter calls as the socket speaks
     * and when it closes; null when the hub refused it (already closed).
     * @param {Conn} conn
     */
    connect(conn) {
      const ip = conn.ip ?? '';
      if (ip) {
        const n = perIp.get(ip) ?? 0;
        if (n >= cfg.maxPerIp) { conn.close(CLOSE.full, 'too many connections'); return null; }
        perIp.set(ip, n + 1);
      }
      /** @type {Client | null} */ let client = null;
      let open = true;
      let helloTimer = setTimer(() => { if (!client && open) conn.close(CLOSE.hello, 'no hello'); }, cfg.helloMs);
      return {
        /** @param {unknown} text */
        message(text) {
          if (!open || typeof text !== 'string') return;
          if (text.length > cfg.maxRelayChars) { conn.close(CLOSE.flood, 'too large'); return; }
          /** @type {any} */ let m;
          try { m = JSON.parse(text); } catch { return; }
          if (!m || typeof m.t !== 'string') return;
          if (!client) {
            if (m.t !== 'hello') return;
            client = hello(conn, m);
            if (client) { clearTimer(helloTimer); helloTimer = null; }
            return;
          }
          if (client.conn !== conn) return; // this socket was replaced by a newer one
          if (!allowed(client)) { log(`flood from ${client.id}`); conn.close(CLOSE.flood, 'slow down'); return; }
          if (m.t !== 'relay' && m.t !== 'sig' && text.length > cfg.maxControlChars) return;
          if (Object.hasOwn(handlers, m.t)) handlers[m.t](client, m);
        },
        closed() {
          if (!open) return;
          open = false;
          clearTimer(helloTimer);
          if (ip) {
            const n = (perIp.get(ip) ?? 1) - 1;
            if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
          }
          const c = client;
          if (!c || c.conn !== conn) return; // never said hello, or already replaced
          c.conn = null;
          c.listing = false;
          connected--;
          if (!c.lobby) { clients.delete(c.id); dirty(); return; }
          // In a lobby: hold the seat, tell the other player.
          send(peerOf(c), { t: 'peer-away' });
          c.grace = setTimer(() => drop(c), cfg.graceMs);
          dirty();
        },
      };
    },
    /** Head-counts, for the health endpoint and the menu's "online" badge. */
    stats() {
      let open = 0;
      for (const l of lobbies.values()) if (l.public && joinable(l)) open++;
      return { online: connected, games: lobbies.size, open, uptime: Math.round((now() - startedAt) / 1000), protocol: PROTOCOL };
    },
  };
}

/** @typedef {ReturnType<typeof createHub>} Hub */
