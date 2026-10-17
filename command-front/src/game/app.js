// @ts-check
/**
 * The application flow (section 18): main menu → skirmish setup → match →
 * end screen, plus loading, saving (3 slots and an autosave every 2 min, on
 * pause and when the app is hidden) and settings. Owns at most one session.
 */
import { loadMap, BUNDLED_MAPS } from '../map/loader.js';
import { validateMap, describe } from '../map/validator.js';
import { generateMap } from '../map/generator.js';
import { createSession } from './session.js';
import { defaultForm, normaliseForm, startMatch } from './matchSetup.js';
import { snapshot, restore } from '../save/serialize.js';
import { saveGame, loadGame, listSaves, deleteGame, saveSettings, loadSettings } from '../lib/storage.js';
import { createAudio } from '../lib/audio.js';
import { setHaptics } from '../lib/haptics.js';
import { showScreen, MainMenu, SetupScreen, SlotsScreen, SettingsScreen, EndScreen } from '../ui/screens.js';
import { html } from 'htm/preact';
import { VICTORY } from '../data/rules.js';
import { FACTIONS } from '../data/factions.js';

const HUMAN = 0;
const AUTOSAVE_MS = VICTORY.autosaveSeconds * 1000;
const FIRST_HINT = 'Tap the truck, then Deploy';

/** @typedef {import('./matchSetup.js').SetupForm} SetupForm */
/** @typedef {import('../ui/screens.js').AppSettings} AppSettings */

/** @returns {AppSettings} */
const defaultSettings = () => ({ leftHanded: false, haptics: true, effects: 1, voice: 1, ui: 0.8 });

/**
 * @param {{ hudEl: HTMLElement, worldEl: HTMLElement, screensEl: HTMLElement, debug: boolean }} el
 */
export async function startApp({ hudEl, worldEl, screensEl, debug }) {
  const audio = createAudio();
  /** @type {AppSettings & { form?: SetupForm, played?: boolean }} */
  let settings = { ...defaultSettings(), ...(await loadSettings().catch(() => ({}))) };
  let form = normaliseForm({ ...defaultForm(), ...(settings.form ?? {}) }, 4);
  /** @type {Awaited<ReturnType<typeof createSession>> | null} */
  let session = null;
  /** What the running match was started from (for saves and rematches). @type {any} */
  let meta = null;
  let autosaveTimer = 0;
  let setupError = '';

  /** Bundled maps, loaded once for the setup screen. */
  const maps = await Promise.all(BUNDLED_MAPS.map(async (id) => {
    const m = await loadMap(id);
    return { id, name: m.name, maxPlayers: m.maxPlayers };
  }));

  const applySettings = () => {
    setHaptics(settings.haptics);
    audio.setBusVolume('effects', settings.effects);
    audio.setBusVolume('voice', settings.voice);
    audio.setBusVolume('ui', settings.ui);
  };
  applySettings();
  const persist = () => saveSettings({ ...settings, form }).catch(() => {});

  // ---- Screens.
  const menu = async () => {
    const saves = await listSaves().catch(() => []);
    showScreen(screensEl, html`<${MainMenu} hasAutosave=${saves.some((s) => s.slot === 'auto')}
      act=${{ skirmish: setup, resume: () => loadSlot('auto'), load: () => slots('load', menu), settings: () => settingsScreen(menu) }} />`);
  };

  const setup = () => {
    showScreen(screensEl, html`<${SetupScreen} form=${form} maps=${maps} error=${setupError}
      onChange=${(/** @type {SetupForm} */ f) => {
        const mp = f.map === 'generated' ? (f.genSize >= 96 ? 4 : 2) : maps.find((m) => m.id === f.map)?.maxPlayers ?? 2;
        form = normaliseForm(f, mp);
        setup();
      }}
      onStart=${startFromForm} onBack=${() => { setupError = ''; menu(); }} />`);
  };

  /** @param {() => void} back */
  const settingsScreen = (back) => {
    showScreen(screensEl, html`<${SettingsScreen} settings=${settings}
      onChange=${(/** @type {AppSettings} */ s) => { settings = { ...settings, ...s }; applySettings(); persist(); settingsScreen(back); }}
      onBack=${back} />`);
  };

  /** Save or load slots. @param {'save' | 'load'} mode @param {() => void} back */
  const slots = async (mode, back) => {
    const saved = await listSaves().catch(() => []);
    const list = ['auto', '1', '2', '3']
      .filter((slot) => mode === 'load' || slot !== 'auto')
      .map((slot) => {
        const rec = saved.find((s) => s.slot === slot);
        return { slot, label: slot === 'auto' ? 'Autosave' : `Slot ${slot}`, at: rec?.at, info: rec?.info };
      });
    showScreen(screensEl, html`<${SlotsScreen} title=${mode === 'save' ? 'Save game' : 'Load game'} slots=${list} mode=${mode}
      onPick=${async (/** @type {string} */ slot) => {
        if (mode === 'save') { await saveTo(slot); back(); } else await loadSlot(slot);
      }}
      onDelete=${async (/** @type {string} */ slot) => { await deleteGame(slot); slots(mode, back); }}
      onBack=${back} />`);
  };

  // ---- Matches.
  const stopSession = () => {
    clearInterval(autosaveTimer);
    session?.destroy();
    session = null;
    hudEl.replaceChildren();
    hudEl.className = 'hud';
  };

  /** Write the running match to a slot. @param {string} slot */
  const saveTo = async (slot) => {
    if (!session || session.world.result) return;
    const w = session.world;
    const info = `${w.map.name} · ${Math.floor(w.tick / 15 / 60)} min`;
    await saveGame(slot, { snapshot: snapshot(w), meta }, info).catch((e) => console.warn('save failed', e));
    session?.toaster.show(slot === 'auto' ? 'Autosaved' : 'Game saved');
  };

  /** @param {string} slot */
  const loadSlot = async (slot) => {
    try {
      const data = await loadGame(slot);
      if (!data) return;
      const world = restore(data.snapshot);
      stopSession();
      await begin(world, data.meta ?? { speed: 'normal' }, null);
    } catch (e) {
      showScreen(screensEl, html`<div class="screen menu"><div class="notice-card panel">
        <h1>That save cannot be loaded</h1><pre class="notice-body">${String(/** @type {any} */ (e)?.message ?? e)}</pre>
        <button class="btn" onClick=${menu}>Back</button></div></div>`);
    }
  };

  async function startFromForm() {
    let map;
    let seed = Date.now() % 1e9;
    if (form.map === 'generated') {
      const gen = generateMap({ seed: form.genSeed, size: form.genSize, players: form.genSize >= 96 ? 4 : 2 });
      if (gen) { map = gen.map; seed = gen.seed; } else {
        setupError = 'No valid map came out of 20 seeds; playing Duel Canyon instead.';
        map = await loadMap('duel-canyon');
      }
    } else {
      map = await loadMap(form.map);
      const report = validateMap(map);
      if (!report.ok) { setupError = `Map "${map.name}" cannot be played:\n${describe(report.errors)}`; setup(); return; }
    }
    form = normaliseForm(form, map.maxPlayers);
    persist();
    const world = startMatch(form, map, seed);
    const first = !settings.played;
    settings.played = true;
    persist();
    await begin(world, { speed: form.speed, form }, first ? FIRST_HINT : null);
  }

  /** Put a world on screen. @param {any} world @param {any} m @param {string | null} hint */
  async function begin(world, m, hint) {
    stopSession();
    showScreen(screensEl, null);
    meta = m;
    session = await createSession({
      world, human: HUMAN, hudEl, worldEl, audio, speed: m.speed ?? 'normal', debug, hint, leftHanded: settings.leftHanded,
      hooks: {
        save: () => slots('save', () => showScreen(screensEl, null)),
        load: () => slots('load', () => showScreen(screensEl, null)),
        autosave: () => { saveTo('auto'); },
        exit: () => { saveTo('auto').finally(() => { stopSession(); menu(); }); },
        ended: (result) => ended(result),
      },
    });
    if (hint) {
      // First match: centre on the MCV.
      const mcv = world.entities.all().find((e) => e.owner === HUMAN && e.type === 'mcv');
      if (mcv) session.view.camera.home(mcv.cx, mcv.cy);
    }
    autosaveTimer = /** @type {any} */ (setInterval(() => { if (session && !document.hidden) saveTo('auto'); }, AUTOSAVE_MS));
    document.body.classList.add('ready');
  }

  /** @param {{ tick: number, draw: boolean, winners: number[] }} result */
  function ended(result) {
    if (!session) return;
    const w = session.world;
    const outcome = result.draw ? 'draw' : result.winners.some((id) => w.allied(id, HUMAN)) ? 'victory' : 'defeat';
    const rows = w.players.map((/** @type {any} */ p) => ({
      name: `${p.human ? 'You' : `AI (${p.difficulty})`} · ${FACTIONS[/** @type {'coalition' | 'union'} */ (p.faction)].name}`,
      color: p.color, alive: p.alive, stats: p.stats,
    }));
    stopSession();
    deleteGame('auto').catch(() => {});
    showScreen(screensEl, html`<${EndScreen} outcome=${outcome} ticks=${result.tick} rows=${rows}
      act=${{ rematch: () => startFromForm(), menu }} />`);
  }

  if (new URLSearchParams(location.search).has('bench')) {
    const { runBenchmark } = await import('./bench.js');
    const secs = Number(new URLSearchParams(location.search).get('bench')) || undefined;
    runBenchmark({ hudEl, worldEl, screensEl, audio, seconds: secs }).catch((e) => console.error(e));
    return { get session() { return session; }, startFromForm, menu };
  }
  await menu();
  document.body.classList.add('ready');
  return {
    /** The running session (debugging). */
    get session() { return session; },
    startFromForm,
    menu,
  };
}
