// @ts-check
/**
 * AI brain (section 16): one per computer player, thinking every 2 / 1 /
 * 0.5 s by difficulty. It plays by the human's rules — it only issues
 * Commands, sees through its own shroud and pays for everything — and keeps
 * its memory in plain data on the world (`w.ai`), so saves and replays hold it.
 * Base: build order, power headroom, silos, repairs, placement, MCV
 * recovery. Production: Harvesters first, then the faction's wave mix.
 * The army is in army.js.
 */
import { AI, PRODUCTION } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { T } from '../data/terrain.js';
import { ticks } from '../core/fixed.js';
import { itemInfo, countOwned, lineOf } from '../sim/catalog.js';
import { structureDef, isActive, rolesOf } from '../sim/entities/structures.js';
import { checkDeploy } from '../sim/placement.js';
import { spiral } from '../sim/nav.js';
import { BUILD_ORDER, WAVES, FLEETS, DIFFICULTY_RANK, UNIT_QUEUE_AHEAD, STRUCTURE_RESERVE } from './buildOrders.js';
import { choosePlacement, baseCentre } from './placement.js';
import { thinkArmy, issue, updateKnowledge, armyOf, fleetOf } from './army.js';

/** @typedef {import('../sim/world.js').World} World */

/** @param {number} pid @param {'beginner' | 'easy' | 'normal' | 'hard'} difficulty */
export function createAiState(pid, difficulty) {
  const cfg = AI[difficulty] ?? AI.normal;
  return {
    pid,
    difficulty,
    cfg,
    /** Enemy structures as last seen. @type {{ id: number, type: string, owner: number, x: number, y: number, cost: number }[]} */
    known: [],
    /** HP of own buildings and Harvesters at the last think (attacks show up as drops). @type {Record<string, number>} */
    hp: {},
    /** Defense group unit ids. @type {number[]} */
    defense: [],
    /** The attack wave in progress. @type {null | { ids: number[], startValue: number, stage: 'gather' | 'attack', target: {x: number, y: number}, staging: {x: number, y: number}, since: number }} */
    wave: null,
    waveCount: 0,
    firstAttack: ticks(cfg.firstAttackSeconds),
    nextWave: ticks(cfg.firstAttackSeconds),
    scouted: false,
    lastStand: false,
    /** Does water link our base to an enemy's (naval build steps)? null = not worked out yet. @type {boolean | null} */
    naval: null,
    /** No room for a naval yard by the water yet: naval steps wait until this tick, so the rest of the build order goes on. */
    navalRetryAt: 0,
    /** Round-robin position in the wave mix. */
    mixCursor: 0,
    /** Where the base was last hit (planes strike there first), or null. @type {{x: number, y: number} | null} */
    threatAt: null,
    /** Earliest tick for the next air strike on the attack target. */
    nextStrike: 0,
  };
}

/** @typedef {ReturnType<typeof createAiState>} AiState */

const ownStructures = (/** @type {World} */ w, /** @type {number} */ pid) => w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && !e.dead);
const ownUnits = (/** @type {World} */ w, /** @type {number} */ pid) => w.entities.all().filter((e) => e.kind === 'unit' && e.owner === pid && !e.dead);

/** Is the item startable right now (visible, unlocked, under its limits)? @param {World} w @param {number} pid @param {string} type */
const startable = (w, pid, type) => {
  const info = itemInfo(w, pid, type);
  return !!info && !info.locked && !info.reason;
};

/** Water near our start connected to water near an enemy start (worked out once). @param {World} w @param {AiState} ai */
function navalWorld(w, ai) {
  if (w.tick < (ai.navalRetryAt ?? 0)) return false;
  if (ai.naval !== null) return ai.naval;
  const comps = (/** @type {{x: number, y: number}} */ s) => {
    const set = new Set();
    for (const [x, y] of spiral(s.x, s.y, 10)) {
      if (x < 0 || y < 0 || x >= w.map.width || y >= w.map.height) continue;
      if (w.map.terrain[y * w.map.width + x] === T.water) set.add(w.nav.component('float', x, y));
    }
    return set;
  };
  const mine = comps(w.map.starts[w.players[ai.pid].start]);
  ai.naval = w.players.some((p) => !w.allied(p.id, ai.pid) && [...comps(w.map.starts[p.start])].some((c) => mine.has(c)));
  return ai.naval;
}

/** Next missing step of the build order for one line. @param {World} w @param {AiState} ai @param {'structures' | 'defenses'} line */
function nextBuildStep(w, ai, line) {
  const p = w.players[ai.pid];
  const order = BUILD_ORDER[/** @type {'coalition' | 'union'} */ (p.faction)] ?? [];
  /** @type {Record<string, number>} */
  const tally = {};
  for (const step of order) {
    if (step.minDifficulty && DIFFICULTY_RANK[ai.difficulty] < DIFFICULTY_RANK[step.minDifficulty]) continue;
    if (step.naval && !navalWorld(w, ai)) continue;
    if (structureDef(step.type)?.powers?.length && ai.cfg.supportPowers === 'no') continue;
    if (ai.cfg.skipRoles.includes(structureDef(step.type)?.role)) continue;
    if (lineOf(step.type) === 'defenses' && !structureDef(step.type)?.wall && countDefenses(w, ai.pid) >= ai.cfg.maxDefenses) continue;
    tally[step.type] = (tally[step.type] ?? 0) + 1;
    if (countOwned(w, ai.pid, step.type) >= tally[step.type]) continue;
    // The first step still to do: build it if it is ours; defenses wait for earlier buildings, buildings skip ahead of defenses.
    if (lineOf(step.type) === line) return startable(w, ai.pid, step.type) ? step.type : null;
    if (line === 'defenses') return null;
  }
  return null;
}

/** Defense towers the player owns (walls not counted). @param {World} w @param {number} pid */
const countDefenses = (w, pid) => ownStructures(w, pid).filter((s) => structureDef(s.type).line === 'defenses' && !structureDef(s.type).wall).length;

/** Power plant to build when the next structure would leave less than 10% headroom, else null. @param {World} w @param {AiState} ai @param {string | null} next */
function powerFirst(w, ai, next) {
  const p = w.players[ai.pid];
  const drain = p.power.drain + Math.max(0, -(next ? structureDef(next).power ?? 0 : 0));
  // Count power plants still being built, waiting to be placed or rising from the ground as if they were running.
  const queued = (p.lines.structures?.queue ?? []).concat(p.lines.structures?.ready ? [{ type: p.lines.structures.ready }] : []);
  const rising = ownStructures(w, ai.pid).filter((s) => s.buildUp > 0);
  const pending = [...queued, ...rising].reduce((/** @type {number} */ a, /** @type {any} */ q) => a + Math.max(0, structureDef(q.type).power ?? 0), 0);
  if ((p.power.produced + pending) * 100 >= drain * Math.round(AI.shared.powerHeadroom * 100)) return null;
  if (startable(w, ai.pid, 'advPowerPlant')) return 'advPowerPlant';
  return startable(w, ai.pid, 'powerPlant') ? 'powerPlant' : null;
}

/** Enemy start nearest our base (for facing defenses). @param {World} w @param {AiState} ai */
function enemyDirection(w, ai) {
  const base = baseCentre(w, ai.pid);
  let best = null;
  for (const p of w.players) {
    if (!p.alive || w.allied(p.id, ai.pid)) continue;
    const s = w.map.starts[p.start];
    if (!best || (s.x - base.x) ** 2 + (s.y - base.y) ** 2 < (best.x - base.x) ** 2 + (best.y - base.y) ** 2) best = s;
  }
  return best;
}

/** How long naval steps wait after a naval yard found no spot. */
const NAVAL_RETRY_TICKS = ticks(60);

/** Keep the Structures and Defenses lines busy, and place what is READY. @param {World} w @param {AiState} ai */
function manageBase(w, ai) {
  const p = w.players[ai.pid];
  for (const line of /** @type {const} */ (['structures', 'defenses'])) {
    const l = p.lines[line];
    if (l?.ready) {
      const spot = choosePlacement(w, ai.pid, l.ready, enemyDirection(w, ai));
      if (spot) issue(w, ai, 'place', [], { type: l.ready, x: spot.x, y: spot.y });
      else {
        issue(w, ai, 'cancelReady', [], { line });
        // A naval yard with no water in reach yet: try again later, building the rest meanwhile.
        if (structureDef(l.ready)?.water) ai.navalRetryAt = w.tick + NAVAL_RETRY_TICKS;
      }
      continue;
    }
    if (l?.queue.length) continue;
    let next = nextBuildStep(w, ai, line);
    if (line === 'structures') {
      if (p.capacity > 0 && p.stored * 100 >= p.capacity * Math.round(AI.shared.siloAtFraction * 100) && startable(w, ai.pid, 'silo')) next = 'silo';
      next = powerFirst(w, ai, next) ?? next;
    }
    if (next) issue(w, ai, 'build', [], { type: next, count: 1 });
  }
}

/** Repair buildings under 75% HP while credits exceed 500. @param {World} w @param {AiState} ai */
function manageRepairs(w, ai) {
  const p = w.players[ai.pid];
  if (p.cash + p.stored <= AI.shared.repairMinCredits) return;
  for (const s of ownStructures(w, ai.pid)) {
    if (s.repairing || s.selling || s.buildUp) continue;
    if (s.hp * 100 < s.maxHp * Math.round(AI.shared.repairBelow * 100)) issue(w, ai, 'repair', [], { id: s.id, on: true });
  }
}

/** No Construction Yard: deploy an MCV (walking it to open ground first), or build one. @param {World} w @param {AiState} ai @returns {boolean} the base is gone for good */
function manageYard(w, ai) {
  const roles = rolesOf(w, ai.pid);
  if (roles.has('yard')) return false;
  const mcv = ownUnits(w, ai.pid).find((u) => u.type === 'mcv' && !u.inside);
  if (mcv) {
    if (mcv.deploying || mcv.order || mcv.next) return false;
    if (checkDeploy(w, mcv).ok) { issue(w, ai, 'deploy', [mcv.id], null); return false; }
    // Find open ground near the old base for it.
    const c = baseCentre(w, ai.pid);
    for (const [x, y] of spiral(c.x, c.y, 8)) {
      if (checkDeploy(w, { ...mcv, cx: x, cy: y }).ok) { issue(w, ai, 'move', [mcv.id], { x, y }); break; }
    }
    return false;
  }
  if (roles.has('factory')) {
    if (startable(w, ai.pid, 'mcv') && !(w.players[ai.pid].lines.vehicles?.queue ?? []).some((/** @type {any} */ q) => q.type === 'mcv')) {
      issue(w, ai, 'build', [], { type: 'mcv', count: 1 });
    }
    return false;
  }
  return !roles.has('barracks');
}

/** Units: Harvesters first, then the wave mix, keeping money for the next building. @param {World} w @param {AiState} ai */
function manageProduction(w, ai) {
  const p = w.players[ai.pid];
  const refineries = ownStructures(w, ai.pid).filter((s) => isActive(s) && structureDef(s.type).role === 'refinery').length;
  const harvesters = countOwned(w, ai.pid, 'harvester');
  const wantHarvesters = Math.min(refineries, ai.cfg.maxRefineries) * ai.cfg.harvestersPerRefinery;
  const vq = p.lines.vehicles?.queue ?? [];
  if (harvesters < wantHarvesters && startable(w, ai.pid, 'harvester') && !vq.some((/** @type {any} */ q) => q.type === 'harvester')) {
    issue(w, ai, 'build', [], { type: 'harvester', count: 1 });
    return;
  }
  // No army before the first Refinery stands; after that, money goes to the build order first.
  if (!refineries) return;
  const building = !!(p.lines.structures?.queue.length) || !!nextBuildStep(w, ai, 'structures');
  const credits = p.cash + p.stored;
  if (building && credits < STRUCTURE_RESERVE) return;
  const mix = WAVES[/** @type {'coalition' | 'union'} */ (p.faction)]?.[ai.difficulty] ?? {};
  const types = Object.keys(mix);
  if (!types.length) return;
  const army = armyOf(w, ai.pid);
  if (army.length >= ai.cfg.armyCap) return; // easier levels keep a small army
  /** @type {Record<string, number>} */
  const have = {};
  for (const u of army) have[u.type] = (have[u.type] ?? 0) + 1;
  for (const line of /** @type {const} */ (['infantry', 'vehicles', 'aircraft'])) {
    const queue = p.lines[line]?.queue ?? [];
    if (queue.length >= UNIT_QUEUE_AHEAD) continue;
    const options = types.filter((t) => UNITS[t].line === line && startable(w, ai.pid, t));
    if (!options.length) continue;
    // The type furthest below its share of the mix (queued items count as had).
    for (const q of queue) have[q.type] = (have[q.type] ?? 0) + 1;
    options.sort((a, b) => (have[a] ?? 0) / mix[a] - (have[b] ?? 0) / mix[b] || types.indexOf(a) - types.indexOf(b));
    issue(w, ai, 'build', [], { type: options[0], count: 1 });
  }
  buildFleet(w, ai);
  // Hard keeps an Engineer around for captures.
  const engineerQueued = (p.lines.infantry?.queue ?? []).some((/** @type {any} */ q) => q.type === 'engineer');
  if (ai.cfg.engineerCapture && countOwned(w, ai.pid, 'engineer') === 0 && !engineerQueued && startable(w, ai.pid, 'engineer')
    && (p.lines.infantry?.queue.length ?? 0) < PRODUCTION.queueMax && ai.waveCount > 0) {
    issue(w, ai, 'build', [], { type: 'engineer', count: 1 });
  }
}

/** Warships up to the fleet size, by the faction's fleet make-up, when water links the bases. @param {World} w @param {AiState} ai */
function buildFleet(w, ai) {
  if (!ai.cfg.fleetSize || !navalWorld(w, ai)) return;
  const p = w.players[ai.pid];
  const queue = p.lines.naval?.queue ?? [];
  if (queue.length >= UNIT_QUEUE_AHEAD) return;
  const mix = FLEETS[/** @type {'coalition' | 'union'} */ (p.faction)] ?? {};
  /** @type {Record<string, number>} */
  const have = {};
  for (const u of fleetOf(w, ai.pid)) have[u.type] = (have[u.type] ?? 0) + 1;
  for (const q of queue) have[q.type] = (have[q.type] ?? 0) + 1;
  if (Object.values(have).reduce((a, n) => a + n, 0) >= ai.cfg.fleetSize) return;
  const types = Object.keys(mix).filter((t) => startable(w, ai.pid, t));
  if (!types.length) return;
  types.sort((a, b) => (have[a] ?? 0) / mix[a] - (have[b] ?? 0) / mix[b] || a.localeCompare(b));
  issue(w, ai, 'build', [], { type: types[0], count: 1 });
}

/** One think for one AI player. @param {World} w @param {AiState} ai */
export function think(w, ai) {
  if (!w.players[ai.pid].alive) return;
  updateKnowledge(w, ai);
  const gone = manageYard(w, ai);
  if (!gone) {
    manageBase(w, ai);
    manageRepairs(w, ai);
    manageProduction(w, ai);
  }
  thinkArmy(w, ai, gone);
}
