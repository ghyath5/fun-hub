// @ts-check
/**
 * Unit entities: plain serialisable objects (no references to defs or other
 * entities, only ids), plus helpers to place them on the occupancy grid.
 */
import { UNITS } from '../../data/units.js';
import { WEAPONS } from '../../data/weapons.js';
import { MOVEMENT, SIM, SPECIALS } from '../../data/rules.js';
import { spiral } from '../nav.js';

/** @typedef {import('../../types.js').UnitDef} UnitDef */

/**
 * What a unit was asked to do. Orders from players and the AI set it; the
 * systems that carry it out read and update it.
 * @typedef {{ type: 'move' } | { type: 'attackMove', x: number, y: number }
 *   | { type: 'attack', target: number } | { type: 'forceFire', target: number, x: number, y: number }
 *   | { type: 'guardArea', x: number, y: number } | { type: 'escort', target: number }
 *   | { type: 'enter', target: number, tries?: number } | { type: 'c4', target: number, plantAt: number, tries?: number }
 *   | { type: 'layMines', cells: number[][], until: number, tries?: number }
 *   | { type: 'load', target: number, giveUpAt: number, at: { x: number, y: number } | null }
 *   | { type: 'depot', depot: number } | { type: 'returnPad' } | { type: 'land' } | { type: 'beach' }} Task
 */

/**
 * @typedef {object} MoveOrder
 * @property {'move'} type
 * @property {number} dx        Destination cell
 * @property {number} dy
 * @property {number} spot      Infantry spot wanted at the destination (-1 = any)
 * @property {boolean} attackMove
 * @property {number} speedCap  Leptons per tick at 100% terrain (0 = none; formation moves)
 * @property {boolean} [auto]   Issued by the sim itself (engaging, stepping aside), not by a player
 */

/**
 * @typedef {object} Unit
 * @property {number} id
 * @property {'unit'} kind
 * @property {string} type
 * @property {number} owner
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} x         Position, leptons
 * @property {number} y
 * @property {number} px        Position at the start of this tick (render interpolation)
 * @property {number} py
 * @property {number} facing    0–255
 * @property {number} pfacing
 * @property {number} turret
 * @property {number} cx        Current cell
 * @property {number} cy
 * @property {number} spot      Infantry spot in the current cell (-1 for others)
 * @property {MoveOrder | null} order
 * @property {number[]} path    Remaining cells as x0, y0, x1, y1, …
 * @property {number} pathReq   >0 while a path request is outstanding (its token)
 * @property {{ x: number, y: number, spot: number } | null} next  Reserved next cell
 * @property {number} waited    Ticks spent waiting for the next cell
 * @property {boolean} askedAside
 * @property {number} sinceCell Ticks since the unit last entered a cell under orders
 * @property {number} retries   Fresh path requests made for the current order
 * @property {number} retryAt   Tick before which a unit with no route waits instead of asking again
 * @property {'guard' | 'hold' | 'holdFire'} stance
 * @property {Task | null} task    What the player (or AI) asked for
 * @property {number} target    Entity being engaged (0 = none)
 * @property {{ x: number, y: number } | null} fireCell  Force-fire at the ground
 * @property {{ x: number, y: number }} post  Guard post: where an idle unit returns after a chase
 * @property {{ cd: number, burst: number, burstCd: number, charge: number, ammo: number }[]} weapons
 * @property {number} proneUntil  Tick until which infantry stay prone
 * @property {number} lastAttacker
 * @property {{ x: number, y: number }[]} waypoints
 * @property {{ x: number, y: number } | null} chase  Cell the current engagement move is heading for
 * @property {number} repairAcc   Thousandths of HP accrued by self-repair
 * @property {number} aegisUntil  Invulnerable until this tick (Aegis Field)
 * @property {any} harv          Harvester state (null for other units)
 * @property {boolean} [inside]  Riding in a transport
 * @property {boolean} [landed]  Aircraft on the ground
 * @property {boolean} [submerged]
 * @property {boolean} [dead]
 * @property {number} [pad]        Aircraft: linked pad (structure id)
 * @property {any} [air]           Aircraft: orbit / crash state (air.js)
 * @property {any} [sub]           Submarine: dive cycle (naval.js)
 * @property {number} [detect]     Stealth: teams that currently see it (bitmask)
 * @property {number[]} [cargo]    Transports: passenger ids
 * @property {boolean} [unloading]
 * @property {number} [unloadAt]
 * @property {number} [mines]      Mine Layer: mines carried
 * @property {number} [maxMines]
 * @property {number} [speedK]     Speed crate: speed in thousandths
 * @property {number} [armorK]     Armour crate: damage taken ÷ (armorK / 1000)
 * @property {any} [mission]       Support plane: what it is flying to do
 * @property {boolean} [deploying] MCV unfolding
 */

/** @param {{ type: string }} e @returns {UnitDef} */
export const defOf = (e) => UNITS[e.type];

/** @param {{ type: string }} e */
export const isInfantry = (e) => UNITS[e.type].loco === 'foot';

/** @param {{ type: string }} e */
export const isAir = (e) => UNITS[e.type].loco === 'air';

/** Lepton position of a spot inside a cell (-1 = cell centre). */
export function spotPos(cx, cy, spot) {
  const L = SIM.leptonsPerCell;
  const [ox, oy] = spot < 0 ? MOVEMENT.cellCentre : MOVEMENT.spotOffsets[spot];
  return { x: cx * L + ox, y: cy * L + oy };
}

/** Squared distance from point (px, py) to the segment a→b. */
function segDist2(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay;
  const len = vx * vx + vy * vy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len)) : 0;
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return dx * dx + dy * dy;
}

/** Do segments a→b and c→d cross? */
function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
  const s1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const s2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const s3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const s4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return s1 * s2 < 0 && s3 * s4 < 0;
}

/** Squared distance between segments a→b and c→d. */
function segSeg2(ax, ay, bx, by, cx, cy, dx, dy) {
  if (crosses(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(segDist2(ax, ay, bx, by, cx, cy), segDist2(ax, ay, bx, by, dx, dy), segDist2(cx, cy, dx, dy, ax, ay), segDist2(cx, cy, dx, dy, bx, by));
}

/** Soldiers closer than this (leptons, centre to centre) would stand in each other. */
const PERSONAL = MOVEMENT.infantryClearance;

/**
 * The free spot of cell (x, y) a soldier walks to: the one he wants (his
 * lane, or his place at the destination) unless the straight walk there
 * would pass through another soldier in his cell or that one (where he
 * stands, or anywhere on the walk he is making); then the free spot whose
 * walk stays clear, nearest first. Deterministic (spot order). `clear` is
 * false when every free spot's walk would cross someone (he goes anyway:
 * waiting for a clear walk jams narrow passes).
 * @param {any} world @param {Unit} u @param {number} x @param {number} y @param {number} want
 * @returns {{ spot: number, clear: boolean }}
 */
function pickSpot(world, u, x, y, want) {
  const occ = world.occ;
  const i = occ.index(x, y);
  // A probe (a unit about to be made) has no position yet: just the wanted or first free spot.
  if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) return { spot: occ.freeSpot(i, want), clear: true };
  const others = [...occ.unitsIn(i), ...(u.cx !== x || u.cy !== y ? occ.unitsIn(occ.index(u.cx, u.cy)) : [])]
    .filter((id) => id !== u.id).map((id) => world.entities.get(id)).filter(Boolean);
  let best = -1;
  let bestCost = Infinity;
  for (let k = 0; k < MOVEMENT.infantrySpots; k++) {
    if (occ.freeSpot(i, k) !== k) continue;
    const p = spotPos(x, y, k);
    let cost = (p.x - u.x) ** 2 + (p.y - u.y) ** 2 - (k === want ? 1 << 15 : 0);
    for (const v of others) {
      const t = v.next && v.kind === 'unit' ? spotPos(v.next.x, v.next.y, isInfantry(v) ? v.next.spot : -1) : null;
      const d2 = t ? segSeg2(u.x, u.y, p.x, p.y, v.x, v.y, t.x, t.y) : segDist2(u.x, u.y, p.x, p.y, v.x, v.y);
      if (d2 < PERSONAL * PERSONAL) cost += 1 << 24;
    }
    if (cost < bestCost) { bestCost = cost; best = k; }
  }
  return { spot: best, clear: bestCost < 1 << 23 };
}

/** Would a soldier's walk to `spot` of cell (x, y) stay clear of every other soldier there and in his cell? @param {any} world @param {Unit} u @param {number} x @param {number} y @param {number} spot */
export function walkClear(world, u, x, y, spot) {
  const occ = world.occ;
  if (occ.freeSpot(occ.index(x, y), spot) !== spot) return false;
  const p = pickSpot(world, u, x, y, spot);
  return p.spot === spot && p.clear;
}

/**
 * Can a unit stand in a cell right now (ignoring itself)? Returns the spot it
 * would take (-1 for vehicles) or null with the id of what blocks it.
 * @param {any} world @param {Unit} u @param {number} x @param {number} y @param {number} [wantSpot]
 * @returns {{ ok: true, spot: number } | { ok: false, blocker: number }}
 */
export function canEnter(world, u, x, y, wantSpot = 0) {
  const def = defOf(u);
  if (!world.nav.passable(def.loco, x, y)) return { ok: false, blocker: 0 };
  if (def.loco === 'air') return { ok: true, spot: -1 };
  const occ = world.occ;
  const i = occ.index(x, y);
  if (def.loco === 'foot') {
    if (occ.veh[i] && occ.veh[i] !== u.id) return { ok: false, blocker: occ.veh[i] };
    if (occ.infCount[i] && occ.infOwner[i] !== u.owner && !world.allied(occ.infOwner[i], u.owner)) {
      return { ok: false, blocker: occ.unitsIn(i)[0] };
    }
    if (occ.freeSpot(i, 0) < 0) return { ok: false, blocker: occ.unitsIn(i)[0] };
    return { ok: true, spot: pickSpot(world, u, x, y, wantSpot).spot };
  }
  if (occ.veh[i] && occ.veh[i] !== u.id) return { ok: false, blocker: occ.veh[i] };
  if (occ.infCount[i]) {
    // A crusher drives into enemy infantry (and kills it on arrival); friends block and get nudged.
    const enemyInf = occ.infOwner[i] !== u.owner && !world.allied(occ.infOwner[i], u.owner);
    if (!(enemyInf && def.crusher !== 'none')) return { ok: false, blocker: occ.unitsIn(i)[0] };
  }
  return { ok: true, spot: -1 };
}

/** Put a unit into a cell's occupancy (current cell or reserved next cell). @param {any} world @param {Unit} u */
export function occupy(world, u, x, y, spot) {
  const i = world.occ.index(x, y);
  if (isAir(u)) return;
  if (isInfantry(u)) world.occ.putInfantry(i, spot, u.id, u.owner);
  else world.occ.putVehicle(i, u.id);
  world.nav.unitEnter(world.players[u.owner].team, i, isInfantry(u));
}

/** @param {any} world @param {Unit} u */
export function vacate(world, u, x, y, spot) {
  const i = world.occ.index(x, y);
  if (isAir(u)) return;
  // Squeezing past a friend, a unit has already handed its old cell over (movement.js).
  if (u.squeeze && x === u.cx && y === u.cy) return;
  if (isInfantry(u)) world.occ.takeInfantry(i, spot, u.id);
  else world.occ.takeVehicle(i, u.id);
  world.nav.unitLeave(world.players[u.owner].team, i, isInfantry(u));
}

/**
 * Create a unit at (x, y), or the nearest free valid cell within 3.
 * Returns null when nothing is free (the caller waits and retries).
 * @param {any} world @param {string} type @param {number} owner @param {number} x @param {number} y
 * @param {{ facing?: number, air?: boolean }} [opts]
 * @returns {Unit | null}
 */
export function spawnUnit(world, type, owner, x, y, opts = {}) {
  const def = UNITS[type];
  if (!def) throw new Error(`Unknown unit type ${type}`);
  const probe = /** @type {Unit} */ ({ id: -1, type, owner });
  let at = null;
  for (const [sx, sy] of spiral(x, y, MOVEMENT.spawnSearch)) {
    const r = canEnter(world, probe, sx, sy);
    if (r.ok) { at = { x: sx, y: sy, spot: r.spot }; break; }
  }
  if (!at) return null;
  const pos = def.loco === 'foot' ? spotPos(at.x, at.y, at.spot) : spotPos(at.x, at.y, -1);
  const facing = opts.facing ?? 128;
  /** @type {Unit} */
  const u = world.entities.add((/** @type {number} */ id) => ({
    id, kind: 'unit', type, owner,
    hp: def.hp, maxHp: def.hp,
    x: pos.x, y: pos.y, px: pos.x, py: pos.y,
    facing, pfacing: facing, turret: facing,
    cx: at.x, cy: at.y, spot: def.loco === 'foot' ? at.spot : -1,
    order: null, path: [], pathReq: 0, next: null, waited: 0, askedAside: false, sinceCell: 0, retries: 0, retryAt: 0,
    stance: 'guard', task: null, target: 0, fireCell: null, post: { x: at.x, y: at.y },
    weapons: def.weapons.map((wid) => ({ cd: 0, burst: 0, burstCd: 0, charge: 0, ammo: WEAPONS[wid].ammo })),
    proneUntil: 0, lastAttacker: 0, waypoints: [], chase: null, repairAcc: 0, aegisUntil: 0,
    // Harvester state machine (systems/harvest.js); null for everything else.
    harv: def.tags.includes('harvester') ? { state: 'seekOre', ore: 0, gem: 0, last: -1, cell: -1, refinery: 0, timer: 0, auto: true } : null,
    ...(def.tags.includes('mineLayer') ? { mines: SPECIALS.mineCarry, maxMines: SPECIALS.mineCarry } : {}),
    ...(def.capacity ? { cargo: [], unloading: false } : {}),
    ...(def.tags.includes('submarine') ? { sub: { state: 'submerged', until: 0, lastShot: -1e9 }, submerged: true } : {}),
  }));
  occupy(world, u, u.cx, u.cy, u.spot);
  world.events.emit('unitSpawned', world.tick, { id: u.id });
  return u;
}

/** Is this unit doing nothing? @param {Unit} u */
export const isIdle = (u) => !u.order && !u.next;
