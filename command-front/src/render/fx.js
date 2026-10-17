// @ts-check
/**
 * Order feedback (section 15): green pulse on a move destination, amber on
 * attack-move, red ring on an attack target, grey cross on a rejected order.
 * Cosmetic and real-time; never read by the sim.
 */
import { Graphics } from 'pixi.js';

const KINDS = {
  move: { color: 0x9fdc6a, ms: 450 },
  attackMove: { color: 0xe0a43a, ms: 450 },
  attack: { color: 0xd0543a, ms: 500 },
  reject: { color: 0x9a9a90, ms: 500 },
};

export function createFx() {
  const g = new Graphics();
  /** @type {{ x: number, y: number, kind: keyof typeof KINDS, t0: number }[]} */
  let items = [];
  return {
    layer: g,
    /** @param {number} x World px @param {number} y @param {keyof typeof KINDS} kind */
    pulse(x, y, kind) {
      items.push({ x, y, kind, t0: performance.now() });
    },
    /** @param {number} viewScale */
    update(viewScale) {
      const now = performance.now();
      g.clear();
      items = items.filter((it) => now - it.t0 < KINDS[it.kind].ms);
      const w = 2 / viewScale;
      for (const it of items) {
        const { color, ms } = KINDS[it.kind];
        const t = (now - it.t0) / ms;
        const a = 1 - t;
        if (it.kind === 'reject') {
          const s = 6;
          g.moveTo(it.x - s, it.y - s).lineTo(it.x + s, it.y + s).moveTo(it.x + s, it.y - s).lineTo(it.x - s, it.y + s)
            .stroke({ width: w * 1.5, color, alpha: a });
        } else {
          g.circle(it.x, it.y, 4 + t * 10).stroke({ width: w, color, alpha: a });
          if (it.kind !== 'attack') g.circle(it.x, it.y, 2).fill({ color, alpha: a });
        }
      }
    },
  };
}
