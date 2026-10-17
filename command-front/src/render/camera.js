// @ts-check
/**
 * Camera adapter over pixi-viewport (section 15): one-finger drag with
 * inertia, pinch zoom anchored at the midpoint, clamped to the map and to
 * 8–25 cells visible vertically. The only file that knows pixi-viewport.
 */
import { Viewport } from 'pixi-viewport';
import { RENDER } from '../data/rules.js';
import { CAMERA, GESTURE } from '../data/ui.js';

const C = RENDER.cellPx;

/**
 * @param {import('pixi.js').Application} app
 * @param {{ width: number, height: number }} map  In cells
 */
export function createCamera(app, map) {
  const worldW = map.width * C;
  const worldH = map.height * C;
  const vp = new Viewport({
    screenWidth: app.screen.width,
    screenHeight: app.screen.height,
    worldWidth: worldW,
    worldHeight: worldH,
    events: app.renderer.events,
    ticker: app.ticker,
    passiveWheel: false,
  });
  vp.drag({ pressDrag: true, wheel: false, mouseButtons: 'middle' })
    .pinch({ noDrag: false })
    .wheel({ smooth: 4 })
    .decelerate({ friction: GESTURE.panFriction })
    .clamp({ direction: 'all', underflow: 'center' })
    .clampZoom({ minHeight: CAMERA.minCellsVisible * C, maxHeight: CAMERA.maxCellsVisible * C });

  return {
    viewport: vp,
    /** Centre on a cell at the default zoom. @param {number} cx @param {number} cy */
    home(cx, cy) {
      vp.fitHeight(CAMERA.defaultCellsVisible * C, false, true, true);
      vp.moveCenter((cx + 0.5) * C, (cy + 0.5) * C);
    },
    /** Keep the same world point at screen centre across a resize. @param {number} w @param {number} h */
    resize(w, h) {
      const centre = vp.center;
      const cellsVisible = vp.worldScreenHeight / C;
      vp.resize(w, h, worldW, worldH);
      vp.fitHeight(cellsVisible * C, false, true, true);
      vp.moveCenter(centre.x, centre.y);
    },
    /** Pause one-finger panning (box select, placement). @param {boolean} on */
    setPanEnabled(on) {
      if (on) vp.plugins.resume('drag');
      else vp.plugins.pause('drag');
    },
    /** Screen CSS px → world cell. @param {number} sx @param {number} sy */
    cellAt(sx, sy) {
      const p = vp.toWorld(sx, sy);
      return { x: Math.floor(p.x / C), y: Math.floor(p.y / C) };
    },
    /** Cells visible vertically at the current zoom. */
    get cellsVisible() { return vp.worldScreenHeight / C; },
  };
}
