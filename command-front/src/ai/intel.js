// @ts-check
/**
 * What the computer player knows (section 16). It sees only through its own
 * shroud and fog, like a human: enemy buildings it has spotted stay on its
 * mind until it sees them gone, and enemy units are remembered where they
 * were last seen for as long as its skill lets it remember. From that it
 * judges strength, danger along a route, the enemy's army make-up and
 * openings worth attacking into.
 */
import { SIM } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { structureDef } from '../sim/entities/structures.js';
import { ticks, isqrt } from '../core/fixed.js';
import { isCombatType, dist2 } from './common.js';

/** @typedef {import('../sim/world.js').World} World */
/** @typedef {import('./common.js').Cell} Cell */
/** @typedef {{ id: number, type: string, owner: number, x: number, y: number, cost: number, reach: number }} KnownStructure  reach: cells a defense's gun covers (0 for none) */
/** @typedef {{ id: number, type: string, owner: number, x: number, y: number, at: number, value: number }} Sighting */

/** How often it takes stock of the enemy army's size (for openings). */
const SAMPLE_TICKS = ticks(10);
/** Samples kept: one minute. */
const SAMPLES = 6;
/** How far round a known enemy unit its threat counts (cells). */
const UNIT_THREAT_RADIUS = 5;

/** Gun reach of a structure that shoots ground targets, in cells (0: none). @param {string} type */
function groundReach(type) {
  const d = structureDef(type);
  const wd = d?.weapon ? WEAPONS[d.weapon] : null;
  return wd && wd.hits.includes('G') ? Math.ceil(Math.max(wd.range, wd.leap ?? 0)) + 1 : 0;
}

/** Refresh everything it knows. @param {World} w @param {any} ai @param {{ memorySeconds: number }} cfg */
export function updateIntel(w, ai, cfg) {
  rememberStructures(w, ai);
  rememberUnits(w, ai, ticks(cfg.memorySeconds));
  const last = ai.foeLog[ai.foeLog.length - 1];
  if (!last || w.tick - last.at >= SAMPLE_TICKS) {
    ai.foeLog.push({ at: w.tick, value: foeArmyValue(ai) });
    if (ai.foeLog.length > SAMPLES) ai.foeLog.shift();
  }
}

/** Enemy buildings it can see now join its memory; ones it sees gone leave it. @param {World} w @param {any} ai */
function rememberStructures(w, ai) {
  /** @type {Map<number, KnownStructure>} */
  const seen = new Map(ai.known.map((/** @type {KnownStructure} */ k) => [k.id, k]));
  for (const e of w.entities.all()) {
    if (e.kind !== 'structure' || e.dead || e.owner < 0 || w.allied(e.owner, ai.pid)) continue;
    if (!w.visibleTo(ai.pid, e)) continue;
    seen.set(e.id, { id: e.id, type: e.type, owner: e.owner, x: e.cx + (e.w >> 1), y: e.cy + (e.h >> 1), cost: structureDef(e.type).cost ?? 0, reach: groundReach(e.type) });
  }
  // Forget what is gone: a known building whose cell is visible but which no longer stands there for an enemy.
  ai.known = [...seen.values()].filter((k) => {
    const e = w.entities.get(k.id);
    if (e && !e.dead && !w.allied(e.owner, ai.pid)) return true;
    return !w.cellVisible(ai.pid, k.x, k.y);
  }).sort((a, b) => a.id - b.id);
}

/** Enemy units in sight are noted where they stand; old sightings fade. @param {World} w @param {any} ai @param {number} keepTicks */
function rememberUnits(w, ai, keepTicks) {
  /** @type {Map<number, Sighting>} */
  const byId = new Map(ai.seen.map((/** @type {Sighting} */ s) => [s.id, s]));
  for (const e of w.entities.all()) {
    if (e.kind !== 'unit' || e.dead || e.inside || e.owner < 0 || w.allied(e.owner, ai.pid)) continue;
    if (!w.visibleTo(ai.pid, e)) continue;
    byId.set(e.id, { id: e.id, type: e.type, owner: e.owner, x: e.cx, y: e.cy, at: w.tick, value: Math.floor((UNITS[e.type].cost * e.hp) / Math.max(1, e.maxHp)) });
  }
  ai.seen = [...byId.values()].filter((s) => {
    const e = w.entities.get(s.id);
    return e && !e.dead && w.tick - s.at <= keepTicks;
  }).sort((a, b) => a.id - b.id);
}

/** Remembered enemy combat units. @param {any} ai @returns {Sighting[]} */
export const foeArmy = (ai) => ai.seen.filter((/** @type {Sighting} */ s) => isCombatType(s.type));

/** What it believes the enemy army is worth. @param {any} ai */
export const foeArmyValue = (ai) => foeArmy(ai).reduce((a, s) => a + s.value, 0);

/** Remembered enemy Harvesters. @param {any} ai @returns {Sighting[]} */
export const foeHarvesters = (ai) => ai.seen.filter((/** @type {Sighting} */ s) => UNITS[s.type].tags.includes('harvester'));

/** Known enemy defenses that shoot ground targets. @param {any} ai @returns {KnownStructure[]} */
export const knownGuns = (ai) => ai.known.filter((/** @type {KnownStructure} */ k) => k.reach > 0);

/**
 * How dangerous a cell looks: known guns that cover it (their price) and
 * remembered enemy units close by (half their value: they may have moved).
 * @param {any} ai @param {number} x @param {number} y
 */
export function dangerAt(ai, x, y) {
  let d = 0;
  for (const k of ai.known) if (k.reach && (k.x - x) ** 2 + (k.y - y) ** 2 <= k.reach * k.reach) d += k.cost;
  const r2 = UNIT_THREAT_RADIUS * UNIT_THREAT_RADIUS;
  for (const s of ai.seen) if (isCombatType(s.type) && (s.x - x) ** 2 + (s.y - y) ** 2 <= r2) d += s.value >> 1;
  return d;
}

/** Danger summed along a straight line, sampled every 2 cells. @param {any} ai @param {Cell} a @param {Cell} b */
export function pathDanger(ai, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.max(1, isqrt(dx * dx + dy * dy) >> 1);
  let sum = 0;
  for (let i = 0; i <= n; i++) sum += dangerAt(ai, a.x + Math.trunc((dx * i) / n), a.y + Math.trunc((dy * i) / n));
  return sum;
}

/**
 * The enemy force it would meet round a spot: enemy units in sight within
 * `r` cells (by health left) and known guns that reach the spot.
 * @param {World} w @param {any} ai @param {Cell} at @param {number} r
 */
export function forceAround(w, ai, at, r) {
  let value = 0;
  const L = SIM.leptonsPerCell;
  for (const e of w.spatial.near(at.x * L + (L >> 1), at.y * L + (L >> 1), r * L)) {
    if (e.dead || e.kind !== 'unit' || e.owner < 0 || w.allied(e.owner, ai.pid) || !isCombatType(e.type) || !w.visibleTo(ai.pid, e)) continue;
    value += Math.floor((UNITS[e.type].cost * e.hp) / Math.max(1, e.maxHp));
  }
  for (const k of ai.known) if (k.reach && dist2(k, at) <= (k.reach + 2) ** 2) value += k.cost;
  return value;
}

/** Armour classes the enemy army is made of, as shares of its value (null when it has seen none). @param {any} ai */
export function foeMakeUp(ai) {
  const out = { none: 0, light: 0, heavy: 0, air: 0 };
  let total = 0;
  for (const s of foeArmy(ai)) {
    const d = UNITS[s.type];
    const k = d.loco === 'air' ? 'air' : /** @type {'none' | 'light' | 'heavy'} */ (d.armor === 'none' ? 'none' : d.armor === 'light' ? 'light' : 'heavy');
    out[k] += s.value;
    total += s.value;
  }
  if (!total) return null;
  return { none: out.none / total, light: out.light / total, heavy: out.heavy / total, air: out.air / total };
}

/**
 * An opening: most of the enemy army it saw lately is far from home, or the
 * enemy army it remembers just shrank by a third (it lost a fight).
 * @param {World} w @param {any} ai
 */
export function openingNow(w, ai) {
  const recent = foeArmy(ai).filter((s) => w.tick - s.at <= ticks(30));
  const total = recent.reduce((a, s) => a + s.value, 0);
  if (total > 0) {
    const away = recent.filter((s) => dist2(s, w.map.starts[w.players[s.owner].start]) > 20 * 20).reduce((a, s) => a + s.value, 0);
    if (away * 10 >= total * 6) return true;
  }
  const log = ai.foeLog;
  if (log.length >= 2) {
    const peak = Math.max(...log.slice(0, -1).map((/** @type {{ value: number }} */ s) => s.value));
    const now = log[log.length - 1].value;
    if (peak >= 1500 && now * 3 <= peak * 2) return true;
  }
  return false;
}
