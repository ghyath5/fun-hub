// @ts-check
/**
 * Full screen, the way browsers allow it. A page may only enter full screen
 * from a user gesture, so the game asks on the player's first tap or click
 * (and again when a match starts, if they left it), locks phones to
 * landscape while there, and stops asking if the player turns it off in
 * Settings. iPhones have no full-screen API for pages: there the answer is
 * "Add to Home Screen", which opens the game without any browser bars (the
 * manifest asks for `display: fullscreen`).
 */

const doc = /** @type {any} */ (document);

/** The page is in full screen (or running as an installed app, which is the same thing). */
export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement)
  || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
  || /** @type {any} */ (navigator).standalone === true;

/** This browser can put the page in full screen. */
export const canFullscreen = () => !!(document.documentElement.requestFullscreen || /** @type {any} */ (document.documentElement).webkitRequestFullscreen);

/** iPhone / iPod Safari: no API, only Add to Home Screen. */
export const needsHomeScreen = () => !canFullscreen() && /iPhone|iPod/.test(navigator.userAgent) && !isFullscreen();

/** Enter full screen and, on phones, hold landscape. Must run inside a user gesture. Never throws. */
export async function enterFullscreen() {
  if (isFullscreen() || !canFullscreen()) return false;
  const el = /** @type {any} */ (document.documentElement);
  try {
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
  } catch { return false; }
  try { await /** @type {any} */ (screen.orientation)?.lock?.('landscape'); } catch { /* desktops and some phones refuse */ }
  return true;
}

/**
 * Ask for full screen on the first tap or click, and whenever `request()` is
 * called from a gesture (match start). If the player leaves full screen
 * themselves, the automatic first-tap request stays off until the next
 * match, so the game never fights them.
 * @param {() => boolean} wanted the player's setting
 */
export function autoFullscreen(wanted) {
  let declined = false;
  const onGesture = (/** @type {Event} */ e) => {
    if (/** @type {KeyboardEvent} */ (e).key === 'Escape') return;
    if (!wanted() || declined || isFullscreen()) return;
    enterFullscreen().then((ok) => { if (!ok) declined = true; });
  };
  const onChange = () => { if (!isFullscreen()) declined = true; };
  document.addEventListener('pointerup', onGesture, true);
  document.addEventListener('keydown', onGesture, true);
  document.addEventListener('fullscreenchange', onChange);
  return {
    /** A match is starting from a tap: ask again even if they left it last time. */
    request() {
      if (!wanted()) return;
      declined = false;
      onGesture(new Event('request'));
    },
    detach() {
      document.removeEventListener('pointerup', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      document.removeEventListener('fullscreenchange', onChange);
    },
  };
}
