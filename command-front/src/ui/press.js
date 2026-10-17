// @ts-check
/**
 * Tap / double-tap / long-press on HUD buttons, with the same thresholds as
 * the world (section 15). The press state lives in a ref, so a HUD re-render
 * between finger-down and finger-up (production progress redraws the sidebar
 * several times a second) never loses the press.
 */
import { buzz } from '../lib/haptics.js';
import { html, useRef } from 'htm/preact';
import { GESTURE } from '../data/ui.js';

/** @typedef {{ tap?: () => void, doubleTap?: () => void, longPress?: () => void }} PressCallbacks */

/** Pointer handlers bound to a persistent state object. @param {{ on: PressCallbacks }} box */
function handlersFor(box) {
  const st = { downAt: 0, x0: 0, y0: 0, timer: 0, fired: false, lastTap: 0, active: false };
  const cancel = () => { clearTimeout(st.timer); st.timer = 0; };
  return {
    onPointerDown: (/** @type {PointerEvent} */ e) => {
      e.stopPropagation();
      st.downAt = performance.now();
      st.x0 = e.clientX; st.y0 = e.clientY;
      st.fired = false;
      st.active = true;
      cancel();
      if (box.on.longPress) {
        st.timer = /** @type {any} */ (setTimeout(() => {
          st.fired = true;
          buzz(GESTURE.hapticTickMs);
          box.on.longPress?.();
        }, GESTURE.longPressMs));
      }
    },
    onPointerMove: (/** @type {PointerEvent} */ e) => {
      if (!st.active) return;
      if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) >= GESTURE.moveTolerancePx) { cancel(); st.active = false; }
    },
    onPointerUp: () => {
      cancel();
      if (!st.active || st.fired) { st.active = false; return; }
      st.active = false;
      const now = performance.now();
      if (now - st.downAt > GESTURE.longPressMs) return;
      if (box.on.doubleTap && now - st.lastTap <= GESTURE.doubleTapMs) {
        st.lastTap = 0;
        box.on.doubleTap();
        return;
      }
      st.lastTap = now;
      box.on.tap?.();
    },
    onPointerCancel: () => { cancel(); st.active = false; },
    onContextMenu: (/** @type {Event} */ e) => e.preventDefault(),
  };
}

/**
 * Hook: stable press handlers that always call the latest callbacks.
 * @param {PressCallbacks} on
 */
export function usePress(on) {
  const ref = useRef(/** @type {{ box: { on: PressCallbacks }, h: ReturnType<typeof handlersFor> } | null} */ (null));
  if (!ref.current) {
    const box = { on };
    ref.current = { box, h: handlersFor(box) };
  }
  ref.current.box.on = on;
  return ref.current.h;
}

/**
 * A button with tap / double-tap / long-press. Extra props go to the <button>.
 * @param {PressCallbacks & { children?: any, [k: string]: any }} props
 */
export function PressButton({ tap, doubleTap, longPress, children, ...rest }) {
  const h = usePress({ tap, doubleTap, longPress });
  return html`<button ...${rest} ...${h}>${children}</button>`;
}

/** Non-hook variant for one-off handlers (state lives in the returned object). @param {PressCallbacks} on */
export const pressHandlers = (on) => handlersFor({ on });
