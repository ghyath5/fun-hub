// @ts-check
/**
 * Entity store. Ids are monotonic and never reused within a match, so the
 * append-only list is always in ascending id order — the only order systems
 * iterate in. Removed entities are compacted out at the end of each tick.
 */

/** @template {{ id: number, dead?: boolean }} E */
export function createStore() {
  /** @type {E[]} */
  let list = [];
  /** @type {Map<number, E>} */
  const byId = new Map();
  let nextId = 1;
  let needsCompact = false;

  return {
    /** @param {(id: number) => E} make */
    add(make) {
      const e = make(nextId++);
      list.push(e);
      byId.set(e.id, e);
      return e;
    },
    /** @param {number} id @returns {E | null} Live entity or null — dead ids resolve to null everywhere. */
    get(id) {
      const e = byId.get(id);
      return e && !e.dead ? e : null;
    },
    /** Mark dead; it disappears from iteration at compact(). @param {E} e */
    remove(e) {
      e.dead = true;
      byId.delete(e.id);
      needsCompact = true;
    },
    /** Live entities in ascending id order. Do not hold on to the array. */
    all() {
      return list;
    },
    compact() {
      if (!needsCompact) return;
      list = list.filter((e) => !e.dead);
      needsCompact = false;
    },
    get nextId() { return nextId; },
    get size() { return byId.size; },
    /** For saves. */
    snapshot() { return { nextId, list }; },
    /** Loading a save: replace everything (ids keep counting from `next`). @param {number} next @param {E[]} entities ascending id */
    restore(next, entities) {
      list = [...entities];
      byId.clear();
      for (const e of list) byId.set(e.id, e);
      nextId = next;
      needsCompact = false;
    },
  };
}
