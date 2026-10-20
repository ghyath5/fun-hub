// @ts-check
/**
 * The camera (section 15): where the battlefield sits on screen. One plain
 * Container carries the world; this module owns its position and scale and
 * nothing else moves it. Input of every kind — a finger, two fingers, the
 * mouse, the wheel, a trackpad, the keyboard, the screen edge, the minimap —
 * ends up as one of a handful of calls here, so they all behave alike:
 *
 *   panBy(dx, dy)          the map follows the finger exactly, 1:1
 *   zoomAt(factor, sx, sy) the point under the fingers / cursor stays put
 *   fling(vx, vy)          inertia after a flick, easing out
 *   flyTo(x, y)            a short eased glide (minimap, alerts, groups)
 *
 * The HUD covers part of the screen (top bar, sidebar), so the camera keeps
 * an inset "play area": centring, homing and the edge limits all use it, and
 * every corner of the map can be scrolled into the uncovered part of the
 * screen — never left stranded under the sidebar.
 */
import { Container } from 'pixi.js';
import { RENDER } from '../data/rules.js';
import { CAMERA } from '../data/ui.js';

const C = RENDER.cellPx;

/** @typedef {{ left: number, right: number, top: number, bottom: number }} Insets */

/**
 * Keep the map edges within the play area: a map smaller than the area is
 * centred in it, a larger one cannot be scrolled past its edges.
 * @param {number} offset  screen position of the map's origin on this axis
 * @param {number} mapPx   map size on screen on this axis
 * @param {number} lo @param {number} hi  play-area bounds on this axis
 */
export function clampAxis(offset, mapPx, lo, hi) {
  const room = hi - lo;
  if (mapPx <= room) return lo + (room - mapPx) / 2;
  return Math.min(lo, Math.max(hi - mapPx, offset));
}

/**
 * @param {{ width: number, height: number }} map  in cells
 * @param {{ width: number, height: number }} screenSize  CSS px
 * @param {{ squash?: number, headroom?: number }} [opts]  squash: how much the 3D view's tilt
 *   shortens the ground vertically (sin of the camera pitch; 1 = straight down).
 *   The world containers are drawn squashed to match, so everything drawn on
 *   the ground in 2D lines up with the 3D scene. headroom: extra world px the
 *   view may scroll past the map's north edge (tall buildings rise into it).
 */
export function createCamera(map, screenSize, opts = {}) {
  const view = new Container();
  view.label = 'camera';
  /** Ground layers drawn before the 3D scene (3D renderer only); same transform as `view`. */
  const ground = new Container();
  ground.label = 'camera-ground';
  const k = opts.squash ?? 1;
  const headroom = opts.headroom ?? 0;
  const worldW = map.width * C;
  const worldH = map.height * C;
  let W = screenSize.width;
  let H = screenSize.height;
  /** @type {Insets} */
  let insets = { left: 0, right: 0, top: 0, bottom: 0 };
  let scale = 1;
  let ox = 0;
  let oy = 0;
  /** Inertia, in screen px per ms. */
  let vx = 0;
  let vy = 0;
  /** A glide in progress. @type {{ from: { x: number, y: number }, to: { x: number, y: number }, t: number, ms: number } | null} */
  let glide = null;
  /** @type {Set<() => void>} */
  const zoomWatchers = new Set();

  const area = () => ({ x0: insets.left, y0: insets.top, x1: W - insets.right, y1: H - insets.bottom });
  const areaH = () => Math.max(1, H - insets.top - insets.bottom);
  /** Zoomed right out: up to CAMERA.maxCellsVisible rows, but no point showing far more than the whole map. */
  const maxCells = () => Math.min(CAMERA.maxCellsVisible, Math.max(CAMERA.defaultCellsVisible, map.height * k + 2));
  const minScale = () => areaH() / (maxCells() * C);
  const maxScale = () => areaH() / (CAMERA.minCellsVisible * C);

  function apply() {
    const a = area();
    ox = clampAxis(ox, worldW * scale, a.x0, a.x1);
    const top = headroom * scale * k;
    oy = clampAxis(oy - top, (worldH + headroom) * scale * k, a.y0, a.y1) + top;
    view.scale.set(scale, scale * k);
    view.position.set(ox, oy);
    ground.scale.set(scale, scale * k);
    ground.position.set(ox, oy);
  }

  /** World point at the centre of the play area. */
  const centre = () => {
    const a = area();
    return { x: ((a.x0 + a.x1) / 2 - ox) / scale, y: ((a.y0 + a.y1) / 2 - oy) / (scale * k) };
  };

  /** Put world point (x, y) at the centre of the play area. @param {number} x @param {number} y */
  function centreOn(x, y) {
    const a = area();
    ox = (a.x0 + a.x1) / 2 - x * scale;
    oy = (a.y0 + a.y1) / 2 - y * scale * k;
    apply();
  }

  /** @param {number} next */
  function setScale(next, sx = (insets.left + W - insets.right) / 2, sy = (insets.top + H - insets.bottom) / 2) {
    const s = Math.min(maxScale(), Math.max(minScale(), next));
    if (s === scale) return;
    const wx = (sx - ox) / scale;
    const wy = (sy - oy) / (scale * k);
    scale = s;
    ox = sx - wx * scale;
    oy = sy - wy * scale * k;
    apply();
    for (const f of zoomWatchers) f();
  }

  return {
    /** The container the world layers are added to. */
    view,
    /** The container for ground layers under the 3D scene. */
    ground,
    /** Vertical squash of the ground (1 in 2D). */
    squash: k,
    /** Screen CSS px → world px (on the ground). @param {number} sx @param {number} sy */
    toWorld: (sx, sy) => ({ x: (sx - ox) / scale, y: (sy - oy) / (scale * k) }),
    /** World px (on the ground) → screen CSS px. @param {number} wx @param {number} wy */
    toScreen: (wx, wy) => ({ x: wx * scale + ox, y: wy * scale * k + oy }),
    /** Screen CSS px → cell. @param {number} sx @param {number} sy */
    cellAt(sx, sy) { return { x: Math.floor((sx - ox) / scale / C), y: Math.floor((sy - oy) / (scale * k) / C) }; },
    get scale() { return scale; },
    /** Screen position of the world origin, CSS px (the 3D camera follows it). */
    get origin() { return { x: ox, y: oy }; },
    /** Screen size, CSS px. */
    get screen() { return { width: W, height: H }; },
    /** World point at the centre of the play area. */
    get centre() { return centre(); },
    /** Cells visible vertically in the play area. */
    get cellsVisible() { return areaH() / scale / C; },
    /** The part of the screen the HUD leaves uncovered. */
    get area() { return area(); },

    /** Centre on a cell at the default zoom. @param {number} cx @param {number} cy */
    home(cx, cy) {
      glide = null; vx = vy = 0;
      scale = Math.min(maxScale(), Math.max(minScale(), areaH() / (CAMERA.defaultCellsVisible * C)));
      centreOn((cx + 0.5) * C, (cy + 0.5) * C);
      for (const f of zoomWatchers) f();
    },
    /** The screen changed size: keep the same centre and the same number of cells visible. @param {number} w @param {number} h */
    resize(w, h) {
      const c = centre();
      const cells = this.cellsVisible;
      W = w; H = h;
      scale = Math.min(maxScale(), Math.max(minScale(), areaH() / (cells * C)));
      centreOn(c.x, c.y);
    },
    /** The HUD's covered margins changed (sidebar collapsed, left-handed, rotated). @param {Insets} next */
    setInsets(next) {
      if (next.left === insets.left && next.right === insets.right && next.top === insets.top && next.bottom === insets.bottom) return;
      const c = centre();
      insets = { ...next };
      scale = Math.min(maxScale(), Math.max(minScale(), scale));
      centreOn(c.x, c.y);
    },
    /** Move the map by a screen distance (the finger's). Cancels any glide. @param {number} dx @param {number} dy */
    panBy(dx, dy) {
      glide = null;
      ox += dx; oy += dy;
      apply();
    },
    /** Zoom by a factor keeping screen point (sx, sy) fixed. @param {number} factor @param {number} sx @param {number} sy */
    zoomAt(factor, sx, sy) { glide = null; setScale(scale * factor, sx, sy); },
    /** One step in (+1) or out (−1) about the middle of the play area: the + and − buttons. @param {1 | -1} dir */
    zoomStep(dir) {
      const a = area();
      this.zoomAt(dir > 0 ? CAMERA.zoomButtonStep : 1 / CAMERA.zoomButtonStep, (a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2);
    },
    /** Carry on moving after a flick. @param {number} pxPerMsX @param {number} pxPerMsY */
    fling(pxPerMsX, pxPerMsY) {
      const max = CAMERA.flingMaxPxPerMs;
      vx = Math.max(-max, Math.min(max, pxPerMsX));
      vy = Math.max(-max, Math.min(max, pxPerMsY));
    },
    /** Stop any inertia or glide (a new touch). */
    halt() { vx = vy = 0; glide = null; },
    /** Glide so world point (x, y) ends at the centre of the play area. @param {number} x @param {number} y @param {number} [ms] */
    flyTo(x, y, ms = CAMERA.glideMs) {
      vx = vy = 0;
      glide = { from: centre(), to: { x, y }, t: 0, ms };
    },
    /** Advance inertia and glides. Call once per frame. @param {number} dtMs */
    update(dtMs) {
      if (glide) {
        glide.t = Math.min(glide.ms, glide.t + dtMs);
        const k = 1 - Math.pow(1 - glide.t / glide.ms, 3);
        const g = glide;
        if (g.t >= g.ms) glide = null;
        centreOn(g.from.x + (g.to.x - g.from.x) * k, g.from.y + (g.to.y - g.from.y) * k);
        return;
      }
      if (!vx && !vy) return;
      const beforeX = ox;
      const beforeY = oy;
      ox += vx * dtMs; oy += vy * dtMs;
      apply();
      // Hitting an edge stops that axis rather than sliding along it forever.
      if (Math.abs(ox - (beforeX + vx * dtMs)) > 0.5) vx = 0;
      if (Math.abs(oy - (beforeY + vy * dtMs)) > 0.5) vy = 0;
      const decay = Math.exp(-dtMs / CAMERA.flingDecayMs);
      vx *= decay; vy *= decay;
      if (Math.hypot(vx, vy) < CAMERA.flingStopPxPerMs) vx = vy = 0;
    },
    /** Called whenever the zoom changes. @param {() => void} fn */
    onZoom(fn) { zoomWatchers.add(fn); return () => zoomWatchers.delete(fn); },
    destroy() {
      zoomWatchers.clear();
      view.parent?.removeChild(view);
      view.destroy({ children: true });
      ground.parent?.removeChild(ground);
      ground.destroy({ children: true });
    },
  };
}

/** @typedef {ReturnType<typeof createCamera>} Camera */
