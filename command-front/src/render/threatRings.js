// @ts-check
/**
 * Rings on the ground where the base is under attack (src/ui/threats.js): a
 * steady ring round the spot and one that keeps spreading out from it, red
 * for the base and amber for a harvester, so the fight is found at a glance
 * at any zoom. Either view adds the layer over its units.
 */
import { Graphics } from 'pixi.js';
import { RENDER } from '../data/rules.js';
import { THREATS } from '../data/ui.js';

const C = RENDER.cellPx;
const COLOR = { base: 0xff3b2f, harvester: 0xffa63a };
/** One spread of the outer ring, ms. */
const PULSE_MS = 1000;

export function createThreatRings() {
  const g = new Graphics();
  return {
    layer: g,
    /**
     * @param {readonly import('../ui/threats.js').Threat[]} list
     * @param {number} scale  screen px per world px
     * @param {number} now  ms, on the same clock as the threats
     */
    draw(list, scale, now) {
      g.clear();
      const w = 1 / scale;
      for (const s of list) {
        const color = COLOR[s.kind] ?? COLOR.base;
        // Fades over the last second of the hold.
        const fade = Math.min(1, (THREATS.holdMs - (now - s.last)) / 1000);
        if (fade <= 0) continue;
        const x = (s.x + 0.5) * C;
        const y = (s.y + 0.5) * C;
        // Never smaller on screen than a finger.
        const r = Math.max(1.3 * C, 22 * w);
        const p = ((now - s.first) % PULSE_MS) / PULSE_MS;
        g.circle(x, y, r).stroke({ width: 3 * w, color, alpha: 0.85 * fade });
        g.circle(x, y, r * (1 + 1.2 * p)).stroke({ width: 2.5 * w, color, alpha: (1 - p) * 0.9 * fade });
        g.circle(x, y, r).fill({ color, alpha: 0.1 * fade });
      }
    },
  };
}
