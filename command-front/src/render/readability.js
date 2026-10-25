// @ts-check
/**
 * Keeping the battle readable on a small screen (both views). Zoomed out on
 * a phone a cell can be a few pixels across, and a tank or a soldier a speck.
 * So units are drawn bigger than life as cells shrink — gently, and never
 * past READABILITY.maxBoost — and team-coloured discs under units and plates
 * under buildings fade in, so who is where reads at a glance. Buildings keep
 * their size: they must fit their footprint.
 */
import { READABILITY } from '../data/ui.js';

/** @param {string} loco @returns {'infantry' | 'vehicle' | 'aircraft'} */
const classOf = (loco) => (loco === 'foot' ? 'infantry' : loco === 'air' ? 'aircraft' : 'vehicle');

/**
 * How much bigger than life a unit is drawn when a cell is `cellPx` screen px across.
 * @param {string} loco @param {number} cellPx
 */
export function unitBoost(loco, cellPx) {
  const cls = classOf(loco);
  const shrink = READABILITY.comfortCellPx[cls] / Math.max(1, cellPx);
  if (shrink <= 1) return 1;
  return Math.min(READABILITY.maxBoost[cls], shrink ** READABILITY.boostPower);
}

/** How strongly the team discs and plates show (0–1) when a cell is `cellPx` screen px across. @param {number} cellPx */
export function aidStrength(cellPx) {
  const { aidFromCellPx: from, aidFullCellPx: full } = READABILITY;
  const f = Math.min(1, Math.max(0, (from - cellPx) / (from - full)));
  return f * f * (3 - 2 * f);
}
