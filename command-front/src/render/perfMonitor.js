// @ts-check
/**
 * Frame-time watch (section 19). For the first 2 s of a match it measures
 * the frame time: a device averaging over 20 ms is treated as low-end and
 * its resolution capped at 1.5. Afterwards, frames over 20 ms for 3 s in a
 * row halve the particle budget (down to 30%); a calm 3 s brings it back.
 */
import { PERF } from '../data/ui.js';

/**
 * @param {{ lowEnd: () => void, particles: (k: number) => void }} on
 */
export function createPerfMonitor(on) {
  let elapsed = 0;
  let sum = 0;
  let frames = 0;
  let decided = false;
  let slowFor = 0;
  let calmFor = 0;
  let budget = 1;
  const windowMs = PERF.slowFrameWindowSeconds * 1000;
  return {
    /** Call once per rendered frame with its duration. @param {number} dtMs */
    frame(dtMs) {
      const dt = Math.min(dtMs, 250);
      if (!decided) {
        elapsed += dt;
        sum += dt;
        frames++;
        if (elapsed >= PERF.benchmarkSeconds * 1000) {
          decided = true;
          if (sum / frames > PERF.slowFrameMs) on.lowEnd();
        }
        return;
      }
      if (dt > PERF.slowFrameMs) { slowFor += dt; calmFor = 0; } else { calmFor += dt; slowFor = 0; }
      if (slowFor >= windowMs && budget > 0.3) {
        budget = Math.max(0.3, budget / 2);
        on.particles(budget);
        slowFor = 0;
      } else if (calmFor >= windowMs && budget < 1) {
        budget = Math.min(1, budget * 2);
        on.particles(budget);
        calmFor = 0;
      }
    },
    get budget() { return budget; },
  };
}
