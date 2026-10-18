// @ts-check
/**
 * Support buildings that change the rules for their owner while they stand
 * and work (data/rules.js BONUSES): the Ore Processor raises the value of
 * harvested ore, the Industrial Plant cuts the price of vehicles, aircraft
 * and ships, and the Clone Lab trains a second copy of most infantry.
 */
import { BONUSES } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { isActive, structureDef } from './entities/structures.js';

/** Does the player own a working building of this role? @param {any} w @param {number} pid @param {string} role */
export const hasWorking = (w, pid, role) => w.entities.all().some((e) => e.kind === 'structure' && !e.dead && e.owner === pid && isActive(e) && structureDef(e.type).role === role);

/** Ore value factor in thousandths: the AI's handicap or bonus, times the Ore Processor's. @param {any} w @param {number} pid */
export function oreValueK(w, pid) {
  const base = w.players[pid].oreValueK ?? 1000;
  return hasWorking(w, pid, 'processor') ? Math.round(base * BONUSES.processorOreFactor) : base;
}

/** What an item costs this player right now (structures never change). @param {any} w @param {number} pid @param {string} type @param {number} cost  list price */
export function priceFor(w, pid, type, cost) {
  const u = UNITS[type];
  if (!u || !BONUSES.industryLines.includes(u.line) || !hasWorking(w, pid, 'industry')) return cost;
  return Math.round(cost * BONUSES.industryCostFactor);
}

/** Should a freshly trained unit get a free twin from the Clone Lab? @param {any} w @param {number} pid @param {string} type */
export const clones = (w, pid, type) => UNITS[type]?.line === 'infantry' && !BONUSES.noClone.includes(type) && hasWorking(w, pid, 'cloning');
