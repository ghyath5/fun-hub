// @ts-check
/**
 * Submarines (section 10): Submerged (invisible and untargetable unless
 * detected; only Depth Charges reach it) → Surfacing (1 s, before a
 * torpedo) → Surfaced (any G or N weapon can hit it) → Submerging (1 s,
 * starting 4 s after its last shot) → Submerged. Run at the start of system 7
 * so a submarine that wants to shoot surfaces first.
 */
import { SUBMARINE } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { ticks } from '../core/fixed.js';

/** @typedef {import('./world.js').World} World */

const SURFACE_TICKS = ticks(SUBMARINE.surfaceSeconds);
const SUBMERGE_TICKS = ticks(SUBMARINE.submergeSeconds);
const DELAY_TICKS = ticks(SUBMARINE.submergeDelaySeconds);

export const isSubmarine = (/** @type {any} */ u) => u.kind === 'unit' && UNITS[u.type].tags.includes('submarine');

/** Fresh state for a new submarine (it starts submerged). */
export const newSubState = () => ({ state: 'submerged', until: 0, lastShot: -1e9 });

/** May this submarine fire right now? @param {any} u */
export const subReady = (u) => !u.sub || u.sub.state === 'surfaced';

/** Advance one submarine's dive cycle. @param {World} w @param {any} u @param {boolean} wantsToFire */
export function stepSubmarine(w, u, wantsToFire) {
  const s = (u.sub ??= newSubState());
  switch (s.state) {
    case 'submerged':
      if (wantsToFire) { s.state = 'surfacing'; s.until = w.tick + SURFACE_TICKS; }
      break;
    case 'surfacing':
      if (w.tick >= s.until) { s.state = 'surfaced'; s.lastShot = Math.max(s.lastShot, w.tick); }
      break;
    case 'surfaced':
      if (w.tick - s.lastShot >= DELAY_TICKS && !wantsToFire) { s.state = 'submerging'; s.until = w.tick + SUBMERGE_TICKS; }
      break;
    case 'submerging':
      if (w.tick >= s.until) s.state = 'submerged';
      break;
    default:
      s.state = 'submerged';
  }
  u.submerged = s.state === 'submerged';
}
