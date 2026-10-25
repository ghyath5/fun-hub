// @ts-check
/**
 * Loading progress: anything the player waits on — the first load, starting
 * a match (renderer, 3D models, art), loading a save, opening a screen that
 * reads storage, setting up a two-phone link — reports here, and the loading
 * line (src/ui/loadingBar.js) shows it. No DOM in this file.
 *
 *   const job = startTask();  job.progress(0.4);  job.end();
 *   await track(promise);                    // a wait with no measurable progress
 *   const bytes = await fetchBytes(url);     // a download, with progress when the size is known
 */

/**
 * @typedef {object} Task
 * @property {number} weight
 * @property {number | null} fraction  0–1, or null while unmeasured
 * @property {number} started          performance.now() at the start
 */

/** @typedef {{ active: boolean, tasks: Readonly<Task>[] }} ProgressState */

/** @type {Set<Task>} */
const tasks = new Set();
/** @type {Set<(s: ProgressState) => void>} */
const listeners = new Set();

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function notify() {
  const state = { active: tasks.size > 0, tasks: [...tasks] };
  for (const fn of listeners) fn(state);
}

/**
 * Begin a piece of work the player waits on.
 * @param {{ weight?: number }} [opts]  weight: how much of the line it fills next to others (a big download counts more)
 */
export function startTask({ weight = 1 } = {}) {
  /** @type {Task} */
  const task = { weight, fraction: null, started: now() };
  tasks.add(task);
  notify();
  let ended = false;
  return {
    /** @param {number} f  0–1 */
    progress(f) {
      if (ended) return;
      task.fraction = Math.max(task.fraction ?? 0, Math.min(1, f));
      notify();
    },
    end() {
      if (ended) return;
      ended = true;
      tasks.delete(task);
      notify();
    },
  };
}

/**
 * Show a wait while a promise settles; returns the same promise.
 * @template T @param {Promise<T>} promise @param {{ weight?: number }} [opts] @returns {Promise<T>}
 */
export function track(promise, opts) {
  const job = startTask(opts);
  return promise.finally(() => job.end());
}

/**
 * Download a file as bytes, reporting progress as it arrives (when the server
 * says how big it is). Throws on an HTTP error, like a checked fetch.
 * @param {string} url @param {{ weight?: number }} [opts] @returns {Promise<ArrayBuffer>}
 */
export async function fetchBytes(url, opts) {
  const job = startTask(opts);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    // A compressed response states its compressed size, not what the stream yields: no measure then.
    const size = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
    if (!size || !res.body) return await res.arrayBuffer();
    const reader = res.body.getReader();
    const out = new Uint8Array(size);
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (got + value.length > size) return concatTail(out.subarray(0, got), value, reader); // the size was wrong (compressed): finish without it
      out.set(value, got);
      got += value.length;
      job.progress(got / size);
    }
    return got === size ? out.buffer : out.slice(0, got).buffer;
  } finally {
    job.end();
  }
}

/**
 * Finish a download whose stated size was too small: keep what came, read the rest.
 * @param {Uint8Array} head @param {Uint8Array} next @param {ReadableStreamDefaultReader<Uint8Array>} reader
 */
async function concatTail(head, next, reader) {
  const parts = [head.slice(), next];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return all.buffer;
}

/** Follow the progress; returns a function that stops. @param {(s: ProgressState) => void} fn */
export function onProgress(fn) {
  listeners.add(fn);
  fn({ active: tasks.size > 0, tasks: [...tasks] });
  return () => { listeners.delete(fn); };
}
