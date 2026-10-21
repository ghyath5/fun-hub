// @ts-check
/**
 * Desktop extras (section 14): hotkeys and hover. Mouse select, box and
 * clicks come through the gesture recognizer like touch (left click selects
 * and orders, right click cancels and deselects, as in Red Alert 2); moving
 * the view (wheel, drags, arrows, screen edge) is src/input/cameraInput.js.
 */

/** Two presses of the same key within this many ms count as a double press. */
const DOUBLE_PRESS_MS = 300;

/**
 * @typedef {{ shift: boolean, ctrl: boolean }} Mods
 * @param {{
 *   canvas: HTMLElement,
 *   groups: { recall: (n: number) => void, assign: (n: number) => void, centre: (n: number) => void, add?: (n: number) => void },
 *   commands: { stop: () => void, scatter: () => void, deselect: () => void, escape?: () => boolean, hotkey?: (key: string, double: boolean) => boolean },
 *   hover?: (x: number, y: number, mods: Mods) => void,
 *   leave?: () => void,
 * }} opts
 */
export function attachDesktop({ canvas, groups, commands, hover, leave }) {
  /** @type {Record<string, number>} */
  const lastPress = {};
  /** Where the mouse rests, so a modifier key can refresh the cursor without moving it. */
  let at = /** @type {{ x: number, y: number } | null} */ (null);
  const mods = { shift: false, ctrl: false };

  /** Was this key pressed moments ago too? Records this press. @param {string} key */
  const doublePress = (key) => {
    const now = performance.now();
    const double = now - (lastPress[key] ?? 0) < DOUBLE_PRESS_MS;
    lastPress[key] = double ? 0 : now;
    return double;
  };

  const onMove = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const r = canvas.getBoundingClientRect();
    at = { x: e.clientX - r.left, y: e.clientY - r.top };
    mods.shift = e.shiftKey;
    mods.ctrl = e.ctrlKey || e.metaKey;
    hover?.(at.x, at.y, { ...mods });
  };
  const onLeave = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'mouse') return;
    at = null;
    leave?.();
  };
  /** Shift or Ctrl went down or up: the cursor may mean something else now. @param {KeyboardEvent} e */
  const onModifier = (e) => {
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey || e.metaKey;
    if (shift === mods.shift && ctrl === mods.ctrl) return;
    mods.shift = shift;
    mods.ctrl = ctrl;
    if (at) hover?.(at.x, at.y, { ...mods });
  };

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    onModifier(e);
    if (e.target instanceof HTMLInputElement) return;
    // e.code, so Shift+1 (which types "!") still names the digit.
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]) - 1;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) groups.assign(n);
      else if (e.altKey) groups.centre(n);
      else if (e.shiftKey && groups.add) groups.add(n);
      else if (doublePress(`group${n}`)) groups.centre(n);
      else groups.recall(n);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    const key = e.key.toLowerCase();
    if (key === 'escape') { if (!commands.escape?.()) commands.deselect(); return; }
    if (commands.hotkey?.(key, doublePress(key))) { e.preventDefault(); return; }
    if (key === 's') commands.stop();
    else if (key === 'x') commands.scatter();
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onModifier);

  return {
    detach() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onModifier);
    },
  };
}
