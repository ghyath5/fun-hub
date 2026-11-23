// @ts-check
/**
 * The direct path between two players' browsers (a WebRTC data channel).
 *
 * It is the fast path, never the only one: the room sends through the lobby
 * server until this opens and again whenever it closes. So this module does
 * not try to be clever about recovery — a link that fails or goes quiet is
 * torn down and, after a pause, built again from scratch.
 *
 * The host always makes the offer, so the two sides can never collide.
 * Signalling (offer, answer, candidates) travels through the lobby server:
 *   host  → { k: 'offer', n, sdp }      n: the attempt, so late messages from an old one are ignored
 *   guest → { k: 'answer', n, sdp }
 *   both  → { k: 'ice', n, c }
 *   guest → { k: 'again' }              my end closed: please offer again
 */
import { ONLINE } from '../../data/online.js';

/**
 * @param {{
 *   initiator: boolean,
 *   signal: (msg: any) => void,
 *   onOpen: () => void, onClose: () => void, onFrame: (frame: any) => void,
 *   RTC?: any, ice?: any[], timing?: Partial<typeof ONLINE>, log?: (line: string) => void,
 * }} o
 */
export function createDirect({ initiator, signal, onOpen, onClose, onFrame, RTC = globalThis.RTCPeerConnection, ice = /** @type {any[]} */ (ONLINE.ice), timing = {}, log = () => {} }) {
  const T = { ...ONLINE, ...timing };
  /** @type {any} */ let pc = null;
  /** @type {any} */ let channel = null;
  let open = false;
  /** The attempt in progress (the host numbers them). */ let attempt = 0;
  /** Failed attempts since the last success or kick. */ let failures = 0;
  let stopped = !RTC;
  let lastHeard = 0;
  /** Candidates that arrived before the remote description. @type {any[]} */ let earlyIce = [];
  /** @type {any} */ let openTimer = 0; /** @type {any} */ let retryTimer = 0; /** @type {any} */ let dropTimer = 0;

  /** Close the current connection. @param {boolean} retry try again later (host) or ask the host to (guest) */
  function teardown(retry) {
    clearTimeout(openTimer); clearTimeout(dropTimer);
    const wasOpen = open;
    open = false;
    const old = pc;
    pc = null;
    if (channel) { channel.onopen = channel.onclose = channel.onmessage = channel.onerror = null; try { channel.close(); } catch { /* closed */ } channel = null; }
    if (old) { old.onicecandidate = old.onconnectionstatechange = old.ondatachannel = null; try { old.close(); } catch { /* closed */ } }
    earlyIce = [];
    if (wasOpen) { log('direct link closed'); onClose(); }
    if (!retry || stopped) return;
    if (!initiator) { if (wasOpen) signal({ k: 'again' }); return; }
    clearTimeout(retryTimer);
    if (failures >= T.directRetryMs.length) { log('direct link: no more attempts until the next reconnect'); return; }
    retryTimer = setTimeout(offer, T.directRetryMs[failures++]);
  }

  /** @param {any} ch */
  function wire(ch) {
    channel = ch;
    ch.onopen = () => {
      if (channel !== ch) return;
      clearTimeout(openTimer);
      open = true;
      failures = 0;
      lastHeard = performance.now();
      log('direct link open');
      onOpen();
    };
    ch.onmessage = (/** @type {any} */ e) => {
      if (channel !== ch) return;
      lastHeard = performance.now();
      /** @type {any} */ let f;
      try { f = JSON.parse(e.data); } catch { return; }
      onFrame(f);
    };
    ch.onclose = ch.onerror = () => { if (channel === ch) teardown(true); };
  }

  /** @param {number} n the attempt this connection belongs to */
  function create(n) {
    const conn = new RTC({ iceServers: ice });
    pc = conn;
    attempt = n;
    conn.onicecandidate = (/** @type {any} */ e) => { if (pc === conn && e.candidate) signal({ k: 'ice', n, c: e.candidate.toJSON?.() ?? e.candidate }); };
    conn.onconnectionstatechange = () => {
      if (pc !== conn) return;
      const s = conn.connectionState;
      clearTimeout(dropTimer);
      if (s === 'failed' || s === 'closed') teardown(true);
      // "disconnected" often heals by itself within a moment; give it one, then rebuild.
      else if (s === 'disconnected') dropTimer = setTimeout(() => { if (pc === conn && conn.connectionState === 'disconnected') teardown(true); }, 3000);
    };
    clearTimeout(openTimer);
    openTimer = setTimeout(() => { if (pc === conn && !open) { log('direct link did not open in time'); teardown(true); } }, T.directTimeoutMs);
    return conn;
  }

  async function offer() {
    if (stopped || !initiator) return;
    teardown(false);
    const n = attempt + 1;
    try {
      const conn = create(n);
      wire(conn.createDataChannel('cf', { ordered: true }));
      await conn.setLocalDescription(await conn.createOffer());
      if (pc !== conn) return;
      signal({ k: 'offer', n, sdp: conn.localDescription.sdp });
    } catch (e) {
      log(`direct offer failed: ${e}`);
      teardown(true);
    }
  }

  /** @param {any} conn */
  async function drainIce(conn) {
    const list = earlyIce;
    earlyIce = [];
    for (const c of list) { try { await conn.addIceCandidate(c); } catch { /* a candidate that does not fit is not fatal */ } }
  }

  return {
    get open() { return open; },
    get available() { return !!RTC; },
    /** When the last frame arrived on this path (performance.now). */
    get lastHeard() { return lastHeard; },

    /** Start connecting (host), or be ready for the host's offer (guest). */
    start() { if (initiator) offer(); },

    /**
     * The situation changed in a way that makes a new attempt worthwhile
     * (the other player came back, the server link returned): try now.
     */
    kick() {
      if (stopped || open) return;
      failures = 0;
      if (initiator) { clearTimeout(retryTimer); if (!pc) offer(); } else if (!pc) signal({ k: 'again' });
    },

    /** A signalling message from the other player. @param {any} m */
    async signal(m) {
      if (stopped || !m || typeof m !== 'object') return;
      try {
        if (m.k === 'offer' && !initiator && typeof m.sdp === 'string') {
          teardown(false);
          const conn = create(Number(m.n) || 0);
          conn.ondatachannel = (/** @type {any} */ e) => { if (pc === conn) wire(e.channel); };
          await conn.setRemoteDescription({ type: 'offer', sdp: m.sdp });
          await drainIce(conn);
          await conn.setLocalDescription(await conn.createAnswer());
          if (pc !== conn) return;
          signal({ k: 'answer', n: attempt, sdp: conn.localDescription.sdp });
        } else if (m.k === 'answer' && initiator && pc && m.n === attempt && typeof m.sdp === 'string') {
          const conn = pc;
          await conn.setRemoteDescription({ type: 'answer', sdp: m.sdp });
          await drainIce(conn);
        } else if (m.k === 'ice' && pc && m.n === attempt && m.c) {
          if (pc.remoteDescription) await pc.addIceCandidate(m.c).catch(() => {}); else earlyIce.push(m.c);
        } else if (m.k === 'again' && initiator) {
          failures = 0;
          clearTimeout(retryTimer);
          offer();
        }
      } catch (e) {
        log(`direct signalling failed: ${e}`);
        teardown(true);
      }
    },

    /** Send a frame; false when the path is not open. @param {any} frame */
    send(frame) {
      if (!open || !channel) return false;
      try { channel.send(JSON.stringify(frame)); return true; } catch { return false; }
    },

    /** The path went quiet (the room's watchdog): drop it and rebuild later. */
    fail() { if (pc) { log('direct link went quiet'); teardown(true); } },

    /** Close for good (until `restart`). */
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      teardown(false);
    },
    /** A new pairing: forget the old link and be ready again. */
    restart() {
      clearTimeout(retryTimer);
      teardown(false);
      stopped = !RTC;
      failures = 0;
    },
  };
}

/** @typedef {ReturnType<typeof createDirect>} Direct */
