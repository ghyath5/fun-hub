// @ts-check
/**
 * The build of the game this page is running. Two phones only play together
 * on the same build: they run the same simulation step for step, and a
 * different rule on one side breaks that.
 *
 * Must equal the number in sw.js's CACHE name; bump both together
 * (tests/build.test.mjs fails when they differ).
 */
export const BUILD = 55;

/**
 * How another phone's build compares with this one. A phone that sends no
 * build predates the check, so it is older.
 * @param {unknown} theirs
 * @returns {'same' | 'theirsOlder' | 'mineOlder'}
 */
export function compareBuild(theirs) {
  const n = Number.isInteger(theirs) ? /** @type {number} */ (theirs) : 0;
  return n === BUILD ? 'same' : n < BUILD ? 'theirsOlder' : 'mineOlder';
}
