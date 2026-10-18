// @ts-check
/**
 * The game context: all sim state for one match, and the fixed per-tick
 * system order (section 2). Nothing outside src/sim mutates a World; input
 * and AI only enqueue Commands.
 */
import { createRng } from '../lib/rng.js';
import { createHasher } from './hash.js';
import { createEventQueue } from '../core/events.js';
import { createStore } from './entities/store.js';
import { createOccupancy } from './occupancy.js';
import { createNav } from './nav.js';
import { allied } from './players.js';
import { applyCommands } from './commands.js';
import { movementSystem } from './systems/movement.js';
import { acquisitionSystem } from './systems/acquisition.js';
import { weaponSystem } from './systems/weapons.js';
import { projectileSystem } from './systems/projectiles.js';
import { damageSystem } from './systems/damage.js';
import { createSpatial } from './spatial.js';
import { powerSystem } from './systems/power.js';
import { harvestSystem, harvesterDied } from './systems/harvest.js';
import { oreSystem } from './systems/ore.js';
import { productionSystem } from './systems/production.js';
import { createVision, installShroud, shroudSystem, visionDigest } from './systems/shroud.js';
import { createBridges } from './terrainDamage.js';
import { transportDied } from './transports.js';
import { aircraftDied } from './air.js';
import { unitPowerDied } from './unitPowers.js';
import { supportPowerSystem } from './systems/supportPowers.js';
import { aiSystem } from './systems/ai.js';
import { victorySystem } from './systems/victory.js';
import { crateSystem } from './systems/crates.js';
import { killUnit } from './systems/damage.js';
import { SETUP_DEFAULTS } from '../data/rules.js';

/** @typedef {import('../types.js').MapData} MapData */
/** @typedef {import('../types.js').Command} Command */
/** @typedef {import('./players.js').Player} Player */
/** @typedef {import('./entities/units.js').Unit} Unit */

/**
 * @typedef {object} MatchSettings
 * @property {number} oreGrowthSeconds  0 = off
 * @property {boolean} fog
 * @property {boolean} crates
 * @property {boolean} shortGame
 * @property {number} techLevel
 * @property {boolean} classicBuild      48 s per 1000 credits instead of 40
 * @property {boolean} revealMap         Every team starts with the whole map explored (tests, debugging)
 * @property {boolean} victory           Eliminate players and end the match (off in rule tests with bare worlds)
 */

/** @returns {MatchSettings} */
export const defaultSettings = () => ({
  oreGrowthSeconds: SETUP_DEFAULTS.oreGrowthSeconds,
  fog: SETUP_DEFAULTS.fog,
  crates: SETUP_DEFAULTS.crates,
  shortGame: SETUP_DEFAULTS.shortGame,
  techLevel: SETUP_DEFAULTS.techLevel,
  classicBuild: false,
  revealMap: false,
  victory: true,
});

/**
 * @param {{ map: MapData, seed: string | number, players: Player[], settings?: Partial<MatchSettings> }} opts
 */
export function createWorld({ map, seed, players, settings }) {
  const teams = [...new Set(players.map((p) => p.team))];
  const world = {
    tick: 0,
    seed: String(seed),
    map,
    players,
    rng: createRng(seed),
    /** @type {Command[]} */
    queue: [],
    events: createEventQueue(),
    /** Units and structures (plain objects told apart by `kind`). @type {ReturnType<typeof createStore<any>>} */
    entities: createStore(),
    occ: createOccupancy(map.width, map.height),
    nav: createNav(map, teams),
    pathToken: 0,
    /** @type {import('./systems/weapons.js').Projectile[]} */
    projectiles: [],
    projectileSeq: 0,
    /** Damage collected this tick (systems 6–8), applied in system 9. @type {import('./systems/projectiles.js').DamageRecord[]} */
    damage: [],
    spatial: createSpatial(map.width, map.height),
    settings: { ...defaultSettings(), ...settings },
    /** Ore cell index → harvester that claimed it. @type {Map<number, number>} */
    oreReserved: new Map(),
    /** Rubble cells and the tick they turn back to Clear. @type {{ i: number, until: number }[]} */
    rubble: [],
    /** Called with (world, unit) just before a unit is removed. @type {((w: any, u: any) => void)[]} */
    deathHooks: /** @type {((w: any, u: any) => void)[]} */ ([
      (/** @type {any} */ w, /** @type {any} */ u) => { harvesterDied(w, u); },
      (/** @type {any} */ w, /** @type {any} */ u) => { transportDied(w, u, killUnit); },
      (/** @type {any} */ w, /** @type {any} */ u) => { aircraftDied(w, u); },
      (/** @type {any} */ w, /** @type {any} */ u) => { unitPowerDied(w, u); },
    ]),
    /** Can player `pid` see entity `e`? Replaced by the shroud system (milestone 6). */
    visibleTo: (/** @type {number} */ pid, /** @type {any} */ e) => true,
    /** Has player `pid` explored this cell? Replaced by the shroud system. */
    isExplored: (/** @type {number} */ pid, /** @type {number} */ x, /** @type {number} */ y) => true,
    /** Is there a mine of `pid` (or an ally) in cell i? */
    mineAt: (/** @type {number} */ i, /** @type {number} */ pid) => {
      const m = world.mines.get(i);
      return !!m && allied(players, m.owner, pid);
    },
    /** Placements waiting for friendly units to clear the footprint. @type {any[]} */
    pendingPlacements: [],
    /** MCVs unfolding into Construction Yards. @type {any[]} */
    deploying: [],
    /** Units owed to a player but with no room to appear yet (free Harvesters). @type {any[]} */
    pendingSpawns: [],
    /** @param {number} a @param {number} b */
    allied: (a, b) => allied(players, a, b),
    /** Per-team explored bits and sight counts (system 12). */
    vision: createVision(map.width * map.height, teams),
    /** Sight circles currently stamped, by entity id. @type {Map<number, { x: number, y: number, r: number, team: number }>} */
    stamps: new Map(),
    /** Cell in sight (fog) or explored (shroud). Installed by the shroud system. */
    cellVisible: (/** @type {number} */ pid, /** @type {number} */ x, /** @type {number} */ y) => true,
    /** Damaged trees: cell index → HP left (absent = full). @type {Map<number, number>} */
    terrainHp: new Map(),
    /** Bridges with their shared HP and repair hut. */
    bridges: createBridges(map),
    /** Mines by cell index (section 10). @type {Map<number, { owner: number, kind: string }>} */
    mines: new Map(),
    /** Crates lying on the map (setting). @type {{ i: number, x: number, y: number }[]} */
    crates: [],
    /** Planted C4 charges. @type {{ target: number, at: number, by: number, owner: number }[]} */
    c4: [],
    /** How the match ended (null while it runs). @type {null | { tick: number, draw: boolean, winners: number[], team: number }} */
    result: null,
    /** Bumped whenever a structure appears, finishes, changes owner or goes (cache key). */
    structureEpoch: 0,
    /** Computer players' memory, by player id (section 16). @type {Record<number, any>} */
    ai: {},
    /** Teams whose vision a player sees through. Installed by the shroud system. */
    visionTeams: (/** @type {number} */ pid) => [players[pid].team],
  };
  installShroud(/** @type {any} */ (world)); // typed loosely: World is inferred from this very object
  if (world.settings.revealMap) for (const v of Object.values(world.vision)) v.explored.fill(1);
  return world;
}

/** @typedef {ReturnType<typeof createWorld>} World */

/** Queue a command; it applies at the start of its tick, in arrival order. @param {World} w @param {Command} cmd */
export function enqueue(w, cmd) {
  w.queue.push(cmd);
}

/** Advance one tick, running systems in the fixed order. @param {World} w */
export function step(w) {
  for (const e of w.entities.all()) {
    e.px = e.x;
    e.py = e.y;
    e.pfacing = e.facing;
  }
  applyCommands(w);          // 1. Apply queued commands
  powerSystem(w);            // 2. Power recompute (only if dirty)
  productionSystem(w);       // 3. Production, spending and structure upkeep
  aiSystem(w);               // 4. AI think (staggered; enqueues commands for the next tick)
  acquisitionSystem(w);      // 5. Target acquisition and engagement
  movementSystem(w);         // 6. Movement and pathing (crushing collects damage)
  weaponSystem(w);           // 7. Weapon firing
  projectileSystem(w);       // 8. Projectiles and damage collection
  damageSystem(w);           // 9. Damage application and deaths
  harvestSystem(w);          // 10. Harvesting and unloading
  oreSystem(w);              // 11. Ore growth (and rubble timers)
  shroudSystem(w);           // 12. Shroud, fog and detection (every 4 ticks)
  supportPowerSystem(w);     // 13. Support-power timers and support planes,
  crateSystem(w);            //     and the crate timer
  victorySystem(w);          // 14. Eliminations and the end of the match
  w.entities.compact();
  w.tick++;
}

/** Deterministic digest of sim state. @param {World} w */
export function hashWorld(w) {
  const h = createHasher().int(w.tick).ints(w.map.bales).ints(w.map.gem).ints(w.map.terrain);
  for (const p of w.players) h.int(p.cash).int(p.stored).int(p.capacity).int(p.power.ratioK).int(p.alive ? 1 : 0);
  for (const e of w.entities.all()) {
    if (e.dead) continue;
    if (e.kind === 'structure') {
      h.int(e.id).str(e.type).int(e.owner).int(e.hp).int(e.cx).int(e.cy).int(e.buildUp).int(e.selling).int(e.target);
      continue;
    }
    h.int(e.id).str(e.type).int(e.owner).int(e.hp).int(e.x).int(e.y).int(e.facing).int(e.turret).int(e.cx).int(e.cy).int(e.spot)
      .int(e.path.length).int(e.order ? 1 : 0).int(e.next ? e.next.x * 4096 + e.next.y : -1)
      .int(e.target).int(e.proneUntil).str(e.task ? e.task.type : '-')
      .int(e.harv ? e.harv.ore * 100 + e.harv.gem : -1).str(e.harv ? e.harv.state : '');
    for (const st of e.weapons) h.int(st.cd).int(st.burst).int(st.ammo);
  }
  for (const p of w.projectiles) h.int(p.id).int(p.x).int(p.y).int(p.tx).int(p.ty);
  h.ints(visionDigest(w));
  return h.str(JSON.stringify(w.rng.state())).hex();
}
