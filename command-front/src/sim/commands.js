// @ts-check
/**
 * Commands are the only way to change the sim (section 2). Human input and AI
 * produce the same objects; they apply at the start of their tick in arrival
 * order. References to dead, captured or other players' entities are dropped
 * while the rest of a group command still applies.
 */
import { assignDestinations } from './groupMove.js';
import { setMove, stopUnit } from './systems/movement.js';
import { canEnter } from './entities/units.js';
import { DIR8 } from '../core/fixed.js';
import { computeField, descend } from './flowField.js';
import { MOVEMENT } from '../data/rules.js';
import { defOf } from './entities/units.js';
import { canAttack, layerOf } from './targeting.js';
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { harvesterManual, harvestAt, unloadAt } from './systems/harvest.js';
import { BASE_COMMANDS, applyBaseCommand } from './baseCommands.js';
import { startDeploy } from './systems/production.js';
import { enterEffect, canC4, isMineLayer } from './specials.js';
import { slotsFor, isTransport } from './transports.js';
import { isAircraft, returnToPad, linkPad, freePad } from './air.js';
import { ticks } from '../core/fixed.js';
import { TRANSPORT } from '../data/rules.js';
import { firePower } from './systems/supportPowers.js';
import { eliminate } from './systems/victory.js';
import { T } from '../data/terrain.js';

/** @typedef {import('../types.js').Command} Command */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./entities/units.js').Unit} Unit */

/** Command types and the target each expects. */
export const COMMAND_TYPES = Object.freeze({
  move: 'cell',          // { x, y } — ignore enemies until arrival
  attackMove: 'cell',    // { x, y } — engage as Guard along the way, then carry on
  guardArea: 'cell',     // { x, y } — go there and guard it
  waypoint: 'cell',      // { x, y } — append a move to each unit's queue
  attack: 'entity',      // { id } — chase with no leash until it dies or turns friendly
  forceFire: 'entity|cell', // { id } or { x, y } — may target own objects and the ground
  escort: 'entity',      // { id } — follow and protect
  stance: 'stance',      // { stance: 'guard' | 'hold' | 'holdFire' }
  harvest: 'cell',       // { x, y } — Harvesters: harvest there and resume automation
  unload: 'entity',      // { id } — Harvesters: unload at this refinery now
  enter: 'entity',       // { id } — Engineer, Spy, Thief: walk into a building
  c4: 'entity',          // { id } — Commando: plant C4 on an enemy structure
  layMines: 'cells',     // { cells: [[x, y], …] } — Mine Layer: lay a mine in each
  load: 'entity',        // { id } — passengers: board this transport
  unloadCargo: 'none',   // transports: let everyone out
  returnPad: 'entity?',  // { id }? — aircraft: fly home (or to this pad)
  depot: 'entity',       // { id } — damaged vehicles: repair at this Service Depot
  power: 'power',        // { power, x?, y?, id?, unit? } — fire a ready support power
  surrender: 'none',     // the issuing player leaves the match
  deploy: 'none',        // MCVs: unfold into a Construction Yard
  stop: 'none',
  scatter: 'none',
});

const STANCES = new Set(['guard', 'hold', 'holdFire']);

/** Forget what a unit was doing before a new order; a player order switches harvesting off. @param {World} w @param {Unit} u */
function clearIntent(w, u) {
  if (u.harv) harvesterManual(w, u);
  u.task = null;
  u.target = 0;
  u.fireCell = null;
  u.chase = null;
  u.waypoints = [];
}

/** The live entity a command targets by id. @param {World} w @param {Command} c */
function targetEntity(w, c) {
  const id = c.target?.id;
  if (!Number.isInteger(id)) return null;
  const e = w.entities.get(id);
  return e && !e.dead ? e : null;
}

/** Units a command may act on: live, owned by the issuer, in ascending id order. @param {World} w @param {Command} c */
export function ownedUnits(w, c) {
  const out = [];
  for (const id of [...new Set(c.entityIds)].sort((a, b) => a - b)) {
    const e = w.entities.get(id);
    if (e && e.kind === 'unit' && e.owner === c.playerId && !e.deploying && !e.inside) out.push(e);
  }
  return out;
}

/**
 * Route from (x, y) toward (gx, gy) over a shared field, finishing with up to
 * three straight steps; whatever is left is covered by a short A* request.
 * @param {number[][]} grid @param {ReturnType<typeof computeField>} field
 */
function fieldRoute(grid, field, x, y, gx, gy) {
  const path = descend(field, grid, x, y, gx, gy);
  let cx = path.length ? path[path.length - 2] : x;
  let cy = path.length ? path[path.length - 1] : y;
  const open = (px, py) => grid[py]?.[px] > 0;
  for (let k = 0; k < 3 && (cx !== gx || cy !== gy); k++) {
    const sx = Math.sign(gx - cx);
    const sy = Math.sign(gy - cy);
    if (!open(cx + sx, cy + sy) || (sx && sy && (!open(cx + sx, cy) || !open(cx, cy + sy)))) break;
    cx += sx;
    cy += sy;
    path.push(cx, cy);
  }
  return path;
}

/**
 * @param {World} w @param {Unit[]} units @param {{x: number, y: number}} t
 * @param {'move' | 'attackMove' | 'guardArea'} kind
 */
function moveGroup(w, units, t, kind) {
  const attackMove = kind === 'attackMove';
  if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) return;
  const tx = Math.max(0, Math.min(w.map.width - 1, t.x));
  const ty = Math.max(0, Math.min(w.map.height - 1, t.y));
  const { dests, speedCapK } = assignDestinations(w, units, tx, ty);
  const shared = units.length >= MOVEMENT.flowFieldMinUnits;
  /** @type {Map<string, ReturnType<typeof computeField>>} */
  const fields = new Map();
  for (const u of units) {
    const d = dests.get(u.id);
    if (!d) continue;
    /** @type {number[] | undefined} */
    let path;
    const loco = defOf(u).loco;
    const grid = w.nav.grids[loco];
    if (shared && grid) {
      if (!fields.has(loco)) fields.set(loco, computeField(grid, tx, ty));
      const o = u.next ?? { x: u.cx, y: u.cy };
      path = fieldRoute(grid, /** @type {ReturnType<typeof computeField>} */ (fields.get(loco)), o.x, o.y, d.x, d.y);
    }
    clearIntent(w, u);
    u.task = kind === 'move' ? { type: 'move' } : { type: kind, x: d.x, y: d.y };
    if (kind === 'guardArea') u.stance = 'guard';
    setMove(w, u, d.x, d.y, { spot: d.spot, attackMove, speedCapK, path });
  }
}

/** Can any of a unit's weapons reach this entity's layer (force-fire ignores ownership)? @param {Unit} u @param {any} e */
const reaches = (u, e) => UNITS[u.type].weapons.some((id) => {
  const wd = WEAPONS[id];
  return wd.damage > 0 && !!wd.warhead && wd.hits.includes(layerOf(e));
});

/** Explicit attack: only units able to hurt the target take the order. @param {World} w @param {Unit[]} units @param {any} t */
function attack(w, units, t) {
  const e = t && Number.isInteger(t.id) ? w.entities.get(t.id) : null;
  if (!e || w.allied(e.owner, units[0].owner)) return false;
  const able = units.filter((u) => canAttack(u, e));
  for (const u of able) {
    clearIntent(w, u);
    u.task = { type: 'attack', target: e.id };
    u.target = e.id;
  }
  return able.length > 0;
}

/** Force-fire at an entity of any owner, or at a ground cell. @param {World} w @param {Unit[]} units @param {any} t */
function forceFire(w, units, t) {
  const e = t && Number.isInteger(t.id) ? w.entities.get(t.id) : null;
  const cell = !e && t && Number.isInteger(t.x) && Number.isInteger(t.y) ? { x: t.x, y: t.y } : null;
  if (!e && !cell) return false;
  let any = false;
  for (const u of units) {
    if (e ? (e.id === u.id || !reaches(u, e)) : !UNITS[u.type].weapons.some((id) => WEAPONS[id].hits.includes('G') && WEAPONS[id].damage > 0)) continue;
    clearIntent(w, u);
    u.task = { type: 'forceFire', target: e ? e.id : 0, x: cell?.x ?? 0, y: cell?.y ?? 0 };
    u.target = e ? e.id : 0;
    u.fireCell = cell;
    any = true;
  }
  return any;
}

/** Follow and protect an own or allied unit. @param {World} w @param {Unit[]} units @param {any} t */
function escort(w, units, t) {
  const e = t && Number.isInteger(t.id) ? w.entities.get(t.id) : null;
  if (!e || !w.allied(e.owner, units[0].owner)) return false;
  for (const u of units) {
    if (u.id === e.id) continue;
    clearIntent(w, u);
    u.task = { type: 'escort', target: e.id };
    u.stance = 'guard';
  }
  return true;
}

/** Append a move to each unit's waypoint queue; idle units start at once. @param {World} w @param {Unit[]} units @param {any} t */
function waypoint(w, units, t) {
  if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) return false;
  for (const u of units) {
    if (!u.task && !u.order && !u.target) {
      u.task = { type: 'move' };
      setMove(w, u, t.x, t.y);
    } else {
      u.waypoints.push({ x: t.x, y: t.y });
    }
  }
  return true;
}

/** Each unit steps to a random free neighbouring cell. @param {World} w @param {Unit[]} units */
function scatter(w, units) {
  for (const u of units) {
    const start = w.rng.int(8);
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = DIR8[(start + k) % 8];
      if (canEnter(w, u, u.cx + dx, u.cy + dy).ok) {
        setMove(w, u, u.cx + dx, u.cy + dy);
        break;
      }
    }
  }
}

/** @param {World} w @param {Command} c */
export function applyCommand(w, c) {
  if (!w.players[c.playerId]?.alive) return false;
  if (c.type === 'surrender') {
    eliminate(w, c.playerId, 'surrendered');
    return true;
  }
  if (c.type === 'power') {
    const done = firePower(w, c.playerId, c.target?.power, c.target ?? {});
    if (done) w.events.emit('commandApplied', w.tick, { type: c.type, playerId: c.playerId, ids: [] });
    return done;
  }
  if (BASE_COMMANDS.has(c.type)) {
    const done = applyBaseCommand(w, c);
    if (done) w.events.emit('commandApplied', w.tick, { type: c.type, playerId: c.playerId, ids: [] });
    return done;
  }
  const units = ownedUnits(w, c);
  if (units.length === 0) return false;
  let ok = true;
  switch (c.type) {
    case 'move':
    case 'attackMove':
    case 'guardArea':
      moveGroup(w, units, c.target, c.type);
      // A loaded naval transport sent onto land goes to the nearest shore and unloads there.
      if (c.type === 'move' && c.target && w.map.terrain[c.target.y * w.map.width + c.target.x] !== T.water) {
        for (const u of units) if (isTransport(u) && UNITS[u.type].loco === 'float' && u.cargo?.length) u.task = { type: 'beach' };
      }
      break;
    case 'attack': ok = attack(w, units, c.target); break;
    case 'forceFire': ok = forceFire(w, units, c.target); break;
    case 'escort': ok = escort(w, units, c.target); break;
    case 'waypoint': ok = waypoint(w, units, c.target); break;
    case 'harvest': {
      const t = c.target;
      if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) return false;
      const hs = units.filter((u) => u.harv);
      for (const u of hs) { u.task = null; u.target = 0; harvestAt(w, u, t.x, t.y); }
      ok = hs.length > 0;
      break;
    }
    case 'unload': {
      const r = c.target && Number.isInteger(c.target.id) ? w.entities.get(c.target.id) : null;
      ok = false;
      for (const u of units) if (u.harv && r && unloadAt(w, u, r)) { u.task = null; ok = true; }
      break;
    }
    case 'depot': {
      const d = c.target && Number.isInteger(c.target.id) ? w.entities.get(c.target.id) : null;
      if (!d || d.kind !== 'structure' || d.owner !== c.playerId || d.type !== 'serviceDepot') return false;
      ok = false;
      for (const u of units) {
        const loco = UNITS[u.type].loco;
        if (loco !== 'wheel' && loco !== 'track') continue; // vehicles only
        clearIntent(w, u);
        u.task = { type: 'depot', depot: d.id };
        ok = true;
      }
      break;
    }
    case 'deploy': {
      ok = false;
      for (const u of units) if (u.type === 'mcv') { clearIntent(w, u); ok = startDeploy(w, u) || ok; }
      break;
    }
    case 'enter': {
      const s = targetEntity(w, c);
      ok = false;
      for (const u of units) {
        if (!s || !enterEffect(w, u, s)) continue;
        clearIntent(w, u);
        u.task = { type: 'enter', target: s.id };
        ok = true;
      }
      break;
    }
    case 'c4': {
      const s = targetEntity(w, c);
      ok = false;
      for (const u of units) {
        if (!canC4(w, u, s)) continue;
        clearIntent(w, u);
        u.task = { type: 'c4', target: s.id, plantAt: 0 };
        ok = true;
      }
      break;
    }
    case 'layMines': {
      const cells = Array.isArray(c.target?.cells) ? c.target.cells.filter((/** @type {any} */ p) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1])).slice(0, 50) : [];
      ok = false;
      for (const u of units) {
        if (!isMineLayer(u) || !cells.length) continue;
        clearIntent(w, u);
        u.task = { type: 'layMines', cells: cells.map((/** @type {number[]} */ p) => [p[0], p[1]]), until: 0 };
        ok = true;
      }
      break;
    }
    case 'load': {
      const t = targetEntity(w, c);
      ok = false;
      if (!t || t.owner !== c.playerId) return false;
      for (const u of units) {
        if (!slotsFor(t, u)) continue;
        clearIntent(w, u);
        u.task = { type: 'load', target: t.id, giveUpAt: w.tick + ticks(TRANSPORT.loadGiveUpSeconds), at: null };
        ok = true;
      }
      break;
    }
    case 'unloadCargo':
      ok = false;
      for (const u of units) {
        if (!isTransport(u) || !u.cargo?.length) continue;
        u.unloading = true;
        if (isAircraft(u) && !u.landed) { u.task = { type: 'land' }; }
        ok = true;
      }
      break;
    case 'returnPad': {
      const pad = targetEntity(w, c);
      ok = false;
      for (const u of units) {
        if (!isAircraft(u)) continue;
        clearIntent(w, u);
        if (pad && pad.kind === 'structure' && pad.owner === u.owner) {
          const free = freePad(w, u);
          if (free && free.id === pad.id) linkPad(w, u, pad);
        }
        returnToPad(w, u);
        ok = true;
      }
      break;
    }
    case 'stance':
      if (!STANCES.has(c.target?.stance)) return false;
      for (const u of units) {
        u.stance = c.target.stance;
        if (u.stance === 'holdFire' && !(u.task?.type === 'attack' || u.task?.type === 'forceFire')) u.target = 0;
      }
      break;
    case 'stop':
      for (const u of units) { clearIntent(w, u); stopUnit(u); u.post = u.next ? { x: u.next.x, y: u.next.y } : { x: u.cx, y: u.cy }; }
      break;
    case 'scatter':
      for (const u of units) { clearIntent(w, u); u.task = { type: 'move' }; }
      scatter(w, units);
      break;
    default: return false;
  }
  if (!ok) return false;
  w.events.emit('commandApplied', w.tick, { type: c.type, playerId: c.playerId, ids: units.map((u) => u.id) });
  return true;
}

/** System 1: apply every command due this tick, in arrival order. @param {World} w */
export function applyCommands(w) {
  if (w.queue.length === 0) return;
  const due = [];
  const later = [];
  for (const c of w.queue) (c.tick <= w.tick ? due : later).push(c);
  w.queue = later;
  for (const c of due) applyCommand(w, c);
}
