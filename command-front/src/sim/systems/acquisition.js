// @ts-check
/**
 * Target acquisition and engagement (system 5, section 9).
 *
 * Each tick, per entity in id order: finish completed tasks, drop invalid
 * targets, answer return fire, rescan (every 8 ticks, staggered by id % 8),
 * then decide movement for the engagement: stop when in range, chase when
 * out of range (Guard leashes 8 cells from its post; Hold never moves for
 * an automatic target; explicit attacks chase without a leash). Defenses
 * scan like units on Hold Position and never move.
 */
import { UNITS } from '../../data/units.js';
import { COMBAT, SPECIALS, SIM } from '../../data/rules.js';
import { cellOf, chebyshev } from '../../core/fixed.js';
import { targetScore } from '../formulas/combat.js';
import { canAttack, maxRangeVs, maxRange, bestMultiplierPct, isInfantryEntity, reachDist, weaponsOf, autoTargetable } from '../targeting.js';
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
      if (t.target && !e) { u.target = 0; u.fireCell = null; becomeIdle(w, u); }
      else if (t.type === 'attack' && e && w.allied(e.owner, u.owner)) { u.target = 0; becomeIdle(w, u); }
      else if (t.type === 'attack' && e && !w.visibleTo(u.owner, e)) {
        // Lost from sight (shroud, fog, submerged, inside a transport): go where it was last seen, then idle.
        u.target = 0;
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

/** Drop a target that died, turned friendly, vanished or can no longer be hit. @param {World} w @param {any} u */
function validateTarget(w, u) {
  if (!u.target) return;
  const t = w.entities.get(u.target);
  const forced = u.task?.type === 'forceFire';
  const friendly = t ? w.allied(t.owner, u.owner) : false;
  let keep = t && (forced || (isMedic(u) ? friendly && t.hp < t.maxHp && t.id !== u.id : !friendly && canAttack(u, t)));
  if (keep && !forced && !w.visibleTo(u.owner, t)) keep = false;
  if (keep && t.inside) keep = false;
  if (keep) return;
  const wasAuto = !(u.task && (u.task.type === 'attack' || u.task.type === 'forceFire'));
  u.target = 0;
  u.chase = null;
  if (wasAuto && !isStructure(u)) returnToPost(w, u);
}

/** After an automatic chase, an idle Guard walks back to its post. @param {World} w @param {Unit} u */
function returnToPost(w, u) {
  if (u.task || u.stance === 'hold') return;
  if (u.cx === u.post.x && u.cy === u.post.y) return;
  setMove(w, u, u.post.x, u.post.y, { auto: true });
}

/** May this entity pick targets by itself right now? @param {World} w @param {any} u */
function scans(w, u) {
  if (!armed(u) || u.stance === 'holdFire' || hasTag(u, 'noAutoAcquire')) return false;
  if (u.landed || hasTag(u, 'plane')) return false; // planes fight only when ordered; nothing fights from a pad
  if (isStructure(u)) return u.buildUp === 0 && !u.selling;
  return !FOCUSED_TASKS.has(u.task?.type ?? '');
}

/** Tasks that keep a unit from picking fights on its own (it is busy going somewhere for a reason). */
const FOCUSED_TASKS = new Set(['move', 'attack', 'forceFire', 'enter', 'c4', 'layMines', 'load', 'unloadAt', 'depot', 'returnPad']);

/** Acquisition radius: sight for Guard, weapon range for Hold. @param {any} u */
const scanRadius = (u) => (u.stance === 'hold' || isStructure(u) ? maxRange(u) : combatDef(u.type).sight * L);

/** Best enemy in range of a scan, by the section 9 score; null when none. @param {World} w @param {any} u */
function bestTarget(w, u) {
  let best = null;
  let bestScore = Infinity;
  const r = scanRadius(u);
  // Structures can be big: widen the search by their half-size and measure to the footprint.
  for (const c of w.spatial.near(u.x, u.y, r + 2 * L)) {
    if (c.id === u.id || c.dead || c.inside) continue;
    if (c.owner < 0 || w.allied(c.owner, u.owner) || !canAttack(u, c)) continue;
    if (!autoTargetable(c, u, (e) => w.visibleTo(u.owner, e))) continue;
    const d = reachDist(u, c);
    if (d > r) continue;
    const cd = combatDef(c.type);
    const score = targetScore({
      distanceMilli: Math.floor((d * 1000) / L),
      canDamageMe: canAttack(c, u),
      isStructure: cd.structure && !cd.defense,
      myMultVsThemPct: bestMultiplierPct(u, c),
      isCurrent: c.id === u.target,
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

/** Answer whoever just shot at us, if allowed. @param {World} w @param {any} u */
function returnFire(w, u) {
  const by = u.lastAttacker;
  u.lastAttacker = 0;
  if (!by || u.target || !armed(u) || u.stance === 'holdFire' || isMedic(u)) return;
  if (isStructure(u) && (u.buildUp > 0 || u.selling)) return;
  if (u.task && u.task.type !== 'attackMove' && u.task.type !== 'escort' && u.task.type !== 'guardArea') return;
  const a = w.entities.get(by);
  if (!a || a.inside || w.allied(a.owner, u.owner) || !canAttack(u, a) || !w.visibleTo(u.owner, a)) return;
  if ((u.stance === 'hold' || isStructure(u)) && reachDist(u, a) > maxRangeVs(u, a)) return;
  u.target = a.id;
  if (u.task) u.post = { x: u.cx, y: u.cy };
}

/** Cell to drive to when chasing: the entity's cell, or a structure's centre cell. @param {any} t */
const chaseCell = (t) => ({ x: cellOf(t.x), y: cellOf(t.y) });

/** Move to fight, or stop because we can already shoot. @param {World} w @param {Unit} u */
function engage(w, u) {
  if (hasTag(u, 'plane')) return; // planes fly their own passes (air.js)
  const t = u.target ? w.entities.get(u.target) : null;
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
  if (d <= range) {
    // In range: hold still and let the weapons work (a plain move order is never interrupted).
    if (u.order && u.task?.type !== 'move') stopUnit(u);
    u.chase = null;
    return;
  }
  if (!explicit) {
    if (u.stance === 'hold') { u.target = 0; return; }
    const tc = chaseCell(t);
    if (chebyshev(u.post.x, u.post.y, tc.x, tc.y) > COMBAT.guardLeash) {
      u.target = 0;
      u.chase = null;
      if (u.task?.type === 'attackMove' || u.task?.type === 'guardArea') setMove(w, u, u.task.x, u.task.y);
      else returnToPost(w, u);
      return;
    }
  }
  const tc = chaseCell(t);
  if (!u.chase || !u.order || chebyshev(u.chase.x, u.chase.y, tc.x, tc.y) >= RECHASE_CELLS) {
    u.chase = tc;
    setMove(w, u, tc.x, tc.y, { auto: true });
  }
}

/** System 5. @param {World} w */
export function acquisitionSystem(w) {
  const all = w.entities.all();
  w.spatial.rebuild(all);
  for (const u of all) {
    if (u.dead || u.inside) continue;
    if (u.kind === 'structure') {
      if (!armed(u)) continue;
      validateTarget(w, u);
      returnFire(w, u);
      if ((w.tick + u.id) % SCAN_EVERY === 0 && scans(w, u)) {
        const pick = bestTarget(w, u);
        if (pick) u.target = pick.id;
      }
      continue;
    }
    if (u.kind !== 'unit') continue;
    updateTask(w, u);
    validateTarget(w, u);
    returnFire(w, u);
    if (u.task?.type === 'attack' || u.task?.type === 'forceFire') {
      if (u.task.target) u.target = u.task.target;
    } else if ((w.tick + u.id) % SCAN_EVERY === 0 && scans(w, u)) {
      const pick = isMedic(u) ? patient(w, u) : bestTarget(w, u);
      if (pick && pick.id !== u.target) {
        // An attack-move or guard-area fight leashes from where it started; an idle Guard keeps its post.
        if (!u.target && u.task) u.post = { x: u.cx, y: u.cy };
        u.target = pick.id;
        u.chase = null;
      }
    }
    if (u.stance !== 'holdFire' || u.task?.type === 'attack' || u.task?.type === 'forceFire') engage(w, u);
  }
}

/** Unit types that never pick targets themselves (exported for the AI). */
export const passiveTypes = Object.values(UNITS).filter((d) => d.tags.includes('noAutoAcquire')).map((d) => d.id);
