// @ts-check
/**
 * Cell occupancy (section 13). Vehicles and ships take a whole cell; infantry
 * take one of 5 sub-cell spots and share a cell only with friendly infantry.
 * A unit holds its current cell and, while moving, the cell it reserved next.
 * Aircraft in flight never appear here.
 */
import { MOVEMENT } from '../data/rules.js';

const SPOTS = MOVEMENT.infantrySpots;

/** @param {number} w @param {number} h */
export function createOccupancy(w, h) {
  const n = w * h;
  /** Vehicle or ship id per cell (0 = none). */
  const veh = new Int32Array(n);
  /** Infantry id per cell spot. */
  const inf = new Int32Array(n * SPOTS);
  const infCount = new Uint8Array(n);
  /** Owner of the infantry in a cell (-1 = none). */
  const infOwner = new Int16Array(n).fill(-1);
  /** Structure (or wall) covering each cell (0 = none). */
  const bld = new Int32Array(n);

  return {
    w, h, veh, inf, infCount, infOwner, bld,

    /** @param {number} x @param {number} y */
    index: (x, y) => y * w + x,

    /** Any unit in the cell? @param {number} i */
    empty: (i) => veh[i] === 0 && infCount[i] === 0,

    /** First free spot in a cell, preferring `want`; -1 when full. @param {number} i @param {number} [want] */
    freeSpot(i, want = 0) {
      if (want >= 0 && inf[i * SPOTS + want] === 0) return want;
      for (let s = 0; s < SPOTS; s++) if (inf[i * SPOTS + s] === 0) return s;
      return -1;
    },

    /** @param {number} i @param {number} id */
    putVehicle(i, id) { veh[i] = id; },
    /** @param {number} i @param {number} id */
    takeVehicle(i, id) { if (veh[i] === id) veh[i] = 0; },

    /** @param {number} i @param {number} spot @param {number} id @param {number} owner */
    putInfantry(i, spot, id, owner) {
      if (inf[i * SPOTS + spot] !== 0) return false;
      inf[i * SPOTS + spot] = id;
      infCount[i]++;
      infOwner[i] = owner;
      return true;
    },
    /** @param {number} i @param {number} spot @param {number} id */
    takeInfantry(i, spot, id) {
      if (spot < 0 || inf[i * SPOTS + spot] !== id) return;
      inf[i * SPOTS + spot] = 0;
      infCount[i]--;
      if (infCount[i] === 0) infOwner[i] = -1;
    },

    /** Ids of every unit in a cell, vehicle first. @param {number} i */
    unitsIn(i) {
      const out = [];
      if (veh[i]) out.push(veh[i]);
      if (infCount[i]) for (let s = 0; s < SPOTS; s++) if (inf[i * SPOTS + s]) out.push(inf[i * SPOTS + s]);
      return out;
    },
  };
}

/** @typedef {ReturnType<typeof createOccupancy>} Occupancy */
