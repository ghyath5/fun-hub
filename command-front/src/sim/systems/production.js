// @ts-check
/**
 * Production and spending (system 3, section 6), plus structure upkeep:
 * build-up, selling, repair, pending placements, MCV deployment, free
 * Harvesters and units idling on reserved cells.
 *
 * Six lines per player, charged in a fixed order each tick. An item gains
 * ceil(10⁹ / totalTicks) progress per tick (billionths, so build times land
 * exactly on ceil(t × 15)), and charges the matching whole credits. A line
 * that cannot pay this tick holds; it resumes when money arrives.
 */
import { PRODUCTION, PLACEMENT, REPAIR, SELL } from '../../data/rules.js';
import { UNITS } from '../../data/units.js';
import { ticks } from '../../core/fixed.js';
import { buildTicks } from '../formulas/production.js';
import { spend, sellRefund } from '../formulas/economy.js';
import { LINES, itemDef, producersOf, lineOf } from '../catalog.js';
import { rolesOf, isActive, structureDef, structureReady, removeStructure, placeStructure, cellAt, footprint } from '../entities/structures.js';
import { spawnUnit, canEnter, vacate } from '../entities/units.js';
import { checkPlacement, checkDeploy } from '../placement.js';
import { setMove } from './movement.js';
import { findSlot, reservedSlots, slotCell, slotHolders, slotPoint } from '../pads.js';
import { DIR8 } from '../../core/fixed.js';
import { spiral } from '../nav.js';
import { cutOut } from '../infest.js';
import { killUnit } from './damage.js';
import { priceFor, clones } from '../bonuses.js';

/** @typedef {import('../world.js').World} World */

export const PROGRESS_DONE = 1_000_000_000;
const SELL_TICKS = ticks(SELL.seconds);
const SECOND = ticks(1);
const EXIT_SWITCH = ticks(PRODUCTION.exitBlockedSwitchSeconds);
const CLEAR_WAIT = ticks(PLACEMENT.clearWaitSeconds);
const DEPLOY_TICKS = ticks(PLACEMENT.mcvDeploySeconds);
const MCV_COST = UNITS.mcv.cost;

/**
 * @typedef {object} QueueItem
 * @property {string} type
 * @property {number} prog    Progress in billionths
 * @property {number} spent   Credits charged so far
 * @property {boolean} paused
 * @property {number} pad     Pad reserved for an aircraft (0 = none)
 */

/**
 * @typedef {object} Line
 * @property {QueueItem[]} queue
 * @property {string | null} ready   Structure waiting to be placed
 * @property {string} hold           '' | paused | requires | factory | funds | pad | exit
 * @property {number} exitWait       Ticks a finished unit has waited for an exit
 */

/** @param {any} p @param {string} id @returns {Line} */
export function lineFor(p, id) {
  if (!p.lines[id]) p.lines[id] = { queue: [], ready: null, hold: '', exitWait: 0 };
  return p.lines[id];
}

/** Cost of an item for production and refunds (the Yard comes from an MCV). @param {string} type */
export const costOf = (type) => (type === 'constructionYard' ? MCV_COST : itemDef(type).cost);

/** A free, unclaimed parking slot for an aircraft type, or null. @param {World} w @param {number} pid @param {string} type */
function freePad(w, pid, type) {
  lineFor(w.players[pid], 'aircraft');
  return findSlot(w, pid, type, { reserved: reservedSlots(w, pid) });
}

/**
 * Put a finished unit into the world at its factory's exit (or pad).
 * @param {World} w @param {number} pid @param {Line} line @param {QueueItem} item
 * @returns {boolean} delivered
 */
function deliver(w, pid, line, item) {
  const def = UNITS[item.type];
  if (def.line === 'aircraft') {
    const pad = item.pad ? w.entities.get(item.pad) : null;
    if (!pad || !isActive(pad) || pad.owner !== pid) { item.pad = 0; return false; }
    const slot = item.slot ?? 0;
    const cell = slotCell(pad, slot);
    const u = spawnUnit(w, item.type, pid, cell.x, cell.y, { facing: 128, air: true });
    if (!u) return false;
    const at = slotPoint(pad, slot);
    u.x = u.px = at.x;
    u.y = u.py = at.y;
    u.landed = true;
    u.pad = pad.id;
    u.padSlot = slot;
    unitBuilt(w, pid, u, null);
    return true;
  }
  const producers = producersOf(w, pid, item.type);
  if (!producers.length) return false;
  const primary = producers.find((s) => s.primary) ?? producers[0];
  const order = [primary, ...producers.filter((s) => s !== primary)];
  const candidates = line.exitWait >= EXIT_SWITCH ? order : [primary];
  const probe = { id: -1, type: item.type, owner: pid };
  for (const s of candidates) {
    const off = structureDef(s.type).exit ?? { x: s.w >> 1, y: s.h };
    const ex = cellAt(s, off);
    if (!canEnter(w, /** @type {any} */ (probe), ex.x, ex.y).ok) {
      // Friendly units on the exit are told to scatter; enemies simply block.
      for (const id of w.occ.unitsIn(w.occ.index(ex.x, ex.y))) {
        const v = w.entities.get(id);
        if (v && w.allied(v.owner, pid) && !v.order) scatterOne(w, v);
      }
      continue;
    }
    const u = spawnUnit(w, item.type, pid, ex.x, ex.y, { facing: 128 });
    if (!u) continue;
    unitBuilt(w, pid, u, s);
    if (clones(w, pid, item.type)) cloneOf(w, pid, u, s);
    return true;
  }
  return false;
}

/** @param {World} w @param {number} pid @param {any} u @param {any} factory */
function unitBuilt(w, pid, u, factory) {
  w.players[pid].stats.unitsBuilt++;
  w.events.emit('unitReady', w.tick, { id: u.id, type: u.type, owner: pid, line: lineOf(u.type) });
  const def = UNITS[u.type];
  if (!factory || def.tags.includes('noRally') || u.harv) {
    if (factory && !u.harv) stepOff(w, u, factory);
    return;
  }
  if (factory.rally) {
    u.task = { type: 'move' };
    setMove(w, u, factory.rally.x, factory.rally.y);
  } else stepOff(w, u, factory);
}

/** The Clone Lab's free twin: same type, on the nearest free cell by the exit. @param {World} w @param {number} pid @param {any} u @param {any} factory */
function cloneOf(w, pid, u, factory) {
  for (const [dx, dy] of [[0, 0], ...DIR8]) {
    const twin = spawnUnit(w, u.type, pid, u.cx + dx, u.cy + dy, { facing: 128 });
    if (!twin) continue;
    unitBuilt(w, pid, twin, factory);
    w.events.emit('cloned', w.tick, { id: twin.id, of: u.id, owner: pid });
    return;
  }
}

/** How far from its factory door a fresh unit looks for a free spot to wait on. */
const MUSTER_RADIUS = 6;

/**
 * Walk a fresh unit (no rally point) clear of its factory: to the nearest
 * empty cell at least two cells from the door that is not hugging a
 * building (doors, docks and pads stay clear) and that no other unit is
 * already heading for — so a long queue spreads out instead of jamming the
 * exit. Falls back to one cell south of the door.
 * @param {World} w @param {any} u @param {any} _s
 */
function stepOff(w, u, _s) {
  const W = w.map.width;
  const H = w.map.height;
  const loco = UNITS[u.type].loco;
  const taken = new Set();
  for (const o of w.entities.all()) if (o.kind === 'unit' && o.owner === u.owner && o.order) taken.add(o.order.dy * W + o.order.dx);
  const hugsBuilding = (/** @type {number} */ x, /** @type {number} */ y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && w.occ.bld[ny * W + nx]) return true;
    }
    return false;
  };
  for (const [x, y] of spiral(u.cx, u.cy + 2, MUSTER_RADIUS)) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (Math.max(Math.abs(x - u.cx), Math.abs(y - u.cy)) < 2) continue;
    const i = y * W + x;
    if (taken.has(i) || w.occ.unitsIn(i).length || hugsBuilding(x, y)) continue;
    if (!w.nav.passable(loco, x, y) || !w.nav.reachable(loco, u.cx, u.cy, x, y)) continue;
    u.task = { type: 'move' };
    setMove(w, u, x, y);
    return;
  }
  if (canEnter(w, u, u.cx, u.cy + 1).ok) {
    u.task = { type: 'move' };
    setMove(w, u, u.cx, u.cy + 1);
  }
}

/** Move a unit to a random free neighbour. @param {World} w @param {any} u */
export function scatterOne(w, u) {
  const start = w.rng.int(8);
  for (let k = 0; k < 8; k++) {
    const [dx, dy] = DIR8[(start + k) % 8];
    if (canEnter(w, u, u.cx + dx, u.cy + dy).ok) {
      setMove(w, u, u.cx + dx, u.cy + dy, { auto: true });
      return true;
    }
  }
  return false;
}

/** Run one player's six lines, in the fixed order. @param {World} w @param {any} p */
function runLines(w, p) {
  const roles = rolesOf(w, p.id);
  const secondsPer1000 = w.settings.classicBuild ? PRODUCTION.secondsPer1000Classic : PRODUCTION.secondsPer1000;
  for (const id of LINES) {
    const line = lineFor(p, id);
    const item = line.queue[0];
    line.hold = '';
    if (!item) { line.exitWait = 0; continue; }
    if (item.paused) { line.hold = 'paused'; continue; }
    const def = itemDef(item.type);
    if (def.requires.some((/** @type {string} */ r) => !roles.has(r))) { line.hold = 'requires'; continue; }
    if (item.prog >= PROGRESS_DONE) {
      // A finished unit waiting for its factory, pad or a clear exit.
      if (deliver(w, p.id, line, item)) { line.queue.shift(); line.exitWait = 0; }
      else { line.hold = producersOf(w, p.id, item.type).length ? 'exit' : 'factory'; line.exitWait++; }
      continue;
    }
    const n = producersOf(w, p.id, item.type).length;
    if (n === 0) { line.hold = 'factory'; continue; }
    if (id === 'aircraft') {
      const pad = item.pad ? w.entities.get(item.pad) : null;
      if (!pad || !isActive(pad) || pad.owner !== p.id || slotHolders(w, pad)[item.slot ?? 0]) {
        item.pad = 0;
        item.slot = 0;
        const free = freePad(w, p.id, item.type);
        if (!free) { line.hold = 'pad'; continue; }
        item.pad = free.pad.id;
        item.slot = free.slot;
      }
    }
    const cost = priceFor(w, p.id, item.type, costOf(item.type));
    const total = buildTicks(cost, n, p.power.ratioK, secondsPer1000);
    const next = Math.min(PROGRESS_DONE, item.prog + Math.ceil(PROGRESS_DONE / total));
    const owed = Math.floor((cost * next) / PROGRESS_DONE) - item.spent;
    const paid = spend({ cash: p.cash, stored: p.stored }, owed);
    if (!paid) {
      line.hold = 'funds';
      if (!p.flags.fundsAlerted || w.tick - p.flags.fundsAlerted > ticks(10)) {
        p.flags.fundsAlerted = w.tick;
        w.events.emit('insufficientFunds', w.tick, { owner: p.id });
      }
      continue;
    }
    p.cash = paid.cash;
    p.stored = paid.stored;
    item.spent += owed;
    item.prog = next;
    if (next >= PROGRESS_DONE) {
      if (id === 'structures' || id === 'defenses') {
        line.queue.shift();
        line.ready = item.type;
        w.events.emit('readyToPlace', w.tick, { owner: p.id, type: item.type, line: id });
      } else if (deliver(w, p.id, line, item)) {
        line.queue.shift();
      }
    }
  }
}

/** @param {World} w */
function upkeepStructures(w) {
  for (const s of w.entities.all()) {
    if (s.dead || s.kind !== 'structure') continue;
    if (s.buildUp > 0 && --s.buildUp === 0) {
      structureReady(w, s);
      onReady(w, s);
    }
    if (s.selling > 0 && --s.selling === 0) {
      const p = w.players[s.owner];
      const refund = sellRefund(costOf(s.type), s.hp, s.maxHp);
      p.cash += refund;
      w.events.emit('sold', w.tick, { id: s.id, owner: s.owner, refund });
      removeStructure(w, s, { sold: true });
      continue;
    }
    if (s.repairing && s.owner >= 0 && (w.tick + s.id) % SECOND === 0) repairStep(w, s);
  }
}

/** Things that happen when a structure finishes building up. @param {World} w @param {any} s */
function onReady(w, s) {
  const def = structureDef(s.type);
  if (def.tags?.includes('freeHarvester') && s.owner >= 0) {
    const d = cellAt(s, def.dock);
    if (!spawnUnit(w, 'harvester', s.owner, d.x, d.y, { facing: 128 })) w.pendingSpawns.push({ type: 'harvester', owner: s.owner, x: d.x, y: d.y, from: s.id });
  }
  // The first factory of a line is its primary.
  const role = def.role;
  const others = w.entities.all().filter((e) => e !== s && e.kind === 'structure' && e.owner === s.owner && !e.dead && structureDef(e.type).role === role && e.primary);
  if (!others.length) s.primary = true;
}

/** One second of structure repair: +2% max HP (min 1) for cost × 0.005. @param {World} w @param {any} s */
function repairStep(w, s) {
  if (s.hp >= s.maxHp || s.selling) { s.repairing = false; return; }
  const p = w.players[s.owner];
  const milli = Math.round(costOf(s.type) * REPAIR.costFractionPerStep * 1000);
  const owed = Math.floor((p.spendMilli + milli) / 1000);
  const paid = spend({ cash: p.cash, stored: p.stored }, owed);
  if (!paid) { s.repairBlocked = true; return; } // waits, blinking, until money arrives
  s.repairBlocked = false;
  p.cash = paid.cash;
  p.stored = paid.stored;
  p.spendMilli = p.spendMilli + milli - owed * 1000;
  s.hp = Math.min(s.maxHp, s.hp + Math.max(1, Math.floor(s.maxHp * REPAIR.hpFractionPerStep)));
  if ((structureDef(s.type).power ?? 0) > 0) p.powerDirty = true;
  if (s.hp >= s.maxHp) s.repairing = false;
}

/** Placements waiting for friendly units to clear; enemies entering make them fail. @param {World} w */
function pendingPlacements(w) {
  w.pendingPlacements = w.pendingPlacements.filter((pp) => {
    const check = checkPlacement(w, pp.owner, pp.type, pp.cx, pp.cy);
    const line = lineFor(w.players[pp.owner], lineOf(pp.type));
    if (check.ok && !check.amber) {
      if (line.ready === pp.type) line.ready = null;
      placeStructure(w, pp.type, pp.owner, pp.cx, pp.cy);
      return false;
    }
    if (!check.ok || w.tick >= pp.until) {
      w.events.emit('placementFailed', w.tick, { owner: pp.owner, type: pp.type, reason: 'Area blocked' });
      return false;
    }
    return true;
  });
}

/** MCVs unfolding: after 2 s the MCV becomes a Yard with the same HP ratio. @param {World} w */
function deployments(w) {
  w.deploying = w.deploying.filter((d) => {
    const u = w.entities.get(d.id);
    if (!u) return false;
    if (w.tick < d.until) return true;
    const check = checkDeploy(w, u);
    if (!check.ok || check.amber) {
      if (check.ok && w.tick < d.giveUp) return true; // friendlies still moving out
      u.deploying = false;
      w.events.emit('deployFailed', w.tick, { id: u.id, owner: u.owner, cells: check.cells });
      return false;
    }
    const hpK = Math.floor((u.hp * 1000) / u.maxHp);
    vacate(w, u, u.cx, u.cy, u.spot);
    w.entities.remove(u);
    const yard = placeStructure(w, 'constructionYard', u.owner, check.cx, check.cy, { buildUp: false, hpRatioK: hpK });
    w.events.emit('deployed', w.tick, { id: yard.id, owner: yard.owner, from: u.id });
    return false;
  });
}

/**
 * Begin deploying an MCV (section 6). Invalid spots fail at once; friendly
 * units in the 3×3 are told to scatter and the deploy retries for 2 s.
 * @param {World} w @param {any} u
 */
export function startDeploy(w, u) {
  if (u.type !== 'mcv' || u.deploying) return false;
  const check = checkDeploy(w, u);
  if (!check.ok) {
    w.events.emit('deployFailed', w.tick, { id: u.id, owner: u.owner, cells: check.cells });
    return false;
  }
  for (const c of check.cells) {
    if (c.state !== 'amber') continue;
    for (const id of w.occ.unitsIn(w.occ.index(c.x, c.y))) {
      const v = w.entities.get(id);
      if (v && v.id !== u.id) scatterOutOf(w, v, check.cx, check.cy, PLACEMENT.mcvFootprint, PLACEMENT.mcvFootprint);
    }
  }
  u.deploying = true;
  u.order = null;
  u.path = [];
  u.task = null;
  w.deploying.push({ id: u.id, until: w.tick + DEPLOY_TICKS, giveUp: w.tick + DEPLOY_TICKS + CLEAR_WAIT });
  w.events.emit('deployStarted', w.tick, { id: u.id, owner: u.owner });
  return true;
}

/** Ask a unit to leave a rectangle for the nearest free cell outside it. @param {World} w @param {any} u */
export function scatterOutOf(w, u, cx, cy, fw, fh) {
  let best = null;
  let bestD = Infinity;
  for (let r = 1; r <= 4 && !best; r++) {
    for (let y = u.cy - r; y <= u.cy + r; y++) {
      for (let x = u.cx - r; x <= u.cx + r; x++) {
        if (x >= cx && x < cx + fw && y >= cy && y < cy + fh) continue;
        if (!canEnter(w, u, x, y).ok) continue;
        const d = (x - u.cx) ** 2 + (y - u.cy) ** 2;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
  }
  if (best) setMove(w, u, best.x, best.y, { auto: true });
}

/** Free Harvesters and other owed units appear as soon as there is room. @param {World} w */
function pendingSpawns(w) {
  if (!w.pendingSpawns.length || w.tick % SECOND !== 0) return;
  w.pendingSpawns = w.pendingSpawns.filter((ps) => !spawnUnit(w, ps.type, ps.owner, ps.x, ps.y, { facing: 128 }));
}

/** Units idling on an exit, dock or pad for 2 s are moved on. @param {World} w */
function clearReservedCells(w) {
  if (w.tick % SECOND !== 0) return;
  for (const s of w.entities.all()) {
    if (s.dead || s.kind !== 'structure') continue;
    const def = structureDef(s.type);
    for (const off of [def.exit, def.dock, def.pad]) {
      if (!off) continue;
      const c = cellAt(s, off);
      if (c.x < 0 || c.y < 0 || c.x >= w.map.width || c.y >= w.map.height) continue;
      for (const id of w.occ.unitsIn(w.occ.index(c.x, c.y))) {
        const u = w.entities.get(id);
        if (!u || u.order || u.next || u.deploying) { if (u) u.reservedIdle = 0; continue; }
        if (u.harv && (u.harv.state === 'docking' || u.harv.state === 'unloading')) continue;
        if (u.task?.type === 'depot') continue;
        u.reservedIdle = (u.reservedIdle ?? 0) + 1;
        if (u.reservedIdle >= PLACEMENT.clearWaitSeconds) { u.reservedIdle = 0; scatterOne(w, u); }
      }
    }
  }
}

/** A vehicle this close to the depot's pad (cells) may take its turn on it. */
const DEPOT_CLAIM_CELLS = 4;
/** A vehicle whose turn it is but that cannot reach the pad gives it up after this long. */
const DEPOT_GIVE_UP_TICKS = ticks(20);

/**
 * Service Depot (section 6): one vehicle at a time on the centre pad,
 * +5% max HP a second for unit cost × 0.0125 a step; a Terror Drone inside is
 * cut out first. Others wait beside it.
 * @param {World} w
 */
function depotService(w) {
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || u.task?.type !== 'depot') continue;
    const d = w.entities.get(u.task.depot);
    if (!d || !isActive(d) || d.owner !== u.owner) { u.task = null; continue; }
    const pad = cellAt(d, structureDef(d.type).pad);
    const holder = d.servicing ? w.entities.get(d.servicing) : null;
    if (d.servicing && (!holder || holder.dead || holder.task?.type !== 'depot' || holder.task.depot !== d.id)) d.servicing = 0;
    // The pad goes to whoever is waiting at the depot, not to a vehicle still crossing the map.
    const close = Math.max(Math.abs(u.cx - pad.x), Math.abs(u.cy - pad.y)) <= DEPOT_CLAIM_CELLS;
    if (!d.servicing && close) { d.servicing = u.id; u.depotWait = 0; }
    if (d.servicing !== u.id) {
      // Come and wait beside the depot's entrance, clear of the lane in.
      if (!u.order && !u.next && !close) setMove(w, u, pad.x + 2, d.cy + d.h + 1, { auto: true });
      continue;
    }
    if (u.cx !== pad.x || u.cy !== pad.y) {
      if (!u.order && !u.next) setMove(w, u, pad.x, pad.y, { auto: true });
      // Cannot get onto the pad (blocked lane): let the next one try, and wait again.
      if (++u.depotWait > DEPOT_GIVE_UP_TICKS) { d.servicing = 0; u.depotWait = 0; }
      continue;
    }
    if (u.next) continue;
    // On the pad, a Terror Drone inside is cut out at once (the depot gets the kill).
    if (u.infested) cutOut(w, u, d.id, killUnit);
    if ((w.tick + u.id) % SECOND !== 0) continue;
    const def = UNITS[u.type];
    if (u.hp < u.maxHp) {
      const p = w.players[u.owner];
      const milli = Math.round(def.cost * REPAIR.depotCostFractionPerStep * 1000);
      const owed = Math.floor((p.spendMilli + milli) / 1000);
      const paid = spend({ cash: p.cash, stored: p.stored }, owed);
      if (paid) {
        p.cash = paid.cash;
        p.stored = paid.stored;
        p.spendMilli = p.spendMilli + milli - owed * 1000;
        u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * REPAIR.depotHpFractionPerSecond)));
      }
    }
    if (u.hp >= u.maxHp) {
      u.task = null;
      d.servicing = 0;
      leaveDepot(w, u, d);
    }
  }
}

/** Drive a serviced vehicle out of the depot, to a free cell past its entrance. @param {World} w @param {any} u @param {any} d */
function leaveDepot(w, u, d) {
  const pad = cellAt(d, structureDef(d.type).pad);
  for (const [x, y] of spiral(pad.x, d.cy + d.h + 1, 3)) {
    if (x === pad.x && y === d.cy + d.h) continue; // not in the doorway
    if (canEnter(w, u, x, y).ok && !w.occ.bld[y * w.map.width + x]) { setMove(w, u, x, y, { auto: true }); return; }
  }
  scatterOne(w, u);
}

/** System 3. @param {World} w */
export function productionSystem(w) {
  depotService(w);
  for (const p of w.players) if (p.alive) runLines(w, p);
  upkeepStructures(w);
  pendingPlacements(w);
  deployments(w);
  pendingSpawns(w);
  clearReservedCells(w);
}

/** Begin selling a structure (1.5 s, reverse build-up). @param {World} w @param {any} s */
export function startSell(w, s) {
  if (s.selling || s.dead) return false;
  s.selling = SELL_TICKS;
  s.repairing = false;
  w.structureEpoch++;
  w.players[s.owner].powerDirty = true;
  if (s.docked) s.docked = 0;
  w.events.emit('selling', w.tick, { id: s.id, owner: s.owner });
  return true;
}

export { footprint, MCV_COST };
