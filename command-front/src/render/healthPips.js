// @ts-check
/**
 * Red Alert 2 style health bars: a dark frame holding a row of small pips,
 * lit green, yellow or red by health band, the lost ones left dark. Shared
 * by the 2D and 3D views, for units and structures.
 */
import { healthBand } from '../sim/formulas/combat.js';

export const BAND_COLOR = Object.freeze({ green: 0x6fe04a, amber: 0xf0c83a, red: 0xe04a32 });
const FRAME = 0x0b0c08;
const EMPTY = 0x2a2d22;
/** World px per pip (pip plus gap) at full zoom; bars get at least MIN_PIPS. */
const PIP_STEP = 3;
const MIN_PIPS = 5;
const MAX_PIPS = 24;

/**
 * @param {import('pixi.js').Graphics} g
 * @param {number} x  left edge, world px
 * @param {number} y  top edge, world px
 * @param {number} w  bar width, world px
 * @param {number} h  pip height, world px (already corrected for the view's squash)
 * @param {number} hp @param {number} maxHp
 */
export function drawPips(g, x, y, w, h, hp, maxHp) {
  const n = Math.max(MIN_PIPS, Math.min(MAX_PIPS, Math.round(w / PIP_STEP)));
  const step = w / n;
  const gap = Math.min(step * 0.3, 0.9);
  const lit = hp <= 0 ? 0 : Math.max(1, Math.ceil((n * hp) / maxHp - 1e-6));
  const color = BAND_COLOR[healthBand(hp, maxHp)];
  const pad = Math.max(0.6, h * 0.25);
  g.rect(x - pad, y - pad, w + pad * 2 - gap, h + pad * 2).fill({ color: FRAME, alpha: 0.85 });
  // One path per colour: the lit pips, then the dark ones.
  for (let i = 0; i < lit; i++) g.rect(x + i * step, y, step - gap, h);
  if (lit) g.fill(color);
  for (let i = lit; i < n; i++) g.rect(x + i * step, y, step - gap, h);
  if (lit < n) g.fill(EMPTY);
}
