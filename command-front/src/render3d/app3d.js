// @ts-check
/**
 * The 3D battlefield renderer: the same interface as the 2D one
 * (render/app.js), so the session, input, HUD and minimap do not know which
 * one they talk to.
 *
 * One canvas, one WebGL context, shared by two renderers. Each frame:
 *   1. PixiJS paints the ground: terrain tiles, ore, scorch marks;
 *   2. three.js draws every model over it — units, buildings, trees — lit by
 *      a sun that casts real shadows onto that ground;
 *   3. PixiJS draws the overlays: effects, selection marks, health bars,
 *      placement cells, the shroud.
 * The 2D layers sit in the camera's squashed world (view.js), so a point on
 * the ground is in the same place in both.
 */
import { Application, Container, Graphics, UPDATE_PRIORITY } from 'pixi.js';
import { createCamera } from '../render/camera.js';
import { createTerrain } from '../render/terrainChunks.js';
import { createTerrainTiles } from '../render/terrainTiles.js';
import { createFx } from '../render/fx.js';
import { createCombatFx } from '../render/combatFx.js';
import { loadArt } from '../render/art.js';
import { createPlacementOverlay } from '../render/placementOverlay.js';
import { createShroudLayer } from '../render/shroud.js';
import { RENDER } from '../data/rules.js';
import { PERF } from '../data/ui.js';
import { UNITS } from '../data/units.js';
import { STRUCTURES } from '../data/structures.js';
import { createScene } from './scene.js';
import { createLibrary } from './library.js';
import { createInstancer } from './instances.js';
import { createUnits3D } from './units3d.js';
import { createStructures3D } from './structures3d.js';
import { createNature3D } from './nature3d.js';
import { makeIcons3D } from './icons3d.js';
import { SQUASH, LIFT, RISE, ALTITUDE } from './view.js';
import { disposeMaterials } from './material.js';

/** @typedef {import('../types.js').MapData} MapData */

const C = RENDER.cellPx;

/**
 * Graphics quality for this device: shadows, their resolution, model detail.
 * `?gfx=low|medium|high` overrides.
 */
export function quality3D() {
  const want = new URLSearchParams(location.search).get('gfx');
  const nav = /** @type {any} */ (navigator);
  const memory = nav.deviceMemory ?? 8;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  const tier = want === 'low' || want === 'medium' || want === 'high' ? want : memory <= 2 ? 'low' : phone || memory <= 4 ? 'medium' : 'high';
  // Multisampling where pixels are big enough for jagged edges to show.
  const antialias = tier !== 'low' && (tier === 'high' || (window.devicePixelRatio || 1) < 2);
  if (tier === 'low') return { tier, shadows: false, shadowSize: 512, receive: false, soft: false, antialias, detail: 0.55, maxTexture: 256, dpr: 1 };
  if (tier === 'medium') return { tier, shadows: true, shadowSize: 1024, receive: false, soft: false, antialias, detail: 0.75, maxTexture: 512, dpr: 1.5 };
  return { tier, shadows: true, shadowSize: 2048, receive: true, soft: true, antialias, detail: 1, maxTexture: 1024, dpr: PERF.dprCap };
}

/**
 * @param {HTMLElement} host
 * @param {MapData} map
 * @param {{ lowEnd?: boolean, faction?: string }} [opts]
 */
export async function createRenderer3D(host, map, opts = {}) {
  const q = quality3D();
  const scene = createScene(map, q);
  const canvas = scene.renderer.domElement;
  const app = new Application();
  await app.init({
    canvas,
    context: /** @type {WebGL2RenderingContext} */ (scene.renderer.getContext()),
    resizeTo: host,
    preference: 'webgl',
    antialias: false,
    background: 0x15140f,
    clearBeforeRender: false,
    resolution: Math.min(window.devicePixelRatio || 1, opts.lowEnd ? PERF.dprCapLowEnd : q.dpr),
    autoDensity: true,
    powerPreference: 'high-performance',
  });
  host.appendChild(canvas);
  canvas.setAttribute('aria-label', `Battlefield: ${map.name}`);

  const camera = createCamera(map, { width: app.screen.width, height: app.screen.height }, { squash: SQUASH, headroom: 1.6 * C * LIFT });
  const groundStage = new Container();
  groundStage.addChild(camera.ground);
  app.stage.addChild(camera.view);

  const [art, lib] = await Promise.all([loadArt({ terrainOnly: true }), createLibrary({ detail: q.detail, maxTexture: q.maxTexture })]);
  const inst = createInstancer(scene.models, { shadows: q.shadows, receive: q.receive });
  const terrain = art?.terrain
    ? createTerrainTiles(map, art.terrain, () => visibleCells(), { scenery3d: true })
    : createTerrain(app.renderer, map, { scenery3d: true });
  const units = createUnits3D(lib, inst);
  const structures = createStructures3D(lib, inst);
  const nature = createNature3D(lib, inst);
  const fx = createFx();
  /** Height of an entity's muzzle / middle above the ground, world px (before the view's lift). */
  const muzzle = (/** @type {any} */ e) => {
    if (e.kind === 'structure') return structures.heightOf(e.faction ? `${e.type}@${e.faction}` : e.type) * 0.8;
    const flying = UNITS[e.type]?.loco === 'air' && !e.landed;
    return (flying ? ALTITUDE : 0) + units.heightOf(e.type) * 0.6;
  };
  const combat = createCombatFx({ lift: (e) => muzzle(e) * LIFT });
  // The overlay draws the cells and build area; the building itself is a 3D ghost.
  const placement = createPlacementOverlay(new Map(), opts.faction ?? '');
  const shroud = createShroudLayer(map);
  const overlay = new Container();
  const top = new Container();
  const cursor = new Graphics();
  const boxG = new Graphics();
  const minesG = new Graphics();
  camera.ground.addChild(terrain.layer, combat.ground);
  overlay.addChild(minesG, structures.smoke, combat.layer, structures.marks, units.marks, structures.flags, fx.layer);
  top.addChild(placement.layer, cursor, boxG);
  camera.view.addChild(overlay, shroud.layer, top);
  let frame = 0;

  // Build every model now, while the match loads, so no first sighting stalls a frame.
  lib.warm([...Object.keys(UNITS), ...Object.keys(STRUCTURES), ...Object.keys(STRUCTURES).map((k) => `${k}@${opts.faction ?? ''}`)]);

  /** Cells currently on screen (with a margin). Tall things south of the screen reach into it. */
  const visibleCells = () => {
    const a = camera.toWorld(0, 0);
    const b = camera.toWorld(app.screen.width, app.screen.height);
    return {
      x0: Math.max(0, Math.floor(a.x / C) - 1), y0: Math.max(0, Math.floor(a.y / C) - 1),
      x1: Math.min(map.width - 1, Math.ceil(b.x / C) + 1), y1: Math.min(map.height - 1, Math.ceil(b.y / C) + 1),
    };
  };
  /** World px on screen, with room for models whose base is just off its bottom edge. */
  const visibleWorld = () => {
    const a = camera.toWorld(0, 0);
    const b = camera.toWorld(app.screen.width, app.screen.height);
    return { x0: a.x - C * 2, y0: a.y - C * 2, x1: b.x + C * 2, y1: b.y + C * 2 + 4 * C * LIFT };
  };

  // ── Compositing: replace Pixi's own render with ground → 3D → overlays.
  let bufW = 0;
  let bufH = 0;
  const renderFrame = () => {
    if (canvas.width !== bufW || canvas.height !== bufH) {
      bufW = canvas.width; bufH = canvas.height;
      scene.setBufferSize(bufW, bufH);
    }
    const pixi = app.renderer;
    pixi.resetState();
    pixi.render({ container: groundStage, clear: true });
    scene.renderer.resetState();
    scene.render();
    pixi.resetState();
    pixi.render({ container: app.stage, clear: false });
  };
  app.ticker.remove(app.render, app);
  app.ticker.add(renderFrame, null, UPDATE_PRIORITY.LOW);

  return {
    app,
    camera,
    terrain,
    /** Which renderer this is (debugging, perf overlay). */
    kind: '3d',
    quality: q,
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
    pulse(cell, kind) { fx.pulse((cell.x + 0.5) * C, (cell.y + 0.5) * C, kind); },
    /** Red flash on cells (deploy or placement refused). @param {{x: number, y: number}[]} cells */
    flash(cells) { for (const c of cells) fx.pulse((c.x + 0.5) * C, (c.y + 0.5) * C, 'reject'); },
    /** Screen rect of a footprint (placement ✓ / ✕). @param {number} cx @param {number} cy @param {number} w @param {number} h */
    footprintOnScreen(cx, cy, w, h) {
      const a = camera.toScreen(cx * C, cy * C);
      const b = camera.toScreen((cx + w) * C, (cy + h) * C);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    },
    visibleCells,
    /**
     * How far above its ground point an entity is drawn, screen px: aircraft
     * fly, units are hit in their middle, buildings up to their roof.
     * @param {any} e
     */
    liftOf(e) {
      const s = camera.scale * RISE;
      if (e.kind === 'structure') return structures.heightOf(e.faction ? `${e.type}@${e.faction}` : e.type) * s;
      const flying = UNITS[e.type]?.loco === 'air' && !e.landed;
      return ((flying ? ALTITUDE : 0) + units.heightOf(e.type) * 0.5) * s;
    },
    /** Draw calls, triangles and GPU memory of the last 3D frame (perf overlay, tests). */
    stats() {
      const i = scene.renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, pools: inst.active };
    },
    /** Build-menu icons drawn from the models. @param {number} tint @param {string} faction */
    makeIcons: (tint, faction) => makeIcons3D(scene.renderer, lib, tint, faction, () => app.renderer.resetState()),
    destroy() {
      app.ticker.remove(renderFrame);
      try { camera.destroy(); } catch (e) { console.warn('camera teardown', e); }
      // The 3D side first, while the shared context is still alive.
      try { inst.dispose(); lib.dispose(); disposeMaterials(); scene.dispose(); scene.renderer.dispose(); } catch (e) { console.warn('3d teardown', e); }
      try { app.destroy(true, { children: true, texture: true }); } catch (e) { console.warn('renderer teardown', e); }
      art?.destroy();
    },
    /**
     * Per-frame work before drawing.
     * @param {any} world @param {number} alpha @param {Set<number>} selected
     * @param {{ selectedStructure?: number, placement?: any, viewer?: number }} [o]
     */
    update(world, alpha, selected, o = {}) {
      terrain.update();
      const scale = camera.scale;
      const viewer = o.viewer ?? -1;
      const cells = visibleCells();
      const vw = visibleWorld();
      if (viewer >= 0 && frame++ % 4 === 0) shroud.update(world, viewer);
      shroud.layer.visible = viewer >= 0 && shroud.anyIn(cells);
      const see = viewer >= 0 ? (/** @type {any} */ e) => world.visibleTo(viewer, e) : () => true;
      inst.begin();
      structures.sync(world, selected, o.selectedStructure ?? 0, scale, see, viewer >= 0 ? {
        viewer, seen: (/** @type {number} */ x, /** @type {number} */ y) => world.cellVisible(viewer, x, y) && shroud.alphaAt(x, y) === 0,
        explored: (/** @type {number} */ x, /** @type {number} */ y) => world.isExplored(viewer, x, y),
      } : undefined, vw);
      const p = o.placement ?? null;
      placement.draw(p, scale);
      if (p?.type && !p.wall) structures.ghost(p.type, opts.faction ?? '', p.cx, p.cy, p.tint);
      units.sync(world, alpha, selected, scale, see, viewer, vw);
      // Scenery: the cells on screen plus those just below it, whose trees reach up into view.
      nature.sync(world, { ...cells, y1: Math.min(map.height - 1, cells.y1 + 2) }, viewer);
      inst.end();
      minesG.clear();
      if (world.mines.size) {
        for (const [i, m] of world.mines) {
          if (viewer >= 0 && !world.allied(m.owner, viewer)) continue;
          const x = i % map.width;
          const y = Math.floor(i / map.width);
          if (x < cells.x0 || x > cells.x1 || y < cells.y0 || y > cells.y1) continue;
          minesG.ellipse((x + 0.5) * C, (y + 0.5) * C, 3.2, 3.2).fill({ color: 0x1b1d16, alpha: 0.85 }).stroke({ width: 1, color: m.kind === 'antiTank' ? 0xe0a43a : 0xd0543a });
        }
      }
      combat.update(world, scale);
      fx.update(scale);
      scene.follow(camera.origin, scale, app.screen.width, app.screen.height, vw);
    },
  };
}
