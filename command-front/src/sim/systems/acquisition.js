// @ts-check
/**
 * Target acquisition and engagement (system 5, section 9).
 *
 * Each tick, per entity in id order: finish completed tasks, drop invalid
 * targets, answer return fire, rescan (every 8 ticks, staggered by id % 8,
 * and at once when the old target is gone), then decide movement for the
 * engagement: stop when in range, chase when out of range (Guard leashes
 * 8 cells from its post; Hold never moves for an automatic target; explicit
 * attacks chase without a leash). Defenses scan like units on Hold Position
 * and never move. Turreted vehicles and helicopters on a plain move order
 * shoot what comes into range on the way without leaving their route.
 *
 * Choosing (targetScore): what can be shot from here now, what threatens
 * this unit, what its weapons are good against, what is nearly dead and
 * what allies are already firing at — but not a target they will kill
 * anyway. A shared tally of who aims at what makes a group focus its fire.
 */
import { UNITS } from '../../data/units.js';
import { COMBAT, SPECIALS, SIM } from '../../data/rules.js';
import { cellOf, chebyshev } from '../../core/fixed.js';
import { targetScore } from '../formulas/combat.js';
import { canAttack, maxRangeVs, maxRange, bestMultiplierPct, isInfantryEntity, reachDist, weaponsOf, autoTargetable, volleyDamage, infests, hasTurret } from '../targeting.js';
import { combatDef } from '../defs.js';
import { setMove, stopUnit } from './movement.js';

/** @typedef {import('../entities/units.js').Unit} Unit */
/** @typedef {import('../world.js').World} World */

const L = SIM.leptonsPerCell;
const SCAN_EVERY = COMBAT.scanStagger;
const ESCORT_RANGE = 3;
const RECHASE_CELLS = 2;

const hasTag = (/** @type {any} */ u, /** @type {string} */ tag) => combatDef(u.type).tags.includes(tag);
const armed = (/** @type {any} */ u) => weaponsOf(u).length > 0;
const isMedic = (/** @type {any} */ u) => hasTag(u, 'medic');
const isStructure = (/** @type {any} */ e) => e.kind === 'structure';
/**
 * Shoots what comes into range while it gets on with its work (the War Miner
 * harvesting): never chases a target and never walks back to a post. An
 * explicit attack order makes it fight like anyone else.
 * @param {any} u
 */
const worksWhileFiring = (u) => hasTag(u, 'firesWhileWorking') && u.task?.type !== 'attack' && u.task?.type !== 'forceFire';

/** @param {World} w @param {Unit} u */
function becomeIdle(w, u) {
  u.task = null;
  u.post = { x: u.cx, y: u.cy };
  const next = u.waypoints.shift();
  if (next) {
    u.task = { type: 'move' };
    setMove(w, u, next.x, next.y);
  }
}

/** Has the current task finished? @param {World} w @param {Unit} u */
function updateTask(w, u) {
  const t = u.task;
  if (!t || hasTag(u, 'plane') || hasTag(u, 'support')) return; // the air system runs plane tasks
  const moving = !!(u.order || u.next);
  switch (t.type) {
    case 'move':
      if (!moving) becomeIdle(w, u);
      break;
    case 'attackMove':
    case 'guardArea':
      if (!moving && !u.target && u.cx === t.x && u.cy === t.y) becomeIdle(w, u);
      else if (!moving && !u.target) setMove(w, u, t.x, t.y); // resume after a fight
      break;
    case 'attack':
    case 'forceFire': {
      const e = t.target ? w.entities.get(t.target) : null;
      if (t.target && !e) { setTarget(u, 0); u.fireCell = null; becomeIdle(w, u); }
      else if (t.type === 'attack' && e && w.allied(e.owner, u.owner)) { setTarget(u, 0); becomeIdle(w, u); }
      else if (t.type === 'attack' && e && !w.visibleTo(u.owner, e)) {
        // Lost from sight (shroud, fog, submerged, inside a transport): go where it was last seen, then idle.
        setTarget(u, 0);
        u.task = { type: 'move' };
        setMove(w, u, cellOf(e.x), cellOf(e.y));
      }
      break;
    }
    case 'escort': {
      const e = w.entities.get(t.target);
      if (!e) { becomeIdle(w, u); break; }
      u.post = { x: e.cx, y: e.cy };
      if (!u.target && chebyshev(u.cx, u.cy, e.cx, e.cy) > ESCORT_RANGE
        && (!u.chase || chebyshev(u.chase.x, u.chase.y, e.cx, e.cy) >= RECHASE_CELLS)) {
        u.chase = { x: e.cx, y: e.cy };
        setMove(w, u, e.cx, e.cy, { auto: true });
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Drop a target that died, turned friendly, vanished or can no longer be hit.
 * Returns true when an automatic target was dropped (the unit may look for
 * another before walking back to its post).
 * @param {World} w @param {any} u
 */
function validateTarget(w, u) {
  if (!u.target) return false;
  const t = w.entities.get(u.target);
  const forced = u.task?.type === 'forceFire';
  const friendly = t ? w.allied(t.owner, u.owner) : false;
  let keep = t && (forced || (isMedic(u) ? friendly && t.hp < t.maxHp && t.id !== u.id : !friendly && canAttack(u, t)));
  if (keep && !forced && !w.visibleTo(u.owner, t)) keep = false;
  if (keep && t.inside) keep = false;
  // A drone already inside that vehicle: other drones find their own (unless ordered to this one).
  if (keep && t.infested && t.infested !== u.id && infests(u) && u.task?.type !== 'attack') keep = false;
  if (keep) return false;
  const wasAuto = !(u.task && (u.task.type === 'attack' || u.task.type === 'forceFire'));
  setTarget(u, 0);
  u.chase = null;
  return wasAuto;
}

/** After an automatic chase, an idle Guard walks back to its post. @param {World} w @param {Unit} u */
function returnToPost(w, u) {
  if (u.task || u.stance === 'hold') return;
  if (u.cx === u.post.x && u.cy === u.post.y) return;
  setMove(w, u, u.post.x, u.post.y, { auto: true });
}

/**
 * May this entity pick targets by itself right now? 'all' within its scan
 * radius, 'range' only what it can already hit (shooting on the move), or
 * false.
 * @param {World} w @param {any} u @returns {'all' | 'range' | false}
 */
function scans(w, u) {
  if (!armed(u) || u.stance === 'holdFire') return false;
  if (worksWhileFiring(u)) return 'range';
  if (hasTag(u, 'noAutoAcquire')) return false;
  if (u.landed || hasTag(u, 'plane')) return false; // planes fight only when ordered; nothing fights from a pad
  if (isStructure(u)) return u.buildUp === 0 && !u.selling ? 'all' : false;
  const task = u.task?.type ?? '';
  if (task === 'move') return firesOnTheMove(u) ? 'range' : false;
  return FOCUSED_TASKS.has(task) ? false : 'all';
}

/** Tasks that keep a unit from picking fights on its own (it is busy going somewhere for a reason). */
const FOCUSED_TASKS = new Set(['move', 'attack', 'forceFire', 'enter', 'c4', 'layMines', 'load', 'unloadAt', 'depot', 'returnPad']);

/** Turrets and helicopters can shoot while they travel; infantry and fixed guns must stop. @param {any} u */
const firesOnTheMove = (u) => hasTurret(u) || hasTag(u, 'heli');

/**
 * Acquisition radius: sight for Guard (or the weapon's reach, when it shoots
 * farther than the unit sees — artillery, rockets, ships fire on what the
 * side can see), weapon range for Hold.
 * @param {any} u
 */
const scanRadius = (u) => (u.stance === 'hold' || isStructure(u) ? maxRange(u) : Math.max(combatDef(u.type).sight * L, maxRange(u)));

// ── Focus fire: who aims at what, per team ──────────────────────

/**
 * The shared tally for this tick: for each (team, target), how many shooters
 * aim at it and the damage of one volley from all of them.
 * @type {Map<number, { n: number, dmg: number }>}
 */
let aims = new Map();
/** @type {World | null} */
let aimsWorld = null;
const aimKey = (/** @type {number} */ team, /** @type {number} */ id) => id * 64 + team;

/** @param {World} w @param {any} u @param {any} t @param {number} sign */
function tally(w, u, t, sign) {
  if (!t || !aimsWorld) return;
  const k = aimKey(w.players[u.owner].team, t.id);
  const a = aims.get(k) ?? { n: 0, dmg: 0 };
  a.n += sign;
  a.dmg += sign * volleyDamage(u, t);
  if (a.n <= 0) aims.delete(k); else aims.set(k, a);
}

/** Change a unit's target, keeping the tally right. @param {any} u @param {number} id */
function setTarget(u, id) {
  if (u.target === id) return;
  const w = aimsWorld;
  if (w && u.target) tally(w, u, w.entities.get(u.target), -1);
  u.target = id;
  if (w && id) tally(w, u, w.entities.get(id), +1);
}

/** Rebuild the tally from scratch at the start of a tick. @param {World} w @param {any[]} all */
function countAims(w, all) {
  aims = new Map();
  aimsWorld = w;
  for (const u of all) {
    if (u.dead || u.inside || !u.target || u.owner < 0 || !armed(u) || isMedic(u)) continue;
    tally(w, u, w.entities.get(u.target), +1);
  }
}

/**
 * Best enemy for a scan, by the section 9 score; null when none.
 * @param {World} w @param {any} u @param {'all' | 'range'} mode
 */
function bestTarget(w, u, mode) {
  let best = null;
  let bestScore = Infinity;
  const r = mode === 'range' ? maxRange(u) : scanRadius(u);
  const team = w.players[u.owner].team;
  // Structures can be big: widen the search by their half-size and measure to the footprint.
  for (const c of w.spatial.near(u.x, u.y, r + 2 * L)) {
    if (c.id === u.id || c.dead || c.inside) continue;
    if (c.owner < 0 || w.allied(c.owner, u.owner) || !canAttack(u, c)) continue;
    if (!autoTargetable(c, u, (e) => w.visibleTo(u.owner, e))) continue;
    const d = reachDist(u, c);
    if (d > r) continue;
    const inRange = d <= maxRangeVs(u, c);
    if (mode === 'range' && !inRange) continue;
    const cd = combatDef(c.type);
    const mine = c.id === u.target;
    const others = aims.get(aimKey(team, c.id));
    // Allies already on it, not counting this unit itself.
    const allies = others ? others.n - (mine ? 1 : 0) : 0;
    const theirDmg = others ? others.dmg - (mine ? volleyDamage(u, c) : 0) : 0;
    const score = targetScore({
      distanceMilli: Math.floor((d * 1000) / L),
      canDamageMe: canAttack(c, u),
      isStructure: cd.structure && !cd.defense,
      myMultVsThemPct: bestMultiplierPct(u, c),
      isCurrent: mine,
      inRange,
      hpPermille: Math.floor((c.hp * 1000) / Math.max(1, c.maxHp)),
      allies,
      overkill: allies > 0 && theirDmg * 100 >= c.hp * Math.round(COMBAT.score.overkillAt * 100),
      attackingMe: c.target === u.id,
    });
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Medic: the most hurt friendly infantry within its sight, never itself. @param {World} w @param {Unit} u */
function patient(w, u) {
  let best = null;
  let bestRatio = Infinity;
  for (const c of w.spatial.near(u.x, u.y, SPECIALS.medicSight * L)) {
    if (c.id === u.id || c.dead || c.inside || !isInfantryEntity(c) || !w.allied(c.owner, u.owner) || c.hp >= c.maxHp) continue;
    const ratio = Math.floor((c.hp * 1000) / c.maxHp);
    if (ratio < bestRatio) { bestRatio = ratio; best = c; }
  }
  return best;
}

/**
 * Answer whoever just shot at us, if allowed: when idle, or when the current
 * automatic target is out of reach while the attacker is not.
 * @param {World} w @param {any} u
 */
function returnFire(w, u) {
  const by = u.lastAttacker;
  u.lastAttacker = 0;
  if (!by || !armed(u) || u.stance === 'holdFire' || isMedic(u)) return;
  if (isStructure(u) && (u.buildUp > 0 || u.selling)) return;
  const task = u.task?.type;
  const onTheMove = task === 'move' && firesOnTheMove(u);
  if (task && !onTheMove && task !== 'attackMove' && task !== 'escort' && task !== 'guardArea') return;
  const a = w.entities.get(by);
  if (!a || a.inside || w.allied(a.owner, u.owner) || !canAttack(u, a) || !w.visibleTo(u.owner, a)) return;
  const reach = reachDist(u, a) <= maxRangeVs(u, a);
  if ((u.stance === 'hold' || isStructure(u) || onTheMove || worksWhileFiring(u)) && !reach) return;
  if (u.target) {
    // Busy: switch only from a target it cannot hit yet to an attacker it can.
    const cur = w.entities.get(u.target);
    if (!reach || (cur && reachDist(u, cur) <= maxRangeVs(u, cur))) return;
  }
  if (!u.target && task && !onTheMove) u.post = { x: u.cx, y: u.cy };
  setTarget(u, a.id);
  u.chase = null;
}

/** Cell to drive to when chasing: the entity's cell, or a structure's centre cell. @param {any} t */
const chaseCell = (t) => ({ x: cellOf(t.x), y: cellOf(t.y) });

/** Move to fight, or stop because we can already shoot. @param {World} w @param {Unit} u */
function engage(w, u) {
  if (hasTag(u, 'plane')) return; // planes fly their own passes (air.js)
  const t = u.target ? w.entities.get(u.target) : null;
  if (worksWhileFiring(u)) {
    // Keeps working: lets go of whatever moves out of reach.
    if (t && reachDist(u, t) > (maxRangeVs(u, t) || maxRange(u))) setTarget(u, 0);
    return;
  }
  if (u.fireCell && !t) {
    const c = { x: u.fireCell.x * L + (L >> 1), y: u.fireCell.y * L + (L >> 1), kind: 'point' };
    const d = reachDist(u, c);
    if (d > maxRange(u) && (!u.chase || !u.order)) {
      u.chase = { x: u.fireCell.x, y: u.fireCell.y };
      setMove(w, u, u.fireCell.x, u.fireCell.y, { auto: true });
    } else if (d <= maxRange(u) && u.order?.auto) stopUnit(u);
    return;
  }
  if (!t) return;
  const friendly = w.allied(t.owner, u.owner);
  const range = maxRangeVs(u, t, friendly) || maxRange(u);
  const d = reachDist(u, t);
  const explicit = u.task?.type === 'attack' || u.task?.type === 'forceFire';
  if (u.task?.type === 'move') {
    // Shooting on the move: never leave the route; let go once out of reach.
    if (d > range) setTarget(u, 0);
    return;
  }
  if (d <= range) {
    // In range: hold still and let the weapons work (a plain move order is never interrupted).
    if (u.order && u.task?.type !== 'move') stopUnit(u);
    u.chase = null;
    return;
  }
  if (!explicit) {
    if (u.stance === 'hold') { setTarget(u, 0); return; }
    const tc = chaseCell(t);
    if (chebyshev(u.post.x, u.post.y, tc.x, tc.y) > COMBAT.guardLeash) {
      setTarget(u, 0);
      u.chase = null;
      if (u.task?.type === 'attackMove' || u.task?.type === 'guardArea') setMove(w, u, u.task.x, u.task.y);
      else returnToPost(w, u);
      return;
    }
  }
  const tc = chaseCell(t);
  if (!u.chase || !u.order || chebyshev(u.chase.x, u.chase.y, tc.x, tc.y) >= RECHASE_CELLS) {
    u.chase = tc;
    if (UNITS[u.type].loco === 'air') {
      // Hovering aircraft fly to a point in range on their own side of the target, not onto it:
      // several attacking one target spread round it instead of stacking over its middle.
      const at = standoff(w, u, t, range);
      setMove(w, u, cellOf(at.x), cellOf(at.y), { auto: true, at });
    } else setMove(w, u, tc.x, tc.y, { auto: true });
  }
}

/**
 * A point at 3/4 of `range` from the target, toward where the attacker is.
 * @param {World} w @param {Unit} u @param {any} t @param {number} range  leptons
 */
function standoff(w, u, t, range) {
  const dx = u.x - t.x, dy = u.y - t.y;
  const d = Math.max(1, Math.round(Math.hypot(dx, dy)));
  const r = Math.min(d, Math.floor((range * 3) / 4));
  const x = t.x + Math.trunc((dx * r) / d), y = t.y + Math.trunc((dy * r) / d);
  return { x: Math.max(0, Math.min(w.map.width * L - 1, x)), y: Math.max(0, Math.min(w.map.height * L - 1, y)) };
}

/** Pick a target now if the unit may: the best by score, or keep the current one. @param {World} w @param {any} u */
function rescan(w, u) {
  const mode = scans(w, u);
  if (!mode) return;
  const pick = isMedic(u) ? patient(w, u) : bestTarget(w, u, mode);
  if (!pick || pick.id === u.target) return;
  // An attack-move or guard-area fight leashes from where it started; an idle Guard keeps its post.
  if (!u.target && u.task && u.task.type !== 'move') u.post = { x: u.cx, y: u.cy };
  setTarget(u, pick.id);
  u.chase = null;
}

/** System 5. @param {World} w */
export function acquisitionSystem(w) {
  const all = w.entities.all();
  w.spatial.rebuild(all);
  countAims(w, all);
  for (const u of all) {
    if (u.dead || u.inside) continue;
    // Busy shooters re-check every 8 ticks; idle ones twice as often, so nothing walks into range unanswered.
    const scanTick = (w.tick + u.id) % (u.target ? SCAN_EVERY : SCAN_EVERY >> 1) === 0;
    if (u.kind === 'structure') {
      if (!armed(u)) continue;
      const lost = validateTarget(w, u);
      returnFire(w, u);
      if (scanTick || (lost && !u.target)) rescan(w, u);
      continue;
    }
    if (u.kind !== 'unit') continue;
    updateTask(w, u);
    const lost = validateTarget(w, u);
    returnFire(w, u);
    if (u.task?.type === 'attack' || u.task?.type === 'forceFire') {
      if (u.task.target) setTarget(u, u.task.target);
    } else if (scanTick || (lost && !u.target)) {
      // A dead target is replaced at once — no walking back first.
      rescan(w, u);
    }
    if (lost && !u.target && !worksWhileFiring(u)) returnToPost(w, u);
    if (u.stance !== 'holdFire' || u.task?.type === 'attack' || u.task?.type === 'forceFire') engage(w, u);
  }
  aimsWorld = null;
}

/** Unit types that never pick targets themselves (exported for the AI). */
export const passiveTypes = Object.values(UNITS).filter((d) => d.tags.includes('noAutoAcquire')).map((d) => d.id);
