// @ts-check
/**
 * Ore growth and spread (system 11, section 5), plus terrain timers (rubble
 * returning to Clear). Every growth interval each ore cell below 12 bales
 * gains 1; then each ore cell at 9+ tries to spread into one random
 * 8-neighbour that is Clear and free of structures and walls, at most
 * max(30, 2% of ore cells) per cycle, in cell-index order. Gem cells never
 * grow on their own; ore and gem mines regrow the ground around them.
 */
import { ECONOMY, SIM } from '../../data/rules.js';
import { T } from '../../data/terrain.js';
import { DIR8 } from '../../core/fixed.js';
import { structureDef } from '../entities/structures.js';

/** @typedef {import('../world.js').World} World */

/** @param {World} w */
export function growOre(w) {
  const m = w.map;
  const W = m.width;
  let oreCells = 0;
  for (let i = 0; i < m.bales.length; i++) {
    if (m.bales[i] === 0 || m.gem[i]) continue;
    oreCells++;
    if (m.bales[i] < ECONOMY.oreCellMax) m.bales[i]++;
  }
  const cap = Math.max(ECONOMY.spreadCapAbsolute, Math.floor(oreCells * ECONOMY.spreadCapFraction));
  let spread = 0;
  const born = [];
  for (let i = 0; i < m.bales.length && spread < cap; i++) {
    if (m.gem[i] || m.bales[i] < ECONOMY.spreadMinBales) continue;
    const [dx, dy] = DIR8[w.rng.int(8)];
    const x = (i % W) + dx;
    const y = ((i / W) | 0) + dy;
    if (x < 0 || y < 0 || x >= W || y >= m.height) continue;
    const j = y * W + x;
    if (m.terrain[j] !== T.clear || m.bales[j] > 0 || w.occ.bld[j]) continue;
    born.push(j);
    spread++;
  }
  // Applied after the scan so a newborn cell cannot spread in the same cycle.
  for (const j of born) {
    m.bales[j] = 1;
    m.gem[j] = 0;
    w.nav.refreshCell(j % W, Math.floor(j / W)); // ore slows wheels and tracks
  }
  w.events.emit('oreGrew', w.tick, { spread });
}

/**
 * Ore and gem mines: each spends a budget of bales per pulse on random cells
 * around it, a clump at a time — topping up cells of its own resource below
 * the cap, or seeding empty Clear ground — so regrown ground comes back in
 * worthwhile cells rather than a scatter of single bales. Never touches a
 * cell holding the other resource or under a structure. Mines are visited in
 * id order, so both phones grow the same cells.
 * @param {World} w
 */
export function pulseMines(w) {
  const m = w.map;
  const W = m.width;
  const r = ECONOMY.mineRadius;
  const span = 2 * r + 1;
  /** @type {number[]} */
  const changed = [];
  const mines = w.entities.all()
    .filter((/** @type {any} */ e) => e.kind === 'structure' && !e.dead && structureDef(e.type).mine)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.id - b.id);
  for (const mine of mines) {
    const gem = structureDef(mine.type).mine === 'gem' ? 1 : 0;
    const max = gem ? ECONOMY.gemCellMax : ECONOMY.oreCellMax;
    let budget = ECONOMY.minePulseBales[gem ? 'gem' : 'ore'];
    for (let tries = 0; budget > 0 && tries < span * span; tries++) {
      const x = mine.cx - r + w.rng.int(span);
      const y = mine.cy - r + w.rng.int(span);
      if (x < 0 || y < 0 || x >= W || y >= m.height) continue;
      const i = y * W + x;
      if (m.terrain[i] !== T.clear || w.occ.bld[i] || m.bales[i] >= max) continue;
      if (m.bales[i] > 0 && m.gem[i] !== gem) continue;
      const fresh = m.bales[i] === 0;
      const add = Math.min(budget, max - m.bales[i], ECONOMY.mineClump[gem ? 'gem' : 'ore']);
      m.bales[i] += add;
      m.gem[i] = gem;
      budget -= add;
      if (fresh) w.nav.refreshCell(x, y); // ore slows wheels and tracks
      changed.push(i);
    }
  }
  for (const i of changed) w.events.emit('oreChanged', w.tick, { i });
}

/** System 11. @param {World} w */
export function oreSystem(w) {
  const every = Math.round(w.settings.oreGrowthSeconds * SIM.ticksPerSecond);
  if (every > 0 && w.tick > 0 && w.tick % every === 0) growOre(w);
  const mineEvery = Math.round(ECONOMY.mineSeconds * SIM.ticksPerSecond);
  if (every > 0 && w.tick > 0 && w.tick % mineEvery === 0) pulseMines(w);
  if (w.rubble.length) {
    const cleared = [];
    w.rubble = w.rubble.filter((r) => {
      if (r.until > w.tick) return true;
      if (w.map.terrain[r.i] === T.rubble) { w.map.terrain[r.i] = T.clear; cleared.push([r.i % w.map.width, (r.i / w.map.width) | 0]); }
      return false;
    });
    if (cleared.length) {
      w.nav.rebuild();
      w.events.emit('terrainChanged', w.tick, { cells: cleared });
    }
  }
}
