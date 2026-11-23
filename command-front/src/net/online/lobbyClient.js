// @ts-check
/**
 * This player's connection to the lobby server, kept alive.
 *
 * It says hello (with the identity the server gave last time, so a seat
 * held during a drop is taken back), keeps the lobby list and the online
 * head-count current, makes the host / join / quick-match requests, and
 * carries relay and signalling traffic for the room built on top of it.
 *
 * Staying connected is its job: a ping every few seconds, a server that
 * falls silent is treated as gone without waiting for the socket to notice,
 * reconnection backs off quickly and tries every configured server in turn,
 * and coming back to the tab or regaining the network reconnects at once.
 */
import { ONLINE } from '../../data/online.js';

export const PROTOCOL = 1;

/** @typedef {'connecting' | 'online' | 'offline' | 'closed'} ClientState */
/**
 * A lobby as the server lists it.
 * @typedef {{ id: string, name: string, host: string, players: number, max: number, build: number,
 *   state: 'open' | 'playing', public: boolean, map: string, ais: number, speed: string, credits: number }} LobbyCard
 */

/** A request the server refused, or that never got an answer. `code` is the server's (gone, full, build, none, busy…) or `offline` / `timeout`. */
export class LobbyError extends Error {
  /** @param {string} code @param {any} [detail] */
  constructor(code, detail) {
    super(`lobby: ${code}`);
    this.code = code;
    this.detail = detail;
  }
}

/**
 * @param {{
 *   urls: string[], name: string, build: number,
 *   WebSocketImpl?: any, timing?: Partial<typeof ONLINE>, log?: (line: string) => void,
 * }} o
 */
export function createLobbyClient({ urls, name, build, WebSocketImpl = globalThis.WebSocket, timing = {}, log = () => {} }) {
  const T = { ...ONLINE, ...timing };
  /** @type {ClientState} */ let state = 'connecting';
  /** @type {any} */ let ws = null;
  /** @type {{ id: string, token: string } | null} */ let identity = null;
  let urlIndex = 0;
  let attempt = 0;
  let listing = false;
  /** @type {LobbyCard[]} */ let lobbies = [];
  let online = 0;
  /** Round trip to the server (ms), smoothed; null until measured. @type {number | null} */
  let rtt = null;
  let lastHeard = 0;
  let pingSeq = 0;
  /** @type {Map<number, number>} */ const pingsOut = new Map();
  /** @type {any} */ let connectTimer = 0; /** @type {any} */ let retryTimer = 0; /** @type {any} */ let beatTimer = 0; /** @type {any} */ let probeTimer = 0;
  /** The one request awaiting its answer. @type {{ ok: string, resolve: (m: any) => void, reject: (e: Error) => void, timer: any } | null} */
  let pending = null;
  /** @type {Map<string, Set<(m: any) => void>>} */ const listeners = new Map();

  const emit = (/** @type {string} */ type, /** @type {any} */ m) => { for (const fn of [...(listeners.get(type) ?? [])]) fn(m); };
  const setState = (/** @type {ClientState} */ s) => { if (state !== s && state !== 'closed') { state = s; emit('state', s); } };
  const raw = (/** @type {any} */ m) => {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(m)); return true; } catch { return false; }
  };
  const settle = (/** @type {Error | null} */ err, /** @type {any} */ value) => {
    const p = pending;
    if (!p) return;
    pending = null;
    clearTimeout(p.timer);
    if (err) p.reject(err); else p.resolve(value);
  };

  function connect() {
    clearTimeout(retryTimer);
    if (state === 'closed') return;
    if (!urls.length) { setState('offline'); return; }
    const url = urls[urlIndex % urls.length];
    // An attempt still in flight (a stale network, say) is dropped for this one.
    if (ws) { const old = ws; ws = null; old.onopen = old.onmessage = old.onclose = old.onerror = null; try { old.close(); } catch { /* closed */ } }
    /** @type {any} */ let sock;
    try { sock = new WebSocketImpl(url); } catch (e) { log(`cannot open ${url}: ${e}`); down(null); return; }
    ws = sock;
    log(`connecting to ${url}`);
    clearTimeout(connectTimer);
    connectTimer = setTimeout(() => { if (ws === sock && state !== 'online') { log('connect timed out'); down(sock); } }, T.connectTimeoutMs);
    sock.onopen = () => { if (ws === sock) raw({ t: 'hello', v: PROTOCOL, name, build, ...(identity ?? {}) }); };
    sock.onmessage = (/** @type {any} */ e) => { if (ws === sock) incoming(e.data); };
    sock.onclose = (/** @type {any} */ e) => {
      if (ws !== sock) return;
      // The server speaks another protocol: reconnecting cannot help, the game needs updating.
      if (e?.code === 4002) { fatal('version'); return; }
      down(sock);
    };
    sock.onerror = () => { /* a close follows */ };
  }

  /** The connection is gone (or never came): tidy up and try again. @param {any} sock the socket that failed, or null */
  function down(sock) {
    if (state === 'closed') return;
    if (sock) {
      if (ws !== sock) return;
      sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
      try { sock.close(); } catch { /* already closed */ }
    }
    ws = null;
    clearTimeout(connectTimer); clearTimeout(probeTimer); clearInterval(beatTimer);
    pingsOut.clear();
    settle(new LobbyError('offline'), null);
    setState('offline');
    const base = T.backoffMs[Math.min(attempt, T.backoffMs.length - 1)];
    attempt++;
    urlIndex++;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, base * (0.75 + Math.random() * 0.5));
  }

  /** @param {string} why */
  function fatal(why) {
    log(`stopping: ${why}`);
    const sock = ws;
    ws = null;
    if (sock) { sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null; try { sock.close(); } catch { /* closed */ } }
    clearTimeout(connectTimer); clearTimeout(retryTimer); clearTimeout(probeTimer); clearInterval(beatTimer);
    settle(new LobbyError(why), null);
    setState('closed');
    emit('fatal', why);
  }

  function beat() {
    if (state !== 'online') return;
    if (performance.now() - lastHeard > T.silenceMs) { log('server went silent'); down(ws); return; }
    const n = ++pingSeq;
    pingsOut.set(n, performance.now());
    if (pingsOut.size > 8) pingsOut.delete(/** @type {number} */ (pingsOut.keys().next().value));
    raw({ t: 'ping', n });
  }

  /** @param {unknown} text */
  function incoming(text) {
    /** @type {any} */ let m;
    try { m = JSON.parse(String(text)); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    lastHeard = performance.now();
    clearTimeout(probeTimer);
    switch (m.t) {
      case 'welcome':
        identity = { id: m.id, token: m.token };
        online = m.online ?? online;
        attempt = 0;
        clearTimeout(connectTimer);
        clearInterval(beatTimer);
        beatTimer = setInterval(beat, T.pingMs);
        setState('online');
        log(`online as ${m.id}${m.resumed ? ' (seat kept)' : ''}`);
        if (listing) raw({ t: 'list' });
        emit('online', online);
        emit('welcome', m);
        beat();
        break;
      case 'pong': {
        const at = pingsOut.get(m.n);
        if (at !== undefined) {
          pingsOut.delete(m.n);
          const sample = performance.now() - at;
          rtt = rtt == null ? sample : rtt * 0.7 + sample * 0.3;
        }
        if (Number.isFinite(m.online) && m.online !== online) { online = m.online; emit('online', online); }
        break;
      }
      case 'lobbies':
        lobbies = Array.isArray(m.list) ? m.list : [];
        if (Number.isFinite(m.online)) online = m.online;
        emit('lobbies', lobbies);
        emit('online', online);
        break;
      case 'error':
        if (m.code === 'version') { fatal('version'); break; }
        if (pending) settle(new LobbyError(String(m.code), m), null); else emit('error', m);
        break;
      default:
        if (pending && m.t === pending.ok) settle(null, m);
        emit(m.t, m);
    }
  }

  /** Ask the server for something and wait for its answer. @param {any} msg @param {string} ok the reply type that means yes */
  function request(msg, ok) {
    if (pending) return Promise.reject(new LobbyError('busy'));
    if (!raw(msg)) return Promise.reject(new LobbyError('offline'));
    return new Promise((resolve, reject) => {
      pending = { ok, resolve, reject, timer: setTimeout(() => settle(new LobbyError('timeout'), null), T.requestTimeoutMs) };
    });
  }

  /** Something suggests the link may have died (tab back, network change): find out now. */
  function check() {
    if (state === 'closed') return;
    if (state !== 'online') { attempt = 0; connect(); return; }
    beat();
    clearTimeout(probeTimer);
    const sock = ws;
    probeTimer = setTimeout(() => { if (ws === sock && state === 'online') { log('no answer to the probe'); down(sock); } }, T.probeMs);
  }
  const onVisible = () => { if (typeof document === 'undefined' || !document.hidden) check(); };
  if (typeof addEventListener === 'function') {
    addEventListener('online', check);
    addEventListener('pageshow', onVisible);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  }

  connect();

  return {
    get state() { return state; },
    /** Players connected to the server right now. */
    get online() { return online; },
    get lobbies() { return lobbies; },
    /** Round trip to the server (ms), or null. */
    get rtt() { return rtt; },
    get name() { return name; },
    /** True when no server is configured at all. */
    get unconfigured() { return !urls.length; },
    /**
     * Listen for server messages by type (peer-joined, peer-left, peer-away,
     * peer-back, relay, sig, lobby, welcome) or for `state`, `lobbies`,
     * `online`, `fatal`. Returns the function that stops listening.
     * @param {string} type @param {(m: any) => void} fn
     */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
      return () => { listeners.get(type)?.delete(fn); };
    },
    /** Keep the lobby list coming (the browser screen), or stop. @param {boolean} on */
    subscribe(on) {
      listing = on;
      raw({ t: 'list', on });
    },
    /** @param {{ name: string, public: boolean, info: any }} o @returns {Promise<{ lobby: LobbyCard }>} */
    host: (o) => request({ t: 'host', ...o }, 'hosted'),
    /** @param {string} id @returns {Promise<{ lobby: LobbyCard, peer: { name: string } }>} */
    join: (id) => request({ t: 'join', id }, 'joined'),
    /** Join whichever open game has waited longest. @returns {Promise<{ lobby: LobbyCard, peer: { name: string } }>} */
    quick: () => request({ t: 'quick' }, 'joined'),
    /** Host: change what the list shows about the lobby. @param {{ name?: string, public?: boolean, state?: 'open' | 'playing', info?: any }} patch */
    info: (patch) => raw({ t: 'info', ...patch }),
    /** Leave the lobby (the connection stays). */
    leave: () => raw({ t: 'leave' }),
    /** Send to the server; false when not connected. @param {any} msg */
    send: raw,
    check,
    close() {
      if (state === 'closed') return;
      const sock = ws;
      ws = null;
      clearTimeout(connectTimer); clearTimeout(retryTimer); clearTimeout(probeTimer); clearInterval(beatTimer);
      settle(new LobbyError('offline'), null);
      if (sock) { sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null; try { sock.close(1000); } catch { /* closed */ } }
      if (typeof removeEventListener === 'function') {
        removeEventListener('online', check);
        removeEventListener('pageshow', onVisible);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      }
      state = 'closed';
      listeners.clear();
    },
  };
}

/** @typedef {ReturnType<typeof createLobbyClient>} LobbyClient */
