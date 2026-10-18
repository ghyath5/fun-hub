// @ts-check
/**
 * Base-building commands (section 6): production queues, placement, walls,
 * selling, repair, primary factory, rally points. Like every other command
 * they arrive through the queue and are validated here against the rules;
 * an invalid command changes nothing.
 */
import { PRODUCTION, PLACEMENT } from '../data/rules.js';
import { ticks } from '../core/fixed.js';
import { spend } from './formulas/economy.js';
import { itemInfo, lineOf, LINES } from './catalog.js';
import { structureDef, placeStructure, isActive } from './entities/structures.js';
import { checkPlacement, wallPrefix } from './placement.js';
import { lineFor, startSell, scatterOutOf, PROGRESS_DONE } from './systems/production.js';
import { UNITS } from '../data/units.js';
import { padAvailable } from './pads.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('../types.js').Command} Command */

export const BASE_COMMANDS = new Set(['build', 'pause', 'resume', 'cancel', 'place', 'walls', 'sell', 'repair', 'primary', 'rally', 'cancelReady']);

/** Own structure named by a command target. @param {World} w @param {Command} c */
function ownStructure(w, c) {
  const s = c.target && Number.isInteger(c.target.id) ? w.entities.get(c.target.id) : null;
  return s && s.kind === 'structure' && s.owner === c.playerId ? s : null;
}

/**
 * Queue items: Structures and Defenses take one item and no queue (and none
 * while a READY structure waits); unit lines queue up to 5. Limits: Commando
 * 1, each support-power building 1, aircraft no more than free pads.
 * @param {World} w @param {number} pid @param {string} type @param {number} count
 */
function build(w, pid, type, count) {
  const p = w.players[pid];
  const info = itemInfo(w, pid, type);
  if (!info || info.locked) return false;
  const lineId = lineOf(type);
  const line = lineFor(p, lineId);
  const single = lineId === 'structures' || lineId === 'defenses';
  let added = 0;
  for (let k = 0; k < count; k++) {
    if (single && (line.queue.length >= 1 || line.ready)) break;
    if (!single && line.queue.length >= PRODUCTION.queueMax) break;
    const now = itemInfo(w, pid, type);
    if (!now || now.reason) break;
    if (lineId === 'aircraft' && !padAvailable(w, pid, type)) break;
    line.queue.push({ type, prog: 0, spent: 0, paused: false, pad: 0 });
    added++;
  }
  return added > 0;
}


/** Cancel refunds 100% of what was spent; items not started cost nothing. */
function cancel(w, pid, lineId, opts) {
  const p = w.players[pid];
  const line = lineFor(p, lineId);
  if (opts.ready && line.ready) {
    // A READY structure was paid in full.
    p.cash += itemCost(line.ready);
    line.ready = null;
    return true;
  }
  if (!line.queue.length) return false;
  const pick = opts.all ? line.queue.length : 1;
  let removed = 0;
  // Remove from the back first (queued items before the active one), unless a type is named.
  for (let k = 0; k < pick; k++) {
    let idx = line.queue.length - 1;
    if (opts.type) idx = line.queue.map((q) => q.type).lastIndexOf(opts.type);
    if (opts.active) idx = 0;
    if (idx < 0) break;
    const [item] = line.queue.splice(idx, 1);
    p.cash += item.spent;
    removed++;
  }
  return removed > 0;
}

const itemCost = (/** @type {string} */ type) => (/** @type {any} */ (UNITS[type]) ?? structureDef(type)).cost;

/** Place a READY structure; friendly units in the way get 2 s to clear. */
function place(w, pid, type, x, y) {
  const line = lineFor(w.players[pid], lineOf(type));
  if (line.ready !== type) return false;
  if (w.pendingPlacements.some((pp) => pp.owner === pid && pp.type === type)) return false;
  const check = checkPlacement(w, pid, type, x, y);
  if (!check.ok) {
    w.events.emit('placementFailed', w.tick, { owner: pid, type, reason: check.reason });
    return false;
  }
  if (check.amber) {
    const def = structureDef(type);
    for (const c of check.cells) {
      if (c.state !== 'amber') continue;
      for (const id of w.occ.unitsIn(w.occ.index(c.x, c.y))) {
        const u = w.entities.get(id);
        if (u && u.kind === 'unit') scatterOutOf(w, u, x, y, def.w, def.h);
      }
    }
    w.pendingPlacements.push({ owner: pid, type, cx: x, cy: y, until: w.tick + ticks(PLACEMENT.clearWaitSeconds) });
    return true;
  }
  line.ready = null;
  placeStructure(w, type, pid, x, y);
  return true;
}

/** Walls bypass the queue: each cell is paid as it is placed. */
function walls(w, pid, type, cells) {
  const def = structureDef(type);
  if (!def?.wall || !Array.isArray(cells)) return false;
  const info = itemInfo(w, pid, type);
  if (!info || info.locked) return false;
  const p = w.players[pid];
  const prefix = wallPrefix(w, pid, type, cells, p.cash + p.stored);
  for (const [x, y] of prefix) {
    const paid = spend({ cash: p.cash, stored: p.stored }, def.cost);
    if (!paid) break;
    p.cash = paid.cash;
    p.stored = paid.stored;
    placeStructure(w, type, pid, x, y, { buildUp: false });
  }
  return prefix.length > 0;
}

/**
 * Apply a base command. Returns false when it was invalid.
 * @param {World} w @param {Command} c
 */
export function applyBaseCommand(w, c) {
  const pid = c.playerId;
  const t = c.target ?? {};
  switch (c.type) {
    case 'build': return typeof t.type === 'string' && build(w, pid, t.type, Math.max(1, Math.min(PRODUCTION.queueMax, t.count | 0 || 1)));
    case 'pause':
    case 'resume': {
      if (!LINES.includes(t.line)) return false;
      const item = lineFor(w.players[pid], t.line).queue[0];
      if (!item) return false;
      item.paused = c.type === 'pause';
      return true;
    }
    case 'cancel': return LINES.includes(t.line) && cancel(w, pid, t.line, { all: !!t.all, type: t.type, active: !!t.active });
    case 'cancelReady': return LINES.includes(t.line) && cancel(w, pid, t.line, { ready: true });
    case 'place': return typeof t.type === 'string' && Number.isInteger(t.x) && Number.isInteger(t.y) && place(w, pid, t.type, t.x, t.y);
    case 'walls': return typeof t.type === 'string' && walls(w, pid, t.type, t.cells);
    case 'sell': {
      const s = ownStructure(w, c);
      return !!s && s.buildUp === 0 && startSell(w, s);
    }
    case 'repair': {
      const s = ownStructure(w, c);
      if (!s || s.selling) return false;
      const on = t.on ?? !s.repairing;
      if (on && s.hp >= s.maxHp) return false; // cannot start at full HP
      s.repairing = !!on;
      return true;
    }
    case 'primary': {
      const s = ownStructure(w, c);
      if (!s) return false;
      const role = structureDef(s.type).role;
      for (const e of w.entities.all()) if (e.kind === 'structure' && e.owner === pid && structureDef(e.type).role === role) e.primary = false;
      s.primary = true;
      return true;
    }
    case 'rally': {
      const s = ownStructure(w, c);
      if (!s || !Number.isInteger(t.x) || !Number.isInteger(t.y)) return false;
      s.rally = { x: Math.max(0, Math.min(w.map.width - 1, t.x)), y: Math.max(0, Math.min(w.map.height - 1, t.y)) };
      return true;
    }
    default: return false;
  }
}

export { PROGRESS_DONE };
