// @ts-check
/**
 * Mines (section 10): laid by Mine Layers, one per cell, at most 50 per
 * player. Invisible to enemies, immune to damage, never blocking paths.
 * Own and allied units never trigger them; an enemy vehicle sets off an
 * anti-tank mine, enemy infantry an anti-personnel one. Detonations go
 * through the normal impact rules (system 8's `detonate`).
 */
import { MINES } from '../data/weapons.js';
import { SPECIALS, SIM } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { T } from '../data/terrain.js';
import { detonate } from './systems/projectiles.js';

/** @typedef {import('./world.js').World} World */

const L = SIM.leptonsPerCell;

/** Mines a player has laid. @param {World} w @param {number} pid */
export function minesOf(w, pid) {
  let n = 0;
  for (const m of w.mines.values()) if (m.owner === pid) n++;
  return n;
}

/** Can `pid` lay a mine in cell (x, y)? @param {World} w @param {number} pid @param {number} x @param {number} y */
export function canMine(w, pid, x, y) {
  if (x < 0 || y < 0 || x >= w.map.width || y >= w.map.height) return false;
  const i = y * w.map.width + x;
  const t = w.map.terrain[i];
  if (t === T.water || t === T.rock || t === T.tree || t === T.bridge) return false;
  return !w.occ.bld[i] && !w.mines.has(i) && minesOf(w, pid) < SPECIALS.minesMaxPerPlayer;
}

/** Lay a mine of the layer's faction kind. @param {World} w @param {any} layer @param {number} x @param {number} y */
export function layMine(w, layer, x, y) {
  if (!canMine(w, layer.owner, x, y)) return false;
  const kind = MINES[w.players[layer.owner].faction].kind;
  w.mines.set(y * w.map.width + x, { owner: layer.owner, kind });
  w.events.emit('mineLaid', w.tick, { owner: layer.owner, x, y });
  return true;
}

/** A unit entered its cell: set off an enemy mine of the matching kind. @param {World} w @param {any} u */
export function triggerMine(w, u) {
  const i = u.cy * w.map.width + u.cx;
  const m = w.mines.get(i);
  if (!m || w.allied(m.owner, u.owner)) return;
  const loco = UNITS[u.type].loco;
  if (loco === 'air' || loco === 'float') return;
  const infantry = loco === 'foot';
  const spec = Object.values(MINES).find((s) => s.kind === m.kind);
  if (!spec || (spec.triggeredBy === 'infantry') !== infantry) return;
  w.mines.delete(i);
  w.spatial.rebuild(w.entities.all());
  detonate(w, { weapon: spec.weapon, tx: u.cx * L + L / 2, ty: u.cy * L + L / 2, target: u.id, direct: true, shooter: 0, owner: m.owner });
  w.events.emit('mineExploded', w.tick, { owner: m.owner, x: u.cx, y: u.cy });
}
