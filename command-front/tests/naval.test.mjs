// Seas on the bundled maps: every base has a coast, one sea links them all,
// and a warship can sail from any base to shell any other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMap, sandbox, spawnUnit, placeStructure, order, run, invariants, TPS } from './harness.mjs';
import { BUNDLED_MAPS } from '../src/map/loader.js';
import { T } from '../src/data/terrain.js';

/** The water cell nearest a point (Chebyshev rings, then straight-line distance). */
function nearestWater(map, s) {
  for (let r = 0; r < 20; r++) {
    let best = null;
    for (let y = s.y - r; y <= s.y + r; y++) for (let x = s.x - r; x <= s.x + r; x++) {
      if (Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) !== r || x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (map.terrain[y * map.width + x] !== T.water) continue;
      const d = Math.hypot(x - s.x, y - s.y);
      if (!best || d < best.d) best = { x, y, d, r };
    }
    if (best) return best;
  }
  return null;
}

for (const id of BUNDLED_MAPS) {
  test(`${id}: every base is on the coast of one shared sea`, () => {
    const map = loadMap(id);
    const w = sandbox({ map });
    const seas = new Set();
    for (const s of map.starts) {
      const c = nearestWater(map, s);
      assert.ok(c && c.r <= 8, `start ${s.x},${s.y}: water ${c?.r} cells away`);
      seas.add(w.nav.component('float', c.x, c.y));
    }
    assert.equal(seas.size, 1, 'one sea reaches every base');
  });

  test(`${id}: a Gunboat sails from each base and shells every other base from the water`, () => {
    const map = loadMap(id);
    for (let a = 0; a < map.starts.length; a++) {
      for (let b = 0; b < map.starts.length; b++) {
        if (a === b) continue;
        const w = sandbox({ map, seed: a * 7 + b });
        const from = nearestWater(map, map.starts[a]);
        const to = map.starts[b];
        const yard = placeStructure(w, 'constructionYard', 1, to.x - 1, to.y - 1, { buildUp: false });
        assert.ok(yard, `a yard at start ${b}`);
        const boat = spawnUnit(w, 'gunboat', 0, from.x, from.y);
        assert.ok(boat, `a gunboat off start ${a}`);
        order(w, 0, 'attack', [boat.id], { id: yard.id });
        let hit = -1;
        for (let t = 0; t < 6 * 60 * TPS && hit < 0; t++) {
          assert.equal(run(w, 1, invariants), null);
          if (yard.hp < yard.maxHp) hit = t;
        }
        assert.ok(hit >= 0, `from base ${a} the gunboat reached base ${b} and hit it`);
      }
    }
  });
}
