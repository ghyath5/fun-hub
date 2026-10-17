// @ts-check
/**
 * Seeded RNG adapter over seedrandom (classic script → global Math.seedrandom).
 * The sim owns one instance; cosmetics own another. Never touches Math.random:
 * `global: false` matters, because calling Math.seedrandom as a method would
 * otherwise replace Math.random.
 */

/** @typedef {import('../types.js').Rng} Rng */

function factory() {
  const sr = /** @type {any} */ (globalThis.Math).seedrandom;
  if (typeof sr !== 'function') throw new Error('seedrandom not loaded (vendor/seedrandom.min.js)');
  return sr;
}

/**
 * @param {string | number} seed
 * @param {object} [savedState]  State from a previous `rng.state()`; when given, seed is ignored
 * @returns {Rng}
 */
export function createRng(seed, savedState) {
  const sr = factory();
  const prng = savedState
    ? sr('', { state: savedState, global: false })
    : sr(String(seed), { state: true, global: false });

  return {
    int32: () => prng.int32(),
    int: (n) => (n <= 1 ? 0 : (prng.int32() >>> 0) % n),
    float: () => prng.quick(),
    state: () => prng.state(),
  };
}

/**
 * Weighted pick. Weights are integers; returns the chosen index.
 * @param {Rng} rng @param {number[]} weights
 */
export function pickWeighted(rng, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let roll = rng.int(total);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** Integer in [lo, hi] inclusive. @param {Rng} rng @param {number} lo @param {number} hi */
export const rangeInt = (rng, lo, hi) => lo + rng.int(hi - lo + 1);
