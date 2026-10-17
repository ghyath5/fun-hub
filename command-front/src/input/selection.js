// @ts-check
/**
 * The human player's selection and control groups. UI state, not sim state:
 * it never travels in a command except as the list of ids a command names.
 */
import { LAYOUT } from '../data/ui.js';

export function createSelection() {
  /** @type {Set<number>} */
  let ids = new Set();
  /** @type {Set<number>[]} */
  const groups = Array.from({ length: LAYOUT.groups }, () => new Set());
  /** @type {Set<() => void>} */
  const subs = new Set();
  const changed = () => subs.forEach((fn) => fn());

  return {
    get ids() { return ids; },
    get size() { return ids.size; },
    has: (/** @type {number} */ id) => ids.has(id),
    /** Ids in ascending order, as commands expect. */
    list: () => [...ids].sort((a, b) => a - b),
    /** Replace the selection. @param {Iterable<number>} next */
    set(next) {
      ids = new Set(next);
      changed();
    },
    /** Add mode: toggle one unit in or out. @param {number} id */
    toggle(id) {
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      ids = new Set(ids);
      changed();
    },
    clear() {
      if (ids.size === 0) return;
      ids = new Set();
      changed();
    },
    /** Assign the current selection to group n; a unit belongs to at most one group. @param {number} n */
    assign(n) {
      for (const g of groups) for (const id of ids) g.delete(id);
      groups[n] = new Set(ids);
      changed();
      return groups[n].size;
    },
    /** @param {number} n */
    recall(n) {
      ids = new Set(groups[n]);
      changed();
      return ids.size;
    },
    groupSizes: () => groups.map((g) => g.size),
    /** @param {number} n */
    group: (n) => groups[n],
    /**
     * Drop ids that no longer belong (dead, captured). Returns true if anything changed.
     * @param {(id: number) => boolean} keep
     */
    prune(keep) {
      let dirty = false;
      for (const id of [...ids]) if (!keep(id)) { ids.delete(id); dirty = true; }
      for (const g of groups) for (const id of [...g]) if (!keep(id)) { g.delete(id); dirty = true; }
      if (dirty) { ids = new Set(ids); changed(); }
      return dirty;
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

/** @typedef {ReturnType<typeof createSelection>} Selection */
