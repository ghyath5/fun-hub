// @ts-check
/**
 * Saving and loading a match (section 18). A snapshot is the full sim state
 * as plain JSON — map (with its live terrain and ore), seed and RNG state,
 * tick, players, entities, queued commands, projectiles, timers, AI memory,
 * shroud, mines, crates and settings. Derived structures (occupancy,
 * passability, pathfinder grids) are rebuilt from it on load. UI state is
 * never saved. Loading is exact when no path search was in flight at save
 * time; `pendingSearches` lets callers pick such a tick.
 */
import { createWorld } from '../sim/world.js';
import { createRng } from '../lib/rng.js';
import { occupy } from '../sim/entities/units.js';
import { occupyStructure } from '../sim/entities/structures.js';
import { requestPath } from '../sim/systems/movement.js';

/** Bumped whenever the snapshot layout changes; older saves are refused, never half-loaded. */
export const SNAPSHOT_VERSION = 2;

/** @typedef {import('../sim/world.js').World} World */

const clone = (/** @type {any} */ v) => JSON.parse(JSON.stringify(v));

/** Path searches still running (a save taken now would not replay them exactly). @param {World} w */
export const pendingSearches = (w) => w.entities.all().filter((e) => !e.dead && e.pathReq > 0).length;

/** @param {World} w */
export function snapshot(w) {
  const m = w.map;
  return {
    version: SNAPSHOT_VERSION,
    map: {
      id: m.id, name: m.name, width: m.width, height: m.height, maxPlayers: m.maxPlayers, theme: m.theme,
      terrain: Array.from(m.terrain), bales: Array.from(m.bales), gem: Array.from(m.gem),
      starts: clone(m.starts), bridges: clone(m.bridges ?? []), neutral: clone(m.neutral ?? []),
    },
    seed: w.seed,
    tick: w.tick,
    rng: w.rng.state(),
    settings: clone(w.settings),
    players: clone(w.players),
    entities: { nextId: w.entities.nextId, list: clone(w.entities.all().filter((e) => !e.dead)) },
    queue: clone(w.queue),
    projectiles: clone(w.projectiles),
    projectileSeq: w.projectileSeq,
    pathToken: w.pathToken,
    damage: clone(w.damage),
    oreReserved: [...w.oreReserved],
    rubble: clone(w.rubble),
    pendingPlacements: clone(w.pendingPlacements),
    deploying: clone(w.deploying),
    pendingSpawns: clone(w.pendingSpawns),
    vision: Object.fromEntries(Object.entries(w.vision).map(([t, v]) => [t, { explored: Array.from(v.explored), seen: Array.from(v.seen) }])),
    stamps: [...w.stamps],
    terrainHp: [...w.terrainHp],
    bridges: clone(w.bridges),
    mines: [...w.mines],
    c4: clone(w.c4),
    crates: clone(w.crates),
    ai: clone(w.ai),
    result: clone(w.result),
    navTemp: w.nav.exportTemp(),
  };
}

/** Rebuild a live world from a snapshot. @param {ReturnType<typeof snapshot>} s @returns {World} */
export function restore(s) {
  if (!s || s.version !== SNAPSHOT_VERSION) {
    throw new Error(`This save was made by a different version of the game (snapshot ${s?.version}, need ${SNAPSHOT_VERSION}).`);
  }
  const map = {
    ...s.map,
    terrain: Uint8Array.from(s.map.terrain),
    bales: Uint8Array.from(s.map.bales),
    gem: Uint8Array.from(s.map.gem),
  };
  const w = createWorld({ map: /** @type {any} */ (map), seed: s.seed, players: clone(s.players), settings: { ...s.settings, revealMap: false } });
  w.settings = clone(s.settings);
  w.tick = s.tick;
  w.rng = createRng(s.seed, s.rng);
  w.entities.restore(s.entities.nextId, clone(s.entities.list));
  // Occupancy and passability come back from where everything stands.
  for (const e of w.entities.all()) if (e.kind === 'structure') occupyStructure(w, e);
  w.nav.rebuild();
  for (const u of w.entities.all()) {
    if (u.kind !== 'unit' || u.inside) continue;
    // Saves from the build where Coalition harvesters charged before warping: drive to the held dock instead.
    if (u.harv?.state === 'chrono') u.harv.state = 'docking';
    occupy(w, u, u.cx, u.cy, u.spot);
    if (u.next) occupy(w, u, u.next.x, u.next.y, u.next.spot);
  }
  w.nav.importTemp(s.navTemp ?? []);
  w.queue = clone(s.queue);
  w.projectiles = clone(s.projectiles);
  w.projectileSeq = s.projectileSeq;
  w.pathToken = s.pathToken;
  w.damage = clone(s.damage);
  w.oreReserved = new Map(s.oreReserved);
  w.rubble = clone(s.rubble);
  w.pendingPlacements = clone(s.pendingPlacements);
  w.deploying = clone(s.deploying);
  w.pendingSpawns = clone(s.pendingSpawns);
  for (const [t, v] of Object.entries(s.vision)) {
    const team = /** @type {any} */ (w.vision)[t];
    if (!team) continue;
    team.explored.set(v.explored);
    team.seen.set(v.seen);
  }
  w.stamps = new Map(s.stamps);
  w.terrainHp = new Map(s.terrainHp);
  w.bridges = clone(s.bridges);
  w.mines = new Map(s.mines);
  w.c4 = clone(s.c4);
  w.crates = clone(s.crates);
  w.ai = clone(s.ai);
  w.result = clone(s.result);
  // Searches that were in flight start again (same order: ascending id).
  for (const u of w.entities.all()) {
    if (u.kind !== 'unit' || !u.pathReq) continue;
    u.pathReq = 0;
    requestPath(w, u);
  }
  return w;
}
