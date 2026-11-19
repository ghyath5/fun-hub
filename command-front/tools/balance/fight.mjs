// Balance measurements in the real engine (no formulas): equal-cost fights
// between two unit types, and how long a squad takes to knock down a building.
//
//   node tools/balance/fight.mjs duel mediumTank heavyTank [budget]
//   node tools/balance/fight.mjs siege mediumTank warFactory [budget]
import { sandbox, squad, order, run, live, placeStructure, UNITS, STRUCTURES, TPS } from '../../tests/harness.mjs';

/** Units of a type that a budget buys (at least one). @param {string} type @param {number} budget */
const countFor = (type, budget) => Math.max(1, Math.floor(budget / UNITS[type].cost));

/** Total price of what is left of some units, by health. @param {any} w @param {number[]} ids */
const valueLeft = (w, ids) => live(w, ids).reduce((a, u) => a + (UNITS[u.type].cost * u.hp) / u.maxHp, 0);

/**
 * Two equal-cost squads attack-move into each other on open ground.
 * @param {string} a @param {string} b @param {number} [budget] @param {number} [seed]
 * @returns {{ a: string, b: string, winner: string, aLeft: number, bLeft: number, seconds: number }}  aLeft/bLeft: share of their value still standing
 */
export function duel(a, b, budget = 4000, seed = 1) {
  const w = sandbox({ seed, factions: [UNITS[a].faction === 'union' ? 'union' : 'coalition', UNITS[b].faction === 'coalition' ? 'coalition' : 'union'] });
  const ids = [squad(w, 0, [a], countFor(a, budget), 14, 18, 4), squad(w, 1, [b], countFor(b, budget), 38, 18, 4)];
  const start = [valueLeft(w, ids[0]), valueLeft(w, ids[1])];
  order(w, 0, 'attackMove', ids[0], { x: 44, y: 20 });
  order(w, 1, 'attackMove', ids[1], { x: 8, y: 20 });
  let ticks = 0;
  run(w, 150 * TPS, () => {
    ticks++;
    return !live(w, ids[0]).length || !live(w, ids[1]).length ? 'done' : null;
  });
  const left = [valueLeft(w, ids[0]) / start[0], valueLeft(w, ids[1]) / start[1]];
  return { a, b, winner: left[0] > left[1] ? a : left[1] > left[0] ? b : 'draw', aLeft: +left[0].toFixed(2), bLeft: +left[1].toFixed(2), seconds: +(ticks / TPS).toFixed(1) };
}

/**
 * A squad attacks one enemy building (nothing else defends it; power plants
 * out of the way keep it running).
 * @param {string} unit @param {string} building @param {number} [budget]
 * @returns {{ unit: string, building: string, count: number, seconds: number | null, left: number }}  seconds: null when it still stands after 5 minutes; left: share of the squad's value still standing
 */
export function siege(unit, building, budget = 4000) {
  const w = sandbox({ factions: ['coalition', STRUCTURES[building].faction === 'coalition' ? 'coalition' : 'union'] });
  const s = placeStructure(w, building, 1, 30, 18, { built: true });
  for (let k = 0, drain = -(STRUCTURES[building].power ?? 0); drain > 0; k++, drain -= STRUCTURES.advPowerPlant.power) {
    placeStructure(w, 'advPowerPlant', 1, 52, 2 + 4 * k, { built: true });
  }
  const ids = squad(w, 0, [unit], countFor(unit, budget), 18, 16, 4);
  const start = valueLeft(w, ids);
  order(w, 0, 'attack', ids, { id: s.id });
  let ticks = 0;
  run(w, 300 * TPS, () => {
    ticks++;
    const e = w.entities.get(s.id);
    return !e || e.dead || !live(w, ids).length ? 'done' : null;
  });
  const e = w.entities.get(s.id);
  return { unit, building, count: ids.length, seconds: !e || e.dead ? +(ticks / TPS).toFixed(1) : null, left: +(valueLeft(w, ids) / start).toFixed(2) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, x, y, budget] = process.argv.slice(2);
  console.log(JSON.stringify(mode === 'siege' ? siege(x, y, Number(budget ?? 4000)) : duel(x, y, Number(budget ?? 4000))));
}
