// @ts-check
/**
 * The application flow (section 18): main menu → skirmish setup → match →
 * end screen, plus loading, saving (3 slots and an autosave every 2 min, on
 * pause and when the app is hidden) and settings. Owns at most one session.
 */
import { loadMap, BUNDLED_MAPS } from '../map/loader.js';
import { mapForForm } from './mapForForm.js';
import { createSession } from './session.js';
import { defaultForm, normaliseForm, startMatch, maxPlayersOf } from './matchSetup.js';
import { snapshot, restore } from '../save/serialize.js';
import { saveGame, loadGame, listSaves, deleteGame, saveSettings, loadSettings } from '../lib/storage.js';
import { createAudio } from '../lib/audio.js';
import { createCustomSounds } from './customSounds.js';
import { createBackGuard } from '../ui/backGuard.js';
import { setHaptics } from '../lib/haptics.js';
import { showScreen, MainMenu, SetupScreen, SlotsScreen, SettingsScreen, EndScreen, CreditsScreen } from '../ui/screens.js';
import { html } from 'htm/preact';
import { VICTORY } from '../data/rules.js';
import { FACTIONS } from '../data/factions.js';
import { createTwoPhones } from './twoPhones.js';
import { inviteInUrl } from '../net/link.js';
import { autoFullscreen, enterFullscreen, needsHomeScreen } from '../ui/fullscreen.js';
import { setLanguages, browserLang, textLang, voiceLang, t, list as listOf } from '../lib/i18n.js';

const HUMAN = 0;
const AUTOSAVE_MS = VICTORY.autosaveSeconds * 1000;
const FIRST_HINT = 'Tap the truck, then Deploy';

/** @typedef {import('./matchSetup.js').SetupForm} SetupForm */
/** @typedef {import('../ui/screens.js').AppSettings} AppSettings */

/** @returns {AppSettings} */
const defaultSettings = () => ({ leftHanded: false, haptics: true, effects: 1, voice: 1, ui: 0.8, autoFullscreen: true, textLang: browserLang(), voiceLang: browserLang(), graphics: /** @type {'3d' | '2d'} */ ('3d') });

/**
 * @param {{ hudEl: HTMLElement, worldEl: HTMLElement, screensEl: HTMLElement, debug: boolean }} el
 */
export async function startApp({ hudEl, worldEl, screensEl, debug }) {
  const audio = createAudio();
  const customSounds = createCustomSounds(audio);
  customSounds.load().catch((e) => console.warn('[audio] custom sounds', e));
  /** What the last custom-sound import did, for the settings screen. */
  let soundsNote = '';
  /** @type {AppSettings & { form?: SetupForm, played?: boolean, mpForm?: SetupForm, mpMe?: { faction: 'coalition' | 'union', color: string } }} */
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
    setLanguages({ text: settings.textLang, voice: settings.voiceLang });
    settings.textLang = textLang();
    settings.voiceLang = voiceLang();
    setHaptics(settings.haptics);
    audio.setBusVolume('effects', settings.effects);
    audio.setBusVolume('voice', settings.voice);
    audio.setBusVolume('ui', settings.ui);
  };
  applySettings();
  const persist = () => saveSettings({ ...settings, form }).catch(() => {});
  const fullscreen = autoFullscreen(() => settings.autoFullscreen !== false);

  // ---- Screens.
  const menu = async () => {
    const saves = await listSaves().catch(() => []);
    showScreen(screensEl, html`<${MainMenu} hasAutosave=${saves.some((s) => s.slot === 'auto')} homeScreenHint=${needsHomeScreen()}
      act=${{ skirmish: setup, twoPhones: () => twoPhones.open(), resume: () => loadSlot('auto'), load: () => slots('load', menu), settings: () => settingsScreen(menu), credits: () => showScreen(screensEl, html`<${CreditsScreen} onBack=${menu} />`) }} />`);
  };

  const setup = () => {
    showScreen(screensEl, html`<${SetupScreen} form=${form} maps=${maps} error=${setupError}
      onChange=${(/** @type {SetupForm} */ f) => {
        form = normaliseForm(f, maxPlayersOf(f, maps));
        setup();
      }}
      onStart=${startFromForm} onBack=${() => { setupError = ''; menu(); }} />`);
  };

  /** @param {() => void} back */
  const settingsScreen = async (back) => {
    /** @type {import('../ui/screens.js').SoundsPanel} */
    const sounds = {
      names: await customSounds.names(),
      replaced: customSounds.replaced,
      count: customSounds.count,
      note: soundsNote,
      add: async (files) => {
        const r = await customSounds.add(files).catch((e) => ({ added: 0, unknown: [], tooBig: [], full: false, error: String(e) }));
        soundsNote = [
          r.added === 1 ? t('1 file added.') : t('{n} files added.', { n: r.added }),
          r.unknown.length ? t('Not a sound name: {list}.', { list: listOf(r.unknown) }) : '',
          r.tooBig.length ? t('Too large (over 5 MB): {list}.', { list: listOf(r.tooBig) }) : '',
          r.full ? t('Storage for custom sounds is full; remove some first.') : '',
          /** @type {any} */ (r).error ? t('Could not save: {why}', { why: /** @type {any} */ (r).error }) : '',
        ].filter(Boolean).join(' ');
        settingsScreen(back);
      },
      clear: async () => { await customSounds.clear(); soundsNote = t('Custom sounds removed: the built-in sounds play again.'); settingsScreen(back); },
    };
    showScreen(screensEl, html`<${SettingsScreen} settings=${settings} sounds=${sounds}
      onChange=${(/** @type {AppSettings} */ s) => { settings = { ...settings, ...s }; applySettings(); persist(); settingsScreen(back); }}
      onBack=${() => { soundsNote = ''; back(); }} />`);
  };

  /** Save or load slots. @param {'save' | 'load'} mode @param {() => void} back */
  const slots = async (mode, back) => {
    const saved = await listSaves().catch(() => []);
    const list = ['auto', '1', '2', '3']
      .filter((slot) => mode === 'load' || slot !== 'auto')
      .map((slot) => {
        const rec = saved.find((s) => s.slot === slot);
        return { slot, label: slot === 'auto' ? t('Autosave') : t('Slot {n}', { n: slot }), at: rec?.at, info: rec?.info };
      });
    showScreen(screensEl, html`<${SlotsScreen} title=${mode === 'save' ? t('Save game') : t('Load game')} slots=${list} mode=${mode}
      onPick=${async (/** @type {string} */ slot) => {
        if (mode === 'save') { await saveTo(slot); back(); } else await loadSlot(slot);
      }}
      onDelete=${async (/** @type {string} */ slot) => { await deleteGame(slot); slots(mode, back); }}
      onBack=${back} />`);
  };

  // ---- Matches.
  // Back (button, swipe or gesture) while playing pauses instead of leaving; Exit in the pause menu leaves.
  let backToastAt = -Infinity;
  const backGuard = createBackGuard(() => {
    if (!session) return;
    session.pause();
    if (performance.now() - backToastAt < 3000) return; // one reminder per burst of Back presses
    backToastAt = performance.now();
    session.toaster.show('Back is off during a match. To leave, use the exit button in this menu.');
  });
  const stopSession = () => {
    backGuard.disarm();
    clearInterval(autosaveTimer);
    session?.destroy();
    session = null;
    hudEl.replaceChildren();
    hudEl.className = 'hud';
    document.documentElement.classList.remove('in-match');
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
    const chosen = await mapForForm(form);
    setupError = chosen.error;
    if (!chosen.map) { setup(); return; }
    const map = chosen.map;
    const seed = chosen.seed ?? Date.now() % 1e9;
    form = normaliseForm(form, map.maxPlayers);
    persist();
    const world = startMatch(form, map, seed);
    const first = !settings.played;
    settings.played = true;
    persist();
    await begin(world, { speed: form.speed, form }, first ? FIRST_HINT : null);
  }

  /**
   * Put a world on screen. A two-phone match passes its net play and its own
   * hooks (no saves; leaving and the end screen are the two-phone flow's).
   * @param {any} world @param {any} m @param {string | null} hint
   * @param {import('../net/netMatch.js').NetPlay | null} [net] @param {any} [online] hooks for a two-phone match
   */
  async function begin(world, m, hint, net = null, online = null) {
    stopSession();
    fullscreen.request();
    showScreen(screensEl, null);
    document.documentElement.classList.add('in-match');
    backGuard.arm();
    meta = m;
    const human = m.me ?? HUMAN; // the player this phone controls
    session = await createSession({
      world, human, hudEl, worldEl, audio, speed: m.speed ?? 'normal', debug, hint, leftHanded: settings.leftHanded, net, edgePan: settings.edgePan !== false,
      graphics: settings.graphics ?? '3d',
      hooks: online ?? {
        save: () => slots('save', () => showScreen(screensEl, null)),
        load: () => slots('load', () => showScreen(screensEl, null)),
        autosave: () => { saveTo('auto'); },
        exit: () => { saveTo('auto').finally(() => { stopSession(); menu(); }); },
        ended: (/** @type {any} */ result) => ended(result),
        speedChanged: (/** @type {string} */ s) => { meta = { ...meta, speed: s }; },
      },
    });
    if (hint) {
      // First match: centre on the MCV.
      const mcv = world.entities.all().find((e) => e.owner === HUMAN && e.type === 'mcv');
      if (mcv) session.view.camera.home(mcv.cx, mcv.cy);
    }
    if (!net) autosaveTimer = /** @type {any} */ (setInterval(() => { if (session && !document.hidden) saveTo('auto'); }, AUTOSAVE_MS));
    document.body.classList.add('ready');
    return session;
  }

  const twoPhones = createTwoPhones({
    screensEl,
    maps,
    prefs: {
      get: () => ({ form: settings.mpForm, me: settings.mpMe }),
      set: (p) => {
        if (p.form) settings.mpForm = p.form;
        if (p.me) settings.mpMe = p.me;
        persist();
      },
    },
    play: (world, m, net, hooks) => begin(world, m, null, net, hooks),
    stop: stopSession,
    session: () => session,
    menu,
  });

  /** @param {{ tick: number, draw: boolean, winners: number[] }} result */
  function ended(result) {
    if (!session) return;
    const w = session.world;
    const outcome = result.draw ? 'draw' : result.winners.some((id) => w.allied(id, HUMAN)) ? 'victory' : 'defeat';
    const rows = w.players.map((/** @type {any} */ p) => ({
      name: `${p.human ? t('You') : t('AI ({level})', { level: t(p.difficulty[0].toUpperCase() + p.difficulty.slice(1)) })} · ${t(FACTIONS[/** @type {'coalition' | 'union'} */ (p.faction)].name)}`,
      color: p.color, country: p.country, alive: p.alive, stats: p.stats,
    }));
    stopSession();
    deleteGame('auto').catch(() => {});
    showScreen(screensEl, html`<${EndScreen} outcome=${outcome} ticks=${result.tick} rows=${rows}
      act=${{ rematch: () => startFromForm(), menu }} />`);
  }

  if (new URLSearchParams(location.search).has('showcase')) {
    const { runShowcase } = await import('./showcase.js');
    runShowcase({ hudEl, worldEl, screensEl, audio, mode: new URLSearchParams(location.search).get('showcase') ?? '' }).catch((e) => console.error(e));
    return { get session() { return session; }, startFromForm, menu };
  }
  if (new URLSearchParams(location.search).has('bench')) {
    const { runBenchmark } = await import('./bench.js');
    const secs = Number(new URLSearchParams(location.search).get('bench')) || undefined;
    runBenchmark({ hudEl, worldEl, screensEl, audio, seconds: secs }).catch((e) => console.error(e));
    return { get session() { return session; }, startFromForm, menu };
  }
  // A phone that scanned the host's invite QR opens the game at …/#o=<code>.
  const invite = inviteInUrl();
  if (invite) {
    history.replaceState(null, '', location.pathname);
    twoPhones.joinWith(invite);
  } else {
    await menu();
  }
  document.body.classList.add('ready');
  return {
    /** The running session (debugging). */
    get session() { return session; },
    startFromForm,
    menu,
  };
}
