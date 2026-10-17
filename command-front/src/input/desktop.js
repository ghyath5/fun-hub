// @ts-check
/**
 * Desktop extras (section 14): hotkeys and edge panning. Mouse select, box
 * and right-click orders come through the gesture recognizer like touch.
 */

const EDGE_PX = 8;
const EDGE_SPEED_PX_PER_S = 900;

/**
 * @param {{
 *   canvas: HTMLElement,
 *   viewport: import('pixi-viewport').Viewport,
 *   groups: { recall: (n: number) => void, assign: (n: number) => void, centre: (n: number) => void },
 *   commands: { stop: () => void, scatter: () => void, deselect: () => void, escape?: () => boolean, hotkey?: (key: string) => boolean },
 *   hover?: (x: number, y: number) => void,
 * }} opts
 */
export function attachDesktop({ canvas, viewport, groups, commands, hover }) {
  /** @type {{ x: number, y: number } | null} */
  let mouse = null;
  /** @type {Record<number, number>} */
  const lastGroupKey = {};

  const onMove = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (e.buttons === 0) hover?.(mouse.x, mouse.y);
  };
  const onLeave = () => { mouse = null; };

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
  canvas.addEventListener('pointerleave', onLeave);
  window.addEventListener('keydown', onKey);

  return {
    /** Pan when the mouse rests at a screen edge. Call once per frame. @param {number} dtMs */
    update(dtMs) {
      if (!mouse) return;
      const r = canvas.getBoundingClientRect();
      const dx = mouse.x < EDGE_PX ? -1 : mouse.x > r.width - EDGE_PX ? 1 : 0;
      const dy = mouse.y < EDGE_PX ? -1 : mouse.y > r.height - EDGE_PX ? 1 : 0;
      if (!dx && !dy) return;
      const step = (EDGE_SPEED_PX_PER_S * dtMs) / 1000 / viewport.scale.x;
      viewport.moveCenter(viewport.center.x + dx * step, viewport.center.y + dy * step);
      viewport.plugins.get('clamp')?.update();
    },
    detach() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
    },
  };
}
