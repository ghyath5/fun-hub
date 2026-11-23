// @ts-check
/**
 * An online room: this player and one other, met through the lobby server.
 *
 * It offers the match the same surface as the two-phone WiFi room
 * (net/room.js) — state, send, listen, blobs, resume — so the lockstep and
 * the HUD's link card work unchanged, and adds what the internet needs:
 *
 *   two paths     every message can go through the lobby server (relay) or
 *                 straight to the other browser (direct). The room uses the
 *                 direct path whenever it is open and the relay otherwise,
 *                 and switches without the match noticing.
 *   no loss       messages are numbered and acknowledged (reliable.js), so
 *                 a switch, a drop or a reconnect neither loses nor repeats
 *                 one.
 *   recovery      with no path at all the room is `down` and everything
 *                 keeps retrying; after a minute it is `gone` (the match
 *                 offers Try again / Play on alone) and still comes back by
 *                 itself if the link returns.
 *
 * A host's room outlives its guests: when one leaves, `reopen()` waits for
 * the next.
 */
import { ONLINE } from '../../data/online.js';
import { createReliable } from './reliable.js';
import { createDirect } from './direct.js';

/** @typedef {'pairing' | 'open' | 'down' | 'gone' | 'failed' | 'closed'} RoomState */
/** @typedef {{ path: 'direct' | 'relay' | 'none', rtt: number | null }} RoomStats */

/** Chunk size for big payloads (characters of base64); the same as the WiFi room's. */
const CHUNK = 48 * 1024;
/** How often the room looks after its link (ms). */
const TICK_MS = 100;
/** A leaving player's last messages may still be on the direct path when the server's notice arrives (ms). */
const LEFT_SETTLE_MS = 400;

/** @param {Uint8Array} bytes */
const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
/** @param {string} b64 */
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * @param {{
 *   client: import('./lobbyClient.js').LobbyClient,
 *   role: 'host' | 'guest',
 *   peer: { name: string } | null,     the other player, if already seated (a guest always has one)
 *   RTC?: any, direct?: boolean, timing?: Partial<typeof ONLINE>, log?: (line: string) => void,
 * }} o
 */
export function openOnlineRoom({ client, role, peer, RTC = globalThis.RTCPeerConnection, direct: wantDirect = ONLINE.direct, timing = {}, log = () => {} }) {
  const T = { ...ONLINE, ...timing };
  /** @type {RoomState} */ let state = peer ? 'open' : 'pairing';
  let peerAway = false;
  /** The other player left or the seat was lost: nothing to reconnect to. */
  let peerGone = false;
  let byeSeen = false;
  /** The server no longer holds our seat (we were away too long): this room cannot be used again. */
  let seatLost = false;
  let downSince = 0;
  /** @type {number | null} */ let rtt = null;
  /** @type {Map<number, number>} */ const pingsOut = new Map();
  let pingSeq = 0;
  let lastPingAt = 0;
  /** @type {RoomStats['path']} */ let lastPath = 'none';

  /** @type {Set<(s: RoomState) => void>} */ const watchers = new Set();
  /** @type {((msg: any) => void) | null} */ let listener = null;
  /** @type {any[]} */ let held = [];
  /** @type {Map<string, { parts: string[], got: number, kind: string }>} */ const incoming = new Map();
  /** @type {Set<(kind: string, bytes: Uint8Array) => void>} */ const blobWatchers = new Set();
  /** @type {Set<() => void>} */ const resumeWatchers = new Set();
  /** @type {Set<(peer: { name: string } | null) => void>} */ const peerWatchers = new Set();
  /** @type {Set<(s: RoomStats) => void>} */ const statsWatchers = new Set();

  // ---- Paths.
  const relayUp = () => client.state === 'online' && !peerAway && !seatLost;
  const link = createDirect({
    initiator: role === 'host', RTC: wantDirect ? RTC : null, timing, log,
    signal: (m) => { client.send({ t: 'sig', d: m }); },
    onOpen: () => { reliable.flush(); refresh(); },
    onClose: () => { reliable.flush(); refresh(); },
    onFrame: (f) => frameIn(f),
  });
  /** @returns {RoomStats['path']} */
  const path = () => (link.open ? 'direct' : relayUp() ? 'relay' : 'none');
  /** Send a frame by the best path there is; with none, it is simply not sent (the reliable layer sends it again). @param {any} frame */
  const transmit = (frame) => {
    if (!peer || state === 'closed') return;
    if (link.open && link.send(frame)) return;
    if (relayUp()) client.send({ t: 'relay', d: frame });
  };

  // ---- Messages.
  const deliver = (/** @type {any} */ msg) => {
    if (msg?.k === 'blob') return absorbChunk(msg);
    if (msg?.k === 'bye') byeSeen = true;
    if (listener) listener(msg); else held.push(msg);
  };
  const absorbChunk = (/** @type {{ id: string, kind: string, i: number, n: number, d: string }} */ m) => {
    if (typeof m.id !== 'string' || typeof m.d !== 'string' || !Number.isInteger(m.i) || !Number.isInteger(m.n) || m.n < 1 || m.n > 4096 || m.i < 0 || m.i >= m.n) return;
    const entry = incoming.get(m.id) ?? { parts: new Array(m.n), got: 0, kind: String(m.kind) };
    if (entry.parts[m.i] === undefined) { entry.parts[m.i] = m.d; entry.got++; }
    incoming.set(m.id, entry);
    if (entry.got < entry.parts.length) return;
    incoming.delete(m.id);
    /** @type {Uint8Array} */ let bytes;
    try { bytes = fromBase64(entry.parts.join('')); } catch { return; }
    for (const w of [...blobWatchers]) w(entry.kind, bytes);
  };
  let reliable = createReliable({ transmit, deliver, resendMs: T.resendMs, ackMs: T.ackMs });

  /** A frame from the other player, by either path. @param {any} f */
  function frameIn(f) {
    if (!f || typeof f !== 'object' || !peer) return;
    // Pings measure the round trip and are not worth resending: they travel outside the numbered stream.
    if (f.p !== undefined) { transmit({ q: f.p }); return; }
    if (f.q !== undefined) {
      const at = pingsOut.get(f.q);
      if (at !== undefined) {
        pingsOut.delete(f.q);
        const sample = performance.now() - at;
        rtt = rtt == null ? sample : rtt * 0.7 + sample * 0.3;
        tellStats();
      }
      return;
    }
    reliable.receive(f);
  }

  // ---- State.
  const set = (/** @type {RoomState} */ s) => {
    if (state === 'closed' || state === s) return;
    const was = state;
    state = s;
    for (const w of [...watchers]) w(s);
    if (s === 'open' && (was === 'down' || was === 'gone')) for (const f of [...resumeWatchers]) f();
  };
  const tellStats = () => { const s = { path: path(), rtt }; for (const w of [...statsWatchers]) w(s); };

  /** Work out the state from what is known now. */
  function refresh() {
    if (state === 'closed') return;
    const now = path();
    if (now !== lastPath) {
      log(`path: ${lastPath} → ${now}`);
      lastPath = now;
      rtt = null; // the old measurement belongs to the old path
      pingsOut.clear();
      lastPingAt = 0;
      tellStats();
    }
    if (peerGone) { set('gone'); return; }
    if (!peer) { set('pairing'); return; }
    if (now !== 'none') { downSince = 0; set('open'); return; }
    if (state === 'open' || state === 'pairing') { downSince = performance.now(); set('down'); }
  }

  /** The other player is gone for good. @param {string} reason */
  function peerLost(reason) {
    if (!peer || peerGone) return;
    log(`the other player is gone (${reason})`);
    const who = peer;
    const finish = () => {
      if (state === 'closed' || peerGone || peer !== who) return; // a host may already be waiting for the next guest
      if (!byeSeen) deliver({ k: 'bye', reason });
      peerGone = true;
      link.stop();
      refresh();
    };
    // A player who left on purpose sent a last word; let it land before the room reports them gone.
    if (reason === 'left' && !byeSeen) setTimeout(finish, LEFT_SETTLE_MS); else finish();
  }

  /** Start afresh with a (new) other player. @param {{ name: string }} p */
  function pairWith(p) {
    peer = p;
    peerAway = false;
    peerGone = false;
    byeSeen = false;
    held = [];
    incoming.clear();
    reliable = createReliable({ transmit, deliver, resendMs: T.resendMs, ackMs: T.ackMs });
    rtt = null;
    link.restart();
    link.start();
    refresh();
    for (const w of [...peerWatchers]) w(peer);
  }

  const offs = [
    client.on('relay', (m) => frameIn(m.d)),
    client.on('sig', (m) => { link.signal(m.d); }),
    client.on('peer-joined', (m) => { if (role === 'host') pairWith({ name: String(m.peer?.name ?? '') }); }),
    client.on('peer-left', (m) => peerLost(m.reason === 'left' ? 'left' : 'timeout')),
    client.on('peer-away', () => { peerAway = true; refresh(); }),
    client.on('peer-back', () => { peerAway = false; refresh(); reliable.flush(); link.kick(); }),
    client.on('state', () => { refresh(); }),
    client.on('welcome', (m) => {
      // Back on the server. Is our seat still there?
      if (!m.resumed || !m.lobby) {
        // The server forgot us (we were away too long, or it restarted). A match on a live direct link plays on regardless.
        log('the seat was not kept');
        seatLost = true;
        if (link.open) refresh(); else { peer ??= { name: '' }; peerLost('timeout'); }
        return;
      }
      if (peer && !m.peer) { peerLost('timeout'); return; }
      peerAway = !!m.peer?.away;
      refresh();
      reliable.flush();
      link.kick();
    }),
    client.on('fatal', () => { seatLost = true; if (link.open) refresh(); else { peer ??= { name: '' }; peerLost('timeout'); } }),
  ];

  const ticker = setInterval(() => {
    if (state === 'closed' || !peer || peerGone) return;
    const now = performance.now();
    reliable.tick(now);
    if (link.open && now - link.lastHeard > T.directSilenceMs) link.fail();
    if (seatLost && !link.open) { peerLost('timeout'); return; } // the direct link was all that was left
    if (path() !== 'none' && now - lastPingAt >= T.peerPingMs) {
      lastPingAt = now;
      const n = ++pingSeq;
      pingsOut.set(n, now);
      if (pingsOut.size > 8) pingsOut.delete(/** @type {number} */ (pingsOut.keys().next().value));
      transmit({ p: n });
    }
    if (state === 'down' && now - downSince > T.giveUpMs) set('gone');
    refresh();
  }, TICK_MS);

  if (peer) link.start();
  lastPath = path();

  return {
    role,
    /** This is an internet room (the HUD words its cards accordingly). */
    internet: true,
    get state() { return state; },
    /** The other player, or null while a host waits for one. */
    get peer() { return peer; },
    /** How the two players are connected right now, and the round trip between them. @returns {RoomStats} */
    stats: () => ({ path: path(), rtt }),
    /** @param {(s: RoomStats) => void} fn */
    onStats(fn) { statsWatchers.add(fn); return () => statsWatchers.delete(fn); },
    /** Host: a player took (or left, null) the other seat. @param {(peer: { name: string } | null) => void} fn */
    onPeer(fn) { peerWatchers.add(fn); return () => peerWatchers.delete(fn); },

    /** @param {any} msg */
    send: (msg) => { if (peer && !peerGone && state !== 'closed') reliable.send(msg); },
    /** Send a large payload in chunks; the other side gets it whole via onBlob. @param {string} kind @param {Uint8Array} bytes */
    sendBlob(kind, bytes) {
      const b64 = toBase64(bytes);
      const n = Math.max(1, Math.ceil(b64.length / CHUNK));
      const id = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      for (let i = 0; i < n; i++) this.send({ k: 'blob', id, kind, i, n, d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    },
    /** @param {(kind: string, bytes: Uint8Array) => void} fn */
    onBlob(fn) { blobWatchers.add(fn); return () => blobWatchers.delete(fn); },
    /** Route incoming messages to fn (replacing the previous listener); held messages are delivered first. @param {((msg: any) => void) | null} fn */
    listen(fn) {
      listener = fn;
      while (listener && held.length) listener(held.shift());
    },
    /** @param {(s: RoomState) => void} fn */
    onState(fn) { watchers.add(fn); return () => watchers.delete(fn); },
    /** @param {() => void} fn */
    onResume(fn) { resumeWatchers.add(fn); return () => resumeWatchers.delete(fn); },
    /** Try again after the room gave up: everything reconnects from the start of its schedule. */
    retry() {
      if (peerGone || state === 'closed') return;
      if (path() === 'none') { downSince = performance.now(); set('down'); }
      client.check();
      link.kick();
    },
    /** The tab came back to the foreground: check the link at once. */
    probe() { client.check(); },
    /** Host: the guest has gone; wait for the next one. False when the server no longer holds this game. */
    reopen() {
      if (role !== 'host' || state === 'closed' || seatLost) return false;
      peer = null;
      peerGone = false;
      peerAway = false;
      byeSeen = false;
      held = [];
      link.restart();
      refresh();
      for (const w of [...peerWatchers]) w(null);
      return true;
    },
    /** Leave: tell the other player and the server. The server connection itself stays open (it is the caller's). */
    close() {
      if (state === 'closed') return;
      if (peer && !peerGone) { try { reliable.send({ k: 'bye' }); } catch { /* nothing to send on */ } }
      clearInterval(ticker);
      const wasPaired = !!peer;
      state = 'closed';
      for (const off of offs) off();
      // Give the goodbye a moment to leave before the paths shut.
      setTimeout(() => { link.stop(); client.leave(); }, wasPaired ? 150 : 0);
      watchers.clear(); blobWatchers.clear(); resumeWatchers.clear(); peerWatchers.clear(); statsWatchers.clear();
      listener = null;
    },
  };
}

/** @typedef {ReturnType<typeof openOnlineRoom>} OnlineRoom */
