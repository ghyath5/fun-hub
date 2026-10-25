// @ts-check
/**
 * Boot: check the launch environment, register the service worker and start
 * the application flow (src/game/app.js).
 */
import { startApp } from './game/app.js';
import { showBlocking } from './ui/menus.js';
import { watchFit } from './ui/fit.js';
import { mountLoadingBar } from './ui/loadingBar.js';
import { track } from './lib/progress.js';

const debug = new URLSearchParams(location.search).has('debug');
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.warn('Service worker not registered', e);
  }
}

/** In ?debug mode, warn about loaded files the service worker would not cache offline. */
async function auditPrecache() {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg?.active) return;
  const channel = new MessageChannel();
  const list = await new Promise((resolve) => {
    channel.port1.onmessage = (e) => resolve(e.data);
    reg.active?.postMessage({ type: 'precache-list' }, [channel.port2]);
  });
  const cached = new Set(/** @type {string[]} */ (list).map((p) => new URL(p, location.href).pathname));
  const loaded = performance.getEntriesByType('resource')
    .map((r) => new URL(r.name))
    .filter((u) => u.origin === location.origin && !u.pathname.endsWith('.map'))
    .map((u) => u.pathname);
  const missing = [...new Set(loaded)].filter((p) => !cached.has(p) && !p.endsWith('/sw.js'));
  if (missing.length) console.warn('[precache] loaded but missing from PRECACHE:', missing);
}

async function loadDebugTools() {
  await import('./lib/debugTools.js').then((m) => m.mountDebugTools()).catch((e) => console.warn('debug tools', e));
}

async function boot() {
  await track(startApp({ hudEl: $('hud'), worldEl: $('world'), screensEl: $('screens'), debug }));
  for (const ev of ['gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  if (debug) {
    loadDebugTools();
    auditPrecache();
  }
}

if (location.protocol === 'file:') {
  // index.html already shows the "serve this folder" card; nothing to start.
} else {
  watchFit();
  mountLoadingBar();
  registerServiceWorker();
  boot().catch((err) => {
    console.error(err);
    showBlocking($('hud'), 'Command Front could not start', String(err?.stack ?? err));
  });
}
