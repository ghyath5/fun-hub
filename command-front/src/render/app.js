// @ts-check
/**
 * Render layer root: the PixiJS application, the camera and the world layers.
 * Reads map and sim data; never mutates them.
 */
import { Application, Container, Graphics } from 'pixi.js';
import { createCamera } from './camera.js';
import { createTerrain } from './terrainChunks.js';
import { createTerrainTiles } from './terrainTiles.js';
import { createUnitLayer } from './units.js';
import { createFx } from './fx.js';
import { createCombatFx } from './combatFx.js';
import { createStructureLayer } from './structures.js';
import { loadArt } from './art.js';
import { createPlacementOverlay } from './placementOverlay.js';
import { createShroudLayer } from './shroud.js';
import { makeIcons } from './icons.js';
import { RENDER } from '../data/rules.js';
import { PERF } from '../data/ui.js';

/** @typedef {import('../types.js').MapData} MapData */

const C = RENDER.cellPx;

/** Device pixel ratio, clamped (section 19). @param {boolean} lowEnd */
export const renderResolution = (lowEnd) => Math.min(window.devicePixelRatio || 1, lowEnd ? PERF.dprCapLowEnd : PERF.dprCap);

/** Can this browser draw the 3D battlefield (WebGL 2)? */
function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

/**
 * The battlefield renderer: 3D (render3d/app3d.js) unless the player chose
 * the classic 2D view, `?gfx=2d` asks for it, or the device cannot draw 3D.
 * Both have the same interface.
 * @param {HTMLElement} host
 * @param {MapData} map
 * @param {{ lowEnd?: boolean, faction?: string, mode?: '3d' | '2d' }} [opts]  faction: the viewer's, for faction-specific building looks
 */
export async function createRenderer(host, map, opts = {}) {
  const forced = new URLSearchParams(location.search).get('gfx');
  const mode = forced === '2d' ? '2d' : forced ? '3d' : opts.mode ?? '3d';
  if (mode === '3d' && webgl2()) {
    const before = new Set(host.children);
    try {
      const { createRenderer3D } = await import('../render3d/app3d.js');
      return await createRenderer3D(host, map, opts);
    } catch (e) {
      console.warn('[render] 3D view unavailable, using the 2D one', e);
      for (const el of [...host.children]) if (!before.has(el)) el.remove();
    }
  }
  return createRenderer2D(host, map, opts);
}

/**
 * The classic 2D renderer: pre-rendered sprites.
 * @param {HTMLElement} host
 * @param {MapData} map
 * @param {{ lowEnd?: boolean, faction?: string }} [opts]
 */
async function createRenderer2D(host, map, opts = {}) {
  const app = new Application();
  await app.init({
    resizeTo: host,
    preference: 'webgl',
    antialias: false,
    background: 0x15140f,
    resolution: renderResolution(!!opts.lowEnd),
    autoDensity: true,
    powerPreference: 'high-performance',
  });
  host.appendChild(app.canvas);
  app.canvas.setAttribute('aria-label', `Battlefield: ${map.name}`);

  const camera = createCamera(map, { width: app.screen.width, height: app.screen.height });
  app.stage.addChild(camera.view);

  const art = await loadArt();
  // visibleCells is hoisted below; the tile renderer only calls it once frames run.
  const terrain = art?.terrain ? createTerrainTiles(map, art.terrain, () => visibleCells()) : createTerrain(app.renderer, map);
  const structures = createStructureLayer(app.renderer, art?.structures);
  const units = createUnitLayer(app.renderer, art?.units);
  const fx = createFx();
  const combat = createCombatFx();
  const placement = createPlacementOverlay(structures.textures, opts.faction ?? '');
  const shroud = createShroudLayer(map);
  const overlay = new Container();
  const top = new Container();
  const cursor = new Graphics();
  const boxG = new Graphics();
  /** Own and allied mines (enemies never see them), and crates. */
  const minesG = new Graphics();
  overlay.addChild(minesG, structures.smoke, combat.layer, structures.marks, units.marks, fx.layer);
  top.addChild(placement.layer, cursor, boxG);
  camera.view.addChild(terrain.layer, combat.ground, structures.layer, units.layer, overlay, shroud.layer, top);
  let frame = 0;

  /** Cells currently on screen (with a margin). */
  const visibleCells = () => {
    const a = camera.toWorld(0, 0);
    const b = camera.toWorld(app.screen.width, app.screen.height);
    return {
      x0: Math.max(0, Math.floor(a.x / C) - 1), y0: Math.max(0, Math.floor(a.y / C) - 1),
      x1: Math.min(map.width - 1, Math.ceil(b.x / C) + 1), y1: Math.min(map.height - 1, Math.ceil(b.y / C) + 1),
    };
  };

  return {
    app,
    camera,
    terrain,
    /** Which renderer this is. */
    kind: '2d',
    /** Build-menu icons from the sprite art. @param {number} tint @param {string} faction */
    makeIcons: (/** @type {number} */ tint, /** @type {string} */ faction) => makeIcons(app.renderer, units.textures, structures.textures, tint, faction),
    /** Outline one cell (inspect feedback). @param {{x: number, y: number} | null} cell @param {number} [color] */
    highlight(cell, color = 0xf0e6c8) {
      cursor.clear();
      if (!cell) return;
      cursor.rect(cell.x * C + 1, cell.y * C + 1, C - 2, C - 2).stroke({ width: 2, color, alpha: 0.95 });
    },
    /** Draw a selection box in screen px (null hides it). @param {{x0: number, y0: number, x: number, y: number} | null} box */
    box(box) {
      boxG.clear();
      if (!box) return;
      const a = camera.toWorld(box.x0, box.y0);
      const b = camera.toWorld(box.x, box.y);
      boxG.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        .fill({ color: 0x9fdc6a, alpha: 0.12 }).stroke({ width: 2 / camera.scale, color: 0x9fdc6a });
    },
    units,
    structures,
    placement,
    shroud,
    fx,
    combat,
    /** Order feedback at a cell. @param {{x: number, y: number}} cell @param {'move' | 'attackMove' | 'attack' | 'reject'} kind */
    pulse(cell, kind) {
      fx.pulse((cell.x + 0.5) * C, (cell.y + 0.5) * C, kind);
    },
    /** Red flash on cells (deploy or placement refused). @param {{x: number, y: number}[]} cells */
    flash(cells) {
      for (const c of cells) fx.pulse((c.x + 0.5) * C, (c.y + 0.5) * C, 'reject');
    },
    /** Screen rect of a footprint (placement ✓ / ✕). @param {number} cx @param {number} cy @param {number} w @param {number} h */
    footprintOnScreen(cx, cy, w, h) {
      const a = camera.toScreen(cx * C, cy * C);
      const b = camera.toScreen((cx + w) * C, (cy + h) * C);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    },
    /** Cells currently on screen (with a margin). */
    visibleCells,
    /** Tear everything down (the world container first, then the renderer). */
    destroy() {
      try { camera.destroy(); } catch (e) { console.warn('camera teardown', e); }
      try { app.destroy(true, { children: true, texture: true }); } catch (e) { console.warn('renderer teardown', e); }
      art?.destroy();
    },
    /**
     * Per-frame work before PixiJS draws.
     * @param {any} world @param {number} alpha @param {Set<number>} selected
     * @param {{ selectedStructure?: number, placement?: any, viewer?: number, hover?: number }} [opts]  viewer: whose eyes the map is drawn through; hover: entity under the mouse
     */
    update(world, alpha, selected, opts = {}) {
      terrain.update();
      const scale = camera.scale;
      const viewer = opts.viewer ?? -1;
      if (viewer >= 0 && frame++ % 4 === 0) shroud.update(world, viewer);
      shroud.layer.visible = viewer >= 0 && shroud.anyIn(visibleCells());
      const see = viewer >= 0 ? (/** @type {any} */ e) => world.visibleTo(viewer, e) : undefined;
      structures.sync(world, selected, opts.selectedStructure ?? 0, scale, see, opts.hover ?? 0);
      placement.draw(opts.placement ?? null, scale);
      units.sync(world, alpha, selected, scale, see ?? (() => true), viewer, opts.hover ?? 0);
      minesG.clear();
      for (const c of world.crates) {
        if (viewer >= 0 && !world.isExplored(viewer, c.x, c.y)) continue;
        const x = c.x * C + 5;
        const y = c.y * C + 6;
        minesG.rect(x, y, C - 10, C - 12).fill(0x8a6a3a).stroke({ width: 1, color: 0xe0a43a });
        minesG.moveTo(x, y).lineTo(x + C - 10, y + C - 12).moveTo(x + C - 10, y).lineTo(x, y + C - 12).stroke({ width: 1, color: 0x3a2a14 });
      }
      if (world.mines.size) {
        const r = visibleCells();
        for (const [i, m] of world.mines) {
          if (viewer >= 0 && !world.allied(m.owner, viewer)) continue;
          const x = i % map.width;
          const y = Math.floor(i / map.width);
          if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
          const cx = (x + 0.5) * C;
          const cy = (y + 0.5) * C;
          minesG.circle(cx, cy, 3.2).fill({ color: 0x1b1d16, alpha: 0.85 }).stroke({ width: 1, color: m.kind === 'antiTank' ? 0xe0a43a : 0xd0543a });
        }
      }
      combat.update(world, scale);
      fx.update(scale);
    },
  };
}
