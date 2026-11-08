// @ts-check
/**
 * AI think (system 4, section 16). Each computer player looks at the game
 * every so often — its reaction time, set by its skill and never quite
 * regular, like a person's. Players start staggered by id so two AIs rarely
 * think on the same tick. Thinking only enqueues Commands; they apply at the
 * start of the next tick like a human's.
 */
import { think, createAiState, nextLook, AI_STATE_VERSION } from '../../ai/brain.js';
import { skillOf } from '../../ai/skill.js';

/** @typedef {import('../world.js').World} World */

/** A brain for a computer player (a new one when a save holds an older kind). @param {World} w @param {any} p */
function brainFor(w, p) {
  const ai = w.ai[p.id];
  if (ai && ai.v === AI_STATE_VERSION) return ai;
  w.ai[p.id] = createAiState(w, p.id, skillOf(p));
  return w.ai[p.id];
}

/** Give every computer player a brain (match setup and loading). @param {World} w */
export function installAi(w) {
  for (const p of w.players) if (!p.human) brainFor(w, p);
}

/** System 4. @param {World} w */
export function aiSystem(w) {
  for (const p of w.players) {
    if (p.human || !p.alive) continue;
    const ai = brainFor(w, p);
    if (w.tick < ai.nextThinkAt) continue;
    think(w, ai);
    ai.nextThinkAt = w.tick + nextLook(ai);
  }
}
