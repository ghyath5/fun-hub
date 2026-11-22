// @ts-check
/**
 * The computer player's base (section 16): its style's build order, power,
 * silos, repairs, where things go, and getting a Construction Yard back.
 * Skill shows here the way it does in a person: a green player hesitates
 * between buildings, builds out of order, notices power only once the lights
 * dim, forgets silos and repairs late; an experienced one keeps the
 * Construction Yard busy, plans power ahead and puts refineries by the ore.
 */
import { AI } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { T } from '../data/terrain.js';
import { ticks } from '../core/fixed.js';
import { itemInfo, itemDef, countOwned, lineOf } from '../sim/catalog.js';
import { structureDef, rolesOf } from '../sim/entities/structures.js';
import { checkDeploy } from '../sim/placement.js';
import { sellRefund } from '../sim/formulas/economy.js';
import { spiral } from '../sim/nav.js';
import { BUILD_ORDER } from './buildOrders.js';
import { choosePlacement, baseCentre, orePatch } from './placement.js';
import { issue, ownStructures, ownUnits, dist2 } from './common.js';
import { foeThreat } from './intel.js';
import { chance, jitter } from './dice.js';

/** @typedef {import('../sim/world.js').World} World */
/** @typedef {import('./skill.js').SkillProfile} SkillProfile */
/** @typedef {typeof import('../data/rules.js').AI_STYLES.balanced} Style */

/** Is the item startable right now (visible, unlocked, under its limits)? @param {World} w @param {number} pid @param {string} type */
export const startable = (w, pid, type) => {
  const info = itemInfo(w, pid, type);
  return !!info && !info.locked && !info.reason;
};

/** How long naval steps wait after a naval yard found no spot. */
const NAVAL_RETRY_TICKS = ticks(60);

/** Water near our start connected to water near an enemy start (worked out once). @param {World} w @param {any} ai */
export function navalWorld(w, ai) {
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

/** Defense towers the player owns (walls not counted). @param {World} w @param {number} pid */
const countDefenses = (w, pid) => ownStructures(w, pid).filter((s) => structureDef(s.type).line === 'defenses' && !structureDef(s.type).wall).length;

/**
 * Steps of the build order still to do on one line, in order (at most 3).
 * Defenses wait for the buildings listed before them; buildings skip ahead
 * of defenses.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {'structures' | 'defenses'} line
 */
function missingSteps(w, ai, cfg, style, line) {
  const p = w.players[ai.pid];
  const order = BUILD_ORDER[/** @type {'coalition' | 'union'} */ (p.faction)]?.[ai.style] ?? [];
  const refineries = Math.round(cfg.refineries);
  const towers = countDefenses(w, ai.pid);
  /** @type {Record<string, number>} */
  const tally = {};
  /** @type {string[]} */
  const out = [];
  for (const step of order) {
    const def = structureDef(step.type);
    if (!def) continue;
    if (step.naval && !navalWorld(w, ai)) continue;
    if (def.line === 'defenses' && !def.wall && towers >= style.defenses) continue;
    tally[step.type] = (tally[step.type] ?? 0) + 1;
    if (def.role === 'refinery' && tally[step.type] > refineries) continue;
    if (countOwned(w, ai.pid, step.type) >= tally[step.type]) continue;
    if (lineOf(step.type) === line) {
      out.push(step.type);
      if (out.length >= 3) break;
    } else if (line === 'defenses') break;
  }
  return out;
}

/** Roles never held back for the army: they make the money and the army (radar unlocks most of it). */
const CORE_ROLES = Object.freeze(['yard', 'power', 'refinery', 'factory', 'barracks', 'radar']);

/**
 * Can it afford this building without starving its army? A costly building
 * (not a refinery or factory) waits until the army is worth as much, unless
 * the money is already there — nobody sensible buys a Tech Center with no
 * army in the field.
 * @param {World} w @param {any} ai @param {string} type @param {number} armyValue
 */
function affordable(w, ai, type, armyValue) {
  const def = structureDef(type);
  const cost = def.cost ?? 0;
  if (cost < 1000 || CORE_ROLES.includes(def.role)) return true;
  const p = w.players[ai.pid];
  return p.cash + p.stored >= cost || armyValue >= cost * AI.shared.techArmyShare;
}

/**
 * The next thing to build on a line, or null. A green player sometimes picks
 * a later step than the next one.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {'structures' | 'defenses'} line @param {number} armyValue
 */
function nextBuild(w, ai, cfg, style, line, armyValue) {
  const steps = missingSteps(w, ai, cfg, style, line).filter((t) => affordable(w, ai, t, armyValue));
  if (!steps.length) return null;
  if (steps.length > 1 && chance(ai, cfg.buildMistakes)) {
    const later = steps.slice(1).find((t) => startable(w, ai.pid, t));
    if (later) return later;
  }
  return startable(w, ai.pid, steps[0]) ? steps[0] : null;
}

/** Cheap guns put up in a hurry when an attack is coming, best first. */
const EMERGENCY_GUNS = Object.freeze(['pillbox', 'sentryGun', 'flameTower', 'gunTurret']);

/** Seconds between buildings sold to pay for the economy. */
const RESCUE_TICKS = ticks(15);

/** What it sells, in order, when cancelling is not enough: anything optional, then these (never the yard). */
const SELL_ORDER = Object.freeze(['power', 'barracks', 'factory']);

/** Credits still owed on an item: its price less what has already gone into it. @param {any} p @param {string} type */
function stillOwed(p, type) {
  const lines = Object.values(p.lines).filter(Boolean);
  if (lines.some((l) => l.ready === type)) return 0;
  const spent = lines.flatMap((l) => l.queue).filter((q) => q.type === type).reduce((m, q) => Math.max(m, q.spent), 0);
  return Math.max(0, itemDef(type).cost - spent);
}

/** Credits its queues will still take for everything but this item. @param {any} p @param {string} type */
const committedBesides = (p, type) => Object.values(p.lines).flatMap((l) => l?.queue ?? []).filter((q) => q.type !== type)
  .reduce((sum, q) => sum + itemDef(q.type).cost - q.spent, 0);

/**
 * Before its first ore: what its money leaves over once the first refinery and
 * everything already queued are paid for (null once it has earned, or has its
 * refinery). The opening never spends that refinery's money elsewhere.
 * @param {World} w @param {any} ai @returns {number | null}
 */
function openingSpare(w, ai) {
  const p = w.players[ai.pid];
  if (p.stats.creditsHarvested) return null;
  const need = economyNeed(w, ai);
  return need ? p.cash + p.stored - stillOwed(p, need) - committedBesides(p, need) : null;
}

/**
 * What it needs to earn again, or null while ore is coming in: a refinery
 * (which brings its own Harvester, so one being built counts), else a
 * Harvester, else a factory to build one.
 * @param {World} w @param {any} ai @returns {string | null}
 */
function economyNeed(w, ai) {
  const own = ownStructures(w, ai.pid);
  const roles = rolesOf(w, ai.pid);
  if (!roles.has('yard')) return null; // its yard comes first (manageYard)
  const refineries = own.filter((s) => structureDef(s.type).role === 'refinery');
  if (!refineries.length) return roles.has('power') ? 'refinery' : 'powerPlant';
  if (refineries.some((s) => s.buildUp > 0) || ownUnits(w, ai.pid).some((u) => u.harv)) return null;
  return roles.has('factory') ? 'harvester' : 'warFactory';
}

/**
 * Losing its refinery or Harvesters with no money left for new ones would
 * leave a player stuck for the rest of the match — and so would an opening
 * that spends the refinery's money on barracks and soldiers (with $2500 to
 * start). Once it notices (sooner with skill) it gets out the way a person
 * does: until it earns again it
 * spends on nothing else; it
 * cancels whatever else is part-paid (a cancel refunds in full); and when
 * that is still not enough it sells a building — anything optional first,
 * then a spare power plant, the barracks and last the factory — picking the
 * cheapest whose refund covers the gap. The yard, the last power plant and
 * whatever the missing piece needs are kept.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @returns {string | null} what it is saving for
 */
function rescueEconomy(w, ai, cfg) {
  const need = economyNeed(w, ai);
  const p = w.players[ai.pid];
  let gap = need ? stillOwed(p, need) - (p.cash + p.stored) : 0;
  if (!need) { ai.brokeAt = 0; ai.saving = null; return null; }
  if (!p.stats.creditsHarvested) {
    // The opening: the build order runs things, but nothing it has queued may eat the first refinery's money.
    ai.saving = gap + committedBesides(p, need) > 0 ? need : null;
    if (!ai.saving || gap <= 0) return ai.saving;
  } else {
    if (!ai.brokeAt) ai.brokeAt = w.tick;
    ai.saving = w.tick - ai.brokeAt >= ticks(cfg.recoverySeconds) ? need : null;
    if (!ai.saving || gap <= 0) return ai.saving;
  }
  for (const [line, l] of Object.entries(p.lines)) {
    for (const q of l?.queue ?? []) {
      if (q.type === need) continue;
      issue(w, ai, 'cancel', [], { line, type: q.type });
      gap -= q.spent;
    }
  }
  const own = ownStructures(w, ai.pid);
  if (gap <= 0 || own.some((s) => s.selling) || w.tick < (ai.soldAt ?? 0) + RESCUE_TICKS) return need;
  const keep = new Set(['yard', 'refinery', ...(need === 'refinery' ? [] : ['factory'])]);
  const powerPlants = own.filter((s) => structureDef(s.type).role === 'power').length;
  const tier = (/** @type {any} */ s) => {
    const role = structureDef(s.type).role;
    if (keep.has(role) || (role === 'power' && powerPlants <= 1)) return -1;
    return SELL_ORDER.indexOf(role) + 1; // 0: optional
  };
  const spare = own.filter((s) => !s.buildUp && !structureDef(s.type).wall && tier(s) >= 0);
  if (!spare.length) return need;
  const first = Math.min(...spare.map(tier));
  const worth = (/** @type {any} */ s) => sellRefund(structureDef(s.type).cost ?? 0, s.hp, s.maxHp);
  const pool = spare.filter((s) => tier(s) === first).sort((a, b) => worth(a) - worth(b) || a.id - b.id);
  const pick = pool.find((s) => worth(s) >= gap) ?? pool[pool.length - 1];
  issue(w, ai, 'sell', [], { id: pick.id });
  ai.soldAt = w.tick;
  return need;
}

/** Is there anything left on the structures line of its build order? @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style */
export const stillBuilding = (w, ai, cfg, style) => !!w.players[ai.pid].lines.structures?.queue.length || missingSteps(w, ai, cfg, style, 'structures').length > 0;

/**
 * A power plant when the next structure would leave less headroom than its
 * skill plans for (a green player's headroom is under 1: it reacts only once
 * power runs short), else null.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {string | null} next
 */
function powerFirst(w, ai, cfg, next) {
  const p = w.players[ai.pid];
  const drain = p.power.drain + Math.max(0, -(next ? structureDef(next).power ?? 0 : 0));
  // Count power plants still being built, waiting to be placed or rising from the ground as if they were running.
  const queued = (p.lines.structures?.queue ?? []).concat(p.lines.structures?.ready ? [{ type: p.lines.structures.ready }] : []);
  const rising = ownStructures(w, ai.pid).filter((s) => s.buildUp > 0);
  const pending = [...queued, ...rising].reduce((/** @type {number} */ a, /** @type {any} */ q) => a + Math.max(0, structureDef(q.type).power ?? 0), 0);
  if ((p.power.produced + pending) * 100 >= drain * Math.round(cfg.powerHeadroom * 100)) return null;
  if (startable(w, ai.pid, 'advPowerPlant')) return 'advPowerPlant';
  return startable(w, ai.pid, 'powerPlant') ? 'powerPlant' : null;
}

/** Enemy start nearest our base (defenses face it). @param {World} w @param {number} pid */
export function enemyDirection(w, pid) {
  const base = baseCentre(w, pid);
  let best = null;
  for (const p of w.players) {
    if (!p.alive || w.allied(p.id, pid)) continue;
    const s = w.map.starts[p.start];
    if (!best || dist2(s, base) < dist2(best, base)) best = s;
  }
  return best;
}

/** Where a READY structure goes. @param {World} w @param {any} ai @param {SkillProfile} cfg @param {string} type */
function placeFor(w, ai, cfg, type) {
  const def = structureDef(type);
  // A first-timer puts guns wherever there is room; from Novice up they face the enemy.
  const enemy = def.line === 'defenses' && cfg.level >= 2 ? enemyDirection(w, ai.pid) : null;
  const toward = def.role === 'refinery' && cfg.oreSense >= 0.5 ? orePatch(w, ai.pid) : null;
  return choosePlacement(w, ai.pid, type, enemy, toward);
}

/**
 * Keep the Structures and Defenses lines going and place what is READY.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {number} armyValue
 */
export function manageBase(w, ai, cfg, style, armyValue) {
  const p = w.players[ai.pid];
  const saving = rescueEconomy(w, ai, cfg);
  for (const line of /** @type {const} */ (['structures', 'defenses'])) {
    const l = p.lines[line];
    if (l?.ready) {
      // Hands: a finished building takes a human's moment to tap into place (the line waits meanwhile, as a human's does).
      if (!ai.placeAt[line]) ai.placeAt[line] = w.tick + ticks(jitter(ai, cfg.placeSeconds, 0.3));
      if (w.tick < ai.placeAt[line]) continue;
      ai.placeAt[line] = 0;
      const spot = placeFor(w, ai, cfg, l.ready);
      if (spot) issue(w, ai, 'place', [], { type: l.ready, x: spot.x, y: spot.y });
      else {
        issue(w, ai, 'cancelReady', [], { line });
        // A naval yard with no water in reach yet: try again later, building the rest meanwhile.
        if (structureDef(l.ready)?.water) ai.navalRetryAt = w.tick + NAVAL_RETRY_TICKS;
      }
      continue;
    }
    if (l?.queue.length) continue;
    // Economy down: only the missing piece is built.
    if (saving) {
      if (line === lineOf(saving) && startable(w, ai.pid, saving)) issue(w, ai, 'build', [], { type: saving, count: 1 });
      continue;
    }
    // A Regular and up who sees a bigger army coming puts a gun up straight away.
    if (line === 'defenses' && cfg.level >= 4 && countDefenses(w, ai.pid) < 2 && (ai.threatAt || foeThreat(w, ai, baseCentre(w, ai.pid)) * 10 > armyValue * 13)) {
      const gun = EMERGENCY_GUNS.find((t) => startable(w, ai.pid, t));
      if (gun) { issue(w, ai, 'build', [], { type: gun, count: 1 }); continue; }
    }
    // A moment's thought before the next building (none for an expert).
    if (!ai.buildAt[line]) ai.buildAt[line] = w.tick + ticks(jitter(ai, cfg.buildHesitation, 0.5));
    if (w.tick < ai.buildAt[line]) continue;
    let next = nextBuild(w, ai, cfg, style, line, armyValue);
    if (line === 'structures') {
      if (p.capacity > 0 && p.stored * 100 >= p.capacity * Math.round(cfg.siloAt * 100) && startable(w, ai.pid, 'silo')) next = 'silo';
      next = powerFirst(w, ai, cfg, next) ?? next;
    }
    // The opening: what the money left over the first refinery cannot cover waits until the refinery is up.
    const spare = openingSpare(w, ai);
    if (next && spare !== null && itemDef(next).cost > spare) {
      const need = /** @type {string} */ (economyNeed(w, ai));
      next = line === lineOf(need) && startable(w, ai.pid, need) ? need : null;
    }
    if (next) {
      issue(w, ai, 'build', [], { type: next, count: 1 });
      ai.buildAt[line] = 0;
    }
  }
}

/** Repair damaged buildings while it has money to spare. @param {World} w @param {any} ai @param {SkillProfile} cfg */
export function manageRepairs(w, ai, cfg) {
  const p = w.players[ai.pid];
  if (ai.saving || p.cash + p.stored <= AI.shared.repairMinCredits) return;
  for (const s of ownStructures(w, ai.pid)) {
    if (s.repairing || s.selling || s.buildUp) continue;
    if (s.hp * 100 < s.maxHp * Math.round(cfg.repairBelow * 100)) issue(w, ai, 'repair', [], { id: s.id, on: true });
  }
}

/**
 * No Construction Yard: deploy an MCV (walking it to open ground first, and
 * taking a human's moment to tap it), or build one.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @returns {boolean} the base is gone for good
 */
export function manageYard(w, ai, cfg) {
  const roles = rolesOf(w, ai.pid);
  if (roles.has('yard')) return false;
  const mcv = ownUnits(w, ai.pid).find((u) => u.type === 'mcv' && !u.inside);
  if (mcv) {
    if (mcv.deploying || mcv.order || mcv.next) return false;
    if (!ai.deployAt) ai.deployAt = w.tick + ticks(jitter(ai, cfg.placeSeconds, 0.3));
    if (w.tick < ai.deployAt) return false;
    if (checkDeploy(w, mcv).ok) { issue(w, ai, 'deploy', [mcv.id], null); ai.deployAt = 0; return false; }
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
