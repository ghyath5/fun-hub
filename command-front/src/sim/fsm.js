// @ts-check
/**
 * Hand-written state machines for the sim (section 2): a table of state →
 * handler. A handler returns the next state; the machine may take a few
 * transitions in one tick so a decision never waits a tick for no reason.
 * Real-time state-machine libraries are not allowed inside the sim.
 */

/**
 * @template S
 * @param {Record<string, (w: any, e: any, s: S) => string>} table
 * @param {number} [maxSteps]
 */
export function createFsm(table, maxSteps = 3) {
  return {
    /**
     * Run the machine stored at `holder.state`.
     * @param {any} w @param {any} e @param {S & { state: string }} holder
     */
    step(w, e, holder) {
      for (let k = 0; k < maxSteps; k++) {
        const fn = table[holder.state];
        if (!fn) throw new Error(`No handler for state ${holder.state}`);
        const next = fn(w, e, holder);
        if (next === holder.state) return;
        holder.state = next;
      }
    },
    states: Object.keys(table),
  };
}
