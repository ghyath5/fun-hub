// @ts-check
/**
 * Every way of moving the view, translated into camera calls.
 *
 * Touch
 *   one finger drag      the map sticks to the finger; a flick carries on
 *   two fingers          pinch zooms around the fingers and drags at once;
 *                        lifting one finger keeps panning with the other
 * Mouse and trackpad
 *   wheel                zoom towards the cursor
 *   trackpad two-finger  scroll pans; trackpad pinch zooms
 *   right or middle drag pans (a right click without a drag is an order)
 *   window edge          pans (desktop; can be switched off)
 * Keyboard
 *   arrow keys           pan; + / − zoom; Home / Space back to base
 *
 * Gestures arrive from the recognizer (src/input/gestures.js), so a pan can
 * never also be read as a tap. Wheel, keys and the edge are listened to here.
 */
import { CAMERA } from '../data/ui.js';

/** Recent finger positions, for the flick at the end of a drag. */
function createVelocityTracker() {
  /** @type {{ x: number, y: number, t: number }[]} */
  let samples = [];
  return {
    reset() { samples = []; },
    /** @param {number} x @param {number} y @param {number} t */
    add(x, y, t) {
      samples.push({ x, y, t });
      while (samples.length > 2 && t - samples[0].t > CAMERA.velocityWindowMs) samples.shift();
    },
    /** px per ms over the recent window, or zero if the finger had stopped. @param {number} now */
    velocity(now) {
      if (samples.length < 2) return { x: 0, y: 0 };
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = b.t - a.t;
      if (dt <= 0 || now - b.t > CAMERA.velocityWindowMs) return { x: 0, y: 0 };
      return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    },
  };
}

/**
 * Tell a trackpad's two-finger scroll (pan) from a mouse wheel (zoom). A
 * pinch on a trackpad arrives as a wheel event with ctrlKey set. Wheels move
 * in coarse vertical steps; trackpads send fine, often sideways, deltas.
 * Once a stream of events is judged a trackpad it stays one until it pauses.
 */
export function createWheelClassifier() {
  let trackpadUntil = 0;
  return {
    /** @param {{ deltaX: number, deltaY: number, deltaMode: number, ctrlKey: boolean }} e @param {number} now */
    kind(e, now) {
      if (e.ctrlKey) return 'zoom';
      if (e.deltaMode !== 0) return 'zoom';
      const fine = e.deltaX !== 0 || (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)) || Math.abs(e.deltaY) < 4;
      if (fine) trackpadUntil = now + 400;
      return now < trackpadUntil ? 'pan' : 'zoom';
    },
  };
}

/**
 * @param {{
 *   camera: import('../render/camera.js').Camera,
 *   canvas: HTMLElement,
 *   edgePan: () => boolean,
 *   home: () => void,
 * }} o
 */
export function createCameraInput({ camera, canvas, edgePan, home }) {
  const tracker = createVelocityTracker();
  const wheel = createWheelClassifier();
  /** Last pan point (null: the next move only re-anchors, as after a pinch). @type {{ x: number, y: number } | null} */
  let last = null;
  /** @type {{ x: number, y: number, d: number } | null} */
  let pinch = null;
  let panEnabled = true;
  /** Mouse position in the window (for edge panning), null when outside. @type {{ x: number, y: number } | null} */
  let mouse = null;
  let mouseButtons = 0;
  /** Over the battlefield itself, not over the HUD. */
  let overCanvas = false;
  /** Arrow keys held. */
  const keys = new Set();

  /** @param {import('./gestures.js').Gesture & { d?: number }} g @returns {boolean} handled */
  function handle(g) {
    switch (g.type) {
      case 'panStart':
        if (!panEnabled) return false;
        camera.halt();
        tracker.reset();
        // Anchor where the finger first touched, so the map catches up with it and then sticks to it.
        last = { x: g.x0 ?? g.x, y: g.y0 ?? g.y };
        tracker.add(last.x, last.y, g.t);
        return true;
      case 'panMove':
        if (!panEnabled) return false;
        if (last) camera.panBy(g.x - last.x, g.y - last.y);
        last = { x: g.x, y: g.y };
        tracker.add(g.x, g.y, g.t);
        return true;
      case 'panEnd': {
        if (!panEnabled) return false;
        const v = tracker.velocity(g.t);
        if (!g.mouse && Math.hypot(v.x, v.y) >= CAMERA.flingMinPxPerMs) camera.fling(v.x, v.y);
        last = null;
        return true;
      }
      case 'pinchStart':
        camera.halt();
        pinch = { x: g.x, y: g.y, d: g.d ?? 0 };
        return true;
      case 'pinchMove':
        if (pinch && g.d && pinch.d) {
          camera.panBy(g.x - pinch.x, g.y - pinch.y);
          camera.zoomAt(g.d / pinch.d, g.x, g.y);
        }
        pinch = { x: g.x, y: g.y, d: g.d ?? 0 };
        return true;
      case 'pinchEnd':
        pinch = null;
        last = null; // the finger still down re-anchors on its next move
        tracker.reset();
        return true;
      default:
        return false;
    }
  }

  const onWheel = (/** @type {WheelEvent} */ e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    camera.halt();
    if (wheel.kind(e, performance.now()) === 'pan') camera.panBy(-e.deltaX * px, -e.deltaY * px);
    else camera.zoomAt(Math.exp(-e.deltaY * px * CAMERA.wheelZoomPerPx * (e.ctrlKey ? 4 : 1)), sx, sy);
  };

  const ARROWS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key in ARROWS) { keys.add(e.key); e.preventDefault(); camera.halt(); return; }
    const a = camera.area;
    if (e.key === '+' || e.key === '=') camera.zoomAt(1.2, (a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2);
    else if (e.key === '-' || e.key === '_') camera.zoomAt(1 / 1.2, (a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2);
    else if (e.key === 'Home' || e.key === ' ') { e.preventDefault(); home(); }
  };
  const onKeyUp = (/** @type {KeyboardEvent} */ e) => { keys.delete(e.key); };
  const onBlur = () => { keys.clear(); mouse = null; };
  const onMouse = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'mouse') return;
    mouse = { x: e.clientX, y: e.clientY };
    mouseButtons = e.buttons;
    overCanvas = e.target === canvas;
  };
  const onMouseOut = (/** @type {MouseEvent} */ e) => { if (!e.relatedTarget) mouse = null; };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onMouse);
  document.addEventListener('mouseout', onMouseOut);

  return {
    handle,
    /** Stop one-finger panning (placement, box mode); pinch still zooms. @param {boolean} on */
    setPanEnabled(on) { panEnabled = on; if (!on) last = null; },
    /** Keys, the screen edge, inertia and glides. Call once per frame. @param {number} dtMs */
    update(dtMs) {
      let dx = 0;
      let dy = 0;
      for (const k of keys) { const v = ARROWS[/** @type {keyof typeof ARROWS} */ (k)]; dx += v[0]; dy += v[1]; }
      if (dx || dy) {
        const step = (CAMERA.keyPanPxPerS * dtMs) / 1000;
        camera.panBy(dx * step, dy * step);
      } else if (mouse && !mouseButtons && edgePan() && document.hasFocus()) {
        // Over the HUD (the sidebar, the pause button) only the outermost pixels count,
        // so reaching for a button near the edge does not drag the map away.
        const band = overCanvas ? CAMERA.edgePx : 2;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const ex = mouse.x < band ? 1 : mouse.x > w - 1 - band ? -1 : 0;
        const ey = mouse.y < band ? 1 : mouse.y > h - 1 - band ? -1 : 0;
        if (ex || ey) {
          const step = (CAMERA.edgePanPxPerS * dtMs) / 1000;
          camera.panBy(ex * step, ey * step);
        }
      }
      camera.update(dtMs);
    },
    detach() {
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onMouse);
      document.removeEventListener('mouseout', onMouseOut);
    },
  };
}
