// @ts-check
/**
 * What the computer player trains (section 16). A green player sticks to a
 * couple of favourite units whatever it faces and leaves factories idle; an
 * experienced one reads the enemy army it has seen and builds what beats it,
 * value for money — anti-air when the sky fills, anti-tank against armour,
 * splash against infantry — while keeping every factory busy.
 */
import { AI, PRODUCTION } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { WARHEADS } from '../data/warheads.js';
import { countOwned } from '../sim/catalog.js';
import { structureDef, isActive } from '../sim/entities/structures.js';
import { FLEETS, UNIT_QUEUE_AHEAD, STRUCTURE_RESERVE } from './buildOrders.js';
import { issue, ownStructures, fleetOf, isCombatType, fightValueOf } from './common.js';
import { rolesOf } from '../sim/entities/structures.js';
import { startable, stillBuilding, navalWorld } from './base.js';
import { foeMakeUp, foeArmyValue } from './intel.js';
import { chance, pickOne } from './dice.js';

/** @typedef {import('../sim/world.js').World} World */
/** @typedef {import('./skill.js').SkillProfile} SkillProfile */
/** @typedef {typeof import('../data/rules.js').AI_STYLES.balanced} Style */
/** @typedef {'none' | 'light' | 'heavy' | 'concrete' | 'air'} Target */

const TARGETS = /** @type {Target[]} */ (['none', 'light', 'heavy', 'concrete', 'air']);
const LINES = /** @type {const} */ (['infantry', 'vehicles', 'aircraft']);
/** What it expects to fight before it has seen the enemy army. */
const UNSEEN = Object.freeze({ none: 0.3, light: 0.15, heavy: 0.3, air: 0 });
/** Share of attention every army keeps on buildings (it has to finish a base). */
const BUILDINGS_SHARE = 0.3;
/** Weight of hit points per credit next to firepower when it picks units. */
const TOUGHNESS = 0.4;
/** Units of a line it spreads production over. */
const MIX_WIDTH = 4;
/** Money it wants in hand before it spends on an Engineer. */
const ENGINEER_CREDITS = 1500;
/** Most Harvesters it sends to one refinery. */
const MAX_PER_REFINERY = 3;
/** Speed (cells/s) from which a unit counts as fast. */
const FAST = 2.2;

/** Does the player have a working War Factory? @param {World} w @param {number} pid */
const hasFactory = (w, pid) => rolesOf(w, pid).has('factory');

/** @typedef {{ vs: Record<Target, number>, tough: number, fast: boolean }} Profile */
/** @type {Map<string, Profile>} */
const profiles = new Map();

/**
 * Damage per second per 1000 credits against each kind of target, and hit
 * points per 1000 credits, worked out from the weapon tables.
 * @param {string} type @returns {Profile}
 */
function profileOf(type) {
  let p = profiles.get(type);
  if (p) return p;
  const d = UNITS[type];
  /** @type {Record<Target, number>} */
  const vs = { none: 0, light: 0, heavy: 0, concrete: 0, air: 0 };
  for (const id of d.weapons) {
    const wd = WEAPONS[id];
    if (!wd.warhead || wd.damage <= 0 || wd.only === 'ships' || wd.only === 'subs' || wd.only === 'friendlyInfantry') continue;
    const dps = (wd.damage * wd.burst) / Math.max(0.2, wd.cooldown);
    const table = WARHEADS[wd.warhead];
    if (wd.hits.includes('G')) {
      for (const k of /** @type {const} */ (['none', 'light', 'heavy', 'concrete'])) {
        if (wd.only === 'infantry' && k !== 'none') continue;
        vs[k] = Math.max(vs[k], (dps * table[k]) / 100);
      }
    }
    if (wd.hits.includes('A') && !wd.only) vs.air = Math.max(vs.air, (dps * table.light) / 100);
  }
  for (const k of TARGETS) vs[k] = (vs[k] * 1000) / d.cost;
  p = { vs, tough: (d.hp * 1000) / d.cost, fast: d.speed >= FAST };
  profiles.set(type, p);
  return p;
}

/** @type {Map<string, string[]>} */
const rosters = new Map();

/** Combat units a faction can ever train on a line, in data order. @param {string} faction @param {string} line */
function roster(faction, line) {
  const key = `${faction}:${line}`;
  let list = rosters.get(key);
  if (!list) {
    list = Object.keys(UNITS).filter((t) => UNITS[t].line === line && (UNITS[t].faction === faction || UNITS[t].faction === 'both') && isCombatType(t));
    rosters.set(key, list);
  }
  return list;
}

/**
 * A green player's favourites: two units per line, picked at the start of
 * the match from the ones it can build without a Tech Center.
 * @param {any} ai @param {string} faction
 */
export function chooseFavourites(ai, faction) {
  /** @type {string[]} */
  const out = [];
  for (const line of LINES) {
    const basic = roster(faction, line).filter((t) => !UNITS[t].requires.includes('tech'));
    for (let k = 0; k < 2 && basic.length; k++) {
      const t = pickOne(ai, basic);
      out.push(t);
      basic.splice(basic.indexOf(t), 1);
    }
  }
  return out;
}

/**
 * How much it wants each startable unit of a line: favourites for a green
 * player, a counter to the enemy's army make-up for an experienced one.
 * @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {string[]} options
 */
function wants(ai, cfg, style, options) {
  const seen = foeMakeUp(ai) ?? UNSEEN;
  const units = 1 - BUILDINGS_SHARE;
  /** @type {Record<Target, number>} */
  const need = { none: seen.none * units, light: seen.light * units, heavy: seen.heavy * units, air: seen.air * units, concrete: BUILDINGS_SHARE };
  const best = /** @type {Record<Target, number>} */ ({ none: 1e-9, light: 1e-9, heavy: 1e-9, concrete: 1e-9, air: 1e-9 });
  let tough = 1e-9;
  for (const t of options) {
    const p = profileOf(t);
    for (const k of TARGETS) best[k] = Math.max(best[k], p.vs[k]);
    tough = Math.max(tough, p.tough);
  }
  return options.map((t) => {
    const p = profileOf(t);
    let fit = TOUGHNESS * (p.tough / tough);
    for (const k of TARGETS) fit += need[k] * (p.vs[k] / best[k]);
    const favourite = ai.favourites.includes(t) ? 1 : 0.1;
    const score = (cfg.counterSense * fit + (1 - cfg.counterSense) * favourite) * (p.fast ? style.fast : 1);
    return { type: t, score };
  });
}

/**
 * The type to queue next on a line: of the units it wants most, the one
 * furthest below its share (queued items count as had).
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {string} line @param {Record<string, number>} have
 */
function pickUnit(w, ai, cfg, style, line, have) {
  const p = w.players[ai.pid];
  const options = roster(p.faction, line).filter((t) => startable(w, ai.pid, t));
  if (!options.length) return null;
  const ranked = wants(ai, cfg, style, options).sort((a, b) => b.score - a.score || options.indexOf(a.type) - options.indexOf(b.type)).slice(0, MIX_WIDTH);
  const total = ranked.reduce((a, r) => a + r.score, 0) || 1;
  const count = ranked.reduce((a, r) => a + (have[r.type] ?? 0), 0) + 1;
  let pick = ranked[0];
  let gap = -Infinity;
  for (const r of ranked) {
    const g = r.score / total - (have[r.type] ?? 0) / count;
    if (g > gap) { gap = g; pick = r; }
  }
  return pick.type;
}

/**
 * Harvesters first, then the army — keeping money for the next building.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {any[]} army
 */
export function manageProduction(w, ai, cfg, style, army) {
  const p = w.players[ai.pid];
  const refineries = ownStructures(w, ai.pid).filter((s) => isActive(s) && structureDef(s.type).role === 'refinery').length;
  const harvesters = countOwned(w, ai.pid, 'harvester');
  const wantHarvesters = Math.min(Math.round(cfg.harvesters), refineries * MAX_PER_REFINERY);
  const vq = p.lines.vehicles?.queue ?? [];
  if (harvesters < wantHarvesters && startable(w, ai.pid, 'harvester') && !vq.some((/** @type {any} */ q) => q.type === 'harvester')) {
    issue(w, ai, 'build', [], { type: 'harvester', count: 1 });
    return;
  }
  // Fewer Harvesters than refineries and short of money: every credit goes to the Harvester.
  if (harvesters < Math.min(wantHarvesters, refineries) && p.cash + p.stored < UNITS.harvester.cost) return;
  // No army before the first Refinery stands. Until the economy is going — a War Factory, two refineries,
  // two Harvesters each — only a small guard, unless the base is under attack (a green player trains more, delaying it all).
  if (!refineries) return;
  const factory = hasFactory(w, ai.pid);
  const settingUp = !factory || refineries < Math.min(2, Math.round(cfg.refineries)) || harvesters < Math.min(wantHarvesters, refineries * 2);
  // A player who reads the enemy (Novice and up) stops being greedy once it has seen a bigger army than its own.
  const outgunned = cfg.level >= 2 && foeArmyValue(ai) > fightValueOf(army);
  if (settingUp && !ai.threatAt && !outgunned && army.length >= Math.round(cfg.earlyGuard)) return;
  if (!factory && stillBuilding(w, ai, cfg, style) && p.cash + p.stored < STRUCTURE_RESERVE) return;
  if (army.length >= AI.shared.armyMax) return;
  // While Harvesters are short, the vehicle line is theirs.
  const harvestersShort = harvesters < wantHarvesters;
  /** @type {Record<string, number>} */
  const have = {};
  for (const u of army) have[u.type] = (have[u.type] ?? 0) + 1;
  for (const line of LINES) {
    const queue = p.lines[line]?.queue ?? [];
    if (queue.length >= UNIT_QUEUE_AHEAD || (line === 'vehicles' && harvestersShort)) continue;
    // A green player forgets a factory now and then.
    if (chance(ai, cfg.productionGaps)) continue;
    for (const q of queue) have[q.type] = (have[q.type] ?? 0) + 1;
    const type = pickUnit(w, ai, cfg, style, line, have);
    if (type) issue(w, ai, 'build', [], { type, count: 1 });
  }
  buildFleet(w, ai);
  // Engineers for captures, once attacks have begun.
  const engineerQueued = (p.lines.infantry?.queue ?? []).some((/** @type {any} */ q) => q.type === 'engineer');
  if (cfg.captureSense >= 0.6 && ai.waveCount > 0 && p.cash + p.stored >= ENGINEER_CREDITS && countOwned(w, ai.pid, 'engineer') === 0 && !engineerQueued
    && startable(w, ai.pid, 'engineer') && (p.lines.infantry?.queue.length ?? 0) < PRODUCTION.queueMax) {
    issue(w, ai, 'build', [], { type: 'engineer', count: 1 });
  }
}

/** Warships up to the fleet size, by the faction's fleet make-up, when water links the bases. @param {World} w @param {any} ai */
function buildFleet(w, ai) {
  if (!navalWorld(w, ai)) return;
  const p = w.players[ai.pid];
  const queue = p.lines.naval?.queue ?? [];
  if (queue.length >= UNIT_QUEUE_AHEAD) return;
  const mix = /** @type {Record<string, number>} */ (FLEETS[/** @type {'coalition' | 'union'} */ (p.faction)] ?? {});
  /** @type {Record<string, number>} */
  const have = {};
  for (const u of fleetOf(w, ai.pid)) have[u.type] = (have[u.type] ?? 0) + 1;
  for (const q of queue) have[q.type] = (have[q.type] ?? 0) + 1;
  if (Object.values(have).reduce((a, n) => a + n, 0) >= AI.shared.fleetSize) return;
  const types = Object.keys(mix).filter((t) => startable(w, ai.pid, t));
  if (!types.length) return;
  types.sort((a, b) => (have[a] ?? 0) / mix[a] - (have[b] ?? 0) / mix[b] || a.localeCompare(b));
  issue(w, ai, 'build', [], { type: types[0], count: 1 });
}
