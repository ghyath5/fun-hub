// @ts-check
/**
 * The computer player's army (section 16): defending the base, attacks,
 * raids, scouting, battle control, air strikes, support powers and the navy.
 *
 * Attacks are decided the way a player decides them. It weighs the army it
 * could send against what it believes guards the target (misjudging by its
 * skill), wants an edge before it goes — less when it notices an opening or
 * grows impatient — and gathers short of the target on the side it judges
 * safest, maybe behind a feint. In the fight it pulls out when the fight
 * turns, and sends reinforcements as a group or (green) one by one. What
 * failed is remembered, if its skill lets it learn.
 */
import { AI, SIM } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { structureDef, isActive } from '../sim/entities/structures.js';
import { canAttack } from '../sim/targeting.js';
import { ticks } from '../core/fixed.js';
import { spiral } from '../sim/nav.js';
import { SCOUTS } from './buildOrders.js';
import { baseCentre } from './placement.js';
import { issue, isPlane, isVehicle, fleetOf, liveUnits, cellOf, dist2, centroid, fightValueOf, towards, ownStructures } from './common.js';
import { forceAround, foeArmy, openingNow } from './intel.js';
import { chooseTarget, chooseApproach, chooseRaidTarget, enemyStarts } from './tactics.js';
import { chance, jitter } from './dice.js';

/** @typedef {import('../sim/world.js').World} World */
/** @typedef {import('./common.js').Cell} Cell */
/** @typedef {import('./skill.js').SkillProfile} SkillProfile */
/** @typedef {typeof import('../data/rules.js').AI_STYLES.balanced} Style */

const L = SIM.leptonsPerCell;
const HUNT_RADIUS = 8;
/** How far round an empty target an attack looks for ground it has never seen (cells). */
const HUNT_SEARCH = 48;
/** Cells round a fight it counts when judging how the fight goes. */
const FIGHT_RADIUS = 8;
/** A Harvester sent running is left alone this long before it can be sent again. */
const FLEE_TICKS = ticks(30);
/** Smallest army that spares units for raids. */
const RAID_ARMY = 8;
/** An attack ends once it is down to a quarter of its units. */
const SPENT_SHARE = 4;

/** Is a unit busy with an attack, a raid, the home guard or scouting? @param {any} ai @param {number} id */
function committed(ai, id) {
  return ai.defense.includes(id) || ai.raid?.ids.includes(id) || ai.wave?.ids.includes(id) || ai.wave?.feint?.ids.includes(id) || ai.scoutId === id;
}

/** Army units free to be sent somewhere (not planes: they fly strikes from their pads). @param {any} ai @param {any[]} army */
const freeUnits = (ai, army) => army.filter((u) => !isPlane(u) && !committed(ai, u.id) && (!u.task || u.task.type === 'move'));

/** Where units pull back to: just in front of the base. @param {World} w @param {any} ai @param {Cell} [toward] */
function homeSpot(w, ai, toward) {
  const base = baseCentre(w, ai.pid);
  return toward ? towards(base, toward, 5) : base;
}

// ---- Home guard and defense -------------------------------------------------

/** Keep the style's share of the army at home. @param {World} w @param {any} ai @param {Style} style @param {any[]} army */
export function keepHomeGuard(w, ai, style, army) {
  const alive = new Set(army.map((u) => u.id));
  ai.defense = ai.defense.filter((/** @type {number} */ id) => alive.has(id));
  const want = Math.floor(army.length * style.homeGuard);
  for (const u of army) {
    if (ai.defense.length >= want) break;
    if (!committed(ai, u.id) && !isPlane(u)) ai.defense.push(u.id);
  }
}

/**
 * What hurts: own buildings or Harvesters that lost health since the last
 * look. The base is under attack when that happens within its watch radius.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg
 * @returns {{ at: Cell | null, harvesters: any[] }}
 */
export function senseThreat(w, ai, cfg) {
  const base = baseCentre(w, ai.pid);
  const r2 = cfg.defendRadius ** 2;
  /** @type {Cell | null} */
  let at = null;
  const harvesters = [];
  /** @type {Record<string, number>} */
  const hp = {};
  for (const e of w.entities.all()) {
    if (e.dead || e.owner !== ai.pid || !(e.kind === 'structure' || e.harv)) continue;
    hp[e.id] = e.hp;
    if ((ai.hp[e.id] ?? e.hp) <= e.hp) continue;
    const spot = e.kind === 'structure' ? { x: e.cx, y: e.cy } : cellOf(e);
    if (e.harv) harvesters.push(e);
    if (!at && dist2(spot, base) <= r2) at = spot;
  }
  ai.hp = hp;
  ai.threatAt = at;
  return { at, harvesters };
}

/** Nearest visible enemy unit round a spot. @param {World} w @param {any} ai @param {Cell} spot @param {number} r */
function foeNear(w, ai, spot, r) {
  let foe = null;
  for (const e of w.spatial.near(spot.x * L + L / 2, spot.y * L + L / 2, r * L)) {
    if (e.dead || e.kind !== 'unit' || e.owner < 0 || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e)) continue;
    if (!foe || dist2(cellOf(e), spot) < dist2(cellOf(foe), spot)) foe = e;
  }
  return foe;
}

/**
 * Answer what hurts: Harvesters under fire run for a refinery (if it
 * notices), the home guard and idle units go for the attackers, and a skilled
 * player brings the attack home when the base is in real danger.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} army @param {{ at: Cell | null, harvesters: any[] }} threat
 */
export function defend(w, ai, cfg, army, threat) {
  for (const h of threat.harvesters) {
    // Once per scare, loaded, away from the refinery and not already heading in.
    const carrying = (h.harv?.ore ?? 0) + (h.harv?.gem ?? 0) > 0;
    if (!carrying || ['docking', 'queueAtDock', 'unloading'].includes(h.harv?.state) || w.tick - (ai.fled[h.id] ?? -FLEE_TICKS) < FLEE_TICKS) continue;
    if (!foeNear(w, ai, cellOf(h), 6) || !chance(ai, cfg.harvesterCare)) continue;
    const refinery = ownStructures(w, ai.pid).filter((s) => isActive(s) && structureDef(s.type).role === 'refinery')
      .sort((a, b) => dist2({ x: a.cx, y: a.cy }, cellOf(h)) - dist2({ x: b.cx, y: b.cy }, cellOf(h)) || a.id - b.id)[0];
    if (!refinery || dist2({ x: refinery.cx + 1, y: refinery.cy + 1 }, cellOf(h)) <= 6 * 6) continue;
    issue(w, ai, 'unload', [h.id], { id: refinery.id });
    ai.fled[h.id] = w.tick;
  }
  for (const id of Object.keys(ai.fled)) if (w.tick - ai.fled[id] > FLEE_TICKS) delete ai.fled[id];
  const spot = threat.at;
  if (!spot) return;
  const foe = foeNear(w, ai, spot, HUNT_RADIUS);
  const to = foe ? cellOf(foe) : spot;
  const attacking = new Set(ai.wave?.stage === 'attack' ? [...ai.wave.ids, ...(ai.wave.feint?.ids ?? [])] : []);
  const defenders = army.filter((u) => !isPlane(u) && !attacking.has(u.id) && !ai.raid?.ids.includes(u.id) && (ai.defense.includes(u.id) || !u.task));
  issue(w, ai, 'attackMove', defenders.map((u) => u.id), to);
  // Bring the attack home when the raiders outgun what is at home.
  if (ai.wave && cfg.recallSense > 0) {
    const theirs = forceAround(w, ai, spot, HUNT_RADIUS);
    const away = fightValueOf(liveUnits(w, [...ai.wave.ids, ...(ai.wave.feint?.ids ?? [])]));
    if (theirs * 10 > fightValueOf(defenders) * 13 && theirs * 2 > away && chance(ai, cfg.recallSense)) {
      const ids = [...ai.wave.ids, ...(ai.wave.feint?.ids ?? [])];
      issue(w, ai, 'attackMove', ids, to);
      endWave(w, ai, cfg, 'recalled', false);
    }
  }
}

// ---- Attacks ----------------------------------------------------------------

/** Total price of the enemy buildings it knows of (it watches this drop as an attack works). @param {any} ai */
const knownValue = (ai) => ai.known.reduce((/** @type {number} */ a, /** @type {any} */ k) => a + k.cost, 0);

/**
 * What it believes guards a target: the enemy army it remembers (it can come
 * home) and the guns it knows of round the target.
 * @param {any} ai @param {Cell & { owner?: number }} target
 */
function guardOf(ai, target) {
  const army = foeArmy(ai).filter((s) => target.owner === undefined || s.owner === target.owner).reduce((a, s) => a + s.value, 0);
  const guns = ai.known.filter((/** @type {any} */ k) => k.reach && dist2(k, target) <= 12 * 12).reduce((/** @type {number} */ a, /** @type {any} */ k) => a + k.cost, 0);
  return army + guns;
}

/**
 * End the attack in progress. A skilled player learns from it: confidence
 * rises after an attack that wrecked buildings worth half its value, falls
 * otherwise, and a failed approach side is remembered.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {'retreat' | 'wiped' | 'spent' | 'recalled' | 'done'} outcome @param {boolean} sendHome
 */
function endWave(w, ai, cfg, outcome, sendHome) {
  const wave = ai.wave;
  if (!wave) return;
  const units = liveUnits(w, [...wave.ids, ...(wave.feint?.ids ?? [])]);
  if (sendHome) issue(w, ai, 'move', units.map((u) => u.id), homeSpot(w, ai, wave.target));
  if (outcome !== 'recalled' && cfg.learning > 0) {
    const success = wave.knownAtStart - knownValue(ai) >= wave.startValue / 2;
    ai.confidence = Math.max(0.7, Math.min(1.3, ai.confidence + (success ? 0.1 : -0.12) * cfg.learning));
    if (!success && wave.dir >= 0) ai.failedDirs[wave.dir] += 1;
  }
  ai.stats[outcome] = (ai.stats[outcome] ?? 0) + 1;
  ai.wave = null;
  ai.lastWaveEnd = w.tick;
  ai.nextWaveAt = w.tick + ticks(jitter(ai, AI.shared.regroupSeconds, 0.3));
}

/**
 * Should it attack now, and with what? It wants its army to outweigh what it
 * believes guards the target by its skill's margin, less when it sees an
 * opening or has waited long, more after attacks that failed.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {any[]} army
 */
function considerAttack(w, ai, cfg, style, army) {
  if (w.tick < ai.nextWaveAt) return;
  const free = freeUnits(ai, army);
  const atCap = army.length >= AI.shared.armyMax - 2;
  const minWave = Math.max(3, Math.round(cfg.minWave * style.waveSize));
  if (!free.length || (free.length < minWave && !atCap)) return;
  const from = cellOf(free[0]);
  const target = chooseTarget(w, ai, cfg, baseCentre(w, ai.pid));
  if (!target) return;
  const mine = fightValueOf(free);
  const believed = jitter(ai, guardOf(ai, target), cfg.judgmentError);
  let need = cfg.attackAdvantage / style.aggression / ai.confidence;
  const waited = w.tick - ai.lastWaveEnd;
  const patience = ticks(cfg.patienceSeconds * style.patience);
  if (waited > patience) need *= 0.6;
  if (waited > 2 * patience) need *= 0.5;
  if (cfg.windowSense > 0 && openingNow(w, ai) && chance(ai, cfg.windowSense)) need *= 0.6;
  if (!atCap && mine < need * believed) return;
  launch(w, ai, cfg, free, from, target);
}

/**
 * Send an attack: the army gathers at the chosen side; a skilled player with
 * a big enough army sends a quarter of it — the fastest — round another side
 * first, as a feint.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} free @param {Cell} from @param {Cell & { owner?: number }} target
 */
function launch(w, ai, cfg, free, from, target) {
  const { staging, dir } = chooseApproach(w, ai, cfg, from, target);
  let main = free;
  /** @type {null | { ids: number[], staging: Cell }} */
  let feint = null;
  if (cfg.routeSense >= 0.85 && free.length >= 10) {
    const side = chooseApproach(w, ai, cfg, from, target, dir);
    if (side.dir !== dir) {
      const fast = [...free].sort((a, b) => UNITS[b.type].speed - UNITS[a.type].speed || a.id - b.id).slice(0, free.length >> 2);
      const ids = new Set(fast.map((u) => u.id));
      main = free.filter((u) => !ids.has(u.id));
      feint = { ids: fast.map((u) => u.id), staging: side.staging };
      issue(w, ai, 'move', feint.ids, feint.staging);
    }
  }
  ai.wave = {
    ids: main.map((u) => u.id), feint, startValue: fightValueOf(free), startCount: free.length, knownAtStart: knownValue(ai),
    stage: 'gather', target: { x: target.x, y: target.y }, owner: target.owner ?? -1, staging, dir, since: w.tick,
  };
  ai.waveCount++;
  ai.stats.waves = (ai.stats.waves ?? 0) + 1;
  issue(w, ai, 'move', ai.wave.ids, staging);
}

/**
 * Units built while an attack is on join it: a skilled player sends them as a
 * group of three or more to the fight, a green one sends each as it comes out.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} army @param {Cell} fight
 */
function reinforce(w, ai, cfg, army, fight) {
  const free = freeUnits(ai, army).filter((u) => !u.task);
  if (!free.length || (cfg.regroup >= 0.5 && free.length < 3)) return;
  const ids = free.map((u) => u.id);
  issue(w, ai, 'attackMove', ids, cfg.regroup >= 0.5 ? fight : ai.wave.target);
  ai.wave.ids.push(...ids);
  ai.wave.startValue += fightValueOf(free);
  ai.wave.startCount += free.length;
}

/** Steer the attack in progress. @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} army */
function steerWave(w, ai, cfg, army) {
  const wave = ai.wave;
  wave.ids = liveUnits(w, wave.ids).map((u) => u.id);
  if (wave.feint) wave.feint.ids = liveUnits(w, wave.feint.ids).map((u) => u.id);
  const main = liveUnits(w, wave.ids);
  const all = [...main, ...liveUnits(w, wave.feint?.ids ?? [])];
  if (!all.length) { endWave(w, ai, cfg, 'wiped', false); return; }
  // Down to a handful: the attack is over (survivors fight on where they are, then join the next one).
  if (all.length * SPENT_SHARE <= wave.startCount || (all.length === 1 && wave.startCount > 1)) { endWave(w, ai, cfg, 'spent', false); return; }
  const value = fightValueOf(all);
  const fight = centroid(all) ?? wave.target;
  const theirs = wave.stage === 'attack' ? forceAround(w, ai, fight, FIGHT_RADIUS) : 0;
  // Lost most of the attack: pull out, unless (for a player who reads fights) it is clearly winning.
  if (value <= wave.startValue * (1 - cfg.retreatLoss) && (cfg.retreatRatio <= 0 || value < theirs * 1.2)) { endWave(w, ai, cfg, 'retreat', true); return; }
  const go = (/** @type {number[]} */ ids) => issue(w, ai, 'attackMove', ids, wave.target);
  if (wave.stage === 'gather') {
    const there = main.filter((u) => dist2(cellOf(u), wave.staging) <= 16).length;
    if (there * 4 >= main.length * 3 || w.tick - wave.since > ticks(AI.shared.gatherSeconds)) {
      wave.since = w.tick;
      if (wave.feint?.ids.length) { go(wave.feint.ids); wave.stage = 'feint'; } else { go(wave.ids); wave.stage = 'attack'; }
    }
    return;
  }
  if (wave.stage === 'feint') {
    if (w.tick - wave.since >= ticks(AI.shared.feintLeadSeconds)) { go(wave.ids); wave.stage = 'attack'; wave.since = w.tick; }
    return;
  }
  // Attacking. Is the fight going its way? (A green player never asks.)
  if (cfg.retreatRatio > 0 && w.tick - wave.since > ticks(3) && theirs > 0 && value < cfg.retreatRatio * jitter(ai, theirs, cfg.judgmentError)) {
    endWave(w, ai, cfg, 'retreat', true);
    return;
  }
  reinforce(w, ai, cfg, army, fight);
  // When (nearly) everyone has stopped, move on to the next target from where it stands — a few stuck units never hold it up.
  const idle = all.filter((u) => !u.task && !u.order).length;
  if (idle * 4 >= all.length * 3 && w.tick - wave.since > ticks(5)) {
    let next = chooseTarget(w, ai, cfg, fight);
    // Nothing known left to hit here: go looking where it has not seen yet.
    if (next && dist2(next, fight) <= 8 * 8 && !ai.known.length) next = unexplored(w, ai, fight) ?? next;
    if (!next) { endWave(w, ai, cfg, 'done', true); return; }
    wave.target = { x: next.x, y: next.y };
    wave.since = w.tick;
    go(all.map((u) => u.id));
  }
}

/** Nearest ground it has never seen round a spot (where an enemy it cannot find must be), or null. @param {World} w @param {any} ai @param {Cell} from */
function unexplored(w, ai, from) {
  for (const [x, y] of spiral(from.x, from.y, HUNT_SEARCH)) {
    if (x < 0 || y < 0 || x >= w.map.width || y >= w.map.height) continue;
    if (!w.isExplored(ai.pid, x, y) && w.nav.passable('track', x, y)) return { x, y };
  }
  return null;
}

/** Attacks: steer the one in progress, or consider a new one. @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {any[]} army */
export function campaign(w, ai, cfg, style, army) {
  if (ai.wave) steerWave(w, ai, cfg, army);
  else considerAttack(w, ai, cfg, style, army);
}

// ---- Raids ------------------------------------------------------------------

/**
 * Raids: a few fast units slip round the side to hit Harvesters, refineries
 * and power plants, and come home once they have lost half their value or
 * run into more than they can take.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Style} style @param {any[]} army
 */
export function raids(w, ai, cfg, style, army) {
  const raid = ai.raid;
  if (raid) {
    const units = liveUnits(w, raid.ids);
    raid.ids = units.map((u) => u.id);
    const home = () => { issue(w, ai, 'move', raid.ids, homeSpot(w, ai, raid.target)); ai.raid = null; };
    if (!units.length) { ai.raid = null; return; }
    const value = fightValueOf(units);
    const at = centroid(units) ?? raid.target;
    if (value * 2 < raid.startValue || w.tick - raid.since > ticks(120) || forceAround(w, ai, at, 6) > value * 1.2) { home(); return; }
    if (raid.stage === 'go') {
      if (units.some((u) => dist2(cellOf(u), raid.staging) <= 9) || w.tick - raid.since > ticks(40)) {
        issue(w, ai, 'attackMove', raid.ids, raid.target);
        raid.stage = 'hit';
      }
      return;
    }
    if (units.every((u) => !u.task && !u.order)) {
      const next = raid.hits < 3 ? chooseRaidTarget(w, ai, at, value / 2) : null;
      if (!next || dist2(next, at) > 15 * 15) { home(); return; }
      raid.target = { x: next.x, y: next.y };
      raid.hits++;
      issue(w, ai, 'attackMove', raid.ids, raid.target);
    }
    return;
  }
  const keen = cfg.raidSense * style.raids;
  if (keen < 0.15 || w.tick < ai.nextRaidAt || army.length < RAID_ARMY) return;
  ai.nextRaidAt = w.tick + ticks(jitter(ai, AI.shared.raidSeconds / Math.min(2.5, keen), 0.4));
  const fast = freeUnits(ai, army).filter((u) => UNITS[u.type].speed >= 2 && !u.task)
    .sort((a, b) => UNITS[b.type].speed - UNITS[a.type].speed || a.id - b.id).slice(0, 2 + Math.min(1, Math.round(keen / 2)));
  if (fast.length < 2) return;
  const from = cellOf(fast[0]);
  const target = chooseRaidTarget(w, ai, from, fightValueOf(fast) / 2);
  if (!target) return;
  const { staging } = chooseApproach(w, ai, cfg, from, target);
  ai.raid = { ids: fast.map((u) => u.id), startValue: fightValueOf(fast), target: { x: target.x, y: target.y }, staging, stage: 'go', since: w.tick, hits: 0 };
  ai.stats.raids = (ai.stats.raids ?? 0) + 1;
  issue(w, ai, 'move', ai.raid.ids, staging);
}

// ---- Scouting ---------------------------------------------------------------

/** Places worth a look: every enemy start, four points round each, and the middle of the map. @param {World} w @param {any} ai */
function scoutSpots(w, ai) {
  const out = [];
  for (const s of enemyStarts(w, ai.pid)) {
    out.push({ x: s.x, y: s.y });
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      out.push({ x: Math.max(0, Math.min(w.map.width - 1, s.x + dx * 12)), y: Math.max(0, Math.min(w.map.height - 1, s.y + dy * 12)) });
    }
  }
  out.push({ x: w.map.width >> 1, y: w.map.height >> 1 });
  return out;
}

/**
 * Scouting: almost everyone has a look at the enemy base once; a skilled
 * player sends someone round again every so often, to the places it has not
 * seen into for longest.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} army
 */
export function scouting(w, ai, cfg, army) {
  if (ai.scoutId) {
    const u = w.entities.get(ai.scoutId);
    if (u && !u.dead && (u.task || u.order)) return;
    // Seen what it went for: come back before the enemy notices.
    if (u && !u.dead) issue(w, ai, 'move', [u.id], homeSpot(w, ai, cellOf(u)));
    ai.scoutId = 0;
  }
  const first = !ai.scouted;
  if (!first && (cfg.scoutSeconds <= 0 || w.tick < ai.nextScoutAt)) return;
  const pool = freeUnits(ai, army).filter((u) => !u.task);
  const scout = SCOUTS.map((t) => pool.find((u) => u.type === t)).find(Boolean)
    ?? pool.filter((u) => UNITS[u.type].speed >= 1.8).sort((a, b) => UNITS[a.type].cost - UNITS[b.type].cost || a.id - b.id)[0];
  if (!scout) return;
  ai.scouted = true;
  ai.nextScoutAt = w.tick + ticks(jitter(ai, Math.max(30, cfg.scoutSeconds), 0.3));
  if (first && !chance(ai, 0.4 + 0.06 * cfg.level)) return;
  const spots = scoutSpots(w, ai);
  let to = spots[0];
  for (let k = 0; k < spots.length; k++) {
    const s = spots[(ai.scoutCursor + k) % spots.length];
    if (!w.cellVisible(ai.pid, s.x, s.y) || k === spots.length - 1) { to = s; ai.scoutCursor = (ai.scoutCursor + k + 1) % spots.length; break; }
  }
  if (first) to = spots[0];
  ai.scoutId = scout.id;
  ai.stats.scouts = (ai.stats.scouts ?? 0) + 1;
  issue(w, ai, 'move', [scout.id], to);
}

// ---- Battle control ---------------------------------------------------------

/**
 * Battle control: badly hurt vehicles go for repairs, and the attack focuses
 * its fire — on what is nearly dead for a fair player, on what is worth most
 * for the health it has left for a skilled one.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} army
 */
export function micro(w, ai, cfg, army) {
  if (cfg.pullBackHp >= 0.1) {
    const depot = w.entities.all().find((e) => e.kind === 'structure' && e.owner === ai.pid && isActive(e) && e.type === 'serviceDepot');
    if (depot) {
      for (const u of army) {
        if (u.task?.type === 'depot' || !isVehicle(u)) continue;
        // Badly hurt, or a Terror Drone inside (only a depot gets it out).
        if (u.infested || u.hp * 100 < u.maxHp * Math.round(cfg.pullBackHp * 100)) issue(w, ai, 'depot', [u.id], { id: depot.id });
      }
    }
  }
  if (cfg.focusFire < 0.3 || ai.wave?.stage !== 'attack') return;
  const units = liveUnits(w, [...ai.wave.ids, ...(ai.wave.feint?.ids ?? [])]);
  const c = centroid(units);
  if (!c) return;
  const sharp = cfg.focusFire >= 0.75;
  let best = null;
  let bestScore = -1;
  for (const e of w.spatial.near(c.x * L + L / 2, c.y * L + L / 2, 6 * L)) {
    if (e.dead || e.kind !== 'unit' || e.owner < 0 || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e)) continue;
    if (!sharp && e.hp * 2 >= e.maxHp) continue;
    const score = sharp ? (UNITS[e.type].cost * 1000) / Math.max(1, e.hp) : e.maxHp - e.hp;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  if (!best) return;
  const target = best;
  const able = units.filter((u) => canAttack(u, target)).slice(0, Math.round(2 + 4 * cfg.focusFire)).map((u) => u.id);
  issue(w, ai, 'attack', able, { id: target.id });
}

/** Engineers take damaged enemy buildings near the front. @param {World} w @param {any} ai @param {SkillProfile} cfg */
export function captures(w, ai, cfg) {
  if (cfg.captureSense < 0.6) return;
  const engineers = w.entities.all().filter((u) => u.kind === 'unit' && u.owner === ai.pid && !u.dead && !u.inside && u.type === 'engineer' && !u.task);
  if (!engineers.length) return;
  const front = ai.wave?.target ?? baseCentre(w, ai.pid);
  let best = null;
  for (const e of w.entities.all()) {
    if (e.kind !== 'structure' || e.dead || e.owner < 0 || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e)) continue;
    const d = structureDef(e.type);
    if (d.line === 'defenses' || d.capturable === false || e.hp * 4 > e.maxHp) continue;
    if (dist2({ x: e.cx, y: e.cy }, front) > 20 * 20) continue;
    if (!best || e.hp < best.hp) best = e;
  }
  if (best) issue(w, ai, 'enter', [engineers[0].id], { id: best.id });
}

// ---- Air strikes and support powers -----------------------------------------

/** Every ammo weapon of an aircraft full? @param {any} u */
const fullyArmed = (u) => UNITS[u.type].weapons.every((id, k) => WEAPONS[id].ammo === 0 || u.weapons[k].ammo >= WEAPONS[id].ammo);

/** Seconds between strikes on the attack target when nothing more pressing calls the planes. */
const STRIKE_GAP = ticks(45);

/**
 * Air strikes, as Red Alert 2's computer flies them: the rearmed planes on
 * their pads go together at one target — first whoever hits the base, then
 * what the attack is fighting, then (every STRIKE_GAP once attacks have
 * begun) the attack target. A skilled player picks the costliest thing most
 * of them can hurt there (defenses count double); a green one the nearest.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} army
 */
export function airStrikes(w, ai, cfg, army) {
  const ready = army.filter((u) => isPlane(u) && u.landed && !u.task && fullyArmed(u));
  if (!ready.length) return;
  /** @type {{ at: Cell, timed: boolean }[]} */
  const spots = [];
  if (ai.threatAt) spots.push({ at: ai.threatAt, timed: false });
  if (ai.wave?.stage === 'attack') {
    const c = centroid(liveUnits(w, ai.wave.ids));
    if (c) spots.push({ at: c, timed: false });
  }
  if (ai.waveCount > 0 && w.tick >= (ai.nextStrike ?? 0)) {
    const t = chooseTarget(w, ai, cfg, baseCentre(w, ai.pid));
    if (t) spots.push({ at: t, timed: true });
  }
  const sharp = cfg.powerTiming >= 0.4;
  for (const spot of spots) {
    let best = null;
    let bestScore = -Infinity;
    for (const e of w.spatial.near(spot.at.x * L + L / 2, spot.at.y * L + L / 2, HUNT_RADIUS * L)) {
      if (e.dead || e.inside || e.owner < 0 || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e)) continue;
      const able = ready.filter((u) => canAttack(u, e)).length;
      if (!able) continue;
      const def = e.kind === 'structure' ? structureDef(e.type) : UNITS[e.type];
      if (e.kind === 'structure' && (def.wall || def.tags.includes('neutral'))) continue;
      const score = sharp ? (def.cost ?? 0) * able * (e.kind === 'structure' && def.line === 'defenses' ? 2 : 1) : -dist2(cellOf(e), spot.at);
      if (score > bestScore || (score === bestScore && best && e.id < best.id)) { bestScore = score; best = e; }
    }
    if (!best) continue;
    const target = best;
    issue(w, ai, 'attack', ready.filter((u) => canAttack(u, target)).map((u) => u.id), { id: target.id });
    if (spot.timed) ai.nextStrike = w.tick + STRIKE_GAP;
    return;
  }
}

/** The known enemy building with the most enemy building value within r cells (null: none known). @param {any} ai @param {number} r */
function richestCluster(ai, r) {
  let best = null;
  let bestValue = -1;
  for (const k of ai.known) {
    const value = ai.known.filter((/** @type {any} */ o) => dist2(o, k) <= r * r).reduce((/** @type {number} */ a, /** @type {any} */ o) => a + o.cost, 0);
    if (value > bestValue) { bestValue = value; best = k; }
  }
  return best;
}

/** How long a skilled player holds a ready superweapon for an attack before firing it anyway. */
const HOLD_SUPERWEAPON = ticks(90);

/**
 * Support powers. A green player fires a superweapon the moment it is ready
 * at the first building it knows of; a fair one at the richest cluster; a
 * skilled one holds it for its next attack (not forever).
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {any[]} army
 */
export function powers(w, ai, cfg, army) {
  const p = w.players[ai.pid];
  const attacking = ai.wave?.stage === 'attack';
  const ready = (/** @type {string} */ id) => {
    const on = !!p.powers[id]?.ready;
    if (!on) delete ai.readySince[id];
    else ai.readySince[id] ??= w.tick;
    return on;
  };
  const fire = (/** @type {any} */ t) => issue(w, ai, 'power', [], t);
  if (ready('satelliteUplink')) fire({ power: 'satelliteUplink' });
  if (ready('spyPlane') && (ai.wave?.stage === 'gather' || !ai.known.length)) {
    const t = chooseTarget(w, ai, cfg, baseCentre(w, ai.pid));
    if (t) fire({ power: 'spyPlane', x: t.x, y: t.y });
  }
  for (const [power, radius] of /** @type {const} */ ([['atomicStrike', 3], ['lightningStorm', 5]])) {
    if (!ready(power) || !ai.known.length) continue;
    if (cfg.powerTiming >= 0.7 && !attacking && w.tick - ai.readySince[power] < HOLD_SUPERWEAPON) continue;
    const at = cfg.powerTiming < 0.35 ? ai.known[0] : richestCluster(ai, radius);
    if (at) fire({ power, x: at.x, y: at.y });
  }
  if (ready('paradrop')) {
    const harv = w.entities.all().find((e) => e.kind === 'unit' && e.harv && !e.dead && !w.allied(e.owner, ai.pid) && w.visibleTo(ai.pid, e) && w.isExplored(ai.pid, e.cx, e.cy));
    const at = harv ? cellOf(harv) : cfg.powerTiming < 0.35 && ai.known.length ? ai.known[0] : null;
    if (at && w.isExplored(ai.pid, at.x, at.y)) fire({ power: 'paradrop', x: at.x, y: at.y });
  }
  if (cfg.powerTiming < 0.4) return;
  if (ready('aegisField') && attacking) {
    const lead = liveUnits(w, ai.wave.ids).find((u) => u.type === 'titanTank' || u.type === 'heavyTank');
    if (lead) fire({ power: 'aegisField', id: lead.id });
  }
  if (ready('phaseShift')) {
    const ref = ai.known.find((/** @type {any} */ k) => structureDef(k.type).role === 'refinery');
    const tank = army.filter((u) => isVehicle(u)).sort((a, b) => UNITS[b.type].cost - UNITS[a.type].cost || a.id - b.id)[0];
    if (ref && tank && w.isExplored(ai.pid, ref.x, ref.y + 2)) fire({ power: 'phaseShift', unit: tank.id, x: ref.x, y: ref.y + 2 });
  }
}

// ---- Navy and last stand ----------------------------------------------------

/** Fewest warships worth sending out together. */
const MIN_FLEET = 3;
/** How far round the target the fleet looks for water it can reach (cells). */
const COAST_SEARCH = 24;

/**
 * The navy: once enough warships are idle, they sail together to the water
 * nearest what the next attack aims at and fight there.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg
 */
export function fleet(w, ai, cfg) {
  const idle = fleetOf(w, ai.pid).filter((u) => !u.task && !u.order && !u.next);
  if (idle.length < Math.min(MIN_FLEET, AI.shared.fleetSize)) return;
  const target = chooseTarget(w, ai, cfg, baseCentre(w, ai.pid));
  if (!target) return;
  const sea = w.nav.component('float', idle[0].cx, idle[0].cy);
  for (const [x, y] of spiral(target.x, target.y, COAST_SEARCH)) {
    if (x < 0 || y < 0 || x >= w.map.width || y >= w.map.height) continue;
    if (w.nav.component('float', x, y) !== sea) continue;
    // Already there: nothing to do until something moves.
    if (idle.every((u) => dist2(cellOf(u), { x, y }) <= 16)) return;
    issue(w, ai, 'attackMove', idle.map((u) => u.id), { x, y });
    return;
  }
}

/** Final attack when the base is gone. @param {World} w @param {any} ai @param {SkillProfile} cfg */
export function lastStand(w, ai, cfg) {
  if (ai.lastStand) return;
  const target = chooseTarget(w, ai, cfg, baseCentre(w, ai.pid));
  if (!target) return;
  ai.lastStand = true;
  const all = w.entities.all().filter((u) => u.kind === 'unit' && u.owner === ai.pid && !u.dead && !u.inside && u.weapons.length);
  issue(w, ai, 'attackMove', all.map((u) => u.id), target);
}
