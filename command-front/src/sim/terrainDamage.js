// @ts-check
/**
 * Destroyable terrain (section 4): Trees (300 HP, Wood) become Clear when
 * destroyed; Bridges (1000 HP, Concrete, one pool per bridge) collapse into
 * Water, killing whatever stands on them. Repair huts rebuild a collapsed
 * bridge (Engineer). Craters (Atomic Strike) replace Clear and Rubble.
 * Passability is rebuilt at once and routes through changed cells re-path.
 */
import { T } from '../data/terrain.js';
import { damage, falloffPermille } from './formulas/combat.js';
import { SIM } from '../data/rules.js';
import { isqrt } from '../core/fixed.js';
import { requestPath } from './systems/movement.js';

/** @typedef {import('./world.js').World} World */

const L = SIM.leptonsPerCell;
export const TREE = Object.freeze({ hp: 300, armor: /** @type {const} */ ('wood') });
export const BRIDGE = Object.freeze({ hp: 1000, armor: /** @type {const} */ ('concrete') });

/** Bridges of a map as live records. @param {any} map */
export const createBridges = (map) => (map.bridges ?? []).map((/** @type {any} */ b) => ({ cells: b.cells, hut: b.hut, hp: BRIDGE.hp, alive: true }));

/** Bridge record holding a cell, or null. @param {World} w @param {number} x @param {number} y */
export function bridgeAt(w, x, y) {
  return w.bridges.find((/** @type {any} */ b) => b.cells.some((/** @type {number[]} */ c) => c[0] === x && c[1] === y)) ?? null;
}

/** Re-path every unit whose remaining route crosses a changed cell. @param {World} w @param {Set<number>} cells */
function invalidateRoutes(w, cells) {
  const W = w.map.width;
  for (const u of w.entities.all()) {
    if (u.dead || u.kind !== 'unit' || !u.order || !u.path.length) continue;
    for (let k = 0; k < u.path.length; k += 2) {
      if (cells.has(u.path[k + 1] * W + u.path[k])) { requestPath(w, u); break; }
    }
  }
}

/** Terrain of cells changed: rebuild passability, redraw, re-path. @param {World} w @param {number[][]} changed */
export function terrainChanged(w, changed) {
  if (!changed.length) return;
  w.nav.rebuild();
  const W = w.map.width;
  invalidateRoutes(w, new Set(changed.map(([x, y]) => y * W + x)));
  w.events.emit('terrainChanged', w.tick, { cells: changed });
}

/** @param {World} w @param {any} b */
function collapse(w, b) {
  b.alive = false;
  b.hp = 0;
  const W = w.map.width;
  for (const [x, y] of b.cells) {
    w.map.terrain[y * W + x] = T.water;
    // Ground units on a collapsing bridge die (applied with the rest of this tick's damage).
    for (const id of w.occ.unitsIn(y * W + x)) {
      const u = w.entities.get(id);
      if (u && !u.dead) w.damage.push({ victim: u.id, amount: u.maxHp, attacker: 0, owner: -1 });
    }
  }
  terrainChanged(w, b.cells);
  w.events.emit('bridgeDestroyed', w.tick, { cells: b.cells });
}

/** Rebuild a collapsed bridge at full HP. @param {World} w @param {any} b */
export function repairBridge(w, b) {
  if (b.alive) return false;
  const W = w.map.width;
  for (const [x, y] of b.cells) w.map.terrain[y * W + x] = T.bridge;
  b.alive = true;
  b.hp = BRIDGE.hp;
  terrainChanged(w, b.cells);
  w.events.emit('bridgeRepaired', w.tick, { cells: b.cells });
  return true;
}

/**
 * Damage the terrain under a detonation: full damage to the cell it lands
 * on, splash with falloff around it. Trees and bridges only.
 * @param {World} w @param {import('../types.js').WeaponDef} wd @param {number} tx @param {number} ty leptons
 */
export function terrainImpact(w, wd, tx, ty) {
  if (!wd.warhead || wd.damage <= 0) return;
  const W = w.map.width;
  const r = Math.round(wd.splash * L);
  const R = Math.ceil(wd.splash) + 1;
  const ccx = Math.floor(tx / L);
  const ccy = Math.floor(ty / L);
  /** @type {number[][]} */
  const felled = [];
  /** @type {Map<any, number>} bridge → damage this impact (the worst cell counts once) */
  const bridgeHits = new Map();
  for (let y = ccy - R; y <= ccy + R; y++) {
    for (let x = ccx - R; x <= ccx + R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= w.map.height) continue;
      const i = y * W + x;
      const t = w.map.terrain[i];
      if (t !== T.tree && t !== T.bridge) continue;
      const centre = x === ccx && y === ccy;
      let f = 1000;
      if (!centre) {
        if (r <= 0) continue;
        const dx = Math.max(0, Math.abs(tx - (x * L + L / 2)) - L / 2);
        const dy = Math.max(0, Math.abs(ty - (y * L + L / 2)) - L / 2);
        f = falloffPermille(isqrt(dx * dx + dy * dy), r);
        if (f <= 0) continue;
      }
      if (t === T.tree) {
        const amount = damage(wd.damage, wd.warhead, TREE.armor, { falloff: f });
        const hp = (w.terrainHp.get(i) ?? TREE.hp) - amount;
        if (hp > 0) w.terrainHp.set(i, hp);
        else {
          w.terrainHp.delete(i);
          w.map.terrain[i] = T.clear;
          felled.push([x, y]);
        }
      } else {
        const b = bridgeAt(w, x, y);
        if (!b || !b.alive) continue;
        const amount = damage(wd.damage, wd.warhead, BRIDGE.armor, { falloff: f });
        bridgeHits.set(b, Math.max(bridgeHits.get(b) ?? 0, amount));
      }
    }
  }
  if (felled.length) terrainChanged(w, felled);
  for (const [b, amount] of bridgeHits) {
    b.hp -= amount;
    if (b.hp <= 0) collapse(w, b);
  }
}

/** Atomic Strike: Craters on open ground and no ore within the blast. @param {World} w @param {number} cx @param {number} cy @param {number} radius cells */
export function scorchEarth(w, cx, cy, radius) {
  const W = w.map.width;
  /** @type {number[][]} */
  const changed = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= W || y >= w.map.height) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = y * W + x;
      if (w.map.bales[i]) { w.map.bales[i] = 0; w.map.gem[i] = 0; w.oreReserved.delete(i); }
      const t = w.map.terrain[i];
      if (t === T.clear || t === T.rubble || t === T.road) {
        w.map.terrain[i] = T.crater;
        w.rubble = w.rubble.filter((/** @type {any} */ r) => r.i !== i);
      }
      changed.push([x, y]);
    }
  }
  terrainChanged(w, changed);
}
