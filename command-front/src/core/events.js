// @ts-check
/**
 * Per-game event queue. The sim pushes events during a tick; render, UI and
 * audio drain them after it. Never a global: one queue lives on each game context.
 */

/**
 * @typedef {object} SimEvent
 * @property {string} type
 * @property {number} tick
 * @property {*} [data]
 */

export function createEventQueue() {
  /** @type {SimEvent[]} */
  let pending = [];
  /** @type {Map<string, Set<(e: SimEvent) => void>>} */
  const listeners = new Map();

  return {
    /** @param {string} type @param {number} tick @param {*} [data] */
    emit(type, tick, data) {
      pending.push({ type, tick, data });
    },
    /** @param {string} type @param {(e: SimEvent) => void} fn */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      /** @type {Set<(e: SimEvent) => void>} */ (listeners.get(type)).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    /** Deliver everything queued so far, in order, then clear. */
    flush() {
      const batch = pending;
      pending = [];
      for (const e of batch) {
        listeners.get(e.type)?.forEach((fn) => fn(e));
        listeners.get('*')?.forEach((fn) => fn(e));
      }
      return batch.length;
    },
    get size() { return pending.length; },
  };
}
