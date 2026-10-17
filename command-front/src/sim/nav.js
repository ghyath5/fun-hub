// @ts-check
/**
 * Navigation (section 13): passability per locomotor, connected components,
 * one EasyStar instance per (team, locomotor), dynamic unit marks, and the
 * unreachable-destination fallback. Static layers change only on events
 * (structure placed or removed, tree or bridge destroyed); call `rebuild()` then.
 */
import { createPathfinder, BLOCKED } from '../lib/pathfinder.js';
import { components, speedAt } from '../map/grid.js';
import { MOVEMENT } from '../data/rules.js';

/** @typedef {import('../types.js').MapData} MapData */
/** @typedef {import('../types.js').LocomotorId} LocomotorId */

/** Ground and water locomotors that path on the grid. Air flies straight. */
export const GRID_LOCOS = /** @type {const} */ (['foot', 'wheel', 'track', 'float']);

/** Cells in spiral order around (cx, cy) out to radius r: ring by ring, nearest first within a ring, then row-major. */
export function spiral(cx, cy, r) {
  const out = [];
  for (let ring = 0; ring <= r; ring++) {
    const cells = [];
    for (let y = cy - ring; y <= cy + ring; y++) {
      for (let x = cx - ring; x <= cx + ring; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== ring) continue;
        cells.push([x, y, (x - cx) * (x - cx) + (y - cy) * (y - cy)]);
      }
    }
    cells.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (const c of cells) out.push([c[0], c[1]]);
  }
  return out;
}

/**
 * @param {MapData} map
 * @param {number[]} teams  Distinct team numbers in play
 */
export function createNav(map, teams) {
  const W = map.width;
  const H = map.height;
  /** Static blockers per cell (structures, walls). */
  const staticBlock = new Uint8Array(W * H);

  /** @type {Record<string, number[][]>} */
  const grids = {};
  /** @type {Record<string, Int32Array>} */
  const comp = {};
  /** Tile value → EasyStar tile cost. Tile value is the terrain speed %. */
  const costs = new Map();

  const tileOf = (/** @type {LocomotorId} */ loco, x, y) => {
    if (staticBlock[y * W + x]) return BLOCKED;
    return speedAt(map, loco, x, y) ?? BLOCKED;
  };

  /** Rebuild every grid; returns the cells whose tile changed (their unit marks need re-deriving). */
  function buildStatic() {
    /** @type {Set<number>} */
    const changed = new Set();
    let passChanged = false;
    for (const loco of GRID_LOCOS) {
      if (!grids[loco]) passChanged = true;
      const fresh = !grids[loco];
      const g = grids[loco] ?? Array.from({ length: H }, () => new Array(W).fill(0));
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = tileOf(loco, x, y);
          if (!fresh && g[y][x] !== t) {
            changed.add(y * W + x);
            if ((g[y][x] === BLOCKED) !== (t === BLOCKED)) passChanged = true;
          }
          g[y][x] = t;
          if (t !== BLOCKED && !costs.has(t)) costs.set(t, MOVEMENT.tileCostBase / t);
        }
      }
      grids[loco] = g;
    }
    // Components only move when a cell turns passable or blocked; ore and speed changes leave them be.
    if (passChanged) compDirty = true;
    return changed;
  }

  /** Connected components are worked out lazily: several rebuilds in one tick cost one pass. */
  let compDirty = true;
  function ensureComponents() {
    if (!compDirty) return;
    compDirty = false;
    for (const loco of GRID_LOCOS) {
      const g = grids[loco];
      comp[loco] = components(W, H, (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== BLOCKED).ids;
    }
  }
  buildStatic();
  // Every speed % the terrain table can produce, so later terrain changes never meet an unknown tile.
  for (const t of [80, 60, 70, 90, 100, 110, 120]) if (!costs.has(t)) costs.set(t, MOVEMENT.tileCostBase / t);

  /** @type {Map<string, import('../lib/pathfinder.js').Pathfinder>} */
  const finders = new Map();
  const key = (/** @type {number} */ team, /** @type {string} */ loco) => `${team}:${loco}`;
  for (const team of [...teams].sort((a, b) => a - b)) {
    for (const loco of GRID_LOCOS) {
      const pf = createPathfinder();
      pf.setGrid(grids[loco], costs);
      finders.set(key(team, loco), pf);
    }
  }

  /** Units of each team per cell (all, and infantry only), and temporary blocks per team per cell. */
  /** @type {Map<number, Uint16Array>} */
  const teamUnits = new Map(teams.map((t) => [t, new Uint16Array(W * H)]));
  /** @type {Map<number, Uint16Array>} */
  const teamInf = new Map(teams.map((t) => [t, new Uint16Array(W * H)]));
  /** @type {Map<number, Uint16Array>} */
  const tempBlocks = new Map(teams.map((t) => [t, new Uint16Array(W * H)]));
  /** @type {{ team: number, i: number, until: number }[]} */
  const expiries = [];

  /** Re-derive the EasyStar marks of one cell for every team. @param {number} i */
  function refreshMarks(i) {
    const x = i % W;
    const y = (i / W) | 0;
    for (const team of teams) {
      let others = 0;
      let otherInf = 0;
      for (const [t, arr] of teamUnits) if (t !== team) { others += arr[i]; otherInf += /** @type {Uint16Array} */ (teamInf.get(t))[i]; }
      const own = /** @type {Uint16Array} */ (teamUnits.get(team))[i];
      const blocked = /** @type {Uint16Array} */ (tempBlocks.get(team))[i] > 0;
      for (const loco of GRID_LOCOS) {
        const pf = /** @type {import('../lib/pathfinder.js').Pathfinder} */ (finders.get(key(team, loco)));
        // Every tracked unit is a crusher: enemy infantry alone never blocks its route.
        const enemy = loco === 'track' ? others - otherInf : others;
        if (blocked || enemy > 0) pf.avoid(x, y); else pf.unavoid(x, y);
        const t = grids[loco][y][x];
        if (own > 0 && t !== BLOCKED) pf.softBlock(x, y, /** @type {number} */ (costs.get(t))); else pf.softClear(x, y);
      }
    }
  }

  return {
    grids,
    /** Static passability for a locomotor. */
    passable(/** @type {LocomotorId} */ loco, x, y) {
      if (loco === 'air') return x >= 0 && y >= 0 && x < W && y < H;
      return x >= 0 && y >= 0 && x < W && y < H && grids[loco][y][x] !== BLOCKED;
    },
    /** Speed % on a cell (100 for air), or 0 when impassable. */
    speedPct(/** @type {LocomotorId} */ loco, x, y) {
      if (loco === 'air') return 100;
      return grids[loco][y][x];
    },
    /** Component id of a cell for a locomotor (-1 = impassable); air is one component. */
    component(/** @type {LocomotorId} */ loco, x, y) {
      if (loco === 'air') return 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return -1;
      ensureComponents();
      return comp[loco][y * W + x];
    },
    reachable(/** @type {LocomotorId} */ loco, fx, fy, tx, ty) {
      const a = this.component(loco, fx, fy);
      return a >= 0 && a === this.component(loco, tx, ty);
    },

    /** Is a cell covered by a structure or wall? */
    staticBlocked(x, y) {
      return staticBlock[y * W + x] === 1;
    },
    /** Mark or clear a static blocker (structure / wall) and rebuild layers. */
    setStaticBlock(x, y, on) {
      staticBlock[y * W + x] = on ? 1 : 0;
    },
    /** Re-derive one cell's tile after its ore appeared or ran out (speed changes; passability does not). @param {number} x @param {number} y */
    refreshCell(x, y) {
      for (const loco of GRID_LOCOS) grids[loco][y][x] = tileOf(loco, x, y);
      refreshMarks(y * W + x);
    },
    /** Recompute passability and components after terrain or structure events. */
    rebuild() {
      for (const i of buildStatic()) refreshMarks(i);
    },

    /** A unit of `team` now occupies cell i (count, not identity). */
    unitEnter(/** @type {number} */ team, /** @type {number} */ i, infantry = false) {
      const arr = teamUnits.get(team);
      if (!arr) return;
      arr[i]++;
      if (infantry) /** @type {Uint16Array} */ (teamInf.get(team))[i]++;
      refreshMarks(i);
    },
    unitLeave(/** @type {number} */ team, /** @type {number} */ i, infantry = false) {
      const arr = teamUnits.get(team);
      if (!arr || arr[i] === 0) return;
      arr[i]--;
      const inf = /** @type {Uint16Array} */ (teamInf.get(team));
      if (infantry && inf[i] > 0) inf[i]--;
      refreshMarks(i);
    },
    /** Does a team's pathfinder for this locomotor treat the cell as a hard block right now? */
    hardFor(/** @type {number} */ team, /** @type {number} */ i, /** @type {LocomotorId} */ loco = 'foot') {
      for (const [t, arr] of teamUnits) {
        if (t === team) continue;
        const n = loco === 'track' ? arr[i] - /** @type {Uint16Array} */ (teamInf.get(t))[i] : arr[i];
        if (n > 0) return true;
      }
      return (tempBlocks.get(team)?.[i] ?? 0) > 0;
    },
    /** Block a cell for one team's paths until `untilTick`. */
    tempBlock(/** @type {number} */ team, /** @type {number} */ i, /** @type {number} */ untilTick) {
      const arr = tempBlocks.get(team);
      if (!arr) return;
      arr[i]++;
      expiries.push({ team, i, until: untilTick });
      refreshMarks(i);
    },
    /** Per-team unit and infantry counts per cell (debugging occupancy leaks). */
    unitCounts() {
      return [...teamUnits.keys()].sort((a, b) => a - b).map((t) => ({ team: t, units: Array.from(/** @type {Uint16Array} */ (teamUnits.get(t))), inf: Array.from(/** @type {Uint16Array} */ (teamInf.get(t))) }));
    },
    /** Temporary blocks still running, for saves. */
    exportTemp() {
      return expiries.map((e) => ({ team: e.team, i: e.i, until: e.until }));
    },
    /** Re-apply saved temporary blocks (after loading). @param {{ team: number, i: number, until: number }[]} list */
    importTemp(list) {
      for (const e of list) this.tempBlock(e.team, e.i, e.until);
    },
    /** Expire temporary blocks. Call once per tick before paths are calculated. */
    expire(/** @type {number} */ tick) {
      for (let k = expiries.length - 1; k >= 0; k--) {
        const e = expiries[k];
        if (e.until > tick) continue;
        expiries.splice(k, 1);
        const arr = /** @type {Uint16Array} */ (tempBlocks.get(e.team));
        if (arr[e.i] > 0) arr[e.i]--;
        refreshMarks(e.i);
      }
    },

    /** @param {number} team @param {LocomotorId} loco */
    finder(team, loco) {
      return /** @type {import('../lib/pathfinder.js').Pathfinder} */ (finders.get(key(team, loco)));
    },
    /** Run every pathfinder's budget for this tick, in a fixed order. */
    calculate() {
      for (const pf of finders.values()) pf.calculate();
    },

    /**
     * Where a unit should actually go when asked for (tx, ty): the target when
     * reachable, else the nearest cell of its own component within 10 cells of
     * the target, else the closest cell of its component in a straight line.
     * @param {LocomotorId} loco @param {number} fx @param {number} fy @param {number} tx @param {number} ty
     */
    resolveDestination(loco, fx, fy, tx, ty) {
      const cx = Math.max(0, Math.min(W - 1, tx));
      const cy = Math.max(0, Math.min(H - 1, ty));
      const mine = this.component(loco, fx, fy);
      if (mine < 0) return { x: fx, y: fy };
      if (this.component(loco, cx, cy) === mine) return { x: cx, y: cy };
      for (const [x, y] of spiral(cx, cy, MOVEMENT.unreachableSearch)) {
        if (this.component(loco, x, y) === mine) return { x, y };
      }
      let best = { x: fx, y: fy };
      let bestD = Infinity;
      for (let i = 0; i < W * H; i++) {
        ensureComponents();
        if (comp[loco][i] !== mine) continue;
        const x = i % W;
        const y = (i / W) | 0;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
      return best;
    },
  };
}

/** @typedef {ReturnType<typeof createNav>} Nav */
