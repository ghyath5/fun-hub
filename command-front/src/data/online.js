// @ts-check
/**
 * Online play: where the lobby server is, and how the link to it behaves.
 *
 * `servers` is the one thing to set after deploying the lobby server (see
 * server/README.md): its wss:// address. More than one is tried in turn.
 * While it is empty the Online screen says the server is not set up; the
 * rest of the game is unaffected.
 */
export const ONLINE = Object.freeze({
  /** Lobby servers, e.g. ['wss://command-front-lobby.example.workers.dev']. */
  servers: /** @type {string[]} */ ([]),

  /**
   * Try to connect the two players straight to each other (WebRTC) once they
   * share a lobby. It is the faster path; the server relay carries the match
   * until it opens and whenever it cannot. A direct link shows each player's
   * network address to the other, as any peer-to-peer game does: set false
   * to keep every match on the relay.
   */
  direct: true,
  /** STUN servers that tell each browser its public address for the direct link. */
  ice: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }],

  // ---- The link to the lobby server.
  /** A connection attempt that has not opened by now is abandoned (ms). */
  connectTimeoutMs: 8000,
  /** Waits between reconnection attempts (ms); the last one repeats. Each is jittered ±25 %. */
  backoffMs: [250, 500, 1000, 2000, 4000, 5000],
  /** A ping goes out this often, and a server silent this long is treated as gone (ms). */
  pingMs: 3000,
  silenceMs: 9000,
  /** After the tab comes back or the network changes: how long the server has to answer before reconnecting (ms). */
  probeMs: 2500,
  /** A request (host, join, quick match) unanswered this long has failed (ms). */
  requestTimeoutMs: 8000,

  // ---- The link to the other player.
  /** An unacknowledged message is sent again after this long (ms). */
  resendMs: 2000,
  /** An acknowledgement with nothing to ride on is sent on its own after this long (ms). */
  ackMs: 150,
  /** Player-to-player ping interval (ms). */
  peerPingMs: 2000,
  /** A direct link silent this long is dropped for the relay (ms). */
  directSilenceMs: 6000,
  /** A direct link that has not opened by now is abandoned (ms). */
  directTimeoutMs: 15000,
  /** Waits before trying the direct link again (ms); after the last, only a reconnect tries again. */
  directRetryMs: [2000, 5000, 15000, 30000, 60000],
  /** With no way to reach the other player for this long, the match offers Try again / Play on alone (ms). */
  giveUpMs: 60000,

  // ---- Lockstep over the internet.
  /** Input delay (s) = half the measured round trip plus this margin, kept within these bounds. LAN play uses 0.2. */
  lagMarginSeconds: 0.12,
  lagMinSeconds: 0.2,
  lagMaxSeconds: 0.6,
});

/** May the server be chosen from the address bar? Only on a developer's own machine. */
const isLocal = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** The lobby servers to use. On localhost, `?server=ws://localhost:8787` overrides the list. */
export function serverUrls() {
  if (isLocal()) {
    const override = new URLSearchParams(location.search).get('server');
    if (override && /^wss?:\/\//.test(override)) return [override];
  }
  return ONLINE.servers.filter((u) => /^wss?:\/\//.test(u));
}

/** The server's head-count address for a socket address. @param {string} wsUrl */
export const statsUrl = (wsUrl) => `${wsUrl.replace(/^ws/, 'http').replace(/\/+$/, '')}/stats`;

/**
 * Lockstep input delay for a measured round trip between the two players.
 * @param {number | null} rttMs null when not measured yet
 * @returns {number} seconds, a multiple of 0.05 so both players read the same number
 */
export function lagFor(rttMs) {
  const raw = rttMs == null ? ONLINE.lagMinSeconds + 0.1 : rttMs / 2000 + ONLINE.lagMarginSeconds;
  const clamped = Math.min(ONLINE.lagMaxSeconds, Math.max(ONLINE.lagMinSeconds, raw));
  return Math.round(Math.ceil(clamped * 20 - 1e-9)) / 20;
}
