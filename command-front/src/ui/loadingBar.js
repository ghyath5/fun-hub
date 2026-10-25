// @ts-check
/**
 * The loading line: a thin bar along the top of the screen while the game
 * makes the player wait (src/lib/progress.js says when). Measured work
 * (downloads) fills it truly; waits that cannot be measured creep toward
 * the end and never claim to be done before they are. When everything has
 * finished it runs to the end and fades. index.html shows the same element
 * before any script runs, sweeping on its own.
 */
import { onProgress } from '../lib/progress.js';

/** How the line creeps for a wait with no measure: most of the way in about this long. */
const CREEP_MS = 2500;
/** The line never shows more than this until everything has finished. */
const CAP = 0.95;
/** How long it stays full before fading (ms). */
const LINGER_MS = 250;

/** Share of the work done, from the tasks in progress. @param {readonly import('../lib/progress.js').Task[]} tasks @param {number} t */
export function fractionOf(tasks, t) {
  let w = 0;
  let done = 0;
  for (const task of tasks) {
    const creep = CAP * (1 - Math.exp(-(t - task.started) / CREEP_MS));
    done += task.weight * Math.max(task.fraction ?? 0, task.fraction === null ? creep : 0);
    w += task.weight;
  }
  return w ? Math.min(CAP, done / w) : 1;
}

/** Mount the line (taking over index.html's, if there is one). */
export function mountLoadingBar() {
  let el = /** @type {HTMLElement | null} */ (document.querySelector('.loadbar'));
  if (!el) {
    el = document.createElement('div');
    el.className = 'loadbar';
    el.append(document.createElement('i'));
    document.body.append(el);
  }
  const bar = /** @type {HTMLElement} */ (el);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  /** @type {readonly import('../lib/progress.js').Task[]} */
  let tasks = [];
  let shown = 0;
  let raf = 0;
  let fade = 0;

  const paint = (/** @type {number} */ f) => {
    bar.style.setProperty('--p', f.toFixed(3));
    bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
  };
  const frame = () => {
    raf = 0;
    if (!tasks.length) return;
    // Never runs backwards when new work joins in.
    shown = Math.max(shown, fractionOf(tasks, performance.now()));
    paint(shown);
    raf = requestAnimationFrame(frame);
  };

  const stop = onProgress((s) => {
    tasks = s.tasks;
    if (s.active) {
      clearTimeout(fade);
      if (!bar.classList.contains('on')) { shown = 0; paint(0); }
      bar.classList.remove('boot-bar');
      bar.classList.add('on');
      if (!raf) raf = requestAnimationFrame(frame);
      return;
    }
    if (!bar.classList.contains('on')) return;
    paint(1);
    clearTimeout(fade);
    fade = /** @type {any} */ (setTimeout(() => { bar.classList.remove('on'); shown = 0; }, LINGER_MS));
  });
  return {
    destroy() { stop(); cancelAnimationFrame(raf); clearTimeout(fade); bar.remove(); },
  };
}
