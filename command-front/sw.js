/* Command Front service worker: cache-first, versioned. Hand-maintained list —
   add every file the game loads; ?debug warns at startup about any that are missing.
   Bump CACHE whenever a listed file changes. */
const CACHE = 'command-front-v16';

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon.svg',
  './maps/crossroads.json',
  './maps/duel-canyon.json',
  './maps/twin-rivers.json',
  './src/ai/army.js',
  './src/ai/brain.js',
  './src/ai/buildOrders.js',
  './src/ai/placement.js',
  './src/core/events.js',
  './src/core/fixed.js',
  './src/core/loop.js',
  './src/data/factions.js',
  './src/data/rules.js',
  './src/data/structures.js',
  './src/data/terrain.js',
  './src/data/ui.js',
  './src/data/units.js',
  './src/data/warheads.js',
  './src/data/weapons.js',
  './src/game/app.js',
  './src/game/bench.js',
  './src/game/matchSetup.js',
  './src/game/session.js',
  './src/input/context.js',
  './src/input/desktop.js',
  './src/input/gestures.js',
  './src/input/hitTest.js',
  './src/input/intents.js',
  './src/input/modes.js',
  './src/input/selection.js',
  './src/lib/audio.js',
  './src/lib/debugTools.js',
  './src/lib/haptics.js',
  './src/lib/noise.js',
  './src/lib/pathfinder.js',
  './src/lib/rng.js',
  './src/lib/storage.js',
  './src/main.js',
  './src/map/generator.js',
  './src/map/grid.js',
  './src/map/loader.js',
  './src/map/validator.js',
  './src/render/app.js',
  './src/render/camera.js',
  './src/render/combatFx.js',
  './src/render/fx.js',
  './src/render/icons.js',
  './src/render/perfMonitor.js',
  './src/render/placementOverlay.js',
  './src/render/shroud.js',
  './src/render/spriteBaker.js',
  './src/render/structureBaker.js',
  './src/render/structures.js',
  './src/render/terrainChunks.js',
  './src/render/units.js',
  './src/save/serialize.js',
  './src/sim/air.js',
  './src/sim/baseCommands.js',
  './src/sim/capture.js',
  './src/sim/catalog.js',
  './src/sim/commands.js',
  './src/sim/defs.js',
  './src/sim/entities/store.js',
  './src/sim/entities/structures.js',
  './src/sim/entities/units.js',
  './src/sim/flowField.js',
  './src/sim/formulas/combat.js',
  './src/sim/formulas/economy.js',
  './src/sim/formulas/production.js',
  './src/sim/fsm.js',
  './src/sim/groupMove.js',
  './src/sim/hash.js',
  './src/sim/mines.js',
  './src/sim/nav.js',
  './src/sim/naval.js',
  './src/sim/occupancy.js',
  './src/sim/placement.js',
  './src/sim/players.js',
  './src/sim/setup.js',
  './src/sim/spatial.js',
  './src/sim/specials.js',
  './src/sim/systems/acquisition.js',
  './src/sim/systems/ai.js',
  './src/sim/systems/crates.js',
  './src/sim/systems/damage.js',
  './src/sim/systems/harvest.js',
  './src/sim/systems/movement.js',
  './src/sim/systems/ore.js',
  './src/sim/systems/power.js',
  './src/sim/systems/production.js',
  './src/sim/systems/projectiles.js',
  './src/sim/systems/shroud.js',
  './src/sim/systems/supportPowers.js',
  './src/sim/systems/victory.js',
  './src/sim/systems/weapons.js',
  './src/sim/targeting.js',
  './src/sim/terrainDamage.js',
  './src/sim/transports.js',
  './src/sim/world.js',
  './src/types.js',
  './src/ui/alerts.js',
  './src/ui/battleEvents.js',
  './src/ui/commandBar.js',
  './src/ui/fit.js',
  './src/ui/gameEvents.js',
  './src/ui/hud.js',
  './src/ui/menus.js',
  './src/ui/minimap.js',
  './src/ui/model.js',
  './src/ui/press.js',
  './src/ui/screens.js',
  './src/ui/sidebar.js',
  './src/ui/store.js',
  './src/ui/toasts.js',
  './vendor/easystar.min.js',
  './vendor/fflate.mjs',
  './vendor/howler.min.js',
  './vendor/htm-preact-standalone.mjs',
  './vendor/idb-keyval.mjs',
  './vendor/pixi-viewport.mjs',
  './vendor/pixi.min.mjs',
  './vendor/seedrandom.min.js',
  './vendor/simplex-noise.mjs',
  './vendor/stats.min.js',
  './vendor/tweakpane.min.mjs',
  './vendor/zzfx.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('command-front-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'precache-list') event.ports[0]?.postMessage(PRECACHE);
});
