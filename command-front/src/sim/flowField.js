// @ts-check
/**
 * Shared flow field (section 13, optional optimisation): when 8 or more units
 * are sent to one place, a single Dijkstra field from the target replaces one
 * A* search per unit. Each unit walks the field downhill until it is near its
 * own destination; the last step or two come from a short A* request.
 * Integer costs and index tie-breaks keep it deterministic.
 */
import { DIR8 } from '../core/fixed.js';

/** Integer step cost for a terrain speed % (100% = 100). */
const cellCost = (/** @type {number} */ pct) => Math.round(10000 / pct);
const DIAG_PERMILLE = 1414;

/** Binary min-heap of cell indices keyed by integer cost; ties broken by index. Parallel typed arrays, no allocation per push. */
function createHeap(capacity) {
  let pri = new Float64Array(Math.max(16, capacity));
  let idx = new Int32Array(pri.length);
  let size = 0;
  const less = (/** @type {number} */ a, /** @type {number} */ b) => pri[a] < pri[b] || (pri[a] === pri[b] && idx[a] < idx[b]);
  const swap = (/** @type {number} */ a, /** @type {number} */ b) => {
    const p = pri[a]; pri[a] = pri[b]; pri[b] = p;
    const i = idx[a]; idx[a] = idx[b]; idx[b] = i;
  };
  return {
    get size() { return size; },
    /** Cost of the entry `pop` will return next. */
    get topPri() { return pri[0]; },
    /** @param {number} p @param {number} i */
    push(p, i) {
      if (size === pri.length) {
        const np = new Float64Array(size * 2); np.set(pri); pri = np;
        const ni = new Int32Array(size * 2); ni.set(idx); idx = ni;
      }
      pri[size] = p; idx[size] = i;
      let k = size++;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if (!less(k, parent)) break;
        swap(k, parent);
        k = parent;
      }
    },
    /** Remove the cheapest entry and return its cell index (read `topPri` first for its cost). */
    pop() {
      const top = idx[0];
      size--;
      if (size > 0) {
        pri[0] = pri[size]; idx[0] = idx[size];
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < size && less(l, m)) m = l;
          if (r < size && less(r, m)) m = r;
          if (m === k) break;
          swap(k, m);
          k = m;
        }
      }
      return top;
    },
  };
}

/**
 * Cost-to-target for every cell a locomotor can reach (Infinity elsewhere).
 * Moves follow the same rules as units: 8 directions, no corner cutting.
 * `visit` sees each cell as its cost becomes final, cheapest first; returning
 * true stops the search there (cells not yet final stay Infinity), so a
 * caller looking for the nearest something pays only for the area it searched.
 * @param {number[][]} grid  Speed % per cell, 0 = blocked
 * @param {number} tx @param {number} ty
 * @param {(i: number, d: number) => boolean | void} [visit]
 */
export function computeField(grid, tx, ty, visit) {
  const H = grid.length;
  const W = grid[0].length;
  const dist = new Float64Array(W * H).fill(Infinity);
  if (!grid[ty]?.[tx]) return { dist, W, H };
  const open = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] > 0;
  const heap = createHeap(W * 4);
  dist[ty * W + tx] = 0;
  heap.push(0, ty * W + tx);
  while (heap.size) {
    const d = heap.topPri;
    const i = heap.pop();
    if (d > dist[i]) continue;
    if (visit && visit(i, d)) {
      // Cells still queued were never finalised: report them as unknown.
      for (let k = 0; k < dist.length; k++) if (dist[k] > d) dist[k] = Infinity;
      break;
    }
    const x = i % W;
    const y = (i / W) | 0;
    // Stepping from neighbour n into (x, y) costs the cost of entering (x, y).
    const enter = cellCost(grid[y][x]);
    const diagCost = Math.floor((enter * DIAG_PERMILLE) / 1000);
    for (let k = 0; k < 8; k++) {
      const dx = DIR8[k][0];
      const dy = DIR8[k][1];
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) continue;
      const diag = dx !== 0 && dy !== 0;
      if (diag && (!open(x, ny) || !open(nx, y))) continue;
      const nd = d + (diag ? diagCost : enter);
      const n = ny * W + nx;
      if (nd < dist[n]) {
        dist[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return { dist, W, H };
}

/**
 * Walk downhill from (x, y) until within `near` cells (Chebyshev) of (gx, gy)
 * or the field bottoms out. Returns cells as a flat [x0, y0, x1, y1, …] list,
 * excluding the start cell.
 * @param {ReturnType<typeof computeField>} field
 * @param {number[][]} grid
 */
export function descend(field, grid, x, y, gx, gy, near = 2) {
  const { dist, W, H } = field;
  const open = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H && grid[cy][cx] > 0;
  const out = [];
  let cx = x;
  let cy = y;
  if (!Number.isFinite(dist[cy * W + cx])) return out;
  for (let guard = 0; guard < W * H; guard++) {
    if (Math.max(Math.abs(cx - gx), Math.abs(cy - gy)) <= near) break;
    let best = dist[cy * W + cx];
    let bx = -1;
    let by = -1;
    for (const [dx, dy] of DIR8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!open(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!open(cx, ny) || !open(nx, cy))) continue;
      const d = dist[ny * W + nx];
      if (d < best) { best = d; bx = nx; by = ny; }
    }
    if (bx < 0) break;
    cx = bx;
    cy = by;
    out.push(cx, cy);
  }
  return out;
}
