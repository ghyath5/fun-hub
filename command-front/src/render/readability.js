// @ts-check
/**
 * Keeping the battle readable on a small screen (both views). Zoomed out on
 * a phone a cell can be a few pixels across, and a tank or a soldier a speck.
 * So units are drawn bigger than life as cells shrink — gently, and never
 * past READABILITY.maxBoost — and team-coloured discs under units and plates
 * under buildings fade in, so who is where reads at a glance. On top of that
 * the player picks how big units and buildings are drawn (Settings → Unit
 * and building size); buildings take only part of it, to stay near their
 * footprint. Presentation only: the simulation never reads any of this.
 */
import { READABILITY } from '../data/ui.js';

let objectSize = READABILITY.defaultObjectSize;

/** The size chosen in Settings (one of READABILITY.objectSizes). @param {number} k */
export function setObjectSize(k) {
  objectSize = READABILITY.objectSizes.includes(k) ? k : READABILITY.defaultObjectSize;
}

/** How much bigger buildings are drawn for the chosen size. */
export function buildingSize() {
  return Math.min(READABILITY.maxBuildingSize, 1 + (objectSize - 1) * READABILITY.buildingShare);
}

/** @param {string} loco @returns {'infantry' | 'vehicle' | 'aircraft'} */
const classOf = (loco) => (loco === 'foot' ? 'infantry' : loco === 'air' ? 'aircraft' : 'vehicle');

/**
 * How much bigger than life a unit is drawn when a cell is `cellPx` screen px across
 * (the zoomed-out growth, times the size chosen in Settings).
 * @param {string} loco @param {number} cellPx
 */
export function unitBoost(loco, cellPx) {
  const cls = classOf(loco);
  const shrink = READABILITY.comfortCellPx[cls] / Math.max(1, cellPx);
  const zoom = shrink <= 1 ? 1 : Math.min(READABILITY.maxBoost[cls], shrink ** READABILITY.boostPower);
  return zoom * objectSize;
}

/** How strongly the team discs and plates show (0–1) when a cell is `cellPx` screen px across. @param {number} cellPx */
export function aidStrength(cellPx) {
  const { aidFromCellPx: from, aidFullCellPx: full } = READABILITY;
  const f = Math.min(1, Math.max(0, (from - cellPx) / (from - full)));
  return f * f * (3 - 2 * f);
}
