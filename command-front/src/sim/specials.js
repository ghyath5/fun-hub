// @ts-check
/**
 * Specialists (section 10), run inside system 6 after units move:
 * Engineers, Spies and Thieves walk up to a building and enter it (the
 * effect resolves the tick they reach an adjacent cell, and they are used
 * up); Commandos plant C4 (1 s) which destroys the building 3 s later
 * unless an Aegis Field covers it; Mine Layers drive to each queued cell and
 * lay a mine in 1 s.
 */
import { SPECIALS } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { ticks } from '../core/fixed.js';
import { structureDef } from './entities/structures.js';
import { vacate } from './entities/units.js';
import { setMove } from './systems/movement.js';
import { captureStructure } from './capture.js';
import { revealCircle } from './systems/shroud.js';
import { repairBridge } from './terrainDamage.js';
import { layMine, canMine } from './mines.js';

/** @typedef {import('./world.js').World} World */

const PLANT_TICKS = ticks(SPECIALS.c4PlantSeconds);
const FUSE_TICKS = ticks(SPECIALS.c4FuseSeconds);
const LAY_TICKS = ticks(SPECIALS.mineLaySeconds);
const INTEL_TICKS = ticks(SPECIALS.spyIntelSeconds);
const SONAR_TICKS = ticks(SPECIALS.sonarPulseSeconds);
/** Give up walking to a building after this many failed approaches. */
const MAX_APPROACHES = 6;

const tagsOf = (/** @type {any} */ u) => UNITS[u.type].tags;
export const isEngineer = (/** @type {any} */ u) => tagsOf(u).includes('engineer');
export const isSpy = (/** @type {any} */ u) => tagsOf(u).includes('spy');
export const isThief = (/** @type {any} */ u) => tagsOf(u).includes('thief');
export const isCommando = (/** @type {any} */ u) => tagsOf(u).includes('c4');
export const isMineLayer = (/** @type {any} */ u) => tagsOf(u).includes('mineLayer');

/** Chebyshev distance from a cell to a structure's footprint. @param {number} x @param {number} y @param {any} s */
export const distToFootprint = (x, y, s) =>
  Math.max(Math.max(s.cx - x, 0, x - (s.cx + s.w - 1)), Math.max(s.cy - y, 0, y - (s.cy + s.h - 1)));

/** Aegis Field protection right now. @param {World} w @param {any} e */
const shielded = (w, e) => e.aegisUntil > w.tick;

/**
 * What entering this structure would do for this unit, or '' if it cannot.
 * Relation is judged now, so a building captured a moment ago is judged as its new owner's.
 * @param {World} w @param {any} u @param {any} s
 * @returns {'' | 'repair' | 'capture' | 'sabotage' | 'bridge' | 'infiltrate' | 'steal'}
 */
export function enterEffect(w, u, s) {
  if (!s || s.dead || s.kind !== 'structure') return '';
  const def = structureDef(s.type);
  const own = s.owner >= 0 && w.allied(s.owner, u.owner);
  if (isEngineer(u)) {
    if (def.tags?.includes('hut')) {
      const b = w.bridges.find((/** @type {any} */ br) => br.hut && br.hut[0] === s.cx && br.hut[1] === s.cy);
      return b && !b.alive ? 'bridge' : '';
    }
    if (own) return s.hp < s.maxHp ? 'repair' : '';
    if (def.wall || def.line === 'defenses' || def.capturable === false) return '';
    if (s.owner < 0) return 'capture';
    return s.hp * 100 <= s.maxHp * Math.round(SPECIALS.engineerCaptureAtOrBelow * 100) ? 'capture' : 'sabotage';
  }
  if (own || s.owner < 0 || def.wall) return '';
  if (isSpy(u)) return 'infiltrate';
  if (isThief(u)) return def.role === 'refinery' || def.role === 'silo' ? 'steal' : '';
  return '';
}

/** C4 may go on any enemy structure but walls. @param {World} w @param {any} u @param {any} s */
export function canC4(w, u, s) {
  return !!s && !s.dead && s.kind === 'structure' && s.owner >= 0 && !w.allied(s.owner, u.owner) && !structureDef(s.type).wall && isCommando(u);
}

/** Remove a unit that walked into a building (not a death: no "unit lost"). @param {World} w @param {any} u */
function consume(w, u) {
  vacate(w, u, u.cx, u.cy, u.spot);
  if (u.next) vacate(w, u, u.next.x, u.next.y, u.next.spot);
  u.next = null;
  u.order = null;
  w.entities.remove(u);
  w.events.emit('unitEntered', w.tick, { id: u.id, type: u.type, owner: u.owner });
}

/** Spy infiltration effects by building role. @param {World} w @param {any} u @param {any} s */
function infiltrate(w, u, s) {
  const p = w.players[u.owner];
  const victim = s.owner;
  const role = structureDef(s.type).role;
  if (role === 'radar') p.flags.spyRadarOn = victim;
  else if (role === 'refinery' || role === 'silo') p.flags[`creditsOf${victim}`] = w.tick + INTEL_TICKS;
  else if (['barracks', 'factory', 'helipad', 'airfield'].includes(role)) p.flags[`queuesOf${victim}`] = w.tick + INTEL_TICKS;
  else if (role === 'navalyard') { p.flags.sonarOn = victim; p.flags.sonarUntil = w.tick + SONAR_TICKS; }
  else revealCircle(w, p.team, s.cx + (s.w >> 1), s.cy + (s.h >> 1), SPECIALS.spyRevealRadius);
  w.events.emit('infiltrated', w.tick, { by: u.owner, victim, id: s.id, role });
}

/** Resolve one entry. @param {World} w @param {any} u @param {any} s */
function resolveEntry(w, u, s) {
  const effect = enterEffect(w, u, s);
  if (!effect || (shielded(w, s) && effect !== 'repair' && effect !== 'bridge')) { u.task = null; return; }
  switch (effect) {
    case 'repair':
      s.hp = s.maxHp;
      if (s.owner >= 0 && (structureDef(s.type).power ?? 0) > 0) w.players[s.owner].powerDirty = true;
      break;
    case 'capture': captureStructure(w, s, u.owner); break;
    case 'sabotage': {
      const amount = Math.min(Math.floor((s.maxHp * Math.round(SPECIALS.engineerDamageFraction * 100)) / 100), s.hp - 1);
      if (amount > 0) w.damage.push({ victim: s.id, amount, attacker: u.id, owner: u.owner });
      break;
    }
    case 'bridge': {
      const b = w.bridges.find((/** @type {any} */ br) => br.hut && br.hut[0] === s.cx && br.hut[1] === s.cy);
      if (b) repairBridge(w, b);
      break;
    }
    case 'infiltrate': infiltrate(w, u, s); break;
    case 'steal': {
      const victim = w.players[s.owner];
      const take = Math.floor(victim.stored * SPECIALS.thiefStealFraction);
      victim.stored -= take;
      w.players[u.owner].cash += take;
      w.events.emit('stolen', w.tick, { by: u.owner, victim: s.owner, amount: take });
      break;
    }
    default: break;
  }
  consume(w, u);
}

/** Walk up to a building: the free cell next to its footprint nearest the unit. @param {World} w @param {any} u @param {any} s */
function approach(w, u, s) {
  if (u.order || u.next || u.pathReq) return true;
  const task = u.task;
  task.tries = (task.tries ?? 0) + 1;
  if (task.tries > MAX_APPROACHES) return false;
  let best = null;
  let bestD = Infinity;
  for (let y = s.cy - 1; y <= s.cy + s.h; y++) {
    for (let x = s.cx - 1; x <= s.cx + s.w; x++) {
      if (distToFootprint(x, y, s) !== 1) continue;
      if (!w.nav.passable('foot', x, y) || w.occ.bld[y * w.map.width + x]) continue;
      const d = (x - u.cx) ** 2 + (y - u.cy) ** 2;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  if (!best) return false;
  setMove(w, u, best.x, best.y);
  return true;
}

/** Engineers, Spies and Thieves heading into buildings. @param {World} w */
function entries(w) {
  /** @type {{ u: any, s: any }[]} */
  const arriving = [];
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.task?.type !== 'enter') continue;
    const s = w.entities.get(u.task.target);
    if (!s || s.dead || !enterEffect(w, u, s)) { u.task = null; continue; }
    if (!u.next && distToFootprint(u.cx, u.cy, s) <= 1) arriving.push({ u, s });
    else if (!approach(w, u, s)) u.task = null;
  }
  // Simultaneous entries resolve in player-index order (then unit id).
  arriving.sort((a, b) => a.u.owner - b.u.owner || a.u.id - b.u.id);
  for (const { u, s } of arriving) if (!u.dead) resolveEntry(w, u, s);
}

/** Commandos planting C4, and charges going off. @param {World} w */
function demolitions(w) {
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.task?.type !== 'c4') continue;
    const s = w.entities.get(u.task.target);
    if (!canC4(w, u, s)) { u.task = null; continue; }
    if (u.next || distToFootprint(u.cx, u.cy, s) > 1) {
      u.task.plantAt = 0;
      if (!approach(w, u, s)) u.task = null;
      continue;
    }
    if (!u.task.plantAt) { u.task.plantAt = w.tick + PLANT_TICKS; continue; }
    if (w.tick < u.task.plantAt) continue;
    w.c4.push({ target: s.id, at: w.tick + FUSE_TICKS, by: u.id, owner: u.owner });
    w.events.emit('c4Planted', w.tick, { id: s.id, by: u.id, owner: u.owner });
    u.task = null; // the Commando stays where it is (not consumed)
  }
  if (!w.c4.length) return;
  const later = [];
  for (const c of w.c4) {
    if (w.tick < c.at) { later.push(c); continue; }
    const s = w.entities.get(c.target);
    if (!s || s.dead || shielded(w, s)) continue;
    w.damage.push({ victim: s.id, amount: s.maxHp, attacker: c.by, owner: c.owner });
  }
  w.c4 = later;
}

/** Mine Layers working through their queued cells. @param {World} w */
function mineLaying(w) {
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.task?.type !== 'layMines') continue;
    const t = u.task;
    while (t.cells.length && !canMine(w, u.owner, t.cells[0][0], t.cells[0][1])) { t.cells.shift(); t.until = 0; }
    if (!t.cells.length || (u.mines ?? 0) <= 0) { u.task = null; continue; }
    const [x, y] = t.cells[0];
    if (u.cx === x && u.cy === y && !u.next) {
      if (!t.until) { t.until = w.tick + LAY_TICKS; continue; }
      if (w.tick < t.until) continue;
      if (layMine(w, u, x, y)) u.mines--;
      t.cells.shift();
      t.until = 0;
    } else if (!u.order && !u.next && !u.pathReq) {
      setMove(w, u, x, y);
      t.tries = (t.tries ?? 0) + 1;
      if (t.tries > MAX_APPROACHES * t.cells.length + MAX_APPROACHES) u.task = null;
    }
  }
}

/** Specialists: part of system 6, after units moved. @param {World} w */
export function specialsSystem(w) {
  entries(w);
  demolitions(w);
  mineLaying(w);
}

