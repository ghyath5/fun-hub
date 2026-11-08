// @ts-check
/**
 * Where to hit and which way to go (section 16). A green player marches at
 * the nearest building it knows of — often a gun tower — along the straight
 * line from its base. An experienced one weighs what each building is worth
 * against the guns round it, and comes in from the side its scouting says is
 * weakest, avoiding approaches that already failed this match.
 */
import { AI } from '../data/rules.js';
import { structureDef } from '../sim/entities/structures.js';
import { DIR8, facingOf, ticks } from '../core/fixed.js';
import { spiral } from '../sim/nav.js';
import { clampCell, dist2, distCells, towards } from './common.js';
import { dangerAt, pathDanger, foeHarvesters } from './intel.js';

/** @typedef {import('../sim/world.js').World} World */
/** @typedef {import('./common.js').Cell} Cell */
/** @typedef {import('./skill.js').SkillProfile} SkillProfile */
/** @typedef {Cell & { id?: number, owner?: number }} Target */

/** Danger (price of guns covering a cell) worth one cell of extra marching. */
const DANGER_PER_CELL = 60;

/** How much taking out a building of each role hurts its owner (1 = ordinary). */
const ROLE_VALUE = Object.freeze({
  yard: 2.5, refinery: 3, power: 2, factory: 2.2, barracks: 1.6, radar: 1.5, tech: 2,
  superA: 3, superB: 3, superC: 3, superD: 3, silo: 1.2, depot: 1.3, airfield: 1.8, helipad: 1.5,
  navalyard: 1.3, processor: 1.5, industry: 1.5, cloning: 1.8, sensor: 1.2, kennel: 1, defense: 0.6,
});

/** Where the enemies started (every player knows the start positions). @param {World} w @param {number} pid */
export function enemyStarts(w, pid) {
  return w.players.filter((p) => p.alive && !w.allied(p.id, pid)).map((p) => ({ ...w.map.starts[p.start], owner: p.id }));
}

/** Nearest of some cells to a point. @template {Cell} T @param {T[]} list @param {Cell} from @returns {T | null} */
const nearest = (list, from) => list.reduce((/** @type {T | null} */ best, c) => (!best || dist2(c, from) < dist2(best, from) ? c : best), null);

/**
 * What the next attack aims at, seen from `from`.
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Cell} from
 * @returns {Target | null}
 */
export function chooseTarget(w, ai, cfg, from) {
  const pool = ai.known.filter((/** @type {any} */ k) => !structureDef(k.type).wall);
  if (!pool.length) return nearest(enemyStarts(w, ai.pid), from);
  const sense = cfg.targetSense;
  if (sense < 0.25) return nearest(pool, from);
  let best = null;
  let bestScore = Infinity;
  for (const k of pool) {
    const role = /** @type {keyof typeof ROLE_VALUE} */ (structureDef(k.type).role);
    const worth = 1 + ((ROLE_VALUE[role] ?? 1) - 1) * sense;
    const score = distCells(from, k) / worth + (sense * dangerAt(ai, k.x, k.y)) / DANGER_PER_CELL;
    if (score < bestScore) { bestScore = score; best = k; }
  }
  return best && { x: best.x, y: best.y, id: best.id, owner: best.owner };
}

/**
 * A raid's target: enemy Harvesters it saw lately, else refineries and power
 * plants, the least defended first — none guarded by more than `maxDanger`.
 * @param {World} w @param {any} ai @param {Cell} from @param {number} maxDanger
 * @returns {Target | null}
 */
export function chooseRaidTarget(w, ai, from, maxDanger) {
  /** @type {(Target & { worth: number })[]} */
  const options = [];
  for (const h of foeHarvesters(ai)) if (w.tick - h.at <= ticks(30)) options.push({ x: h.x, y: h.y, id: h.id, owner: h.owner, worth: 3 });
  for (const k of ai.known) {
    const role = structureDef(k.type).role;
    if (role === 'refinery' || role === 'power') options.push({ x: k.x, y: k.y, id: k.id, owner: k.owner, worth: role === 'refinery' ? 2 : 1.5 });
  }
  let best = null;
  let bestScore = Infinity;
  for (const o of options) {
    const danger = dangerAt(ai, o.x, o.y);
    // Raiders go where the guns are not.
    if (danger > maxDanger) continue;
    const score = distCells(from, o) / o.worth + (1.5 * danger) / DANGER_PER_CELL;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best && { x: best.x, y: best.y, id: best.id, owner: best.owner };
}

/** Index into DIR8 nearest the direction from a to b. @param {Cell} a @param {Cell} b */
const dirOf = (a, b) => ((facingOf(b.x - a.x, b.y - a.y) + 16) >> 5) & 7;

/** A cell near p that ground units at `from` can reach (null when none within 3 cells). @param {World} w @param {Cell} from @param {Cell} p */
function reachableNear(w, from, p) {
  for (const [x, y] of spiral(p.x, p.y, 3)) {
    if (x < 0 || y < 0 || x >= w.map.width || y >= w.map.height) continue;
    if (w.nav.passable('track', x, y) && w.nav.reachable('track', from.x, from.y, x, y)) return { x, y };
  }
  return null;
}

/**
 * Where an attack gathers before going in: `stagingDistance` short of the
 * target. A green player gathers on the straight line from home; with route
 * sense it compares the eight sides of the target by the danger it knows of
 * on the way in (and, learning, by the sides that failed before).
 * @param {World} w @param {any} ai @param {SkillProfile} cfg @param {Cell} from  where the army stands
 * @param {Cell} target @param {number} [avoidDir]  a side to keep away from (a feint's main attack), -1: none
 * @returns {{ staging: Cell, dir: number }}
 */
export function chooseApproach(w, ai, cfg, from, target, avoidDir = -1) {
  const S = AI.shared.stagingDistance;
  const toward = towards(target, from, S);
  const straight = clampCell(w, toward.x, toward.y);
  const straightDir = dirOf(target, straight);
  if (cfg.routeSense < 0.15 && avoidDir < 0) return { staging: straight, dir: straightDir };
  const diag = Math.trunc((S * 707) / 1000);
  /** @type {{ staging: Cell, dir: number }[]} */
  const candidates = [{ staging: straight, dir: straightDir }];
  DIR8.forEach(([dx, dy], dir) => {
    const len = dx && dy ? diag : S;
    const p = reachableNear(w, from, clampCell(w, target.x + dx * len, target.y + dy * len));
    if (p) candidates.push({ staging: p, dir });
  });
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (avoidDir >= 0 && Math.min((c.dir - avoidDir + 8) % 8, (avoidDir - c.dir + 8) % 8) < 2) continue;
    const march = distCells(from, c.staging) + (distCells(c.staging, target) >> 1);
    const danger = (pathDanger(ai, from, c.staging) + 2 * pathDanger(ai, c.staging, target)) / DANGER_PER_CELL;
    const memory = cfg.learning * (ai.failedDirs[c.dir] ?? 0) * 25;
    const score = march + cfg.routeSense * danger + memory;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best ?? { staging: straight, dir: straightDir };
}
