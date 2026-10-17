// @ts-check
/**
 * One match on screen: the world, its renderer, input, HUD, sounds and the
 * fixed-step loop, wired together. main.js creates a session from a setup
 * (and later the setup screen does); `destroy()` tears it all down.
 */
import { buzz } from '../lib/haptics.js';
import { createRenderer, renderResolution } from '../render/app.js';
import { makeIcons } from '../render/icons.js';
import { createPerfMonitor } from '../render/perfMonitor.js';
import { attachGestures } from '../input/gestures.js';
import { createLoop } from '../core/loop.js';
import { step, hashWorld, enqueue } from '../sim/world.js';
import { createSelection } from '../input/selection.js';
import { createIntents } from '../input/intents.js';
import { createModes } from '../input/modes.js';
import { attachDesktop } from '../input/desktop.js';
import { createStore } from '../ui/store.js';
import { mountHud } from '../ui/hud.js';
import { createToaster } from '../ui/toasts.js';
import { createAlerts } from '../ui/alerts.js';
import { wireBattleEvents } from '../ui/battleEvents.js';
import { wireGameEvents } from '../ui/gameEvents.js';
import { sidebarModel, economyModel, structureCard, sameShape, powersModel, intelLine } from '../ui/model.js';
import { drawMinimap, hasRadar } from '../ui/minimap.js';
import { isTransport } from '../sim/transports.js';
import { isAircraft } from '../sim/air.js';
import { GAME_SPEEDS, SIM, RENDER } from '../data/rules.js';
import { GESTURE, LAYOUT } from '../data/ui.js';
import { PLAYER_COLORS, FACTIONS } from '../data/factions.js';
import { itemDef, lineOf } from '../sim/catalog.js';
import { structureDef, isActive, placeStructure } from '../sim/entities/structures.js';
import { spawnUnit } from '../sim/entities/units.js';

/** Bottom band the command bar occupies; a selection centred there sends the bar to the top. */
const BAR_ZONE_PX = LAYOUT.commandButtonPx * 2 + 24;
/** HUD snapshot refresh: every N rendered frames. */
const HUD_EVERY_FRAMES = 6;
const C = RENDER.cellPx;
const L = SIM.leptonsPerCell;

/** Phone held upright: the sim pauses and the rotate card shows (CSS draws it). */
const portraitPhone = () => matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 600px)').matches;

/**
 * @typedef {object} SessionHooks
 * @property {() => void} [save]       Open the save slots (game stays paused)
 * @property {() => void} [load]       Open the load slots
 * @property {() => void} [autosave]   Save to the autosave slot now
 * @property {() => void} [exit]       Leave the match for the main menu
 * @property {(result: any) => void} [ended]  The match is over
 */

/**
 * @param {{
 *   world: any, human: number, hudEl: HTMLElement, worldEl: HTMLElement,
 *   audio: ReturnType<typeof import('../lib/audio.js').createAudio>,
 *   speed?: keyof typeof GAME_SPEEDS, debug?: boolean, hooks?: SessionHooks, hint?: string | null, leftHanded?: boolean,
 * }} opts
 */
export async function createSession({ world, human, hudEl, worldEl, audio, speed = 'normal', debug = false, hooks = {}, hint = null, leftHanded = false }) {
  const map = world.map;
  const view = await createRenderer(worldEl, map);
  const vp = view.camera.viewport;
  const me = world.players[human];
  const tint = PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (me.color)].main;
  const home = map.starts[me.start];
  view.camera.home(home.x, home.y);
  const onResize = (/** @type {number} */ w, /** @type {number} */ h) => view.camera.resize(w, h);
  view.app.renderer.on('resize', onResize);

  const selection = createSelection();
  let selectedStructure = 0;

  const store = createStore({
    credits: 0,
    powerProduced: 0,
    powerDrain: 0,
    powerPreview: 0,
    paused: false,
    mapName: map.name,
    cellsVisible: view.camera.cellsVisible,
    toasts: /** @type {import('../ui/toasts.js').Toast[]} */ ([]),
    hash: debug ? hashWorld(world) : null,
    sel: /** @type {import('../ui/commandBar.js').SelectionInfo} */ ({ count: 0, types: [] }),
    groups: selection.groupSizes(),
    barTop: false,
    addMode: false,
    selectMode: false,
    card: /** @type {{ name: string, hp: number, maxHp: number, owner: string } | null} */ (null),
    radial: /** @type {{ x: number, y: number, options: { id: string, label: string }[] } | null} */ (null),
    targetMode: /** @type {string | null} */ (null),
    alertCount: 0,
    sidebar: sidebarModel(world, human),
    icons: /** @type {Record<string, string>} */ ({}),
    tab: /** @type {import('../sim/catalog.js').LineId} */ ('structures'),
    collapsed: false,
    structure: /** @type {import('../ui/commandBar.js').StructureInfo | null} */ (null),
    sellArmed: false,
    placeAt: /** @type {{ x: number, y: number, ok: boolean, reason: string } | null} */ (null),
    powers: /** @type {{ id: string, name: string, progress: number, ready: boolean }[]} */ ([]),
    intel: /** @type {string | null} */ (null),
    radar: false,
    mapCollapsed: false,
    confirmSurrender: false,
    defeated: false,
    watching: false,
    hint: /** @type {string | null} */ (hint),
    ended: false,
  });
  const toaster = createToaster((toasts) => store.set({ toasts }));
  const alerts = createAlerts({
    show: (text, at) => {
      toaster.show(text, at);
      if (at) { pings.push({ ...at, at: performance.now() }); if (pings.length > 8) pings.shift(); }
      store.set({ alertCount: alerts.count });
    },
  });
  let userPaused = false;
  /** A defeated player watching the rest of the match with the map revealed. */
  let watching = false;
  /** The minimap's canvas while it is shown with radar. @type {HTMLCanvasElement | null} */
  let minimapCanvas = null;
  /** Alert spots pulsing on the minimap. @type {{ x: number, y: number, at: number }[]} */
  const pings = [];
  let lastAlpha = 0;

  /** @param {string} type @param {any} target @param {number[]} [ids] */
  const issue = (type, target, ids = []) => enqueue(world, { tick: world.tick, playerId: human, type, entityIds: ids, target });
  const jump = (/** @type {{x: number, y: number}} */ at) => vp.animate({ position: { x: (at.x + 0.5) * C, y: (at.y + 0.5) * C }, time: 300 });

  // ---- Modes: placement, walls, sell, repair, rally (they get gestures first).
  /** The intents' own target mode (attack-move); modes report theirs through `modes.mode`. */
  let intentTarget = /** @type {string | null} */ (null);
  const syncMode = () => store.set({ targetMode: modes.mode?.kind ?? intentTarget, placeAt: modes.mode ? store.get().placeAt : null });
  const modes = createModes({
    world,
    human,
    issue: (type, target) => issue(type, target, target?.ids ?? []),
    toWorld: (sx, sy) => vp.toWorld(sx, sy),
    scale: () => vp.scale.x,
    entityAt: (sx, sy) => intents.entityAt(sx, sy),
    centreCell: () => ({ x: Math.floor(vp.center.x / C), y: Math.floor(vp.center.y / C) }),
    onScreen: (cell) => {
      const r = view.visibleCells();
      return cell.x > r.x0 + 1 && cell.x < r.x1 - 1 && cell.y > r.y0 + 1 && cell.y < r.y1 - 1;
    },
    structureAt: (cell) => {
      const id = cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height ? world.occ.bld[cell.y * map.width + cell.x] : 0;
      return id ? world.entities.get(id) : null;
    },
    toast: (text) => toaster.show(text),
    changed: () => syncMode(),
    setPan: (on) => view.camera.setPanEnabled(on && !store.get().selectMode),
  });
  const enterTarget = (/** @type {string | null} */ m) => {
    if (m) modes.cancel();
    intentTarget = m;
    syncMode();
  };

  // ---- Intents: gestures on the world become selections and commands.
  let cardTimer = 0;
  const showCard = (/** @type {any} */ e) => {
    if (!e) return;
    const owner = e.owner >= 0 ? FACTIONS[world.players[e.owner].faction].name : 'Neutral';
    store.set({ card: { name: itemDef(e.type)?.name ?? e.type, hp: e.hp, maxHp: e.maxHp, owner } });
    clearTimeout(cardTimer);
    cardTimer = /** @type {any} */ (setTimeout(() => store.set({ card: null }), 2000));
  };
  const selectStructure = (/** @type {number} */ id) => {
    if (id === selectedStructure) return;
    selectedStructure = id;
    if (store.get().targetMode === 'rally') modes.cancel();
    store.set({ structure: id ? structureCard(world, world.entities.get(id), human) : null, sellArmed: false });
  };
  const intents = createIntents({
    world,
    human,
    selection,
    issue: (cmd) => enqueue(world, cmd),
    toWorld: (sx, sy) => vp.toWorld(sx, sy),
    toScreen: (wx, wy) => vp.toScreen(wx, wy),
    scale: () => vp.scale.x,
    screen: () => ({ w: view.app.screen.width, h: view.app.screen.height }),
    radiusOf: (type) => view.units.radiusOf(type),
    feedback: {
      pulse: (cell, kind) => {
        view.pulse(cell, kind);
        if (kind === 'reject') { audio.play('reject', { bus: 'ui', volume: 0.5 }); buzz(GESTURE.hapticTickMs); }
      },
      ack: () => audio.play('ack', { bus: 'voice', volume: 0.6 }),
      tap: () => audio.play('tap', { bus: 'ui', volume: 0.4 }),
      info: showCard,
    },
    modes: {
      addMode: () => store.get().addMode,
      smartBox: () => true,
      targetMode: () => intentTarget,
      setTargetMode: (m) => enterTarget(m),
    },
    radial: (menu) => store.set({ radial: menu }),
    selectStructure,
    visible: (e) => world.visibleTo(human, e),
  });

  // ---- HUD actions.
  const centreOnGroup = (/** @type {number} */ n) => {
    const units = [...selection.group(n)].map((id) => world.entities.get(id)).filter(Boolean);
    if (!units.length) return;
    const x = units.reduce((a, e) => a + e.x, 0) / units.length / L;
    const y = units.reduce((a, e) => a + e.y, 0) / units.length / L;
    jump({ x: Math.floor(x), y: Math.floor(y) });
  };
  const groupActs = {
    recall: (/** @type {number} */ n) => { selectStructure(0); selection.recall(n); },
    centre: (/** @type {number} */ n) => { selectStructure(0); selection.recall(n); centreOnGroup(n); },
    assign: (/** @type {number} */ n) => {
      if (!selection.size) return;
      const count = selection.assign(n);
      toaster.show(`Group ${n + 1} set (${count})`);
    },
  };
  const refreshSelection = () => store.set({ sel: intents.summary(), groups: selection.groupSizes() });
  const cmdActs = {
    stop: () => intents.simple('stop'),
    scatter: () => intents.simple('scatter'),
    same: () => intents.selectSameType(),
    deselect: () => { selection.clear(); selectStructure(0); },
    narrow: (/** @type {string} */ t) => intents.narrowTo(t),
    toggleAdd: () => store.set({ addMode: !store.get().addMode }),
    toggleSelect: () => {
      const on = !store.get().selectMode;
      store.set({ selectMode: on });
      view.camera.setPanEnabled(!on);
    },
    stance: () => { if (intents.cycleStance()) setTimeout(refreshSelection, 120); },
    attackMove: () => enterTarget(intentTarget === 'attackMove' ? null : 'attackMove'),
    deploy: () => intents.simple('deploy', (u) => u.type === 'mcv'),
    harvest: () => intents.harvestHere(),
    unload: () => intents.simple('unloadCargo', (u) => isTransport(u) && u.cargo?.length > 0),
    mines: () => {
      if (modes.mode?.kind === 'mines') { modes.cancel(); return; }
      const ids = intents.selectedIds((u) => !!u.maxMines);
      if (ids.length) { enterTarget(null); modes.mines(ids); }
    },
    returnPad: () => intents.simple('returnPad', isAircraft),
  };
  selection.subscribe(() => {
    refreshSelection();
    if (selection.size) selectStructure(0);
    if (!selection.size && intentTarget) enterTarget(null);
  });

  let sellTimer = 0;
  const structureActs = {
    sell: () => {
      if (!selectedStructure) return;
      if (store.get().sellArmed) {
        issue('sell', { id: selectedStructure });
        clearTimeout(sellTimer);
        store.set({ sellArmed: false });
        return;
      }
      store.set({ sellArmed: true });
      clearTimeout(sellTimer);
      sellTimer = /** @type {any} */ (setTimeout(() => store.set({ sellArmed: false }), GESTURE.sellConfirmMs));
    },
    repair: () => { if (selectedStructure) issue('repair', { id: selectedStructure }); },
    rally: () => { if (selectedStructure) { enterTarget(null); modes.rally(selectedStructure); } },
    primary: () => { if (selectedStructure) issue('primary', { id: selectedStructure }); },
    deselect: () => selectStructure(0),
  };
  /** @type {import('../ui/sidebar.js').SidebarActions} */
  const buildActs = {
    build: (type, count) => issue('build', { type, count }),
    setPaused: (line, paused) => issue(paused ? 'pause' : 'resume', { line }),
    cancel: (line, o) => issue('cancel', { line, ...o }),
    cancelReady: (line) => issue('cancelReady', { line }),
    place: (type) => { enterTarget(null); selection.clear(); selectStructure(0); modes.startPlacing(type); },
    toast: (text) => toaster.show(text),
    tab: (tab) => store.set({ tab }),
    collapse: () => store.set({ collapsed: !store.get().collapsed }),
    sell: () => { enterTarget(null); modes.sell(); },
    repair: () => { enterTarget(null); modes.repair(); },
  };

  const hud = mountHud(hudEl, store, {
    pause: () => { userPaused = true; store.set({ paused: true }); hooks.autosave?.(); },
    resume: () => { userPaused = false; store.set({ paused: false, confirmSurrender: false }); loop.resetClock(); },
    save: () => hooks.save?.(),
    load: () => hooks.load?.(),
    exit: () => hooks.exit?.(),
    surrender: () => {
      if (!store.get().confirmSurrender) { store.set({ confirmSurrender: true }); return; }
      issue('surrender', null);
      store.set({ confirmSurrender: false, paused: false });
      userPaused = false;
      loop.resetClock();
    },
    watch: () => { watching = true; store.set({ defeated: false, watching: true }); },
    dismissHint: () => store.set({ hint: null }),
    jump,
    fullscreen: async () => {
      try {
        await document.documentElement.requestFullscreen();
        await /** @type {any} */ (screen.orientation)?.lock?.('landscape');
      } catch { /* iOS and some browsers refuse; ignore */ }
    },
    cmd: cmdActs,
    groups: groupActs,
    radialPick: (id) => intents.radialPick(id),
    radialClose: () => store.set({ radial: null }),
    cancelTarget: () => { enterTarget(null); modes.cancel(); },
    alertJump: () => { const p = alerts.nextPlace(); if (p) jump(p); },
    build: buildActs,
    structure: structureActs,
    place: () => {
      if (!modes.confirm()) { audio.play('reject', { bus: 'ui', volume: 0.5 }); return; }
      audio.play('tap', { bus: 'ui', volume: 0.5 });
    },
    power: (id) => {
      const p = store.get().powers.find((x) => x.id === id);
      if (!p) return;
      if (!p.ready) { toaster.show(`${p.name}: ${Math.round(p.progress * 100)}% charged`); return; }
      enterTarget(null);
      selectStructure(0);
      modes.power(id);
    },
    minimapCanvas: (c) => { minimapCanvas = c; },
    minimapJump: (fx, fy) => jump({ x: Math.floor(fx * map.width), y: Math.floor(fy * map.height) }),
    minimapToggle: () => store.set({ mapCollapsed: !store.get().mapCollapsed }),
  });
  hudEl.classList.toggle('left', leftHanded);
  store.subscribe((s) => {
    hudEl.classList.toggle('watching', s.watching);
    hudEl.classList.toggle('sb-collapsed', s.collapsed || ['place', 'walls', 'mines', 'power'].includes(s.targetMode ?? ''));
    hudEl.classList.toggle('mm-collapsed', s.mapCollapsed);
  });

  // ---- Sim events → effects, sounds, alerts.
  const battle = wireBattleEvents({
    world, human, fx: view.combat, audio, alerts,
    toScreen: (wx, wy) => vp.toScreen(wx, wy),
    screen: () => ({ w: view.app.screen.width, h: view.app.screen.height }),
  });
  const game = wireGameEvents({
    world, human, alerts, audio,
    terrain: view.terrain,
    flash: (cells) => view.flash(cells),
    onStructureGone: (id) => { if (id === selectedStructure) selectStructure(0); },
    toast: (text, at) => toaster.show(text, at),
  });

  const offEnd = [
    world.events.on('playerEliminated', (e) => {
      if (e.data.player === human && !world.result) store.set({ defeated: true, paused: false });
    }),
    world.events.on('matchEnded', (e) => {
      store.set({ ended: true, defeated: false });
      setTimeout(() => hooks.ended?.(e.data), 2500);
    }),
    world.events.on('deployed', (e) => { if (e.data.owner === human && store.get().hint) store.set({ hint: null }); }),
  ];

  const desktop = attachDesktop({
    canvas: view.app.canvas, viewport: vp, groups: groupActs,
    commands: {
      ...cmdActs,
      escape: () => {
        if (!modes.mode && !intentTarget) return false;
        enterTarget(null);
        modes.cancel();
        return true;
      },
      hotkey: (key) => {
        if (key === 'a' && selection.size) { cmdActs.attackMove(); return true; }
        if (key === 'd' && selection.size) { cmdActs.deploy(); return true; }
        if (key === 'enter' && modes.mode) { modes.confirm(); return true; }
        if (key === 'u' && selection.size) { cmdActs.unload(); return true; }
        return false;
      },
    },
    hover: (x, y) => modes.hover(x, y),
  });

  // ---- Per-frame HUD upkeep.
  /** Keep the HUD snapshot in step with the world (several times a second). */
  function refreshHud() {
    selection.prune((id) => {
      const e = world.entities.get(id);
      return !!e && e.owner === human && !e.inside;
    });
    /** @type {Partial<ReturnType<typeof store.get>>} */
    const patch = {};
    const cur = store.get();
    const eco = economyModel(world, human);
    if (eco.credits !== cur.credits || eco.powerProduced !== cur.powerProduced || eco.powerDrain !== cur.powerDrain) {
      Object.assign(patch, { credits: eco.credits, powerProduced: eco.powerProduced, powerDrain: eco.powerDrain });
    }
    if (me.power.low) alerts.raise('lowPower');
    const sb = sidebarModel(world, human);
    if (!sameShape(sb, cur.sidebar)) patch.sidebar = sb;
    if (selectedStructure) {
      const s = world.entities.get(selectedStructure);
      if (!s || s.owner !== human) { selectedStructure = 0; patch.structure = null; } else {
        const card = structureCard(world, s, human);
        if (!sameShape(card, cur.structure)) patch.structure = card;
      }
    }
    const m = modes.mode;
    const preview = m && m.kind === 'place' ? structureDef(m.type).power ?? 0 : 0;
    if (preview !== cur.powerPreview) patch.powerPreview = preview;
    if (m && m.kind === 'place') {
      const line = me.lines[lineOf(m.type)];
      const yard = world.entities.all().some((e) => e.kind === 'structure' && e.owner === human && isActive(e) && structureDef(e.type).role === 'yard');
      if (!yard || !line || line.ready !== m.type) modes.cancel();
    }
    const pw = powersModel(world, human);
    if (!sameShape(pw, cur.powers)) patch.powers = pw;
    const intel = intelLine(world, human);
    if (intel !== cur.intel) patch.intel = intel;
    const radar = hasRadar(world, human);
    if (radar !== cur.radar) patch.radar = radar;
    if (m && m.kind === 'power' && !pw.some((p) => p.id === m.power && p.ready)) modes.cancel();
    let centre = intents.selectionCentre();
    if (!centre && selectedStructure) {
      const s = world.entities.get(selectedStructure);
      if (s) centre = vp.toScreen((s.cx + s.w / 2) * C, (s.cy + s.h / 2) * C);
    }
    const barTop = !!centre && centre.y > view.app.screen.height - BAR_ZONE_PX;
    if (barTop !== cur.barTop) patch.barTop = barTop;
    if (Object.keys(patch).length) store.set(patch);
  }

  /** ✓ / ✕ sit just above the ghost, flipping below it near the top edge. @param {any} overlay */
  function placeControls(overlay) {
    if (!overlay) { if (store.get().placeAt) store.set({ placeAt: null }); return; }
    const r = overlay.anchor || overlay.wall || !overlay.type
      ? view.footprintOnScreen(overlay.cx, overlay.cy, 1, 1)
      : view.footprintOnScreen(overlay.cx, overlay.cy, structureDef(overlay.type).w, structureDef(overlay.type).h);
    const above = r.y0 - 52;
    const y = above < LAYOUT.topBarPx + 8 ? r.y1 + 8 : above;
    const x = Math.max(8, Math.min(view.app.screen.width - 120, (r.x0 + r.x1) / 2 - 50));
    const cur = store.get().placeAt;
    const next = { x, y, ok: overlay.ok, reason: overlay.reason ?? '' };
    if (!cur || Math.abs(cur.x - x) > 0.5 || Math.abs(cur.y - y) > 0.5 || cur.ok !== next.ok || cur.reason !== next.reason) store.set({ placeAt: next });
  }

  const perf = createPerfMonitor({
    lowEnd: () => {
      const res = renderResolution(true);
      if (res < view.app.renderer.resolution) {
        view.app.renderer.resolution = res;
        view.app.resize();
        console.info(`[perf] low-end device: resolution ${res}`);
      }
    },
    particles: (k) => view.combat.setBudget(k),
  });
  let frameNo = 0;
  const loop = createLoop({
    tick: () => {
      step(world);
      if (debug && world.tick % SIM.hashEveryTicks === 0) store.set({ hash: hashWorld(world) });
    },
    render: (alpha, dtMs) => {
      lastAlpha = alpha;
      perf.frame(dtMs);
      desktop.update(dtMs);
      const overlay = modes.overlay(tint, view.visibleCells());
      view.update(world, alpha, selection.ids, { selectedStructure, placement: overlay, viewer: watching ? -1 : human });
      placeControls(overlay);
      world.events.flush();
      battle.flush();
      if (++frameNo % HUD_EVERY_FRAMES === 0) refreshHud();
      if (frameNo % (HUD_EVERY_FRAMES * 2) === 0 && minimapCanvas && store.get().radar) drawMinimap(minimapCanvas, world, human, view.visibleCells(), pings);
    },
    ticksPerSecond: () => GAME_SPEEDS[speed].ticksPerSecond,
    paused: () => userPaused || portraitPhone() || document.hidden,
  });
  const onTick = (/** @type {any} */ t) => loop.frame(t.deltaMS);
  view.app.ticker.add(onTick);

  // ---- Gestures: modes first, then intents.
  /** Last few gestures, for debugging input on real devices (window.__cf.gestures). */
  const gestureLog = /** @type {string[]} */ ([]);
  const restorePan = () => view.camera.setPanEnabled(!store.get().selectMode && !(modes.mode && ['place', 'walls', 'mines'].includes(modes.mode.kind)));
  const gestures = attachGestures(view.app.canvas, (g) => {
    gestureLog.push(`${g.type}@${Math.round(g.x)},${Math.round(g.y)}`);
    if (gestureLog.length > 30) gestureLog.shift();
    if (!audio.unlocked) audio.unlock();
    if (modes.mode && modes.handle(g)) return;
    switch (g.type) {
      case 'longPress':
        view.camera.setPanEnabled(false);
        buzz(GESTURE.hapticTickMs);
        break;
      case 'boxStart':
      case 'boxMove':
        view.box({ x0: g.x0 ?? g.x, y0: g.y0 ?? g.y, x: g.x, y: g.y });
        break;
      case 'boxEnd':
        view.box(null);
        selectStructure(0);
        intents.handle(g);
        restorePan();
        break;
      case 'radial':
        view.box(null);
        restorePan();
        intents.handle(g);
        break;
      case 'boxCancel':
      case 'cancel':
        view.box(null);
        restorePan();
        break;
      default:
        intents.handle(g);
        break;
    }
  }, { dragIsBox: () => store.get().selectMode });
  const onZoom = () => store.set({ cellsVisible: view.camera.cellsVisible });
  vp.on('zoomed-end', onZoom);

  const onVisibility = () => {
    if (document.hidden) { view.app.ticker.stop(); hooks.autosave?.(); }
    else { loop.resetClock(); view.app.ticker.start(); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onViewport = () => view.app.resize();
  window.visualViewport?.addEventListener('resize', onViewport);

  // Icons are cut from baked art after the first frames, so the match appears at once.
  setTimeout(() => {
    makeIcons(view.app.renderer, view.units.textures, view.structures.textures, tint)
      .then((icons) => store.set({ icons }))
      .catch((e) => console.warn('icons', e));
  }, 50);

  /** @type {any} */ (window).__cf = {
    world, view, store, selection, intents, modes, enqueue: (/** @type {any} */ c) => enqueue(world, c),
    alpha: () => lastAlpha, gestures: gestureLog, recognizer: gestures.recognizer,
    selectStructure, get selectedStructure() { return selectedStructure; },
    /** Debug: put a unit or a finished structure on the map. */
    spawn: (/** @type {string} */ type, /** @type {number} */ owner, /** @type {number} */ x, /** @type {number} */ y) => spawnUnit(world, type, owner, x, y),
    build: (/** @type {string} */ type, /** @type {number} */ owner, /** @type {number} */ x, /** @type {number} */ y) => placeStructure(world, type, owner, x, y, { buildUp: false }),
    /** Run n ticks at once (debugging and scripted play-tests). @param {number} n */
    advance: (n) => { for (let k = 0; k < n; k++) step(world); },
  };

  return {
    world,
    view,
    store,
    loop,
    toaster,
    alerts,
    /** Pause or resume the match from outside (menus). @param {boolean} on */
    setPaused(on) { userPaused = on; store.set({ paused: on }); if (!on) loop.resetClock(); },
    destroy() {
      view.app.ticker.remove(onTick);
      gestures.detach();
      desktop.detach();
      battle.detach();
      game.detach();
      offEnd.forEach((off) => off());
      document.removeEventListener('visibilitychange', onVisibility);
      window.visualViewport?.removeEventListener('resize', onViewport);
      hud.unmount();
      view.destroy();
    },
  };
}
