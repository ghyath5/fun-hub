// @ts-check
/**
 * Fixed-step game loop (section 3). The sim ticks at the current game speed;
 * rendering runs every display frame with an interpolation alpha in [0, 1).
 */
import { SIM } from '../data/rules.js';

/**
 * @typedef {object} LoopHooks
 * @property {() => void} tick                 Advance the sim one tick
 * @property {(alpha: number, dtMs: number) => void} render
 * @property {() => number} ticksPerSecond     Current game speed
 * @property {() => boolean} [paused]
 */

/**
 * @param {LoopHooks} hooks
 * @param {{ now?: () => number, raf?: (cb: FrameRequestCallback) => number, caf?: (id: number) => void }} [env]
 */
export function createLoop(hooks, env = {}) {
  const now = env.now ?? (() => performance.now());
  const raf = env.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = env.caf ?? ((id) => cancelAnimationFrame(id));
  let acc = 0;
  let last = 0;
  let handle = 0;
  let running = false;
  let skipNext = false;

  /**
   * Run one frame given the elapsed real time. Call it from requestAnimationFrame
   * (via start) or from an external frame driver such as a PixiJS ticker.
   * @param {number} dtMs
   */
  function frame(dtMs) {
    const step = 1000 / hooks.ticksPerSecond();
    if (skipNext) {
      skipNext = false;
      dtMs = 0;
    }
    if (hooks.paused?.()) {
      acc = 0;
    } else {
      acc += dtMs;
      let n = 0;
      while (acc >= step && n < SIM.maxCatchUpTicks) {
        hooks.tick();
        acc -= step;
        n++;
      }
      if (n === SIM.maxCatchUpTicks && acc >= step) acc = 0; // drop backlog: no spiral of death
    }
    hooks.render(acc / step, dtMs);
  }

  /** @param {number} t */
  function onFrame(t) {
    if (!running) return;
    const dt = Math.min(250, t - last);
    last = t;
    frame(dt);
    handle = raf(onFrame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      acc = 0;
      last = now();
      handle = raf(onFrame);
    },
    /** Stop rendering (tab hidden). Resuming never bursts to catch up. */
    stop() {
      running = false;
      caf(handle);
    },
    frame,
    /** Forget elapsed time (after the tab was hidden), so the next frame never bursts. */
    resetClock() {
      acc = 0;
      skipNext = true;
    },
    get running() { return running; },
  };
}
