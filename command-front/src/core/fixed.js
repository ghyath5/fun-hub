// @ts-check
/**
 * Integer helpers for the deterministic sim (section 2, determinism rules).
 * Data files keep human units (seconds, cells, fractions); these convert them
 * once into ticks, leptons and thousandths. Everything returned is an integer.
 */
import { SIM } from '../data/rules.js';

const TPS = SIM.ticksPerSecond;
const LEP = SIM.leptonsPerCell;

/** Seconds at Normal speed → ticks (nearest). @param {number} seconds */
export const ticks = (seconds) => Math.round(seconds * TPS);

/** Seconds → ticks, rounded up (build times, section 21). @param {number} seconds */
export const ticksCeil = (seconds) => Math.ceil(seconds * TPS - 1e-9);

/** Cells → leptons. @param {number} cells */
export const leptons = (cells) => Math.round(cells * LEP);

/** Leptons → cell index. @param {number} lep */
export const cellOf = (lep) => Math.floor(lep / LEP);

/** Centre of a cell in leptons. @param {number} cell */
export const cellCentre = (cell) => cell * LEP + (LEP >> 1);

/** Fraction → thousandths. @param {number} f */
export const permille = (f) => Math.round(f * 1000);

/** Cells per second (× terrain %) → leptons per tick. @param {number} cellsPerSecond @param {number} [pct] */
export const speedPerTick = (cellsPerSecond, pct = 100) => Math.max(1, Math.floor((cellsPerSecond * LEP * pct) / (100 * TPS)));

/** @param {number} v @param {number} lo @param {number} hi */
export const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Squared distance in leptons. @param {number} ax @param {number} ay @param {number} bx @param {number} by */
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

/** Is (ax,ay) within `cells` of (bx,by)? Integer-only comparison. */
export const withinCells = (ax, ay, bx, by, cells) => {
  const r = leptons(cells);
  return dist2(ax, ay, bx, by) <= r * r;
};

/** Integer square root (floor). @param {number} n */
export function isqrt(n) {
  if (n < 2) return n < 0 ? 0 : n;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

/** Chebyshev distance between two cells. */
export const chebyshev = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

// Half-step tangent bounds for one octant, ×65536: facing k covers ratios below BOUND[k].
// Hard-coded so facings never depend on an engine's Math.atan2.
const BOUND = [804, 2414, 4026, 5644, 7268, 8901, 10545, 12202, 13874, 15564, 17273, 19005, 20762, 22546, 24360, 26208,
  28093, 30018, 31986, 34002, 36071, 38196, 40382, 42636, 44963, 47369, 49863, 52451, 55144, 57950, 60880, 63947];

/**
 * Facing 0–255 (0 = north, clockwise) pointing along (dx, dy), y down.
 * Integer-only and identical on every engine.
 * @param {number} dx @param {number} dy
 */
export function facingOf(dx, dy) {
  if (dx === 0 && dy === 0) return 0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const swap = ax > ay;
  const lo = swap ? ay : ax;
  const hi = swap ? ax : ay;
  const ratio = Math.floor((lo * 65536) / hi);
  let k = 0;
  while (k < 32 && ratio >= BOUND[k]) k++;
  // k: steps away from the major axis, 0..32. Angle measured clockwise from north.
  // North axis (|dy| major): a = k; east axis (|dx| major): a = 64 - k.
  let a = swap ? 64 - k : k;
  if (dx >= 0 && dy <= 0) return a & 255;          // NE quadrant
  if (dx >= 0 && dy > 0) return (128 - a) & 255;   // SE
  if (dx < 0 && dy > 0) return (128 + a) & 255;    // SW
  return (256 - a) & 255;                          // NW
}

/** Signed shortest turn from facing a to b, in -128..127. */
export const facingDelta = (a, b) => (((b - a + 128) & 255) - 128);

/** Turn `from` toward `to` by at most `rate`. */
export function turnToward(from, to, rate) {
  const d = facingDelta(from, to);
  if (Math.abs(d) <= rate) return to & 255;
  return (from + (d > 0 ? rate : -rate)) & 255;
}

/** Cell step (dx, dy) for each of 8 directions, index = facing >> 5 rounded. */
export const DIR8 = Object.freeze([
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
]);
