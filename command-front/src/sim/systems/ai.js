// @ts-check
/**
 * AI think (system 4, section 16). Each computer player thinks every
 * 2 / 1 / 0.5 s by difficulty, staggered by player id so two AIs never think
 * on the same tick. Thinking only enqueues Commands; they apply at the start
 * of the next tick like a human's.
 */
import { ticks } from '../../core/fixed.js';
import { think, createAiState } from '../../ai/brain.js';

/** @typedef {import('../world.js').World} World */

/** Give every computer player a brain (match setup and loading). @param {World} w */
export function installAi(w) {
  for (const p of w.players) {
    if (p.human || w.ai[p.id]) continue;
    w.ai[p.id] = createAiState(p.id, /** @type {any} */ (p.difficulty));
  }
}

/** System 4. @param {World} w */
export function aiSystem(w) {
  for (const p of w.players) {
    const ai = w.ai[p.id];
    if (!ai || !p.alive) continue;
    const every = Math.max(1, ticks(ai.cfg.thinkSeconds));
    if ((w.tick + p.id * 3) % every !== 0) continue;
    think(w, ai);
  }
}
