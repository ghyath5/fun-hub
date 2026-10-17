// @ts-check
/** Pure production rules (section 6). Integers in, integers out. */
import { PRODUCTION, SIM, POWER } from '../../data/rules.js';

/** Build-speed bonus in thousandths for n serving buildings: 1000, 1400, 1800, 2200. @param {number} n */
export function bonusPermille(n) {
  const k = Math.min(Math.max(n, 1), PRODUCTION.bonusMaxFactories);
  return 1000 + Math.round(PRODUCTION.bonusPerExtraFactory * 1000) * (k - 1);
}

/** Production speed factor in thousandths for a power ratio in thousandths. @param {number} ratioK */
export function powerFactorPermille(ratioK) {
  const lo = Math.round(POWER.minProductionFactor * 1000);
  return Math.min(1000, Math.max(lo, ratioK));
}

/**
 * Build time in ticks: ceil(cost/1000 × secondsPer1000 × 15 / bonus / powerFactor),
 * never below the minimum build time.
 * @param {number} cost
 * @param {number} servingBuildings
 * @param {number} ratioK   Power ratio in thousandths (1000 = full)
 * @param {number} [secondsPer1000]
 */
export function buildTicks(cost, servingBuildings, ratioK = 1000, secondsPer1000 = PRODUCTION.secondsPer1000) {
  const num = cost * secondsPer1000 * SIM.ticksPerSecond * 1000 * 1000; // ×1e6 cancels the two permille divisors
  const den = 1000 * bonusPermille(servingBuildings) * powerFactorPermille(ratioK);
  const t = Math.ceil(num / den - 1e-9);
  return Math.max(t, Math.round(PRODUCTION.minBuildSeconds * SIM.ticksPerSecond));
}

/**
 * Credits owed after `doneTicks` of `totalTicks`, so that charging the
 * difference each tick spends exactly `cost` in whole credits overall.
 * @param {number} cost @param {number} doneTicks @param {number} totalTicks
 */
export function spentAt(cost, doneTicks, totalTicks) {
  if (doneTicks >= totalTicks) return cost;
  return Math.floor((cost * doneTicks) / totalTicks);
}
