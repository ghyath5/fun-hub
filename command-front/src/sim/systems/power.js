// @ts-check
/**
 * Power (system 2, section 5). Recomputed only when something marked a
 * player's power dirty: a structure added, removed, captured, finishing its
 * build-up, or a power structure's HP changing. Output scales with HP;
 * drain is always full. Low power is r < 1.
 */
import { powerTotals } from '../formulas/economy.js';
import { isActive, structureDef } from '../entities/structures.js';

/** @typedef {import('../world.js').World} World */

/** @param {World} w @param {number} pid */
export function recomputePower(w, pid) {
  const list = [];
  for (const e of w.entities.all()) {
    if (e.kind !== 'structure' || e.owner !== pid || e.dead) continue;
    const def = structureDef(e.type);
    if (!def.power) continue;
    list.push({ power: def.power, hp: e.hp, maxHp: e.maxHp, active: isActive(e) });
  }
  const p = w.players[pid];
  const before = p.power.low;
  p.power = powerTotals(list);
  p.powerDirty = false;
  if (p.power.low && !before) w.events.emit('lowPower', w.tick, { owner: pid });
}

/** System 2. @param {World} w */
export function powerSystem(w) {
  for (const p of w.players) if (p.powerDirty) recomputePower(w, p.id);
}
