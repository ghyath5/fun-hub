// @ts-check
/**
 * One match on screen: the world, its renderer, input, HUD, sounds and the
 * fixed-step loop, wired together. main.js creates a session from a setup
 * (and later the setup screen does); `destroy()` tears it all down.
 */
import { buzz } from '../lib/haptics.js';
import { createRenderer, renderResolution } from '../render/app.js';
import { createPerfMonitor } from '../render/perfMonitor.js';
import { attachGestures } from '../input/gestures.js';
import { createLoop } from '../core/loop.js';
import { step, hashWorld, enqueue } from '../sim/world.js';
import { createSelection } from '../input/selection.js';
import { createIntents } from '../input/intents.js';
import { createModes } from '../input/modes.js';
import { attachDesktop } from '../input/desktop.js';
import { createCursor } from '../input/cursors.js';
import { canDig } from '../sim/dig.js';
import { createCameraInput } from '../input/cameraInput.js';
import { createStore } from '../ui/store.js';
import { mountHud } from '../ui/hud.js';
import { createToaster } from '../ui/toasts.js';
import { createAlerts } from '../ui/alerts.js';
import { createVoices } from '../ui/voices.js';
import { wireBattleEvents } from '../ui/battleEvents.js';
import { wireGameEvents } from '../ui/gameEvents.js';
import { sidebarModel, economyModel, structureCard, sameShape, powersModel, intelLine } from '../ui/model.js';
import { t, nameOf } from '../lib/i18n.js';
import { drawMinimap, hasRadar } from '../ui/minimap.js';
import { isTransport } from '../sim/transports.js';
import { isMineLayer } from '../sim/specials.js';
import { createThreats } from '../ui/threats.js';
import { createThreatArrows } from '../ui/threatArrows.js';
import { THREATS } from '../data/ui.js';
import { isAircraft } from '../sim/air.js';
import { GAME_SPEEDS, SIM, RENDER, PRODUCTION } from '../data/rules.js';
import { GESTURE, LAYOUT } from '../data/ui.js';
import { PLAYER_COLORS, FACTIONS } from '../data/factions.js';
import { itemDef, lineOf } from '../sim/catalog.js';
import { structureDef, isActive, placeStructure } from '../sim/entities/structures.js';
import { spawnUnit } from '../sim/entities/units.js';
import { enterFullscreen } from '../ui/fullscreen.js';

/** Why a full production queue is not moving, by line hold (sim/systems/production.js). */
/** Remembers on this device whether the control-group column is folded. */
const GROUPS_FOLDED_KEY = 'cf-groups-folded';

const QUEUE_STUCK = Object.freeze({
  funds: 'waiting for money', exit: 'the factory exit is blocked', pad: 'no free pad', factory: 'no factory', paused: 'it is paused', requires: 'a required building is missing',
});

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
 * @property {() => void} [retry]     Two phones: try the lost connection again
 * @property {(speed: string) => void} [speedChanged]  The player changed the game speed (saves keep it)
 */

/**
 * @param {{
 *   world: any, human: number, hudEl: HTMLElement, worldEl: HTMLElement,
 *   audio: ReturnType<typeof import('../lib/audio.js').createAudio>,
 *   speed?: keyof typeof GAME_SPEEDS, debug?: boolean, hooks?: SessionHooks, hint?: string | null, leftHanded?: boolean,
 *   net?: import('../net/netMatch.js').NetPlay | null, edgePan?: boolean, graphics?: '3d' | '2d',
 * }} opts  net: a two-phone match — commands go through the lockstep and the pause is shared
 */
export async function createSession({ world, human, hudEl, worldEl, audio, speed = 'normal', debug = false, hooks = {}, hint = null, leftHanded = false, net = null, edgePan = true, graphics = '3d' }) {
  const map = world.map;
  const view = await createRenderer(worldEl, map, { faction: world.players[human]?.faction ?? '', mode: graphics });
  const cam = view.camera;
  const me = world.players[human];
  const tint = PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (me.color)].main;
  const home = map.starts[me.start];
  cam.home(home.x, home.y);
  const onResize = (/** @type {number} */ w, /** @type {number} */ h) => cam.resize(w, h);
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
    speed: /** @type {string} */ (speed),
    cellsVisible: cam.cellsVisible,
    toasts: /** @type {import('../ui/toasts.js').Toast[]} */ ([]),
    hash: debug ? hashWorld(world) : null,
    sel: /** @type {import('../ui/commandBar.js').SelectionInfo} */ ({ count: 0, types: [] }),
    groups: selection.groupSizes(),
    groupsCollapsed: (() => { try { return localStorage.getItem(GROUPS_FOLDED_KEY) === '1'; } catch { return false; } })(),
    barTop: false,
    addMode: false,
    selectMode: false,
    card: /** @type {{ name: string, hp: number, maxHp: number, owner: string } | null} */ (null),
    radial: /** @type {{ x: number, y: number, options: { id: string, label: string }[] } | null} */ (null),
    targetMode: /** @type {string | null} */ (null),
    /** Lay Mines: cells queued and what they will cost. @type {{ queued: number, cost: number } | null} */
    minesCount: null,
    alertCount: 0,
    /** The base is being hit right now (the "!" button glows and jumps there). */
    underAttack: false,
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
    online: !!net,
    link: /** @type {import('../net/netMatch.js').LinkCard} */ (null),
    linkDismissed: false,
  });
  const toaster = createToaster((toasts) => store.set({ toasts }));
  const voices = createVoices({ audio, world, human });
  const alerts = createAlerts({
    show: (text, at) => {
      toaster.show(text, at);
      if (at) { pings.push({ ...at, at: performance.now() }); if (pings.length > 8) pings.shift(); }
      store.set({ alertCount: alerts.count });
    },
    said: (key) => voices.alert(key),
  });
  /** The human's own units in the selection (they are the ones who answer). */
  const ownSelected = () => selection.list().map((id) => world.entities.get(id)).filter((e) => e && e.owner === human && e.kind === 'unit');
  let userPaused = false;
  /** A defeated player watching the rest of the match with the map revealed. */
  let watching = false;
  /** The minimap's canvas while it is shown with radar. @type {HTMLCanvasElement | null} */
  let minimapCanvas = null;
  /** Alert spots pulsing on the minimap. @type {{ x: number, y: number, at: number, attack?: boolean }[]} */
  const pings = [];
  /** Where the base is under attack (rings, edge arrows, minimap pings, the "!" button). */
  const threats = createThreats();
  /** When each attack spot last pinged the minimap. @type {Map<number, number>} */
  const threatPinged = new Map();
  let lastAlpha = 0;

  /** Every player command goes through here: straight into the sim, or into the lockstep on two phones. @param {any} cmd */
  const submit = (cmd) => (net ? net.submit(cmd) : enqueue(world, cmd));
  /** @param {string} type @param {any} target @param {number[]} [ids] */
  const issue = (type, target, ids = []) => submit({ tick: world.tick, playerId: human, type, entityIds: ids, target });
  const jump = (/** @type {{x: number, y: number}} */ at) => cam.flyTo((at.x + 0.5) * C, (at.y + 0.5) * C);
  /** Back to base: the construction yard if there is one, else where we started. */
  const goHome = () => {
    const yard = world.entities.all().find((/** @type {any} */ e) => e.kind === 'structure' && e.owner === human && structureDef(e.type).role === 'yard');
    jump(yard ? { x: yard.cx + 1, y: yard.cy + 1 } : home);
  };
  // ---- The view: every pan, pinch, wheel, key and edge goes through here.
  const cameraInput = createCameraInput({ camera: cam, canvas: view.app.canvas, edgePan: () => edgePan, home: goHome });

  // ---- Modes: placement, walls, sell, repair, rally (they get gestures first).
  /** The intents' own target mode (attack-move); modes report theirs through `modes.mode`. */
  let intentTarget = /** @type {string | null} */ (null);
  const syncMode = () => store.set({ targetMode: modes.mode?.kind ?? intentTarget, minesCount: modes.minesCount(), placeAt: modes.mode ? store.get().placeAt : null });
  const modes = createModes({
    world,
    human,
    issue: (type, target) => issue(type, target, target?.ids ?? []),
    toWorld: (sx, sy) => cam.toWorld(sx, sy),
    scale: () => cam.scale,
    entityAt: (sx, sy) => intents.entityAt(sx, sy),
    centreCell: () => ({ x: Math.floor(cam.centre.x / C), y: Math.floor(cam.centre.y / C) }),
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
    setPan: (on) => cameraInput.setPanEnabled(on && !store.get().selectMode),
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
    const owner = e.owner >= 0 ? t(FACTIONS[world.players[e.owner].faction].name) : t('Neutral');
    store.set({ card: { name: nameOf(e.type, itemDef(e.type)?.name ?? structureDef(e.type)?.name ?? e.type), hp: e.hp, maxHp: e.maxHp, owner } });
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
    issue: submit,
    toWorld: (sx, sy) => cam.toWorld(sx, sy),
    toScreen: (wx, wy) => cam.toScreen(wx, wy),
    scale: () => cam.scale,
    screen: () => ({ w: view.app.screen.width, h: view.app.screen.height }),
    radiusOf: (type) => view.units.radiusOf(type),
    lift: (e) => view.liftOf?.(e) ?? 0,
    feedback: {
      pulse: (cell, kind) => {
        view.pulse(cell, kind);
        if (kind === 'reject') { audio.play('reject', { bus: 'ui', volume: 0.5 }); buzz(GESTURE.hapticTickMs); }
      },
      ack: (kind = 'move') => voices.reply(kind, ownSelected()),
      picked: () => voices.reply('select', ownSelected()),
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
    explored: (x, y) => world.isExplored(human, x, y),
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
    recall: (/** @type {number} */ n) => { selectStructure(0); selection.recall(n); voices.reply('select', ownSelected()); },
    /** The on-screen number: select the group; an empty one takes the selection (or says how). @param {number} n */
    tap: (n) => {
      if (selection.groupSizes()[n] > 0) { groupActs.recall(n); return; }
      if (selection.size) { groupActs.assign(n); return; }
      toaster.show(t('Select units, then tap a number to save them as a group'));
    },
    toggle: () => {
      const groupsCollapsed = !store.get().groupsCollapsed;
      store.set({ groupsCollapsed });
      try { localStorage.setItem(GROUPS_FOLDED_KEY, groupsCollapsed ? '1' : '0'); } catch { /* private mode: not remembered */ }
    },
    centre: (/** @type {number} */ n) => { selectStructure(0); selection.recall(n); centreOnGroup(n); },
    /** Shift + number (desktop): add the group to the selection. @param {number} n */
    add: (n) => { selectStructure(0); selection.set([...selection.ids, ...selection.group(n)]); },
    assign: (/** @type {number} */ n) => {
      if (!selection.size) return;
      const count = selection.assign(n);
      toaster.show(t('Group {g} set ({n})', { g: n + 1, n: count }));
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
      cameraInput.setPanEnabled(!on);
    },
    stance: () => { if (intents.cycleStance()) setTimeout(refreshSelection, 120); },
    attackMove: () => enterTarget(intentTarget === 'attackMove' ? null : 'attackMove'),
    deploy: () => intents.simple('deploy', (u) => u.type === 'mcv' || canDig(u)),
    harvest: () => intents.harvestHere(),
    unload: () => intents.simple('unloadCargo', (u) => isTransport(u) && u.cargo?.length > 0),
    mines: () => {
      if (modes.mode?.kind === 'mines') { modes.cancel(); return; }
      const ids = intents.selectedIds(isMineLayer);
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
    repair: () => {
      if (!selectedStructure) return;
      if (!world.entities.get(selectedStructure)?.repairing) voices.announce('repairing');
      issue('repair', { id: selectedStructure });
    },
    rally: () => { if (selectedStructure) { enterTarget(null); modes.rally(selectedStructure); } },
    primary: () => { if (selectedStructure) issue('primary', { id: selectedStructure }); },
    deselect: () => selectStructure(0),
  };
  /** @type {import('../ui/sidebar.js').SidebarActions} */
  const buildActs = {
    build: (type, count) => {
      const line = lineOf(type);
      voices.announce(line === 'structures' || line === 'defenses' ? 'building' : 'training');
      issue('build', { type, count });
    },
    setPaused: (line, paused) => { if (paused) voices.announce('onHold'); issue(paused ? 'pause' : 'resume', { line }); },
    cancel: (line, o) => { voices.announce('cancelled'); issue('cancel', { line, ...o }); },
    cancelReady: (line) => { voices.announce('cancelled'); issue('cancelReady', { line }); },
    queueFull: (line) => {
      // Say why the line is not moving, so a full queue is never a mystery.
      const why = QUEUE_STUCK[/** @type {keyof typeof QUEUE_STUCK} */ (me.lines[line]?.hold ?? '')] ?? '';
      toaster.show(why ? t('Queue full ({n}): {why}', { n: PRODUCTION.queueMax, why: t(why) }) : t('Queue full ({n})', { n: PRODUCTION.queueMax }));
      voices.announce('queueFull');
    },
    place: (type) => { enterTarget(null); selection.clear(); selectStructure(0); modes.startPlacing(type); },
    toast: (text) => toaster.show(text),
    tab: (tab) => store.set({ tab }),
    collapse: () => store.set({ collapsed: !store.get().collapsed }),
    sell: () => { enterTarget(null); modes.sell(); },
    repair: () => { enterTarget(null); modes.repair(); },
  };

  /** Pause the match and show the pause menu (its own button, or Back while playing). On two phones it holds both. */
  const pauseMatch = () => {
    if (store.get().paused || store.get().ended) return;
    userPaused = true;
    store.set({ paused: true });
    net?.hold(true);
    hooks.autosave?.();
  };

  const hud = mountHud(hudEl, store, {
    pause: () => pauseMatch(),
    resume: () => { userPaused = false; store.set({ paused: false, confirmSurrender: false }); net?.hold(false); loop.resetClock(); },
    // Two phones share one speed, set before the match.
    speed: net ? undefined : (/** @type {string} */ s) => {
      if (!(s in GAME_SPEEDS)) return;
      speed = /** @type {keyof typeof GAME_SPEEDS} */ (s);
      store.set({ speed });
      hooks.speedChanged?.(speed);
    },
    save: () => hooks.save?.(),
    load: () => hooks.load?.(),
    exit: () => hooks.exit?.(),
    link: net ? {
      retry: () => hooks.retry?.(),
      alone: () => { net.abandon(); store.set({ linkDismissed: true }); },
      dismiss: () => store.set({ linkDismissed: true }),
      exit: () => hooks.exit?.(),
    } : undefined,
    surrender: () => {
      if (!store.get().confirmSurrender) { store.set({ confirmSurrender: true }); return; }
      issue('surrender', null);
      store.set({ confirmSurrender: false, paused: false });
      userPaused = false;
      net?.hold(false);
      loop.resetClock();
    },
    watch: () => { watching = true; store.set({ defeated: false, watching: true }); },
    dismissHint: () => store.set({ hint: null }),
    jump,
    fullscreen: () => { enterFullscreen(); },
    cmd: cmdActs,
    groups: groupActs,
    radialPick: (id) => intents.radialPick(id),
    radialClose: () => store.set({ radial: null }),
    cancelTarget: () => { enterTarget(null); modes.cancel(); },
    // While the base is under attack, the fights come first (each press the next one), then recent alerts.
    alertJump: () => {
      const live = threats.active();
      if (live.length) { jump(live[threatCursor++ % live.length]); return; }
      const p = alerts.nextPlace();
      if (p) jump(p);
    },
    zoom: (dir) => cam.zoomStep(dir),
    build: buildActs,
    structure: structureActs,
    place: () => {
      if (!modes.confirm()) { audio.play('reject', { bus: 'ui', volume: 0.5 }); return; }
      audio.play('tap', { bus: 'ui', volume: 0.5 });
    },
    power: (id) => {
      const p = store.get().powers.find((x) => x.id === id);
      if (!p) return;
      if (!p.ready) { toaster.show(t('{name}: {pct}% charged', { name: p.name, pct: Math.round(p.progress * 100) })); return; }
      enterTarget(null);
      selectStructure(0);
      modes.power(id);
      voices.announce('selectTarget');
    },
    minimapCanvas: (c) => { minimapCanvas = c; },
    minimapJump: (fx, fy) => jump({ x: Math.floor(fx * map.width), y: Math.floor(fy * map.height) }),
    minimapToggle: () => store.set({ mapCollapsed: !store.get().mapCollapsed }),
  });
  hudEl.classList.toggle('left', leftHanded);
  syncInsets();
  store.subscribe((s) => {
    hudEl.classList.toggle('watching', s.watching);
    hudEl.classList.toggle('sb-collapsed', s.collapsed || ['place', 'walls', 'mines', 'power'].includes(s.targetMode ?? ''));
    hudEl.classList.toggle('mm-collapsed', s.mapCollapsed);
  });

  // ---- Sim events → effects, sounds, alerts.
  const battle = wireBattleEvents({
    world, human, fx: view.combat, audio, alerts,
    toScreen: (wx, wy) => cam.toScreen(wx, wy),
    screen: () => ({ w: view.app.screen.width, h: view.app.screen.height }),
  });
  const game = wireGameEvents({
    world, human, alerts, audio, voices,
    terrain: view.terrain,
    flash: (cells) => view.flash(cells),
    onStructureGone: (id) => { if (id === selectedStructure) selectStructure(0); },
    toast: (text, at) => toaster.show(text, at),
    threats,
  });
  const threatArrows = createThreatArrows(worldEl, (cell) => jump(cell));
  let threatCursor = 0;
  /** Attack spots this frame, and their minimap pings. */
  const watchThreats = () => {
    const live = threats.active();
    const now = performance.now();
    for (const s of live) {
      if (now - (threatPinged.get(s.id) ?? -Infinity) < THREATS.pingEveryMs) continue;
      threatPinged.set(s.id, now);
      pings.push({ x: s.x, y: s.y, at: now, attack: true });
      if (pings.length > 8) pings.shift();
    }
    if (threatPinged.size > 16) for (const id of threatPinged.keys()) if (!live.some((s) => s.id === id)) threatPinged.delete(id);
    threatArrows.update(live, cam.area, (c) => cam.toScreen((c.x + 0.5) * C, (c.y + 0.5) * C));
    return live;
  };

  const offEnd = [
    ...(net ? [net.onCard((link) => store.set({ link }))] : []),
    world.events.on('playerEliminated', (e) => {
      if (e.data.player === human && !world.result) { store.set({ defeated: true, paused: false }); voices.announce('defeat'); }
    }),
    world.events.on('matchEnded', (e) => {
      if (!watching && !store.get().defeated) voices.announce(e.data.winners?.includes(human) ? 'victory' : 'defeat');
      store.set({ ended: true, defeated: false });
      setTimeout(() => hooks.ended?.(e.data), 2500);
    }),
    world.events.on('deployed', (e) => { if (e.data.owner === human && store.get().hint) store.set({ hint: null }); }),
  ];

  // ---- Desktop: hotkeys, the hover cursor and the health of what is under the mouse.
  const cursor = createCursor(view.app.canvas);
  /** Where the mouse rests over the battlefield (desktop only), with Shift / Ctrl. */
  let pointer = /** @type {{ x: number, y: number, mods: { shift: boolean, ctrl: boolean } } | null} */ (null);
  /** The entity under the mouse: its health bar shows, as in Red Alert 2. */
  let hoverId = 0;
  /** Cursor for each input mode; the attack-move target and the rest come from the intents. */
  const MODE_CURSOR = /** @type {Record<string, string>} */ ({ sell: 'sell', repair: 'repair', rally: 'move', power: 'attack', mines: 'move' });
  const refreshHover = () => {
    if (!pointer) { hoverId = 0; cursor.set('default'); return; }
    const e = intents.entityAt(pointer.x, pointer.y);
    hoverId = e && !e.dead ? e.id : 0;
    cursor.set(modes.mode ? MODE_CURSOR[modes.mode.kind] ?? 'default' : intents.hoverIntent(pointer.x, pointer.y, pointer.mods));
  };
  /** Right click and Escape: leave a mode or target pick; false when there was none. */
  const cancelModes = () => {
    if (!modes.mode && !intentTarget) return false;
    enterTarget(null);
    modes.cancel();
    return true;
  };
  const offHoverSel = selection.subscribe(() => { if (pointer) refreshHover(); });
  const desktop = attachDesktop({
    canvas: view.app.canvas, groups: groupActs,
    commands: {
      ...cmdActs,
      escape: () => {
        if (store.get().radial) { store.set({ radial: null }); return true; }
        return cancelModes();
      },
      hotkey: (key, double) => {
        if (key === 'a' && selection.size) { cmdActs.attackMove(); return true; }
        if (key === 'd' && selection.size) { cmdActs.deploy(); return true; }
        if (key === 'enter' && modes.mode) { modes.confirm(); return true; }
        if (key === 'u' && selection.size) { cmdActs.unload(); return true; }
        // T: the same type on screen; T twice: across the whole map.
        if (key === 't' && selection.size) { intents.selectSameType(double); return true; }
        if (key === 'h') { goHome(); return true; }
        if (key === 'g' && selection.size) { cmdActs.stance(); return true; }
        // R: Repair mode (Shift-free, like the sidebar's wrench); Delete: sell the selected building (press twice).
        if (key === 'r') { buildActs.repair(); return true; }
        if (key === 'delete' && selectedStructure) { structureActs.sell(); return true; }
        return false;
      },
    },
    hover: (x, y, mods) => { modes.hover(x, y); pointer = { x, y, mods }; refreshHover(); },
    leave: () => { pointer = null; refreshHover(); },
  });

  // ---- Per-frame HUD upkeep.
  /** Tell the camera which screen margins the top bar and sidebar cover, so every part of the map can be scrolled into view. */
  function syncInsets() {
    const canvasRect = view.app.canvas.getBoundingClientRect();
    const bar = hudEl.querySelector('.topbar')?.getBoundingClientRect();
    const side = hudEl.querySelector('.sidebar')?.getBoundingClientRect();
    const onLeft = !!side && side.left - canvasRect.left < canvasRect.width / 2;
    cam.setInsets({
      top: bar ? Math.max(0, bar.bottom - canvasRect.top) : 0,
      right: side && !onLeft ? Math.max(0, canvasRect.right - side.left) : 0,
      left: side && onLeft ? Math.max(0, side.right - canvasRect.left) : 0,
      bottom: 0,
    });
  }

  /** How many build items were unlocked at the last refresh (-1 until the first). */
  let unlockedItems = -1;
  /** Keep the HUD snapshot in step with the world (several times a second). */
  function refreshHud() {
    syncInsets();
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
    const attacked = threats.active().some((s) => s.kind === 'base');
    if (attacked !== cur.underAttack) patch.underAttack = attacked;
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
    if (radar !== cur.radar) {
      patch.radar = radar;
      voices.announce(radar ? 'radarOnline' : 'radarOffline');
      audio.play(radar ? 'radar' : 'powerDown', { bus: 'ui', volume: 0.6 });
    }
    // More of the build menu unlocked than before: new construction options.
    const open = Object.values(sb.items).flat().filter((it) => it.state !== 'locked').length;
    if (open > unlockedItems && unlockedItems > 0) voices.announce('newOptions');
    unlockedItems = open;
    if (m && m.kind === 'power' && !pw.some((p) => p.id === m.power && p.ready)) modes.cancel();
    let centre = intents.selectionCentre();
    if (!centre && selectedStructure) {
      const s = world.entities.get(selectedStructure);
      if (s) centre = cam.toScreen((s.cx + s.w / 2) * C, (s.cy + s.h / 2) * C);
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
    ready: () => !net || net.ready(world),
    tick: () => {
      if (net) net.step(world); else step(world);
      if (debug && world.tick % SIM.hashEveryTicks === 0) store.set({ hash: hashWorld(world) });
    },
    render: (alpha, dtMs) => {
      lastAlpha = alpha;
      perf.frame(dtMs);
      cameraInput.update(dtMs);
      const overlay = modes.overlay(tint, view.visibleCells());
      // The world moves under a still mouse: re-read what is under it now and then.
      if (pointer && frameNo % 4 === 0) refreshHover();
      view.update(world, alpha, selection.ids, { selectedStructure, placement: overlay, viewer: watching ? -1 : human, hover: hoverId, threats: watchThreats() });
      placeControls(overlay);
      world.events.flush();
      battle.flush();
      if (++frameNo % HUD_EVERY_FRAMES === 0) refreshHud();
      if (frameNo % (HUD_EVERY_FRAMES * 2) === 0 && minimapCanvas && store.get().radar) drawMinimap(minimapCanvas, world, human, view.visibleCells(), pings);
    },
    ticksPerSecond: () => GAME_SPEEDS[speed].ticksPerSecond * (net ? net.rate(world) : 1),
    paused: () => userPaused || portraitPhone() || document.hidden || !!net?.held(),
  });
  const onTick = (/** @type {any} */ t) => loop.frame(t.deltaMS);
  view.app.ticker.add(onTick);

  // ---- Gestures: modes first, then intents.
  /** Last few gestures, for debugging input on real devices (window.__cf.gestures). */
  const gestureLog = /** @type {string[]} */ ([]);
  const restorePan = () => cameraInput.setPanEnabled(!store.get().selectMode && !(modes.mode && ['place', 'walls', 'mines'].includes(modes.mode.kind)));
  const gestures = attachGestures(view.app.canvas, (g) => {
    gestureLog.push(`${g.type}@${Math.round(g.x)},${Math.round(g.y)}`);
    if (gestureLog.length > 30) gestureLog.shift();
    if (!audio.unlocked) audio.unlock(); else audio.wake();
    // Two fingers always move the view, whatever mode is on; a one-finger
    // drag pans unless a mode (placing, walls, mines) wants it first.
    if (g.type.startsWith('pinch') && cameraInput.handle(g)) return;
    // Right click (desktop): leave the current mode first; with none, drop the selection.
    if (g.type === 'secondary') {
      view.box(null);
      if (store.get().radial) store.set({ radial: null });
      else if (!cancelModes()) intents.handle(g);
      restorePan();
      if (pointer) refreshHover();
      return;
    }
    if (modes.mode && modes.handle(g)) return;
    if (g.type.startsWith('pan') && cameraInput.handle(g)) return;
    switch (g.type) {
      case 'longPress':
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
  const offZoom = cam.onZoom(() => store.set({ cellsVisible: cam.cellsVisible }));

  const onVisibility = () => {
    if (document.hidden) { view.app.ticker.stop(); hooks.autosave?.(); }
    else { loop.resetClock(); view.app.ticker.start(); net?.wake(); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onViewport = () => view.app.resize();
  window.visualViewport?.addEventListener('resize', onViewport);

  // Icons are cut from baked art after the first frames, so the match appears at once.
  setTimeout(() => {
    view.makeIcons(tint, world.players[human]?.faction ?? '')
      .then((icons) => store.set({ icons }))
      .catch((e) => console.warn('icons', e));
  }, 50);

  // The announcer opens the match as soon as sound is allowed (the Start tap allows it), then this side's lines load.
  const fresh = world.tick === 0;
  audio.unlock();
  audio.whenReady().then(() => {
    if (fresh) voices.announce('battleControlOnline');
    return voices.preload();
  }).catch(() => {});

  /** @type {any} */ (window).__cf = {
    world, view, store, selection, intents, modes, audio, voices, enqueue: (/** @type {any} */ c) => enqueue(world, c),
    /** Issue a command the way the player's input does (through the lockstep on two phones). */
    submit,
    alpha: () => lastAlpha, gestures: gestureLog, recognizer: gestures.recognizer,
    /** Desktop: the cursor showing and the entity under the mouse. */
    hover: () => ({ cursor: cursor.kind, id: hoverId }),
    selectStructure, get selectedStructure() { return selectedStructure; },
    /** Debug: put a unit or a finished structure on the map. */
    spawn: (/** @type {string} */ type, /** @type {number} */ owner, /** @type {number} */ x, /** @type {number} */ y) => spawnUnit(world, type, owner, x, y),
    build: (/** @type {string} */ type, /** @type {number} */ owner, /** @type {number} */ x, /** @type {number} */ y) => placeStructure(world, type, owner, x, y, { buildUp: false }),
    /** Where an entity is on screen (scripted play-tests tap there). @param {any} e */
    screenOf: (e) => cam.toScreen((e.x * C) / L, (e.y * C) / L),
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
    /** Pause the match and open the pause menu, as its pause button does. */
    pause: pauseMatch,
    /** Pause or resume the match from outside (menus). @param {boolean} on */
    setPaused(on) { userPaused = on; store.set({ paused: on }); if (!on) loop.resetClock(); },
    destroy() {
      view.app.ticker.remove(onTick);
      gestures.detach();
      desktop.detach();
      offHoverSel();
      cameraInput.detach();
      offZoom();
      battle.detach();
      game.detach();
      offEnd.forEach((off) => off());
      document.removeEventListener('visibilitychange', onVisibility);
      window.visualViewport?.removeEventListener('resize', onViewport);
      hud.unmount();
      threatArrows.destroy();
      view.destroy();
    },
  };
}
