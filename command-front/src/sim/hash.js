// @ts-check
/**
 * State hash (FNV-1a, 32-bit) over integers, for the debug overlay and the
 * replay and save/load determinism tests.
 */

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

export function createHasher() {
  let h = OFFSET;
  const api = {
    /** @param {number} n Integer (32-bit two's complement is used) */
    int(n) {
      let v = n | 0;
      for (let k = 0; k < 4; k++) {
        h ^= v & 255;
        h = Math.imul(h, PRIME);
        v >>>= 8;
      }
      return api;
    },
    /** @param {ArrayLike<number>} arr */
    ints(arr) {
      for (let i = 0; i < arr.length; i++) api.int(arr[i]);
      return api;
    },
    /** @param {string} s */
    str(s) {
      for (let i = 0; i < s.length; i++) api.int(s.charCodeAt(i));
      return api;
    },
    /** Hex digest. */
    hex: () => (h >>> 0).toString(16).padStart(8, '0'),
  };
  return api;
}
