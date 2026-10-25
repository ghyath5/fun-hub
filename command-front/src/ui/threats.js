// @ts-check
/**
 * Where the base is being hit, kept as a few spots so the player can find
 * the fight: the view rings them, arrows at the screen edge point to those
 * off screen, the minimap pings them and the "!" button jumps to the latest.
 * Hits within THREATS.mergeCells of a spot join it (the spot follows the
 * latest hit); a spot fades THREATS.holdMs after its last hit. No DOM here.
 */
import { THREATS } from '../data/ui.js';

/**
 * @typedef {object} Threat
 * @property {number} id
 * @property {number} x  cell
 * @property {number} y
 * @property {'base' | 'harvester'} kind
 * @property {number} first  ms of the first hit
 * @property {number} last   ms of the latest hit
 */

/** @param {() => number} [now] ms */
export function createThreats(now = () => performance.now()) {
  /** @type {Threat[]} */
  let list = [];
  let seq = 0;
  const prune = () => {
    const t = now();
    list = list.filter((s) => t - s.last < THREATS.holdMs);
  };
  return {
    /**
     * Something of ours was hit by an enemy at this cell.
     * @param {{ x: number, y: number }} cell @param {'base' | 'harvester'} kind
     * @returns {Threat}
     */
    hit(cell, kind) {
      prune();
      const t = now();
      const near = list.find((s) => Math.max(Math.abs(s.x - cell.x), Math.abs(s.y - cell.y)) <= THREATS.mergeCells);
      if (near) {
        Object.assign(near, { x: cell.x, y: cell.y, last: t });
        if (kind === 'base') near.kind = 'base'; // the base outranks a harvester in the same place
        return near;
      }
      const s = { id: ++seq, x: cell.x, y: cell.y, kind, first: t, last: t };
      list.push(s);
      return s;
    },
    /** Spots still under attack, newest hit first. @returns {Threat[]} */
    active() {
      prune();
      return [...list].sort((a, b) => b.last - a.last);
    },
    /** The spot hit most recently, or null. */
    latest() { return this.active()[0] ?? null; },
  };
}
