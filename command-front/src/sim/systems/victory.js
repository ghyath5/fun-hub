// @ts-check
/**
 * Victory check (system 14, section 18). Counting objects: every structure
 * except walls and every unit (passengers and aircraft in flight count);
 * production never counts. In Short game only structures and undeployed
 * MCVs count. A player with none left is eliminated and their walls and
 * mines are removed. The match ends when one player or one team is left;
 * if the last ones fall in the same tick it is a draw.
 */
import { structureDef } from '../entities/structures.js';
import { UNITS } from '../../data/units.js';
import { vacate } from '../entities/units.js';

/** @typedef {import('../world.js').World} World */

/** Does this entity keep its owner in the game? @param {World} w @param {any} e */
function counts(w, e) {
  if (e.dead || e.owner < 0) return false;
  if (e.kind === 'structure') return !structureDef(e.type).wall;
  if (UNITS[e.type]?.tags.includes('support')) return false; // a passing support plane is not an army
  return w.settings.shortGame ? e.type === 'mcv' : true;
}

/**
 * Remove what an eliminated player leaves behind: walls and mines (and, in
 * Short game, any units still standing, so nobody fights for a dead player).
 * @param {World} w @param {number} pid
 */
function clearRemains(w, pid) {
  for (const [i, m] of [...w.mines]) if (m.owner === pid) w.mines.delete(i);
  for (const e of w.entities.all()) {
    if (e.dead || e.owner !== pid) continue;
    if (e.kind === 'structure') {
      // Walls (and, in Short game, anything else) quietly crumble.
      w.damage.push({ victim: e.id, amount: e.maxHp, attacker: 0, owner: -1 });
    } else if (e.kind === 'unit' && !e.inside) {
      vacate(w, e, e.cx, e.cy, e.spot);
      if (e.next) vacate(w, e, e.next.x, e.next.y, e.next.spot);
      e.next = null;
      w.entities.remove(e);
    }
  }
}

/** Eliminate a player now (no objects left, or surrender). @param {World} w @param {number} pid @param {string} why */
export function eliminate(w, pid, why) {
  const p = w.players[pid];
  if (!p.alive) return;
  p.alive = false;
  p.eliminatedAt = w.tick;
  clearRemains(w, pid);
  w.events.emit('playerEliminated', w.tick, { player: pid, why });
}

/** System 14. @param {World} w */
export function victorySystem(w) {
  if (w.result || !w.settings.victory) return;
  const alive = w.players.filter((p) => p.alive);
  /** @type {Set<number>} */
  const holding = new Set();
  for (const e of w.entities.all()) if (counts(w, e)) holding.add(e.owner);
  const falling = alive.filter((p) => !holding.has(p.id));
  for (const p of falling) eliminate(w, p.id, 'destroyed');
  const left = w.players.filter((p) => p.alive);
  const teams = new Set(left.map((p) => p.team));
  if (teams.size > 1) return;
  w.result = {
    tick: w.tick,
    draw: left.length === 0,
    winners: left.map((p) => p.id),
    team: left.length ? left[0].team : -1,
  };
  w.events.emit('matchEnded', w.tick, w.result);
}
