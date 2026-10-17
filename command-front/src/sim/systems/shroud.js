// @ts-check
/**
 * Shroud, fog and detection (system 12, section 12). Each team keeps an
 * `explored` bit per cell and a `seen` count per cell (how many of its
 * entities' sight circles cover it). Sight circles are precomputed masks;
 * every 4 ticks only entities that changed cell are re-stamped. Allies share
 * one team record. Stealth (submerged submarines, Camo Pillboxes) is decided
 * here too, as a per-team detection bitmask on the entity.
 */
import { SHROUD, SUBMARINE, SIM } from '../../data/rules.js';
import { UNITS } from '../../data/units.js';
import { structureDef, isActive } from '../entities/structures.js';
import { ticks } from '../../core/fixed.js';

/** @typedef {import('../world.js').World} World */
/** @typedef {{ explored: Uint8Array, seen: Uint16Array }} TeamVision */

/** @type {Map<number, Int16Array>} radius → flat [dx, dy, dx, dy, …] */
const MASKS = new Map();

/** Offsets of a filled sight circle of radius r cells. @param {number} r */
export function circleMask(r) {
  const key = Math.ceil(r * 4);
  let m = MASKS.get(key);
  if (m) return m;
  const R = Math.ceil(r);
  const out = [];
  const r2 = r * r + r * 0.5; // a little fuller than the exact circle, so edges are not ragged
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r2) out.push(dx, dy);
  m = Int16Array.from(out);
  MASKS.set(key, m);
  return m;
}

/** Fresh vision records for every team in the match. @param {number} n cells @param {number[]} teams */
export function createVision(n, teams) {
  /** @type {Record<number, TeamVision>} */
  const v = {};
  for (const t of teams) v[t] = { explored: new Uint8Array(n), seen: new Uint16Array(n) };
  return v;
}

/** Team record of a player. @param {World} w @param {number} pid */
const teamOf = (w, pid) => w.vision[w.players[pid].team];

/** Sight radius of an entity in cells (0 = none). @param {any} e */
export function sightOf(e) {
  if (e.kind === 'structure') {
    const d = structureDef(e.type);
    if (!d) return 0;
    return d.wall ? 1 : d.sight;
  }
  return UNITS[e.type]?.sight ?? 0;
}

/** Reveal a circle permanently for a team (start area, spy plane, infiltration). @param {World} w @param {number} team @param {number} x @param {number} y @param {number} r */
export function revealCircle(w, team, x, y, r) {
  const v = w.vision[team];
  if (!v) return;
  const m = circleMask(r);
  const W = w.map.width;
  for (let k = 0; k < m.length; k += 2) {
    const cx = x + m[k];
    const cy = y + m[k + 1];
    if (cx < 0 || cy < 0 || cx >= W || cy >= w.map.height) continue;
    v.explored[cy * W + cx] = 1;
  }
}

/** Reveal the whole map for a team (Satellite Uplink). @param {World} w @param {number} team */
export function revealAll(w, team) {
  w.vision[team]?.explored.fill(1);
}

/** @param {World} w @param {TeamVision} v @param {number} x @param {number} y @param {number} r @param {1 | -1} sign */
function stamp(w, v, x, y, r, sign) {
  const m = circleMask(r);
  const W = w.map.width;
  const H = w.map.height;
  for (let k = 0; k < m.length; k += 2) {
    const cx = x + m[k];
    const cy = y + m[k + 1];
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    const i = cy * W + cx;
    if (sign > 0) {
      v.seen[i]++;
      v.explored[i] = 1;
    } else if (v.seen[i] > 0) v.seen[i]--;
  }
}

/** Centre cell of an entity's sight. @param {any} e */
const eyeOf = (e) => (e.kind === 'structure' ? { x: e.cx + (e.w >> 1), y: e.cy + (e.h >> 1) } : { x: e.cx, y: e.cy });

/** Re-stamp every sight circle from scratch (after loading a save). @param {World} w */
export function rebuildVision(w) {
  for (const v of Object.values(w.vision)) v.seen.fill(0);
  w.stamps = new Map();
  updateStamps(w);
}

/** @param {World} w */
function updateStamps(w) {
  const alive = new Set();
  for (const e of w.entities.all()) {
    if (e.dead || e.owner < 0 || e.inside) continue;
    const r = sightOf(e);
    if (!r) continue;
    alive.add(e.id);
    const team = w.players[e.owner].team;
    const at = eyeOf(e);
    const old = w.stamps.get(e.id);
    if (old && old.x === at.x && old.y === at.y && old.team === team && old.r === r) continue;
    if (old) stamp(w, w.vision[old.team], old.x, old.y, old.r, -1);
    stamp(w, w.vision[team], at.x, at.y, r, 1);
    w.stamps.set(e.id, { x: at.x, y: at.y, r, team });
  }
  for (const [id, s] of w.stamps) {
    if (alive.has(id)) continue;
    stamp(w, w.vision[s.team], s.x, s.y, s.r, -1);
    w.stamps.delete(id);
  }
}

/** Every 2 s a powered Shroud Generator re-shrouds unseen cells within 10 for enemy teams. @param {World} w */
function shroudGenerators(w) {
  if (w.tick % ticks(SHROUD.generatorEverySeconds) !== 0) return;
  const m = circleMask(SHROUD.generatorRadius);
  const W = w.map.width;
  for (const g of w.entities.all()) {
    if (g.kind !== 'structure' || g.dead || g.owner < 0 || !isActive(g)) continue;
    if (!structureDef(g.type).tags.includes('shroudGen') || w.players[g.owner].power.low) continue;
    for (const [team, v] of Object.entries(w.vision)) {
      if (Number(team) === w.players[g.owner].team) continue;
      for (let k = 0; k < m.length; k += 2) {
        const x = g.cx + m[k];
        const y = g.cy + m[k + 1];
        if (x < 0 || y < 0 || x >= W || y >= w.map.height) continue;
        const i = y * W + x;
        if (!v.seen[i]) v.explored[i] = 0;
      }
    }
  }
}

/**
 * Stealth (section 12): which teams detect each submerged submarine and Camo
 * Pillbox. `e.detect` is a bitmask over team ids (bit t set = team t sees it).
 * @param {World} w
 */
function detection(w) {
  const subDetect = SUBMARINE.destroyerDetect * SIM.leptonsPerCell;
  const camoNear = SHROUD.camoRevealRadius;
  const afterFire = ticks(SHROUD.camoRevealAfterFireSeconds);
  const all = w.entities.all();
  for (const e of all) {
    if (e.dead) continue;
    if (e.kind === 'unit' && e.submerged) {
      let mask = 0;
      for (const d of all) {
        if (d.dead || d.kind !== 'unit' || d.inside || !UNITS[d.type].tags.includes('detectsSubs')) continue;
        if (w.allied(d.owner, e.owner)) continue;
        const dx = d.x - e.x;
        const dy = d.y - e.y;
        if (dx * dx + dy * dy <= subDetect * subDetect) mask |= 1 << w.players[d.owner].team;
      }
      for (const p of w.players) if ((p.flags.sonarUntil ?? 0) > w.tick && (p.flags.sonarOn ?? -1) === e.owner) mask |= 1 << p.team;
      e.detect = mask;
    } else if (e.kind === 'structure' && e.owner >= 0 && structureDef(e.type)?.tags.includes('camo')) {
      let mask = 0;
      if ((e.firedAt ?? -1e9) + afterFire > w.tick) mask = ~0;
      else {
        for (const u of w.spatial.near(e.x, e.y, (camoNear + 1) * SIM.leptonsPerCell)) {
          if (u.dead || u.kind !== 'unit' || u.inside || w.allied(u.owner, e.owner)) continue;
          if (Math.max(Math.abs(u.cx - e.cx), Math.abs(u.cy - e.cy)) <= camoNear) mask |= 1 << w.players[u.owner].team;
        }
      }
      e.detect = mask;
    }
  }
}

/** Is this entity hidden by stealth from player pid? @param {World} w @param {number} pid @param {any} e */
export function stealthed(w, pid, e) {
  if (w.allied(e.owner, pid)) return false;
  const stealthy = (e.kind === 'unit' && e.submerged) || (e.kind === 'structure' && e.detect !== undefined);
  if (!stealthy) return false;
  return !((e.detect ?? 0) & (1 << w.players[pid].team));
}

/** System 12. @param {World} w */
export function shroudSystem(w) {
  if (w.tick % SHROUD.updateEveryTicks !== 0) return;
  updateStamps(w);
  shroudGenerators(w);
  detection(w);
}

/**
 * Install the shroud's queries on a world (replacing the always-visible stubs).
 * @param {World} w
 */
export function installShroud(w) {
  const W = w.map.width;
  const H = w.map.height;
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < W && y < H;
  /** Teams whose vision a player also gets (allies share one team; spies on a Radar Dome add the victim's). @param {number} pid */
  const teamsFor = (pid) => {
    const p = w.players[pid];
    const extra = p.flags.spyRadarOn;
    if (extra === undefined || extra < 0) return [p.team];
    const radar = w.entities.all().some((e) => e.kind === 'structure' && e.owner === extra && isActive(e) && structureDef(e.type).role === 'radar');
    return radar ? [p.team, w.players[extra].team] : [p.team];
  };
  w.visionTeams = teamsFor;
  w.isExplored = (pid, x, y) => {
    if (!inside(x, y)) return false;
    const i = y * W + x;
    return teamsFor(pid).some((t) => w.vision[t].explored[i] === 1);
  };
  /** Cell currently in sight (fog) or explored (shroud only). */
  w.cellVisible = (/** @type {number} */ pid, /** @type {number} */ x, /** @type {number} */ y) => {
    if (!inside(x, y)) return false;
    const i = y * W + x;
    return teamsFor(pid).some((t) => (w.settings.fog ? w.vision[t].seen[i] > 0 : w.vision[t].explored[i] === 1));
  };
  w.visibleTo = (pid, e) => {
    if (!e || e.dead) return false;
    if (e.owner >= 0 && w.allied(e.owner, pid)) return true;
    if (e.inside) return false;
    if (stealthed(w, pid, e)) return false;
    if (e.kind === 'structure') {
      for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) if (w.cellVisible(pid, x, y)) return true;
      return false;
    }
    return w.cellVisible(pid, e.cx, e.cy);
  };
}

/** Explored cell count per team, for the state hash. @param {World} w */
export function visionDigest(w) {
  const out = [];
  for (const t of Object.keys(w.vision).sort()) {
    let n = 0;
    for (const b of w.vision[/** @type {any} */ (t)].explored) n += b;
    out.push(n);
  }
  return out;
}

