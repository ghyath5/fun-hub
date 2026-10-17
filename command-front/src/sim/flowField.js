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

/** Minimal binary heap of [priority, index] pairs, ties broken by index. */
function createHeap() {
  /** @type {number[]} */ const pri = [];
  /** @type {number[]} */ const idx = [];
  const less = (a, b) => pri[a] < pri[b] || (pri[a] === pri[b] && idx[a] < idx[b]);
  const swap = (a, b) => {
    [pri[a], pri[b]] = [pri[b], pri[a]];
    [idx[a], idx[b]] = [idx[b], idx[a]];
  };
  return {
    get size() { return pri.length; },
    push(p, i) {
      pri.push(p); idx.push(i);
      let k = pri.length - 1;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if (!less(k, parent)) break;
        swap(k, parent);
        k = parent;
      }
    },
    pop() {
      const top = [pri[0], idx[0]];
      const lp = /** @type {number} */ (pri.pop());
      const li = /** @type {number} */ (idx.pop());
      if (pri.length) {
        pri[0] = lp; idx[0] = li;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < pri.length && less(l, m)) m = l;
          if (r < pri.length && less(r, m)) m = r;
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
 * @param {number[][]} grid  Speed % per cell, 0 = blocked
 * @param {number} tx @param {number} ty
 */
export function computeField(grid, tx, ty) {
  const H = grid.length;
  const W = grid[0].length;
  const dist = new Float64Array(W * H).fill(Infinity);
  if (!grid[ty]?.[tx]) return { dist, W, H };
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] > 0;
  const heap = createHeap();
  dist[ty * W + tx] = 0;
  heap.push(0, ty * W + tx);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % W;
    const y = (i / W) | 0;
    // Stepping from neighbour n into (x, y) costs the cost of entering (x, y).
    const enter = cellCost(grid[y][x]);
    for (const [dx, dy] of DIR8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) continue;
      const diag = dx !== 0 && dy !== 0;
      if (diag && (!open(x, ny) || !open(nx, y))) continue;
      const nd = d + (diag ? Math.floor((enter * DIAG_PERMILLE) / 1000) : enter);
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
