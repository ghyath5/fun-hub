// @ts-check
/**
 * Fetching the newest build on request. The service worker serves the game
 * from its cache, so a new build normally arrives one visit late; this asks
 * for it now, waits until it has taken over, and reloads into it.
 */

/** Longest wait (ms) for the new build to download and take over before reloading anyway. */
const UPDATE_WAIT_MS = 90000;

/** @param {ServiceWorker} worker @returns {Promise<void>} resolved once it is active (or has failed) */
const settled = (worker) => new Promise((done) => {
  const check = () => { if (worker.state === 'activated' || worker.state === 'redundant') done(); };
  worker.addEventListener('statechange', check);
  check();
});

/** Update to the newest build and reload. Reloads even when nothing newer is found or the wait runs out. */
export async function updateGame() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      const incoming = reg.installing ?? reg.waiting;
      if (incoming) await Promise.race([settled(incoming), new Promise((done) => setTimeout(done, UPDATE_WAIT_MS))]);
    }
  } catch { /* offline or no service worker: the reload below is all that can be done */ }
  location.reload();
}
