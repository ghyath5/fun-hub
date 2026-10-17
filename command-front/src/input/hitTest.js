// @ts-check
/**
 * Hit testing under a finger (section 15). Pure: callers pass candidates in
 * screen px. Every hit area is at least 44 px across whatever the zoom.
 * Priority with a selection: valid context targets, enemies, own units,
 * structures, then ground. Without: own units, structures, enemies, ground.
 * Ties go to the nearest centre; tapping the same spot again within 600 ms
 * cycles to the next candidate underneath.
 */
import { GESTURE } from '../data/ui.js';

/** @typedef {'context' | 'enemy' | 'own' | 'structure'} HitClass */
/**
 * Circle candidates (units) use r; footprint candidates (structures) also
 * carry their screen rect, and a finger anywhere inside it hits.
 * @typedef {{ id: number, x: number, y: number, r: number, cls: HitClass, rect?: { x0: number, y0: number, x1: number, y1: number } }} Candidate
 */

const ORDER_WITH = ['context', 'enemy', 'own', 'structure'];
const ORDER_WITHOUT = ['own', 'structure', 'enemy', 'context'];

/**
 * Everything under (px, py), best first.
 * @param {Candidate[]} candidates @param {number} px @param {number} py @param {boolean} hasSelection
 */
export function hitsAt(candidates, px, py, hasSelection) {
  const order = hasSelection ? ORDER_WITH : ORDER_WITHOUT;
  const minR = GESTURE.minHitPx / 2;
  return candidates
    .map((c) => ({ c, d2: (c.x - px) ** 2 + (c.y - py) ** 2, r: Math.max(minR, c.r) }))
    .filter((h) => h.d2 <= h.r * h.r || (h.c.rect && px >= h.c.rect.x0 && px <= h.c.rect.x1 && py >= h.c.rect.y0 && py <= h.c.rect.y1))
    .sort((a, b) => order.indexOf(a.c.cls) - order.indexOf(b.c.cls) || a.d2 - b.d2 || a.c.id - b.c.id)
    .map((h) => h.c);
}

/** Remembers the last tap so a repeat tap on the same spot picks the next candidate. */
export function createCycler() {
  /** @type {{ x: number, y: number, t: number, key: string, index: number } | null} */
  let last = null;
  return {
    /**
     * @param {Candidate[]} hits  Result of hitsAt
     * @param {number} x @param {number} y @param {number} t ms
     * @returns {Candidate | null}
     */
    pick(hits, x, y, t) {
      if (hits.length === 0) { last = null; return null; }
      const key = hits.map((h) => h.id).join(',');
      const again = last && t - last.t <= GESTURE.cycleTapMs && Math.hypot(x - last.x, y - last.y) < GESTURE.moveTolerancePx && last.key === key;
      const index = again && last ? (last.index + 1) % hits.length : 0;
      last = { x, y, t, key, index };
      return hits[index];
    },
    reset() { last = null; },
  };
}
