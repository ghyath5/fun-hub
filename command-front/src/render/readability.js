// @ts-check
/**
 * One scale for the whole battlefield, so units and buildings keep their
 * true proportions (a tank never looks as big as a power plant):
 *
 *   drawn size = life size × the size chosen in Settings (Unit and building
 *                size) × a gentle zoomed-out growth
 *
 * Zoomed out on a phone a cell can be a few pixels across, so everything
 * grows a little as cells shrink below READABILITY.comfortCellPx — never past
 * READABILITY.maxZoomBoost — and team-coloured discs under units fade in, so
 * who is where still reads at a glance. Buildings grow about their footprint
 * by the same scale (walls stay life size so they join up). Presentation
 * only: the simulation never reads any of this.
 */
import { READABILITY } from '../data/ui.js';

let objectSize = READABILITY.defaultObjectSize;

/** The size chosen in Settings (one of READABILITY.objectSizes). @param {number} k */
export function setObjectSize(k) {
  objectSize = READABILITY.objectSizes.includes(k) ? k : READABILITY.defaultObjectSize;
}

/** The gentle growth as the view zooms out, when a cell is `cellPx` screen px across. @param {number} cellPx */
export function zoomBoost(cellPx) {
  const shrink = READABILITY.comfortCellPx / Math.max(1, cellPx);
  return shrink <= 1 ? 1 : Math.min(READABILITY.maxZoomBoost, shrink ** READABILITY.boostPower);
}

/**
 * How much bigger than life units and buildings are drawn when a cell is
 * `cellPx` screen px across: the same for both, so their proportions hold.
 * @param {number} cellPx
 */
export function objectScale(cellPx) {
  return objectSize * zoomBoost(cellPx);
}

/** How strongly the team discs show (0–1) when a cell is `cellPx` screen px across. @param {number} cellPx */
export function aidStrength(cellPx) {
  const { aidFromCellPx: from, aidFullCellPx: full } = READABILITY;
  const f = Math.min(1, Math.max(0, (from - cellPx) / (from - full)));
  return f * f * (3 - 2 * f);
}
