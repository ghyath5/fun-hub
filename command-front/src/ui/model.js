// @ts-check
/**
 * HUD view models: plain snapshots built from the world for the sidebar,
 * the top bar and the structure card. Pure functions (no DOM, no Pixi), so
 * the HUD stays a dumb renderer and these can be unit-tested.
 */
import { STRUCTURES } from '../data/structures.js';
import { LINES, catalog, itemDef } from '../sim/catalog.js';
import { PROGRESS_DONE } from '../sim/systems/production.js';
import { credits } from '../sim/players.js';
import { structureDef, isActive } from '../sim/entities/structures.js';
import { POWER_IDS, grants, chargeTicks } from '../sim/systems/supportPowers.js';
import { SUPPORT_POWERS } from '../data/rules.js';

/** @typedef {import('../sim/catalog.js').LineId} LineId */

export const TAB_LABEL = Object.freeze({
  structures: 'Base', defenses: 'Def', infantry: 'Inf', vehicles: 'Veh', aircraft: 'Air', naval: 'Navy',
});

/** Hold reasons → the label on a greyed icon (section 14). */
export const HOLD_LABEL = Object.freeze({
  paused: 'Paused', requires: 'Requires', factory: 'No factory', funds: 'Funds', pad: 'No pad', exit: 'Blocked',
});

/** Display name of the first structure filling a role ("power" → "Power Plant"). @param {string} role */
export function roleName(role) {
  for (const d of Object.values(STRUCTURES)) if (d.role === role) return d.name;
  return role;
}

/**
 * @typedef {object} BuildItem
 * @property {string} type
 * @property {string} name
 * @property {number} cost
 * @property {'available' | 'building' | 'paused' | 'ready' | 'locked' | 'busy' | 'limit'} state
 * @property {number} progress   0–1 for the active item
 * @property {number} queued     Items of this type in the queue (including the active one)
 * @property {string} label      Hold reason or lock text
 * @property {boolean} wall      Walls skip the queue: tapping draws a line
 */

/**
 * @typedef {object} TabInfo
 * @property {LineId} id
 * @property {string} label
 * @property {number} items      Visible items
 * @property {number} progress   Active item 0–1 (−1 idle)
 * @property {boolean} ready
 * @property {number} queued
 */

/**
 * Sidebar model: every tab with its badges and every visible item's state.
 * @param {any} w @param {number} pid
 * @returns {{ tabs: TabInfo[], items: Record<LineId, BuildItem[]> }}
 */
export function sidebarModel(w, pid) {
  const p = w.players[pid];
  const all = catalog(w, pid);
  /** @type {Record<string, BuildItem[]>} */
  const items = {};
  const tabs = LINES.map((id) => {
    const line = p.lines[id] ?? { queue: [], ready: null, hold: '' };
    const active = line.queue[0];
    const single = id === 'structures' || id === 'defenses';
    items[id] = all[id].map((info) => {
      const queued = line.queue.filter((/** @type {any} */ q) => q.type === info.type).length;
      /** @type {BuildItem} */
      const item = { type: info.type, name: info.name, cost: info.cost, state: 'available', progress: 0, queued, label: '', wall: !!itemDef(info.type).wall };
      if (line.ready === info.type) {
        item.state = 'ready';
        item.progress = 1;
      } else if (active && active.type === info.type) {
        item.progress = Math.min(1, active.prog / PROGRESS_DONE);
        const held = active.paused ? 'paused' : line.hold;
        item.state = held ? 'paused' : 'building';
        item.label = held ? HOLD_LABEL[/** @type {keyof typeof HOLD_LABEL} */ (held)] ?? '' : '';
        if (held === 'requires') item.label = `Requires ${itemDef(info.type).requires.map(roleName).join(', ')}`;
      } else if (info.locked) {
        item.state = 'locked';
        item.label = `Requires ${info.missing.map(roleName).join(', ')}`;
      } else if (single && (line.ready || line.queue.length)) {
        item.state = 'busy';
      } else if (info.reason && !queued) {
        item.state = 'limit';
        item.label = info.reason === 'unitCap' ? 'Unit cap' : 'Limit';
      }
      return item;
    });
    return {
      id,
      label: TAB_LABEL[id],
      items: items[id].length,
      progress: line.ready ? 1 : active ? Math.min(1, active.prog / PROGRESS_DONE) : -1,
      ready: !!line.ready,
      queued: line.queue.length,
    };
  });
  return { tabs, items: /** @type {Record<LineId, BuildItem[]>} */ (items) };
}

/** Top-bar economy: credits, storage and power. @param {any} w @param {number} pid */
export function economyModel(w, pid) {
  const p = w.players[pid];
  return {
    credits: credits(p),
    stored: p.stored,
    capacity: p.capacity,
    powerProduced: p.power.produced,
    powerDrain: p.power.drain,
  };
}

/**
 * The command bar's card for a selected structure (section 14): name, HP,
 * power and which buttons apply.
 * @param {any} w @param {any} s @param {number} pid
 */
export function structureCard(w, s, pid) {
  const def = structureDef(s.type);
  const own = s.owner === pid;
  const role = def.role;
  const factory = ['barracks', 'factory', 'helipad', 'airfield', 'navalyard', 'kennel'].includes(role);
  let sameRole = 0;
  if (own && factory) {
    for (const e of w.entities.all()) if (e.kind === 'structure' && e.owner === pid && structureDef(e.type).role === role && isActive(e)) sameRole++;
  }
  return {
    id: s.id,
    type: s.type,
    name: def.name,
    hp: s.hp,
    maxHp: s.maxHp,
    power: def.power ?? 0,
    own,
    canSell: own && s.buildUp === 0 && !s.selling,
    repairing: !!s.repairing,
    canRepair: own && !s.selling && (s.repairing || s.hp < s.maxHp),
    canRally: own && factory && !!def.exit,
    canPrimary: own && factory && sameRole > 1,
    primary: factory && !!s.primary,
  };
}

/**
 * Support powers the player can use now (granting building owned), with charge 0–1.
 * @param {any} w @param {number} pid
 */
export function powersModel(w, pid) {
  const p = w.players[pid];
  return POWER_IDS.filter((id) => grants(w, pid, id) && !(SUPPORT_POWERS[id].oneUse && p.powers[id]?.used)).map((id) => {
    const st = p.powers[id] ?? { charge: 0, ready: false };
    return { id, name: SUPPORT_POWERS[id].name, ready: !!st.ready, progress: st.ready ? 1 : Math.min(1, Math.floor((st.charge / chargeTicks(id)) * 100) / 100) };
  });
}

/** Spy intelligence for the top bar: credits of players whose refinery or silo a spy entered (3 min). @param {any} w @param {number} pid */
export function intelLine(w, pid) {
  const p = w.players[pid];
  const parts = [];
  for (const q of w.players) {
    if (q.id === pid) continue;
    if ((p.flags[`creditsOf${q.id}`] ?? 0) > w.tick) parts.push(`${q.color}: $${(q.cash + q.stored).toLocaleString('en-US')}`);
    if ((p.flags[`queuesOf${q.id}`] ?? 0) > w.tick) {
      const building = Object.values(q.lines).map((/** @type {any} */ l) => l.queue[0]?.type).filter(Boolean).map((/** @type {string} */ t) => itemDef(t).name);
      parts.push(`${q.color} builds: ${building.length ? building.join(', ') : 'nothing'}`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Shallow structural equality for snapshots, so the HUD only re-renders on change. @param {any} a @param {any} b */
export function sameShape(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
