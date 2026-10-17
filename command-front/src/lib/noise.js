// @ts-check
/** simplex-noise adapter, seeded from an Rng so the same seed gives the same map. */
import { createNoise2D } from 'simplex-noise';

/**
 * @param {import('../types.js').Rng} rng
 * @returns {(x: number, y: number) => number}  Value in [-1, 1]
 */
export function createNoise(rng) {
  return createNoise2D(() => rng.float());
}
