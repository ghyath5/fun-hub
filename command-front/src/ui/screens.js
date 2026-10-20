// @ts-check
/**
 * Out-of-match screens (section 18): main menu, skirmish setup, load,
 * settings and the end-of-match report. Preact + htm; every action goes
 * through the callbacks given, and the screens hold no game state.
 */
import { html, render } from 'htm/preact';
import { FACTIONS, PLAYER_COLORS } from '../data/factions.js';
import { CREDITS } from '../data/credits.js';
import { CountryButton, Flag } from './countryPicker.js';
import { COUNTRIES } from '../data/countries.js';
import { GAME_SPEEDS, SETUP_DEFAULTS, SIM } from '../data/rules.js';
import { COLORS, ORE_GROWTH_OPTIONS, maxPlayersOf } from '../game/matchSetup.js';
import { GENERATOR } from '../map/generator.js';
import { LANGS, LANG_NAMES, t, int } from '../lib/i18n.js';

/** @typedef {import('../game/matchSetup.js').SetupForm} SetupForm */

const FACTION_IDS = /** @type {('coalition' | 'union')[]} */ (['coalition', 'union']);
const DIFFICULTIES = ['beginner', 'easy', 'normal', 'hard'];
const cap = (/** @type {string} */ s) => t(s[0].toUpperCase() + s.slice(1));
/** A faction's name in the current language. @param {'coalition' | 'union'} f */
export const factionName = (f) => t(FACTIONS[f].name);
const colorDot = (/** @type {string} */ c) => html`<span class="dot" style=${`background:${PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (c)].dot}`}></span>`;

/** mm:ss of a tick count. @param {number} ticks */
export const clock = (ticks) => {
  const s = Math.floor(ticks / SIM.ticksPerSecond);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** @param {{ label: string, children?: any, wide?: boolean }} p */
const Row = ({ label, children, wide }) => html`<label class=${`row ${wide ? 'wide' : ''}`}><span class="row-label">${label}</span><span class="row-ctl">${children}</span></label>`;

/**
 * @param {{ value: any, options: { value: any, label: string }[], onChange: (v: any) => void, label?: string }} p
 */
const Select = ({ value, options, onChange, label }) => html`<select aria-label=${label} value=${String(value)}
  onChange=${(/** @type {any} */ e) => {
    const o = options.find((x) => String(x.value) === e.target.value);
    onChange(o ? o.value : e.target.value);
  }}>
  ${options.map((o) => html`<option key=${String(o.value)} value=${String(o.value)}>${o.label}</option>`)}
</select>`;

/** @param {{ checked: boolean, onChange: (v: boolean) => void, label?: string }} p */
const Toggle = ({ checked, onChange, label }) => html`<input type="checkbox" class="toggle" aria-label=${label} checked=${checked}
  onChange=${(/** @type {any} */ e) => onChange(e.target.checked)} />`;

/**
 * @param {{ hasAutosave: boolean, homeScreenHint?: boolean, act: { skirmish: () => void, twoPhones: () => void, resume: () => void, load: () => void, settings: () => void, credits: () => void } }} p
 *   homeScreenHint: iPhone Safari, where only Add to Home Screen removes the browser bars
 */
export function MainMenu({ hasAutosave, homeScreenHint = false, act }) {
  return html`<div class="screen menu">
    <div class="menu-mark"><span>COMMAND</span><b>FRONT</b></div>
    <p class="menu-sub">${t('Classic real-time strategy · skirmish')}</p>
    <div class="menu-buttons">
      <button class="btn primary" onClick=${act.skirmish}>${t('Skirmish')}</button>
      <button class="btn" disabled=${!hasAutosave} onClick=${act.resume}>${t('Continue')}</button>
      <button class="btn" onClick=${act.load}>${t('Load game')}</button>
      <button class="btn" onClick=${act.twoPhones}>${t('Two phones · WiFi')}</button>
      <button class="btn" onClick=${act.settings}>${t('Settings')}</button>
      <button class="btn" onClick=${act.credits}>${t('Credits')}</button>
    </div>
    ${homeScreenHint ? html`<p class="menu-tip">${t('For full screen on iPhone: tap Share ⎙ then Add to Home Screen, and open the game from there.')}</p>` : null}
  </div>`;
}

/**
 * Credits (main menu): who made the game and what it is built with, ending with thanks.
 * @param {{ onBack: () => void }} p
 */
export function CreditsScreen({ onBack }) {
  return html`<div class="screen credits-screen">
    <header class="screen-head"><button class="btn" onClick=${onBack}>${t('‹ Back')}</button><h2>${t('Credits')}</h2><span></span></header>
    <div class="credits-roll">
      ${CREDITS.map((sec) => html`<section key=${sec.title}>
        <h3>${t(sec.title)}</h3>
        ${sec.lines.map((l) => html`<p><b>${l.name}</b>${l.note ? html`<span class="muted">${t(l.note)}</span>` : null}</p>`)}
      </section>`)}
      <p class="credits-end">${t('Thanks for playing')}</p>
    </div>
  </div>`;
}

/** Team options for a form: 2 v 2 needs four players; on two phones, "both phones against the AI". @param {SetupForm} form @param {boolean} online */
export function teamOptions(form, online) {
  const ais = form.opponents.filter((o) => !o.remote).length;
  const out = [{ value: 'ffa', label: t('Free-for-all') }];
  if (online && ais >= 1 && form.opponents.length >= 2) out.push({ value: 'coop', label: t('Both phones vs the AI') });
  else if (!online && form.opponents.length === 3) out.push({ value: '2v2', label: t('2 v 2 (you + first AI)') });
  return out;
}

/** @param {{ o: import('../game/matchSetup.js').OpponentForm }} p */
const RemoteSlot = ({ o }) => html`<div class="opp remote">${colorDot(o.color)}<${Flag} id=${o.country} /><b>${t('Phone 2')}</b>
  <span class="muted">${factionName(o.faction)} · ${cap(o.color)} · ${t('chosen on their phone')}</span></div>`;

/**
 * @param {{ form: SetupForm, maps: { id: string, name: string, maxPlayers: number }[], error: string,
 *   onChange: (f: SetupForm) => void, onStart: () => void, onBack: () => void, online?: boolean }} p
 *   online: the host's lobby in a two-phone match (opponent 1 is the other phone)
 */
export function SetupScreen({ form, maps, error, onChange, onStart, onBack, online = false }) {
  const set = (/** @type {Partial<SetupForm>} */ patch) => onChange({ ...form, ...patch });
  const generated = form.map === 'generated';
  const maxPlayers = maxPlayersOf(form, maps);
  const opp = (/** @type {number} */ k, /** @type {any} */ patch) => set({ opponents: form.opponents.map((o, i) => (i === k ? { ...o, ...patch } : o)) });
  return html`<div class="screen setup">
    <header class="screen-head">
      <button class="btn" onClick=${onBack}>${online ? t('‹ Leave') : t('‹ Back')}</button>
      <h2>${online ? t('Two phones') : t('Skirmish')}</h2>
      <button class="btn primary" onClick=${onStart}>${t('Start')}</button>
    </header>
    ${error ? html`<p class="setup-error" role="alert">${t(error)}</p>` : null}
    <div class="setup-body">
      <section class="setup-col">
        <h3>${t('Battlefield')}</h3>
        <${Row} label=${t('Map')}><${Select} label=${t('Map')} value=${form.map} onChange=${(v) => set({ map: v })}
          options=${[...maps.map((m) => ({ value: m.id, label: `${t(m.name)} (${m.maxPlayers})` })), { value: 'generated', label: t('Generated…') }]} /></${Row}>
        ${generated ? html`
          <${Row} label=${t('Seed')}><input type="number" inputmode="numeric" value=${form.genSeed} min="1"
            onChange=${(/** @type {any} */ e) => set({ genSeed: Math.max(1, e.target.value | 0) })} /></${Row}>
          <${Row} label=${t('Size')}><${Select} label=${t('Size')} value=${form.genSize} onChange=${(v) => set({ genSize: v })}
            options=${GENERATOR.sizes.map((s) => ({ value: s.size, label: `${t(s.name)} ${s.size} × ${s.size}` }))} /></${Row}>
          <${Row} label=${t('Bases')}><${Select} label=${t('Bases')} value=${maxPlayers} onChange=${(v) => set({ genPlayers: v })}
            options=${[{ value: 2, label: t('2 players') }, ...(form.genSize >= GENERATOR.minSizeFor4 ? [{ value: 4, label: t('4 players') }] : [])]} /></${Row}>` : null}
        <${Row} label=${t('Start positions')}><${Select} label=${t('Start positions')} value=${form.startPositions} onChange=${(v) => set({ startPositions: v })}
          options=${[{ value: 'random', label: t('Random') }, { value: 'fixed', label: t('Fixed') }]} /></${Row}>
        <h3>${t('You')}</h3>
        <${Row} label=${t('Faction')}><${Select} label=${t('Your faction')} value=${form.faction} onChange=${(v) => set({ faction: v })}
          options=${FACTION_IDS.map((f) => ({ value: f, label: factionName(f) }))} /></${Row}>
        <${Row} label=${t('Colour')}>${colorDot(form.color)}<${Select} label=${t('Your colour')} value=${form.color} onChange=${(v) => set({ color: v })}
          options=${COLORS.map((c) => ({ value: c, label: cap(c) }))} /></${Row}>
        <div class="row"><span class="row-label">${t('Country')}</span><span class="row-ctl"><${CountryButton} label=${t('Your country')} value=${form.country} onPick=${(v) => set({ country: v })} /></span></div>
        <h3>${t('Opponents')}</h3>
        ${form.opponents.map((o, k) => o.remote ? html`<${RemoteSlot} key=${k} o=${o} />` : html`<div class="opp" key=${k}>
          ${colorDot(o.color)}
          <${CountryButton} compact label=${t('Opponent {n} country', { n: k + 1 })} value=${o.country} onPick=${(v) => opp(k, { country: v })} />
          <${Select} label=${t('Opponent {n} faction', { n: k + 1 })} value=${o.faction} onChange=${(v) => opp(k, { faction: v })} options=${FACTION_IDS.map((f) => ({ value: f, label: factionName(f) }))} />
          <${Select} label=${t('Opponent {n} colour', { n: k + 1 })} value=${o.color} onChange=${(v) => opp(k, { color: v })} options=${COLORS.map((c) => ({ value: c, label: cap(c) }))} />
          <${Select} label=${t('Opponent {n} difficulty', { n: k + 1 })} value=${o.difficulty} onChange=${(v) => opp(k, { difficulty: v })} options=${DIFFICULTIES.map((d) => ({ value: d, label: cap(d) }))} />
          ${form.opponents.filter((x) => !x.remote).length > (online ? 0 : 1) ? html`<button class="cmd" aria-label=${t('Remove opponent')} onClick=${() => set({ opponents: form.opponents.filter((_, i) => i !== k) })}>✕</button>` : null}
        </div>`)}
        ${form.opponents.length + 1 < maxPlayers ? html`<button class="btn" onClick=${() => set({ opponents: [...form.opponents, {
          faction: form.opponents.length % 2 ? 'coalition' : 'union', color: COLORS.find((c) => c !== form.color && !form.opponents.some((o) => o.color === c)) ?? 'green',
          country: COUNTRIES.find((c) => c.id !== form.country && !form.opponents.some((o) => o.country === c.id))?.id ?? '', difficulty: 'normal' }] })}>${t('+ Add AI opponent')}</button>` : null}
        ${teamOptions(form, online).length > 1 ? html`<${Row} label=${t('Teams')}><${Select} label=${t('Teams')} value=${form.teams} onChange=${(v) => set({ teams: v })}
          options=${teamOptions(form, online)} /></${Row}>` : null}
      </section>
      <section class="setup-col">
        <h3>${t('Rules')}</h3>
        <${Row} label=${t('Starting credits')}><${Select} label=${t('Starting credits')} value=${form.startingCredits} onChange=${(v) => set({ startingCredits: v })}
          options=${SETUP_DEFAULTS.startingCreditsOptions.map((c) => ({ value: c, label: `$${int(c)}` }))} /></${Row}>
        <${Row} label=${t('Starting units')}><${Select} label=${t('Starting units')} value=${form.startingUnits} onChange=${(v) => set({ startingUnits: v })}
          options=${[{ value: 'mcv', label: t('MCV only') }, { value: 'force', label: t('MCV + 2 vehicles + 4 Riflemen') }]} /></${Row}>
        <${Row} label=${t('Tech level {n}', { n: form.techLevel })}><input type="range" min="1" max="10" value=${form.techLevel} aria-label=${t('Tech level')}
          onInput=${(/** @type {any} */ e) => set({ techLevel: e.target.value | 0 })} /></${Row}>
        <${Row} label=${t('Ore regrowth')}><${Select} label=${t('Ore regrowth')} value=${form.oreGrowthSeconds} onChange=${(v) => set({ oreGrowthSeconds: v })}
          options=${ORE_GROWTH_OPTIONS.map((s) => ({ value: s, label: s ? t('{n} s', { n: s }) : t('Off') }))} /></${Row}>
        <${Row} label=${t('Fog of war')}><${Toggle} label=${t('Fog of war')} checked=${form.fog} onChange=${(v) => set({ fog: v })} /></${Row}>
        <${Row} label=${t('Crates')}><${Toggle} label=${t('Crates')} checked=${form.crates} onChange=${(v) => set({ crates: v })} /></${Row}>
        <${Row} label=${t('Short game')}><${Toggle} label=${t('Short game')} checked=${form.shortGame} onChange=${(v) => set({ shortGame: v })} /></${Row}>
        <${Row} label=${t('Game speed')}><${Select} label=${t('Game speed')} value=${form.speed} onChange=${(v) => set({ speed: v })}
          options=${Object.entries(GAME_SPEEDS).map(([s, g]) => ({ value: s, label: t(g.name) }))} /></${Row}>
      </section>
    </div>
  </div>`;
}

/**
 * @param {{ title: string, slots: { slot: string, label: string, at?: string, info?: string }[], mode: 'load' | 'save',
 *   onPick: (slot: string) => void, onDelete?: (slot: string) => void, onBack: () => void }} p
 */
export function SlotsScreen({ title, slots, mode, onPick, onDelete, onBack }) {
  return html`<div class="screen slots">
    <header class="screen-head"><button class="btn" onClick=${onBack}>${t('‹ Back')}</button><h2>${title}</h2><span></span></header>
    <ul class="slot-list">
      ${slots.map((s) => html`<li key=${s.slot} class="slot panel">
        <div class="slot-text"><b>${s.label}</b><span class="muted">${s.at ? `${new Date(s.at).toLocaleString()} · ${s.info ?? ''}` : t('Empty')}</span></div>
        <button class="btn primary" disabled=${mode === 'load' && !s.at} onClick=${() => onPick(s.slot)}>${mode === 'load' ? t('Load') : s.at ? t('Overwrite') : t('Save')}</button>
        ${onDelete && s.at && s.slot !== 'auto' ? html`<button class="cmd" aria-label=${t('Delete {name}', { name: s.label })} onClick=${() => onDelete(s.slot)}>✕</button>` : null}
      </li>`)}
    </ul>
  </div>`;
}

/**
 * @typedef {object} AppSettings
 * @property {boolean} leftHanded
 * @property {boolean} haptics
 * @property {number} effects   0–1
 * @property {number} voice     0–1
 * @property {number} ui        0–1
 * @property {boolean} [autoFullscreen]  Ask for full screen on the first tap and at each match start
 * @property {boolean} [edgePan]         Mouse at the screen edge scrolls the map
 * @property {'en' | 'ar'} textLang     Language of the text
 * @property {'en' | 'ar'} voiceLang    Language of the announcer and unit voices
 * @property {'3d' | '2d'} [graphics]   The battlefield in 3D (default) or the classic 2D sprites
 */

/**
 * @typedef {object} SoundsPanel  Settings → Custom sounds
 * @property {string[]} names      every name a file can take
 * @property {string[]} replaced   names that have a file of the player's
 * @property {number} count        files kept
 * @property {string} note         what the last import did
 * @property {(files: File[]) => void} add
 * @property {() => void} clear
 */

/** @param {{ sounds: SoundsPanel }} p */
function CustomSounds({ sounds }) {
  const replaced = new Set(sounds.replaced);
  return html`<section class="setup-col custom-sounds">
    <h3>${t('Custom sounds')}</h3>
    <p class="muted">${t('Play your own sound files instead of the built-in ones. Name each file after the sound it replaces, for example')}
      <code dir="ltr">constructionComplete.mp3</code>, <code dir="ltr">infantry.select.mp3</code> ${t('or')} <code dir="ltr">sfx.cannon.wav</code>;
      ${t('add -2, -3… for more versions of one sound. The files stay on this device.')}</p>
    <div class="row-buttons">
      <label class="btn">${t('Add sound files…')}<input type="file" accept="audio/*" multiple class="file-pick"
        onChange=${(/** @type {any} */ e) => { sounds.add([...e.target.files]); e.target.value = ''; }} /></label>
      ${sounds.count ? html`<button class="btn" onClick=${sounds.clear}>${t('Remove all ({n})', { n: sounds.count })}</button>` : null}
    </div>
    ${sounds.note ? html`<p class="muted" role="status">${sounds.note}</p>` : null}
    <details><summary>${t('Sound names ({n})', { n: sounds.names.length })}</summary>
      <div class="sound-names">${sounds.names.map((n) => html`<code class=${replaced.has(n) ? 'mine' : ''}>${n}</code>`)}</div>
    </details>
  </section>`;
}

/** @param {{ settings: AppSettings, onChange: (s: AppSettings) => void, onBack: () => void, sounds?: SoundsPanel }} p */
export function SettingsScreen({ settings, onChange, onBack, sounds }) {
  const set = (/** @type {Partial<AppSettings>} */ patch) => onChange({ ...settings, ...patch });
  const slider = (/** @type {'effects' | 'voice' | 'ui'} */ k, /** @type {string} */ label) => html`<${Row} label=${label}>
    <input type="range" min="0" max="100" value=${Math.round(settings[k] * 100)} aria-label=${label}
      onInput=${(/** @type {any} */ e) => set({ [k]: (e.target.value | 0) / 100 })} /></${Row}>`;
  return html`<div class="screen settings">
    <header class="screen-head"><button class="btn" onClick=${onBack}>${t('‹ Back')}</button><h2>${t('Settings')}</h2><span></span></header>
    <div class="setup-body"><section class="setup-col">
      <h3>${t('Language')}</h3>
      <${Row} label=${t('Text')}><${Select} label=${t('Text language')} value=${settings.textLang} onChange=${(v) => set({ textLang: v })}
        options=${LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))} /></${Row}>
      <${Row} label=${t('Voices')}><${Select} label=${t('Voice language')} value=${settings.voiceLang} onChange=${(v) => set({ voiceLang: v })}
        options=${LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))} /></${Row}>
      <h3>${t('Graphics')}</h3>
      <${Row} label=${t('Battlefield view')}><${Select} label=${t('Battlefield view')} value=${settings.graphics ?? '3d'} onChange=${(v) => set({ graphics: v })}
        options=${[{ value: '3d', label: t('3D') }, { value: '2d', label: t('Classic 2D') }]} /></${Row}>
      <p class="muted">${t('Applies from the next match.')}</p>
      <h3>${t('Controls and sound')}</h3>
      <${Row} label=${t('Left-handed layout')}><${Toggle} label=${t('Left-handed layout')} checked=${settings.leftHanded} onChange=${(v) => set({ leftHanded: v })} /></${Row}>
      <${Row} label=${t('Haptics')}><${Toggle} label=${t('Haptics')} checked=${settings.haptics} onChange=${(v) => set({ haptics: v })} /></${Row}>
      <${Row} label=${t('Scroll at screen edges (mouse)')}><${Toggle} label=${t('Scroll at screen edges (mouse)')} checked=${settings.edgePan !== false} onChange=${(v) => set({ edgePan: v })} /></${Row}>
      <${Row} label=${t('Full screen automatically')}><${Toggle} label=${t('Full screen automatically')} checked=${settings.autoFullscreen !== false} onChange=${(v) => set({ autoFullscreen: v })} /></${Row}>
      ${slider('effects', t('Effects volume'))}
      ${slider('voice', t('Voice volume'))}
      ${slider('ui', t('Interface volume'))}
    </section>
    ${sounds ? html`<${CustomSounds} sounds=${sounds} />` : null}</div>
  </div>`;
}

/**
 * End of the match (section 18): who won, the time, and each player's numbers.
 * @param {{ outcome: 'victory' | 'defeat' | 'draw', ticks: number,
 *   rows: { name: string, color: string, country?: string, alive: boolean, stats: Record<string, number> }[],
 *   act: { rematch?: () => void, menu: () => void }, labels?: { rematch?: string, menu?: string, note?: string } }} p
 *   No rematch action shows the note instead (a two-phone guest waits for the host).
 */
export function EndScreen({ outcome, ticks, rows, act, labels = {} }) {
  const title = { victory: t('Victory'), defeat: t('Defeat'), draw: t('Draw') }[outcome];
  const cols = [
    ['unitsBuilt', t('Units built')], ['unitsLost', t('Units lost')], ['unitsKilled', t('Units killed')],
    ['structuresBuilt', t('Structures built')], ['structuresLost', t('Structures lost')], ['creditsHarvested', t('Credits harvested')],
  ];
  return html`<div class="screen end">
    <h2 class=${`end-title ${outcome}`}>${title}</h2>
    <p class="muted">${t('Match time {time}', { time: clock(ticks) })}</p>
    <div class="end-table-wrap"><table class="end-table">
      <thead><tr><th>${t('Player')}</th>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr class=${r.alive ? '' : 'out'}>
        <td>${colorDot(r.color)} <${Flag} id=${r.country} />${r.name}</td>${cols.map(([k]) => html`<td>${int(r.stats[k] ?? 0)}</td>`)}</tr>`)}</tbody>
    </table></div>
    <div class="menu-buttons row">
      ${act.rematch ? html`<button class="btn primary" onClick=${act.rematch}>${labels.rematch ?? t('Rematch')}</button>` : null}
      <button class="btn" onClick=${act.menu}>${labels.menu ?? t('Main menu')}</button>
    </div>
    ${labels.note ? html`<p class="muted end-note">${labels.note}</p>` : null}
  </div>`;
}

/** Render a screen (or nothing) into the screens layer. @param {HTMLElement} el @param {any} vnode */
export function showScreen(el, vnode) {
  el.classList.toggle('on', !!vnode);
  render(vnode, el);
}
