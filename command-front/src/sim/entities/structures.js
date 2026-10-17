// @ts-check
/**
 * Structure entities: placed on a footprint that blocks movement, with a
 * build-up, sell and repair state; removal leaves rubble and survivors and
 * adjusts storage and power (sections 5–7).
 */
import { STRUCTURES, NEUTRAL } from '../../data/structures.js';
import { WEAPONS } from '../../data/weapons.js';
import { PRODUCTION, SELL, SIM } from '../../data/rules.js';
import { RUBBLE_SECONDS, T } from '../../data/terrain.js';
import { ticks } from '../../core/fixed.js';
import { survivors, clampStorage } from '../formulas/economy.js';
import { spawnUnit } from './units.js';

const L = SIM.leptonsPerCell;
const BUILD_UP = ticks(PRODUCTION.buildUpSeconds);

/**
 * @typedef {object} Structure
 * @property {number} id
 * @property {'structure'} kind
 * @property {string} type
 * @property {number} owner      -1 for neutral
 * @property {string} faction    Design faction (unlocks that faction's items for whoever owns it)
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} cx         Footprint top-left cell
 * @property {number} cy
 * @property {number} w
 * @property {number} h
 * @property {number} x          Footprint centre, leptons
 * @property {number} y
 * @property {number} px
 * @property {number} py
 * @property {number} facing
 * @property {number} pfacing
 * @property {number} turret
 * @property {number} buildUp    Ticks of build-up left (0 = working)
 * @property {number} selling    Ticks of sell left (0 = not selling)
 * @property {boolean} repairing
 * @property {boolean} primary
 * @property {{ x: number, y: number } | null} rally
 * @property {'hold'} stance
 * @property {number} target
 * @property {null} fireCell
 * @property {null} task
 * @property {{ cd: number, burst: number, burstCd: number, charge: number, ammo: number }[]} weapons
 * @property {number} lastAttacker
 * @property {number} proneUntil
 * @property {number[]} dockQueue  Harvester ids waiting for the dock, first come first served
 * @property {number} docked       Harvester currently on the dock (0 = none)
 * @property {number} linked       Aircraft linked to this pad (0 = none)
 * @property {number} aegisUntil
 * @property {number} lastFired
 * @property {boolean} [dead]
 */

/** Static data for a structure or neutral building type. @param {string} type */
export const structureDef = (type) => /** @type {any} */ (STRUCTURES[type] ?? NEUTRAL[type]);

/** Cells covered by a footprint. @param {{ cx: number, cy: number, w: number, h: number }} s */
export function footprint(s) {
  const out = [];
  for (let y = s.cy; y < s.cy + s.h; y++) for (let x = s.cx; x < s.cx + s.w; x++) out.push([x, y]);
  return out;
}

/** Cells of the footprint that block movement (a Service Depot's pad stays drivable). @param {Structure} s */
function blockingCells(s) {
  const def = structureDef(s.type);
  const pad = def.pad;
  return footprint(s).filter(([x, y]) => !(pad && x === s.cx + pad.x && y === s.cy + pad.y));
}

/** Working: built up, not being sold. @param {Structure} s */
export const isActive = (s) => !s.dead && s.buildUp === 0 && !s.selling;

/**
 * Place a structure. The caller has already checked the placement rules.
 * @param {any} w @param {string} type @param {number} owner @param {number} cx @param {number} cy
 * @param {{ buildUp?: boolean, hpRatioK?: number, faction?: string }} [opts] hpRatioK: start HP in thousandths of max (MCV deploy);
 *   faction: whose design it is (defaults to the owner's) — a captured Yard or factory keeps it
 * @returns {Structure}
 */
export function placeStructure(w, type, owner, cx, cy, opts = {}) {
  const def = structureDef(type);
  const weaponIds = def.weapon ? [def.weapon] : [];
  const hp = opts.hpRatioK != null ? Math.max(1, Math.floor((def.hp * opts.hpRatioK) / 1000)) : def.hp;
  /** @type {Structure} */
  const s = w.entities.add((/** @type {number} */ id) => ({
    id, kind: 'structure', type, owner,
    faction: opts.faction ?? (owner >= 0 ? w.players[owner].faction : 'both'),
    hp, maxHp: def.hp,
    cx, cy, w: def.w, h: def.h,
    x: cx * L + (def.w * L) / 2, y: cy * L + (def.h * L) / 2, px: 0, py: 0,
    facing: 128, pfacing: 128, turret: 128,
    buildUp: opts.buildUp === false ? 0 : BUILD_UP,
    selling: 0, repairing: false, primary: false, rally: null,
    stance: 'hold', target: 0, fireCell: null, task: null,
    weapons: weaponIds.map((wid) => ({ cd: 0, burst: 0, burstCd: 0, charge: 0, ammo: WEAPONS[wid].ammo })),
    lastAttacker: 0, proneUntil: 0, dockQueue: [], docked: 0, linked: 0, aegisUntil: 0, lastFired: -9999,
  }));
  s.px = s.x;
  s.py = s.y;
  occupyStructure(w, s);
  // Ore under the footprint is removed by placement.
  for (const [x, y] of footprint(s)) {
    const i = y * w.map.width + x;
    if (w.map.bales[i]) { w.map.bales[i] = 0; w.map.gem[i] = 0; w.events.emit('oreChanged', w.tick, { i }); }
  }
  w.nav.rebuild();
  if (owner >= 0) {
    w.players[owner].powerDirty = true;
    if (!def.wall) w.players[owner].stats.structuresBuilt++;
    if (opts.buildUp === false) structureReady(w, s);
  }
  w.structureEpoch++;
  w.events.emit('structurePlaced', w.tick, { id: s.id, type, owner, cx, cy });
  return s;
}

/** Put a structure on the occupancy and passability layers (placement and loading a save). @param {any} w @param {Structure} s */
export function occupyStructure(w, s) {
  for (const [x, y] of blockingCells(s)) w.nav.setStaticBlock(x, y, true);
  for (const [x, y] of footprint(s)) w.occ.bld[y * w.map.width + x] = s.id;
}

/** Storage of a player's working refineries and silos. @param {any} w @param {number} pid */
export function storageOf(w, pid) {
  let cap = 0;
  for (const e of w.entities.all()) {
    if (e.kind !== 'structure' || e.owner !== pid || !isActive(e)) continue;
    cap += structureDef(e.type).storage ?? 0;
  }
  return cap;
}

/** Recompute storage capacity; stored ore above it is lost at once. @param {any} w @param {number} pid */
export function refreshStorage(w, pid) {
  if (pid < 0) return;
  const p = w.players[pid];
  p.capacity = storageOf(w, pid);
  const before = p.stored;
  const next = clampStorage({ cash: p.cash, stored: p.stored }, p.capacity);
  p.stored = next.stored;
  if (before > p.stored) w.events.emit('oreLost', w.tick, { owner: pid, amount: before - p.stored });
}

/** Build-up finished: the structure starts working. @param {any} w @param {Structure} s */
export function structureReady(w, s) {
  s.buildUp = 0;
  w.structureEpoch++;
  if (s.owner < 0) return;
  w.players[s.owner].powerDirty = true;
  refreshStorage(w, s.owner);
  w.events.emit('structureReady', w.tick, { id: s.id, type: s.type, owner: s.owner });
}

/**
 * Remove a structure (sold, destroyed or deployed into something else).
 * Destroyed structures leave Rubble for 30 s and half the survivors at half HP.
 * @param {any} w @param {Structure} s @param {{ destroyed?: boolean, sold?: boolean, killer?: number }} [how]
 */
export function removeStructure(w, s, how = {}) {
  const def = structureDef(s.type);
  for (const [x, y] of blockingCells(s)) w.nav.setStaticBlock(x, y, false);
  for (const [x, y] of footprint(s)) if (w.occ.bld[y * w.map.width + x] === s.id) w.occ.bld[y * w.map.width + x] = 0;
  if (how.destroyed && !def.wall) {
    const until = w.tick + ticks(RUBBLE_SECONDS);
    for (const [x, y] of footprint(s)) {
      const i = y * w.map.width + x;
      if (w.map.terrain[i] === T.clear) {
        w.map.terrain[i] = T.rubble;
        w.rubble.push({ i, until });
      }
    }
    w.events.emit('terrainChanged', w.tick, { cells: footprint(s) });
  }
  w.entities.remove(s);
  w.structureEpoch++;
  w.nav.rebuild();
  // Survivors walk out of anything with a cost (walls never leave survivors).
  if (s.owner >= 0 && !def.wall && def.cost > 0 && (how.destroyed || how.sold)) {
    // Sold: by remaining HP. Destroyed: half the full-health count, at half HP.
    const kit = how.destroyed ? survivors(def.cost, s.maxHp, s.maxHp, true) : survivors(def.cost, s.hp, s.maxHp, false);
    for (const type of kit) {
      const u = spawnUnit(w, type, s.owner, s.cx + (s.w >> 1), s.cy + s.h, { facing: 128 });
      if (u && how.destroyed) u.hp = Math.max(1, Math.floor(u.maxHp * SELL.destroyedSurvivorHpFraction));
    }
  }
  if (s.owner >= 0) {
    const p = w.players[s.owner];
    p.powerDirty = true;
    refreshStorage(w, s.owner);
    if (how.destroyed && !def.wall) p.stats.structuresLost++;
  }
  w.events.emit(how.destroyed ? 'structureDestroyed' : 'structureRemoved', w.tick, {
    id: s.id, type: s.type, owner: s.owner, x: s.x, y: s.y, cx: s.cx, cy: s.cy, w: s.w, h: s.h, killer: how.killer ?? 0, sold: !!how.sold,
  });
}

/** Roles a player owns with completed, working buildings (captured ones count). @param {any} w @param {number} pid */
export function rolesOf(w, pid) {
  const roles = new Set();
  for (const e of w.entities.all()) {
    if (e.kind === 'structure' && e.owner === pid && isActive(e)) roles.add(structureDef(e.type).role);
  }
  return roles;
}

/** A player's working structures of a role, ascending id. @param {any} w @param {number} pid @param {string} role */
export function structuresWithRole(w, pid, role) {
  return w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && isActive(e) && structureDef(e.type).role === role);
}

/** Cell just outside a structure, given an offset from its top-left (exit, dock). @param {Structure} s @param {{x: number, y: number}} off */
export const cellAt = (s, off) => ({ x: s.cx + off.x, y: s.cy + off.y });
