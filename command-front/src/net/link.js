// @ts-check
/**
 * The link between two phones on the same WiFi.
 *
 * Everything that touches WebRTC is the Fun Hub's duel-net engine
 * (vendor/duel-net.js, copied unmodified): its compressed-SDP codes, its
 * peer with two data channels, heartbeat and ICE-restart recovery, its QR
 * drawing and scanning, and its diagnostics log. This module only loads it
 * on demand and gives the game a small, typed surface over `Duel.Peer`,
 * `Duel.Qr` and `Duel.Diag`. It never calls `Duel.start`: Command Front has
 * its own screens and its own (lockstep) match loop.
 *
 * Pairing, as on every Fun Hub game:
 *   host  → invite link `…/#o=<code>` shown as a QR (the stock camera opens it)
 *   guest → answers automatically, shows its reply code as a QR / share text
 *   host  → scans or pastes the reply; both channels open → `ready`.
 */

const SCRIPTS = ['./vendor/qrcode.min.js', './vendor/jsqr.min.js', './vendor/duel-net.js'];

/** @type {Promise<any> | null} */
let loading = null;

/** Load the engine once (classic scripts, in order). @returns {Promise<any>} window.Duel */
export function loadEngine() {
  if (/** @type {any} */ (window).Duel) return Promise.resolve(/** @type {any} */ (window).Duel);
  loading ??= SCRIPTS.reduce((chain, src) => chain.then(() => new Promise((done, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => done(undefined);
    s.onerror = () => fail(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  })), Promise.resolve()).then(() => /** @type {any} */ (window).Duel);
  return loading;
}

/**
 * Asking for the camera before the peer exists makes browsers stop hiding
 * the phone's LAN address behind a `.local` alias, which is what makes the
 * direct connection reliable (see the engine's pairing notes). Mirrors the
 * engine's own private warmCamera().
 */
export async function warmCamera() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
  } catch { /* no camera or refused: pairing still works with pasted codes */ }
}

/** The invite or reply code inside whatever was scanned or pasted. @param {string} raw */
export const extractCode = (raw) => {
  const m = /[#?&](?:o|a)=([A-Za-z0-9_-]+)/.exec(raw || '');
  return (m ? m[1] : String(raw || '').trim()).replace(/\s+/g, '');
};

/** The invite code in this page's own URL (a guest arriving from the host's QR), or null. */
export const inviteInUrl = () => /[#?&]o=([A-Za-z0-9_-]+)/.exec(location.hash + location.search)?.[1] ?? null;

/** The link a guest's camera opens. @param {string} code */
export const inviteLink = (code) => `${location.href.split('#')[0].split('?')[0]}#o=${code}`;

/**
 * @typedef {object} LinkEvents
 * @property {() => void} [ready]          Both channels open: paired
 * @property {(msg: any) => void} [message]
 * @property {(why: string) => void} [drop]   The link went quiet; the engine is trying to recover
 * @property {() => void} [resume]         Recovered
 * @property {() => void} [giveup]         Recovery gave up (offer Retry / Leave)
 * @property {() => void} [failed]         Pairing never connected
 */

/**
 * One side of a two-phone link.
 * @param {'host' | 'guest'} role
 * @param {LinkEvents} on
 */
export async function createLink(role, on) {
  const Duel = await loadEngine();
  await warmCamera();
  const peer = new Duel.Peer(role === 'host');
  peer.onready = () => on.ready?.();
  peer.onmsg = (/** @type {any} */ d) => {
    // A message arriving is the plainest proof the link works. The engine
    // declares a drop after 3.5 s without a heartbeat, which a phone busy
    // building a match can trip on its own; and only the host renegotiates,
    // so a guest that wrongly thinks it is down would wait out the full
    // minute. `_maybeUp` is the engine's own "positive signal" entry: it
    // checks both channels are open before resuming anything.
    if (peer.down) {
      Duel.Diag.log('message received while marked down: link is alive');
      peer._maybeUp();
    }
    on.message?.(d);
  };
  peer.ondrop = (/** @type {string} */ why) => on.drop?.(why);
  peer.onresume = () => on.resume?.();
  peer.ongiveup = () => on.giveup?.();
  peer.onlost = () => { Duel.Diag.log('!! no candidate pair worked'); on.failed?.(); };

  let open = true;
  return {
    role,
    /** Host: the invite link to show as a QR. */
    invite: async () => inviteLink(await peer.makeOffer()),
    /** Guest: answer an invite code; returns the reply code to show back. @param {string} code */
    answer: (code) => peer.answerTo(code),
    /** Host: take the guest's reply code. @param {string} code */
    accept: (code) => peer.takeAnswer(code),
    /** Send on the reliable, ordered channel (dropped while the link is down). @param {any} msg */
    send: (msg) => peer.send('cmd', msg),
    /** Is the link currently considered down? */
    get down() { return !!peer.down; },
    get up() { return !!peer.up && !peer.down; },
    /** Manual retry once automatic recovery gave up. */
    retry: () => peer.retry(),
    /** The tab came back to the foreground: check the link at once. */
    probe: () => peer.probe(),
    close() {
      if (!open) return;
      open = false;
      peer.close();
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof createLink>>} Link */

/** Draw a QR code for text into an element; false if it does not fit. @param {HTMLElement} el @param {string} text */
export async function drawQr(el, text) {
  const Duel = await loadEngine();
  return Duel.Qr.draw(el, text);
}

/**
 * Scan QR codes from the camera into a video element until one reads.
 * @param {HTMLVideoElement} video @param {(code: string) => void} found
 * @returns {Promise<() => void>} stop
 */
export async function scanQr(video, found) {
  const Duel = await loadEngine();
  return Duel.Qr.scan(video, found);
}

/** The engine's connection log, for the diagnostics panel. */
export const diagnostics = {
  async report() { return (await loadEngine()).Diag.report(); },
  async log(/** @type {string} */ line) { (await loadEngine()).Diag.log(line); },
  async setStun(/** @type {boolean} */ on) { (await loadEngine()).Peer.stun = on; },
  async stun() { return !!(await loadEngine()).Peer.stun; },
};
