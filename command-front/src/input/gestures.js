// @ts-check
/**
 * Gesture recognizer (section 15). Turns raw pointer events into gestures:
 * tap, doubleTap, longPress (fires while held), radial (long-press lifted
 * without moving), boxStart / boxMove / boxEnd, panStart / panMove / panEnd,
 * pinchStart / pinchMove / pinchEnd (midpoint and finger spread), secondary
 * (right click).
 *
 * The recognizer is a plain state machine over `{ id, x, y, t }` samples so it
 * can be tested without a DOM; `attachGestures` wires it to an element.
 * The camera input (src/input/cameraInput.js) turns pan and pinch gestures
 * into camera moves; reporting them here means nothing else can mistake a
 * pan for a tap.
 */
import { GESTURE } from '../data/ui.js';

/**
 * @typedef {{ type: string, x: number, y: number, x0?: number, y0?: number, t: number, d?: number, mouse?: boolean }} Gesture  d: finger spread (pinch)
 * @typedef {{ id: number, x: number, y: number, t: number, h?: number, mouse?: boolean }} Sample  t: input time; h: when it was handled (defaults to t)
 */

/** @param {(g: Gesture) => void} emit @param {typeof GESTURE} [opts] */
export function createRecognizer(emit, opts = GESTURE) {
  /** @type {Map<number, { x0: number, y0: number, x: number, y: number, t0: number, h0: number }>} */
  const pointers = new Map();
  /** 'idle' | 'pending' | 'drag' | 'longPress' | 'box' | 'pinch' | 'afterPinch' */
  let state = 'idle';
  let primary = -1;
  /** @type {{ x: number, y: number, t: number } | null} */
  let lastTap = null;
  /** A mouse drag box-selects (desktop); a finger drag pans. */
  let mouse = false; // set per touch from Sample.mouse

  const moved = (/** @type {{x0: number, y0: number, x: number, y: number}} */ p) => Math.hypot(p.x - p.x0, p.y - p.y0);
  /** Midpoint and spread of the two fingers. */
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  function reset() {
    pointers.clear();
    state = 'idle';
    primary = -1;
  }

  return {
    /** @param {Sample} s */
    down(s) {
      if (pointers.size >= 2) return; // a third finger is ignored
      pointers.set(s.id, { x0: s.x, y0: s.y, x: s.x, y: s.y, t0: s.t, h0: s.h ?? s.t });
      if (pointers.size === 1) {
        primary = s.id;
        state = 'pending';
        mouse = !!s.mouse;
        return;
      }
      // Second finger: whatever the first was doing becomes a pinch.
      if (state === 'box') {
        const p = pointers.get(primary);
        emit({ type: 'boxCancel', x: p?.x ?? s.x, y: p?.y ?? s.y, t: s.t });
      }
      if (state === 'drag') emit({ type: 'panEnd', x: s.x, y: s.y, t: s.t });
      state = 'pinch';
      emit({ type: 'pinchStart', ...spread(), t: s.t });
    },

    /** @param {Sample} s */
    move(s) {
      const p = pointers.get(s.id);
      if (!p) return;
      p.x = s.x;
      p.y = s.y;
      if (state === 'pinch') {
        if (pointers.size === 2) emit({ type: 'pinchMove', ...spread(), t: s.t });
        return;
      }
      if (s.id !== primary) return;
      if (state === 'pending' && moved(p) >= opts.moveTolerancePx && mouse) {
        state = 'box';
        emit({ type: 'boxStart', x: p.x, y: p.y, x0: p.x0, y0: p.y0, t: s.t });
      } else if (state === 'pending' && moved(p) >= opts.moveTolerancePx) {
        state = 'drag';
        emit({ type: 'panStart', x: p.x0, y: p.y0, t: s.t });
      } else if (state === 'longPress' && moved(p) >= opts.moveTolerancePx) {
        state = 'box';
        emit({ type: 'boxStart', x: p.x, y: p.y, x0: p.x0, y0: p.y0, t: s.t });
      } else if (state === 'box') {
        emit({ type: 'boxMove', x: p.x, y: p.y, x0: p.x0, y0: p.y0, t: s.t });
      } else if (state === 'drag' || state === 'afterPinch') {
        emit({ type: 'panMove', x: p.x, y: p.y, x0: p.x0, y0: p.y0, t: s.t });
      }
    },

    /** @param {Sample} s */
    up(s) {
      const p = pointers.get(s.id);
      if (!p) return;
      pointers.delete(s.id);
      if (state === 'pinch') {
        if (pointers.size === 0) {
          state = 'idle';
          emit({ type: 'pinchEnd', x: s.x, y: s.y, t: s.t });
        } else {
          // The remaining finger keeps panning and can never become a tap.
          primary = /** @type {number} */ (pointers.keys().next().value);
          state = 'afterPinch';
          emit({ type: 'pinchEnd', x: s.x, y: s.y, t: s.t });
        }
        return;
      }
      if (s.id !== primary) return;
      const dt = s.t - p.t0;
      const far = moved(p) >= opts.moveTolerancePx;
      if (state === 'pending' && !far && dt < opts.tapMs) {
        emit({ type: 'tap', x: p.x0, y: p.y0, t: s.t });
        if (lastTap && s.t - lastTap.t <= opts.doubleTapMs && Math.hypot(p.x0 - lastTap.x, p.y0 - lastTap.y) <= opts.doubleTapPx) {
          emit({ type: 'doubleTap', x: p.x0, y: p.y0, t: s.t });
          lastTap = null;
        } else {
          lastTap = { x: p.x0, y: p.y0, t: s.t };
        }
      } else if (state === 'longPress') {
        emit({ type: 'radial', x: p.x, y: p.y, t: s.t });
      } else if (state === 'box') {
        emit({ type: 'boxEnd', x: p.x, y: p.y, x0: p.x0, y0: p.y0, t: s.t });
      } else if (state === 'drag' || state === 'afterPinch') {
        emit({ type: 'panEnd', x: p.x, y: p.y, t: s.t });
      }
      if (pointers.size === 0) state = 'idle';
    },

    /** Call every frame (and on events) so a held finger fires long-press on time. @param {number} now */
    update(now) {
      if (state !== 'pending') return;
      const p = pointers.get(primary);
      // Long-press counts from when the touch was handled, so a stale timestamp cannot fire it early.
      if (p && now - p.h0 >= opts.longPressMs && moved(p) < opts.moveTolerancePx) {
        state = 'longPress';
        emit({ type: 'longPress', x: p.x, y: p.y, t: now });
      }
    },

    /** pointercancel, visibilitychange: drop every gesture in progress without acting. */
    cancel() {
      if (state === 'box') emit({ type: 'boxCancel', x: 0, y: 0, t: 0 });
      if (state !== 'idle') emit({ type: 'cancel', x: 0, y: 0, t: 0 });
      reset();
      lastTap = null;
    },

    get state() { return state; },
    /** Pointers currently held. */
    get active() { return pointers.size; },
  };
}

/**
 * Wire a recognizer to an element's pointer events. Coordinates are CSS px
 * relative to the element. Only touches that start on this element reach it.
 * @param {HTMLElement} el
 * @param {(g: Gesture) => void} emit
 * @param {{ dragIsBox?: () => boolean }} [opts]  Select mode: a finger drag box-selects like a mouse drag
 */
export function attachGestures(el, emit, opts = {}) {
  const rec = createRecognizer(emit);
  /**
   * When the input happened: the event's own timestamp, so a busy frame cannot
   * stretch a tap into a long-press — unless it is on a different clock
   * (some synthetic events), then the time it was handled.
   */
  const when = (/** @type {Event} */ e) => {
    const now = performance.now();
    return e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
  };
  const sample = (/** @type {PointerEvent} */ e) => {
    const r = el.getBoundingClientRect();
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, t: when(e), h: performance.now(), mouse: e.pointerType === 'mouse' || !!opts.dragIsBox?.() };
  };
  /**
   * Right or middle mouse button held: a drag past a few pixels pans the map
   * (with the button that started it); a right click that never moved is an order.
   * @type {{ button: number, x0: number, y0: number, panning: boolean } | null}
   */
  let mouseDrag = null;
  const MOUSE_DRAG_PX = 6;
  const mouseDown = (/** @type {PointerEvent} */ e) => {
    const s = sample(e);
    mouseDrag = { button: e.button, x0: s.x, y0: s.y, panning: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const mouseMove = (/** @type {PointerEvent} */ e) => {
    if (!mouseDrag) return false;
    const s = sample(e);
    if (!mouseDrag.panning && Math.hypot(s.x - mouseDrag.x0, s.y - mouseDrag.y0) >= MOUSE_DRAG_PX) {
      mouseDrag.panning = true;
      emit({ type: 'panStart', x: s.x, y: s.y, x0: mouseDrag.x0, y0: mouseDrag.y0, t: s.t, mouse: true });
    }
    if (mouseDrag.panning) emit({ type: 'panMove', x: s.x, y: s.y, t: s.t, mouse: true });
    return true;
  };
  const mouseUp = (/** @type {PointerEvent} */ e) => {
    if (!mouseDrag || e.button !== mouseDrag.button) return false;
    const s = sample(e);
    if (mouseDrag.panning) emit({ type: 'panEnd', x: s.x, y: s.y, t: s.t, mouse: true });
    else if (mouseDrag.button === 2) emit({ type: 'secondary', x: mouseDrag.x0, y: mouseDrag.y0, t: s.t });
    mouseDrag = null;
    return true;
  };
  /** @type {[string, (e: any) => void][]} */
  const handlers = [
    ['pointerdown', (e) => {
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) { e.preventDefault(); mouseDown(e); return; }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      rec.down(sample(e));
    }],
    ['pointermove', (e) => { if (!mouseMove(e)) rec.move(sample(e)); }],
    ['pointerup', (e) => { if (!mouseUp(e)) rec.up(sample(e)); }],
    ['pointercancel', () => { mouseDrag = null; rec.cancel(); }],
    ['auxclick', (e) => e.preventDefault()],
    ['contextmenu', (e) => e.preventDefault()],
  ];
  for (const [type, fn] of handlers) el.addEventListener(type, fn);
  const onHidden = () => { if (document.hidden) rec.cancel(); };
  document.addEventListener('visibilitychange', onHidden);
  let raf = 0;
  const tick = () => { rec.update(performance.now()); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  return {
    recognizer: rec,
    detach() {
      for (const [type, fn] of handlers) el.removeEventListener(type, fn);
      document.removeEventListener('visibilitychange', onHidden);
      cancelAnimationFrame(raf);
    },
  };
}
