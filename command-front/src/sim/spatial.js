// @ts-check
/**
 * Spatial hash for range queries (section 19), rebuilt once per tick from
 * entity positions. Buckets are 4×4 cells; results come back in ascending id
 * order so every query is deterministic.
 */
import { SIM } from '../data/rules.js';

const BUCKET_CELLS = 4;
const BUCKET = BUCKET_CELLS * SIM.leptonsPerCell;

/** @param {number} widthCells @param {number} heightCells */
export function createSpatial(widthCells, heightCells) {
  const bw = Math.ceil(widthCells / BUCKET_CELLS);
  const bh = Math.ceil(heightCells / BUCKET_CELLS);
  /** @type {any[][]} */
  const buckets = Array.from({ length: bw * bh }, () => []);

  return {
    /** @param {Iterable<any>} entities */
    rebuild(entities) {
      for (const b of buckets) b.length = 0;
      for (const e of entities) {
        if (e.dead || e.inside) continue;
        const bx = Math.min(bw - 1, Math.max(0, Math.floor(e.x / BUCKET)));
        const by = Math.min(bh - 1, Math.max(0, Math.floor(e.y / BUCKET)));
        buckets[by * bw + bx].push(e);
      }
    },
    /**
     * Entities whose centre is within r leptons of (x, y), ascending id.
     * @param {number} x @param {number} y @param {number} r
     */
    near(x, y, r) {
      const out = [];
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor((x - r) / BUCKET));
      const x1 = Math.min(bw - 1, Math.floor((x + r) / BUCKET));
      const y0 = Math.max(0, Math.floor((y - r) / BUCKET));
      const y1 = Math.min(bh - 1, Math.floor((y + r) / BUCKET));
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          for (const e of buckets[by * bw + bx]) {
            const dx = e.x - x;
            const dy = e.y - y;
            if (dx * dx + dy * dy <= r2) out.push(e);
          }
        }
      }
      out.sort((a, b) => a.id - b.id);
      return out;
    },
  };
}
