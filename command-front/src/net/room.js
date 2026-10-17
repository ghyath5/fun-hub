// @ts-check
/**
 * A room: two paired phones, from the moment pairing starts until one of
 * them leaves. It owns the link, reports its state (pairing → open, and
 * down / gone while the engine fights a drop) and routes incoming messages
 * to whichever part of the game currently listens — the lobby, then the
 * match, then the lobby again for a rematch. Messages that arrive while
 * nobody listens are held, so nothing is lost between screens.
 *
 * It also moves large payloads (a resync snapshot) in chunks: the data
 * channel caps one message, and a world can be bigger than that.
 */
import { createLink } from './link.js';

/** @typedef {'pairing' | 'open' | 'down' | 'gone' | 'failed' | 'closed'} RoomState */

/** Keepalive interval (ms). The other side's messages are what revive a link wrongly marked down (see link.js). */
const KEEPALIVE_MS = 1000;

/** Chunk size for big payloads (characters of base64). Well under the channel's 256 KiB message cap. */
const CHUNK = 48 * 1024;

/** @param {Uint8Array} bytes */
const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
/** @param {string} b64 */
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** @param {'host' | 'guest'} role */
export async function openRoom(role) {
  /** @type {RoomState} */
  let state = 'pairing';
  /** @type {Set<(s: RoomState) => void>} */
  const watchers = new Set();
  /** @type {((msg: any) => void) | null} */
  let listener = null;
  /** @type {any[]} */
  const held = [];
  /** Big payloads being reassembled, by id. @type {Map<string, { parts: string[], got: number, kind: string }>} */
  const incoming = new Map();
  /** @type {Set<(kind: string, bytes: Uint8Array) => void>} */
  const blobWatchers = new Set();
  /** @type {Set<() => void>} */
  const resumeWatchers = new Set();

  const set = (/** @type {RoomState} */ s) => {
    if (state === 'closed' || state === s) return;
    state = s;
    for (const w of [...watchers]) w(s);
  };

  const deliver = (/** @type {any} */ msg) => {
    if (msg?.k === 'ka') return;
    if (msg?.k === 'blob') return absorbChunk(msg);
    if (listener) listener(msg); else held.push(msg);
  };

  const absorbChunk = (/** @type {{ id: string, kind: string, i: number, n: number, d: string }} */ m) => {
    const entry = incoming.get(m.id) ?? { parts: new Array(m.n), got: 0, kind: m.kind };
    if (entry.parts[m.i] === undefined) { entry.parts[m.i] = m.d; entry.got++; }
    incoming.set(m.id, entry);
    if (entry.got < m.n) return;
    incoming.delete(m.id);
    const bytes = fromBase64(entry.parts.join(''));
    for (const w of [...blobWatchers]) w(entry.kind, bytes);
  };

  let keepalive = 0;
  const link = await createLink(role, {
    ready: () => {
      set('open');
      clearInterval(keepalive);
      keepalive = /** @type {any} */ (setInterval(() => link.send({ k: 'ka' }), KEEPALIVE_MS));
    },
    message: deliver,
    drop: () => set('down'),
    resume: () => { set('open'); for (const f of [...resumeWatchers]) f(); },
    giveup: () => set('gone'),
    failed: () => set('failed'),
  });

  return {
    role,
    get state() { return state; },
    /** Host: the invite link for the QR. */
    invite: () => link.invite(),
    /** Guest: answer an invite; returns the reply code. @param {string} code */
    answer: (code) => link.answer(code),
    /** Host: take the reply code. @param {string} code */
    accept: (code) => link.accept(code),
    /** @param {any} msg */
    send: (msg) => link.send(msg),
    /** Send a large payload in chunks; the other side gets it whole via onBlob. @param {string} kind @param {Uint8Array} bytes */
    sendBlob(kind, bytes) {
      const b64 = toBase64(bytes);
      const n = Math.max(1, Math.ceil(b64.length / CHUNK));
      const id = `${kind}-${Date.now().toString(36)}`;
      for (let i = 0; i < n; i++) link.send({ k: 'blob', id, kind, i, n, d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
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
    retry: () => { link.retry(); set('down'); },
    probe: () => link.probe(),
    /** Leave: tell the other phone, then close. */
    close() {
      if (state === 'closed') return;
      try { link.send({ k: 'bye' }); } catch { /* already down */ }
      // Give the goodbye a moment to leave before the channels shut.
      setTimeout(() => link.close(), 150);
      clearInterval(keepalive);
      set('closed');
      watchers.clear(); blobWatchers.clear(); resumeWatchers.clear();
      listener = null;
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof openRoom>>} Room */
