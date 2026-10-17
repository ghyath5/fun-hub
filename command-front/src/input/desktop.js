// @ts-check
/**
 * Desktop extras (section 14): hotkeys and hover. Mouse select, box and
 * right-click orders come through the gesture recognizer like touch; moving
 * the view (wheel, drags, arrows, screen edge) is src/input/cameraInput.js.
 */

/**
 * @param {{
 *   canvas: HTMLElement,
 *   groups: { recall: (n: number) => void, assign: (n: number) => void, centre: (n: number) => void },
 *   commands: { stop: () => void, scatter: () => void, deselect: () => void, escape?: () => boolean, hotkey?: (key: string) => boolean },
 *   hover?: (x: number, y: number) => void,
 * }} opts
 */
export function attachDesktop({ canvas, groups, commands, hover }) {
  /** @type {Record<number, number>} */
  const lastGroupKey = {};

  const onMove = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const r = canvas.getBoundingClientRect();
    hover?.(e.clientX - r.left, e.clientY - r.top);
  };

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.target instanceof HTMLInputElement) return;
    const n = Number(e.key) - 1;
    if (n >= 0 && n < 5) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        groups.assign(n);
      } else {
        const now = performance.now();
        if (now - (lastGroupKey[n] ?? 0) < 300) groups.centre(n); else groups.recall(n);
        lastGroupKey[n] = now;
      }
      return;
    }
    if (e.key === 'Escape') { if (!commands.escape?.()) commands.deselect(); }
    else if (commands.hotkey?.(e.key.toLowerCase())) e.preventDefault();
    else if (e.key === 's' || e.key === 'S') commands.stop();
    else if (e.key === 'x' || e.key === 'X') commands.scatter();
  };

  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('keydown', onKey);

  return {
    detach() {
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    },
  };
}
