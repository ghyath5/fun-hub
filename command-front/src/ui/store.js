// @ts-check
/**
 * Tiny observable snapshot for the HUD. The game writes a new snapshot; Preact
 * components read it through `useSnapshot`. The UI never touches sim state.
 */
import { useEffect, useState } from 'htm/preact';

/** @template T @param {T} initial */
export function createStore(initial) {
  let value = initial;
  /** @type {Set<(v: T) => void>} */
  const subs = new Set();
  return {
    get: () => value,
    /** @param {Partial<T>} patch */
    set(patch) {
      value = { ...value, ...patch };
      subs.forEach((fn) => fn(value));
    },
    /** @param {(v: T) => void} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

/** @template T @param {ReturnType<typeof createStore<T>>} store @returns {T} */
export function useSnapshot(store) {
  const [v, setV] = useState(store.get());
  useEffect(() => store.subscribe(setV), [store]);
  return v;
}
