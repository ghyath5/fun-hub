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
  // A scanner already holds the camera: that grant does the same job.
  if (scanners > 0 || !navigator.mediaDevices?.getUserMedia) return;
  await withCamera(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
    } catch { /* no camera or refused: pairing still works with pasted codes */ }
  });
}

/*
 * Camera access, one request at a time. Phones refuse (or silently kill) a
 * second camera request while another is opening or open — Android answers
 * "NotReadableError", iOS ends the first stream — so the scanner and the
 * warm-up above must never race. Every request waits for the previous one.
 */
let cameraQueue = Promise.resolve();
/** Scanners currently holding the camera. */
let scanners = 0;
/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function withCamera(fn) {
  const run = cameraQueue.then(fn, fn);
  cameraQueue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Why the camera could not start, for the message the player sees:
 * insecure (page not on https), unsupported (no camera API), denied
 * (permission refused), missing (no camera), busy (held by another app).
 */
export class CameraError extends Error {
  /** @param {'insecure' | 'unsupported' | 'denied' | 'missing' | 'busy'} kind @param {string} [detail] */
  constructor(kind, detail = '') {
    super(`camera ${kind}${detail ? `: ${detail}` : ''}`);
    this.kind = kind;
  }
}

const pause = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** Open the back camera, falling back to any camera; retried while the device is busy. */
async function openCamera() {
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  const asks = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
    { video: true, audio: false },
  ];
  /** @type {any} */
  let last = null;
  for (const ask of asks) {
    try {
      return await navigator.mediaDevices.getUserMedia(ask);
    } catch (e) {
      last = e;
      const name = /** @type {any} */ (e)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', name);
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') throw new CameraError('missing', name);
      await pause(400); // busy or over-constrained: give the device a moment, then ask more simply
    }
  }
  throw new CameraError('busy', String(last?.name ?? last));
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

/** While the link is marked down: how often to look for a fresh heartbeat, and how fresh it must be (ms). */
const LIVENESS_CHECK_MS = 500;
const HEARD_RECENTLY_MS = 1500;

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
  // Both phones can mark the link down at the same moment (each was busy
  // building the match and missed the other's heartbeats). Then neither
  // sends game messages, so the check above never fires, and an ICE restart
  // on a healthy path changes no state: the match would hang for the full
  // minute and then give up. Heartbeats keep flowing while down, and the
  // engine stamps each one in `rxAt`, so one that arrived after the drop
  // is the same proof of life as a game message.
  const liveness = setInterval(() => {
    if (!peer.down || peer.closed) return;
    if (peer.rxAt > peer.downAt && performance.now() - peer.rxAt < HEARD_RECENTLY_MS) {
      Duel.Diag.log('heartbeat received while marked down: link is alive');
      peer._maybeUp();
    }
  }, LIVENESS_CHECK_MS);
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
      clearInterval(liveness);
      peer.close();
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof createLink>>} Link */

/** Draw a QR code for text into an element; false if it does not fit. @param {HTMLElement} el @param {string} text */
export async function drawQr(el, text) {
  await loadEngine();
  const make = /** @type {any} */ (window).qrcode;
  let qr;
  try {
    // Lowest error correction: a screen is a clean source, and fewer, larger
    // modules are what a phone camera at arm's length actually needs.
    qr = make(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
  } catch {
    el.textContent = '';
    return false;
  }
  el.innerHTML = qr.createSvgTag({ cellSize: QR_CELL_PX, margin: QR_CELL_PX * QR_QUIET_MODULES, scalable: true });
  return true;
}

/** QR drawing: module size in the SVG's own units, and the blank border every reader expects (in modules). */
const QR_CELL_PX = 4;
const QR_QUIET_MODULES = 4;

/** Width (px) a camera frame is scaled to before jsQR reads it: enough for a dense code, cheap enough per frame. */
const SCAN_WIDTH_PX = 960;
/** Errors from the browser's own QR reader before the scanner stops using it. */
const NATIVE_FAILURES_ALLOWED = 3;

/** Ask the camera to keep refocusing (a code on a screen is close); cameras that cannot simply ignore it. @param {MediaStream} stream */
function keepInFocus(stream) {
  for (const track of stream.getVideoTracks()) {
    const modes = /** @type {any} */ (track.getCapabilities?.() ?? {}).focusMode;
    if (Array.isArray(modes) && modes.includes('continuous')) {
      track.applyConstraints(/** @type {any} */ ({ advanced: [{ focusMode: 'continuous' }] })).catch(() => {});
    }
  }
}

/**
 * Scan QR codes from the camera into a video element until one reads.
 * @param {HTMLVideoElement} video @param {(code: string) => void} found
 * @returns {Promise<() => void>} stop
 */
export async function scanQr(video, found) {
  const Duel = await loadEngine();
  scanners++;
  /** @type {MediaStream} */
  let stream;
  try {
    stream = await withCamera(openCamera);
  } catch (e) {
    scanners--;
    throw e;
  }
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  keepInFocus(stream);

  // The browser's own QR reader where there is one (Chrome on Android): faster and better in poor light.
  const W = /** @type {any} */ (window);
  let native = null;
  try {
    if (W.BarcodeDetector && (await W.BarcodeDetector.getSupportedFormats()).includes('qr_code')) native = new W.BarcodeDetector({ formats: ['qr_code'] });
  } catch { native = null; }
  const buf = document.createElement('canvas');
  const bx = /** @type {CanvasRenderingContext2D} */ (buf.getContext('2d', { willReadFrequently: true }));
  let alive = true;
  let frame = 0;
  let nativeFailures = 0;
  const stop = () => {
    if (!alive) return;
    alive = false;
    scanners--;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  /** @param {string} raw */
  const hit = (raw) => { if (!alive || !raw) return; stop(); found(Duel.Qr.extract(raw)); };
  /** The browser's reader; '' when it finds nothing or cannot run (then the frame is read by hand). */
  const readNative = async () => {
    try {
      return String((await native.detect(video))[0]?.rawValue ?? '');
    } catch {
      // Present but not working (on Android it needs a system module that may be missing): stop asking.
      if (++nativeFailures >= NATIVE_FAILURES_ALLOWED) native = null;
      return '';
    }
  };
  /** Read the current frame with jsQR. @param {number} vw */
  const readPixels = (vw) => {
    try {
      const w = Math.min(SCAN_WIDTH_PX, vw);
      const h = Math.round((video.videoHeight * w) / vw);
      buf.width = w;
      buf.height = h;
      bx.drawImage(video, 0, 0, w, h);
      const px = bx.getImageData(0, 0, w, h);
      // Every few frames also look for light-on-dark codes (a screen in dark mode).
      return String(W.jsQR(px.data, w, h, { inversionAttempts: frame++ % 4 === 3 ? 'attemptBoth' : 'dontInvert' })?.data ?? '');
    } catch {
      return ''; // a frame that could not be read
    }
  };
  const tick = async () => {
    if (!alive) return;
    // A stream the system ended (another app took the camera) is reopened.
    if (stream.getVideoTracks().every((t) => t.readyState === 'ended')) {
      try { stream = await withCamera(openCamera); video.srcObject = stream; await video.play().catch(() => {}); keepInFocus(stream); } catch { /* keep trying */ }
    }
    const vw = video.videoWidth;
    if (vw && video.readyState >= 2) {
      const raw = (native ? await readNative() : '') || readPixels(vw);
      if (raw) { hit(raw); return; }
    }
    if (alive) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return stop;
}

/** The engine's connection log, for the diagnostics panel. */
export const diagnostics = {
  async report() { return (await loadEngine()).Diag.report(); },
  async log(/** @type {string} */ line) { (await loadEngine()).Diag.log(line); },
  async setStun(/** @type {boolean} */ on) { (await loadEngine()).Peer.stun = on; },
  async stun() { return !!(await loadEngine()).Peer.stun; },
};
