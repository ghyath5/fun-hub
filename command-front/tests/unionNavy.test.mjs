// The Union's warships: the Dreadnought shells bases far inland from the sea,
// the Sea Scorpion fights aircraft, boats and the shore, and the AI builds them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMap, sandbox, spawnUnit, placeStructure, order, run, invariants, TPS, L, UNITS } from './harness.mjs';
import { T } from '../src/data/terrain.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buildable } from '../src/map/grid.js';
import { FLEETS } from '../src/ai/buildOrders.js';

const MAP = 'duel-canyon';
const water = (map, x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.terrain[y * map.width + x] === T.water;

/** Every water cell, and each cell's straight-line distance to the nearest one. */
function seaDistance(map) {
  const cells = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (water(map, x, y)) cells.push({ x, y });
  return { cells, from: (x, y) => Math.min(...cells.map((c) => Math.hypot(c.x - x, c.y - y))) };
}

/** A 2×2 building spot about `inland` cells from the sea, and the water cell nearest it. */
function inlandSpot(map, inland) {
  const sea = seaDistance(map);
  for (let y = 2; y < map.height - 3; y++) for (let x = 2; x < map.width - 3; x++) {
    if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => buildable(map, x + dx, y + dy))) continue;
    if (Math.abs(sea.from(x + 1, y + 1) - inland) > 0.5) continue;
    const near = sea.cells.reduce((a, c) => (Math.hypot(c.x - x, c.y - y) < Math.hypot(a.x - x, a.y - y) ? c : a));
    return { x, y, near };
  }
  return null;
}

/** Union warships are Union-only naval units that need a Naval Yard. */
test('the Union has a navy of its own: Sea Scorpion and Dreadnought, built at the Naval Yard', () => {
  for (const id of ['seaScorpion', 'dreadnought']) {
    const u = UNITS[id];
    assert.equal(u.faction, 'union');
    assert.equal(u.loco, 'float');
    assert.ok(u.requires.includes('navalyard'));
  }
  assert.ok(UNITS.dreadnought.requires.includes('tech'), 'the battleship comes late');
  // Its missiles reach far inland but not right next to it.
  const m = WEAPONS.dreadnoughtMissile;
  assert.ok(m.range >= 18 && m.minRange >= 4 && m.hits.includes('G') && m.hits.includes('N'));
  // Every fleet the AI asks for is its own side's ships.
  for (const [faction, mix] of Object.entries(FLEETS)) for (const t of Object.keys(mix)) {
    assert.equal(UNITS[t].faction === 'both' ? faction : UNITS[t].faction, faction, `${t} in the ${faction} fleet`);
    assert.equal(UNITS[t].loco, 'float');
  }
});

test('a Dreadnought sails in from far out, stops at its missiles\' reach and destroys a base building', () => {
  const map = loadMap(MAP);
  const w = sandbox({ map, seed: 3 });
  const s = map.starts[1];
  const target = placeStructure(w, 'powerPlant', 1, s.x, s.y, { buildUp: false });
  // A water cell about 30 cells out, on the sea that reaches the base.
  const sea = seaDistance(map).cells;
  const shore = sea.reduce((a, c) => (Math.hypot(c.x - s.x, c.y - s.y) < Math.hypot(a.x - s.x, a.y - s.y) ? c : a));
  const from = sea.find((c) => w.nav.component('float', c.x, c.y) === w.nav.component('float', shore.x, shore.y) && Math.abs(Math.hypot(c.x - s.x, c.y - s.y) - 30) < 2);
  assert.ok(target && from, 'a base building and open sea 30 cells out');
  const ship = spawnUnit(w, 'dreadnought', 0, from.x, from.y);
  order(w, 0, 'attack', [ship.id], { id: target.id });
  let firstHit = -1;
  let closest = Infinity;
  for (let t = 0; t < 3 * 60 * TPS && !target.dead; t++) {
    assert.equal(run(w, 1, invariants), null);
    assert.ok(water(map, ship.cx, ship.cy), 'the ship stays at sea');
    const d = Math.hypot(ship.x - target.x, ship.y - target.y) / L;
    closest = Math.min(closest, d);
    if (firstHit < 0 && target.hp < target.maxHp) firstHit = d;
  }
  assert.ok(firstHit > 0, 'it hit the building');
  assert.ok(firstHit > WEAPONS.dreadnoughtMissile.range - 3, `it opened fire from ${firstHit.toFixed(1)} cells`);
  assert.ok(closest > WEAPONS.dreadnoughtMissile.range - 3, `it held off at ${closest.toFixed(1)} cells instead of sailing up to the shore`);
  assert.ok(target.dead, 'and destroyed it');
});

test('a Sea Scorpion shoots at aircraft, boats and the shore', () => {
  const map = loadMap(MAP);
  const spot = inlandSpot(map, 3);
  assert.ok(spot);
  const w = sandbox({ map, seed: 4 });
  const boat = spawnUnit(w, 'seaScorpion', 0, spot.near.x, spot.near.y);
  // On the shore, at sea and in the air, all in its reach; none of them fire back.
  const onShore = spawnUnit(w, 'heavyTank', 1, spot.x, spot.y);
  const sea = seaDistance(map).cells.filter((c) => Math.hypot(c.x - spot.near.x, c.y - spot.near.y) >= 2 && Math.hypot(c.x - spot.near.x, c.y - spot.near.y) <= 4);
  const atSea = spawnUnit(w, 'gunboat', 1, sea[0].x, sea[0].y);
  const inAir = spawnUnit(w, 'attackHeli', 1, sea.at(-1).x, sea.at(-1).y);
  for (const e of [onShore, atSea, inAir]) { assert.ok(e); e.stance = 'holdFire'; e.hp = e.maxHp = 1e6; }
  order(w, 1, 'move', [inAir.id], { x: sea.at(-1).x, y: sea.at(-1).y });
  const hurt = new Set();
  for (let t = 0; t < 60 * TPS && hurt.size < 3; t++) {
    assert.equal(run(w, 1, invariants), null);
    for (const e of [onShore, atSea, inAir]) if (e.hp < e.maxHp) hurt.add(e.type);
    // Point it at whatever it has not hit yet, as a player would.
    if (t % (5 * TPS) === 0) {
      const next = [inAir, atSea, onShore].find((e) => !hurt.has(e.type));
      if (next) order(w, 0, 'attack', [boat.id], { id: next.id });
    }
  }
  assert.deepEqual([...hurt].sort(), ['attackHeli', 'gunboat', 'heavyTank']);
});
