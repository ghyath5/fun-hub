// @ts-check
/**
 * Damage application and deaths (system 9, section 9). All damage collected
 * this tick is applied together in ascending victim id order; deaths follow,
 * also in id order. Any damage puts infantry prone for 3 s. Healing never
 * revives. Titan Tanks below half health repair 1% of max HP per second up to 50%.
 */
import { UNITS } from '../../data/units.js';
import { COMBAT } from '../../data/rules.js';
import { ticks } from '../../core/fixed.js';
import { vacate } from '../entities/units.js';
import { removeStructure, structureDef } from '../entities/structures.js';
import { isInfantryEntity } from '../targeting.js';

/** @typedef {import('../world.js').World} World */

const PRONE_TICKS = ticks(COMBAT.proneSeconds);
const SECOND = ticks(1);

/** Remove a dead unit from the world. @param {World} w @param {any} u @param {number} killer */
export function killUnit(w, u, killer) {
  if (!u.inside) {
    vacate(w, u, u.cx, u.cy, u.spot);
    if (u.next) vacate(w, u, u.next.x, u.next.y, u.next.spot);
  }
  if (u.owner >= 0) w.players[u.owner].stats.unitsLost++;
  const k = killer ? w.entities.get(killer) : null;
  if (k && k.owner >= 0 && !w.allied(k.owner, u.owner)) w.players[k.owner].stats.unitsKilled++;
  for (const hook of w.deathHooks) hook(w, u);
  u.next = null;
  u.order = null;
  u.pathReq = 0;
  w.entities.remove(u);
  w.events.emit('unitDied', w.tick, { id: u.id, type: u.type, owner: u.owner, x: u.x, y: u.y, killer });
}

/** @param {World} w */
function applyDamage(w) {
  if (w.damage.length === 0) return;
  const records = w.damage.map((r, i) => ({ r, i })).sort((a, b) => a.r.victim - b.r.victim || a.i - b.i);
  w.damage = [];
  /** @type {Map<number, number>} victim → last attacker, for deaths */
  const killers = new Map();
  for (const { r } of records) {
    const v = w.entities.get(r.victim);
    if (!v || v.hp <= 0) continue;
    if (v.aegisUntil > w.tick) continue; // Aegis Field: invulnerable
    if (v.kind === 'structure' && structureDef(v.type).tags?.includes('invulnerable')) continue; // bridge repair huts
    if (r.amount < 0) {
      v.hp = Math.min(v.maxHp, v.hp - r.amount);
      continue;
    }
    // Armour crate: damage taken ÷ 1.5 (never below 1).
    const amount = v.armorK ? Math.max(1, Math.floor((r.amount * 1000) / v.armorK)) : r.amount;
    v.hp = Math.max(0, v.hp - amount);
    killers.set(v.id, r.attacker);
    if (v.kind === 'structure' && v.owner >= 0 && (structureDef(v.type).power ?? 0) > 0) w.players[v.owner].powerDirty = true;
    if (isInfantryEntity(v)) v.proneUntil = w.tick + PRONE_TICKS;
    if (r.attacker && r.owner >= 0 && !w.allied(r.owner, v.owner)) v.lastAttacker = r.attacker;
    w.events.emit('damaged', w.tick, { id: v.id, amount: r.amount, by: r.attacker, owner: v.owner });
  }
  const dead = [...killers.keys()].sort((a, b) => a - b);
  for (const id of dead) {
    const v = w.entities.get(id);
    if (!v || v.hp !== 0) continue;
    if (v.kind === 'structure') removeStructure(w, v, { destroyed: true, killer: killers.get(id) });
    else killUnit(w, v, /** @type {number} */ (killers.get(id)));
  }
}

/** Titan self-repair: once a second, +1% max HP while below 50%. @param {World} w */
function selfRepair(w) {
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || !UNITS[u.type].tags.includes('selfRepair')) continue;
    if ((w.tick + u.id) % SECOND !== 0) continue;
    const cap = Math.floor(u.maxHp * COMBAT.titanSelfRepairBelow);
    if (u.hp > 0 && u.hp < cap) u.hp = Math.min(cap, u.hp + Math.max(1, Math.floor(u.maxHp * COMBAT.titanSelfRepairPerSecond)));
  }
}

/** System 9. @param {World} w */
export function damageSystem(w) {
  applyDamage(w);
  selfRepair(w);
}
