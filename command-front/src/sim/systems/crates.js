// @ts-check
/**
 * Crates (section 18, a setting). Every 2 min a crate appears on a random
 * explored Clear cell (at most 3 on the map). Any ground unit entering the
 * cell picks it up; the effect is rolled with the sim RNG. Runs with the
 * support-power timers (system 13); pickups happen in movement (system 6).
 */
import { CRATES, SIM } from '../../data/rules.js';
import { UNITS } from '../../data/units.js';
import { T } from '../../data/terrain.js';
import { ticks } from '../../core/fixed.js';
import { pickWeighted, rangeInt } from '../../lib/rng.js';
import { spawnUnit } from '../entities/units.js';
import { techLevelOf } from '../catalog.js';
import { revealAll } from './shroud.js';
import { detonate } from './projectiles.js';

/** @typedef {import('../world.js').World} World */

const L = SIM.leptonsPerCell;
const EVERY = ticks(CRATES.everySeconds);
const effectOf = (/** @type {string} */ id) => /** @type {any} */ (CRATES.effects.find((e) => e.id === id));

/** Could a crate sit here? Explored by someone, Clear, empty. @param {World} w @param {number} i */
function crateCell(w, i) {
  if (w.map.terrain[i] !== T.clear || w.map.bales[i] || w.occ.bld[i] || w.occ.veh[i] || w.occ.infCount[i]) return false;
  if (w.crates.some((c) => c.i === i) || w.mines.has(i)) return false;
  return Object.values(w.vision).some((v) => v.explored[i] === 1);
}

/** System 13 part: drop a new crate every 2 min. @param {World} w */
export function crateSystem(w) {
  if (!w.settings.crates || w.tick === 0 || w.tick % EVERY !== 0 || w.crates.length >= CRATES.maxOnMap) return;
  const n = w.map.width * w.map.height;
  // A few random tries, then give up until next time (deterministic: every roll is the sim RNG).
  for (let k = 0; k < 40; k++) {
    const i = w.rng.int(n);
    if (!crateCell(w, i)) continue;
    w.crates.push({ i, x: i % w.map.width, y: Math.floor(i / w.map.width) });
    w.events.emit('crateSpawned', w.tick, { x: i % w.map.width, y: Math.floor(i / w.map.width) });
    return;
  }
}

/** A free unit of the collector's faction within the match's tech level. @param {World} w @param {number} pid */
function freeUnitType(w, pid) {
  const faction = w.players[pid].faction;
  const pool = Object.values(UNITS).filter((d) => (d.faction === faction || d.faction === 'both')
    && (d.line === 'infantry' || d.line === 'vehicles') && d.cost > 0 && !d.tags.includes('mcv') && techLevelOf(d.id) <= w.settings.techLevel);
  return pool.length ? pool[w.rng.int(pool.length)].id : 'rifleman';
}

/** A ground unit entered a cell: pick up any crate there. @param {World} w @param {any} u */
export function collectCrate(w, u) {
  const loco = UNITS[u.type].loco;
  if (loco === 'air' || loco === 'float') return;
  const i = u.cy * w.map.width + u.cx;
  const k = w.crates.findIndex((c) => c.i === i);
  if (k < 0) return;
  w.crates.splice(k, 1);
  const effect = CRATES.effects[pickWeighted(w.rng, CRATES.effects.map((e) => e.weight))].id;
  const p = w.players[u.owner];
  /** @type {any} */
  let detail = null;
  switch (effect) {
    case 'cash': {
      const e = effectOf('cash');
      detail = rangeInt(w.rng, e.min, e.max);
      p.cash += detail;
      break;
    }
    case 'unit': {
      const type = freeUnitType(w, u.owner);
      spawnUnit(w, type, u.owner, u.cx, u.cy);
      detail = type;
      break;
    }
    case 'heal': {
      const r = effectOf('heal').radius;
      for (const e of w.entities.all()) {
        if (e.dead || e.kind !== 'unit' || e.owner !== u.owner || e.inside) continue;
        if (Math.max(Math.abs(e.cx - u.cx), Math.abs(e.cy - u.cy)) <= r) e.hp = e.maxHp;
      }
      break;
    }
    case 'reveal': revealAll(w, p.team); break;
    case 'armor': u.armorK = Math.round(effectOf('armor').factor * 1000); break;
    case 'speed': u.speedK = Math.round(effectOf('speed').factor * 1000); break;
    case 'explode':
      w.spatial.rebuild(w.entities.all());
      detonate(w, { weapon: 'crateBomb', tx: u.cx * L + L / 2, ty: u.cy * L + L / 2, target: u.id, direct: true, shooter: 0, owner: -1 });
      break;
    default: break;
  }
  w.events.emit('crateCollected', w.tick, { owner: u.owner, x: u.cx, y: u.cy, effect, detail });
}
