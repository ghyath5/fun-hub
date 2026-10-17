// @ts-check
/**
 * Out-of-match screens (section 18): main menu, skirmish setup, load,
 * settings and the end-of-match report. Preact + htm; every action goes
 * through the callbacks given, and the screens hold no game state.
 */
import { html, render } from 'htm/preact';
import { FACTIONS, PLAYER_COLORS } from '../data/factions.js';
import { GAME_SPEEDS, SETUP_DEFAULTS, SIM } from '../data/rules.js';
import { COLORS, ORE_GROWTH_OPTIONS } from '../game/matchSetup.js';

/** @typedef {import('../game/matchSetup.js').SetupForm} SetupForm */

const FACTION_IDS = /** @type {('coalition' | 'union')[]} */ (['coalition', 'union']);
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const cap = (/** @type {string} */ s) => s[0].toUpperCase() + s.slice(1);
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
 * @param {{ hasAutosave: boolean, homeScreenHint?: boolean, act: { skirmish: () => void, twoPhones: () => void, resume: () => void, load: () => void, settings: () => void } }} p
 *   homeScreenHint: iPhone Safari, where only Add to Home Screen removes the browser bars
 */
export function MainMenu({ hasAutosave, homeScreenHint = false, act }) {
  return html`<div class="screen menu">
    <div class="menu-mark"><span>COMMAND</span><b>FRONT</b></div>
    <p class="menu-sub">Classic real-time strategy · skirmish</p>
    <div class="menu-buttons">
      <button class="btn primary" onClick=${act.skirmish}>Skirmish</button>
      <button class="btn" disabled=${!hasAutosave} onClick=${act.resume}>Continue</button>
      <button class="btn" onClick=${act.load}>Load game</button>
      <button class="btn" onClick=${act.twoPhones}>Two phones · WiFi</button>
      <button class="btn" onClick=${act.settings}>Settings</button>
    </div>
    ${homeScreenHint ? html`<p class="menu-tip">For full screen on iPhone: tap Share <span aria-hidden="true">⎙</span> then <b>Add to Home Screen</b>, and open the game from there.</p>` : null}
  </div>`;
}

/** Team options for a form: 2 v 2 needs four players; on two phones, "both phones against the AI". @param {SetupForm} form @param {boolean} online */
export function teamOptions(form, online) {
  const ais = form.opponents.filter((o) => !o.remote).length;
  const out = [{ value: 'ffa', label: 'Free-for-all' }];
  if (online && ais >= 1 && form.opponents.length >= 2) out.push({ value: 'coop', label: 'Both phones vs the AI' });
  else if (!online && form.opponents.length === 3) out.push({ value: '2v2', label: '2 v 2 (you + first AI)' });
  return out;
}

/** @param {{ o: import('../game/matchSetup.js').OpponentForm }} p */
const RemoteSlot = ({ o }) => html`<div class="opp remote">${colorDot(o.color)}<b>Phone 2</b>
  <span class="muted">${FACTIONS[o.faction].name} · ${cap(o.color)} · chosen on their phone</span></div>`;

/**
 * @param {{ form: SetupForm, maps: { id: string, name: string, maxPlayers: number }[], error: string,
 *   onChange: (f: SetupForm) => void, onStart: () => void, onBack: () => void, online?: boolean }} p
 *   online: the host's lobby in a two-phone match (opponent 1 is the other phone)
 */
export function SetupScreen({ form, maps, error, onChange, onStart, onBack, online = false }) {
  const set = (/** @type {Partial<SetupForm>} */ patch) => onChange({ ...form, ...patch });
  const generated = form.map === 'generated';
  const maxPlayers = generated ? (form.genSize >= 96 ? 4 : 2) : maps.find((m) => m.id === form.map)?.maxPlayers ?? 2;
  const opp = (/** @type {number} */ k, /** @type {any} */ patch) => set({ opponents: form.opponents.map((o, i) => (i === k ? { ...o, ...patch } : o)) });
  return html`<div class="screen setup">
    <header class="screen-head">
      <button class="btn" onClick=${onBack}>${online ? '‹ Leave' : '‹ Back'}</button>
      <h2>${online ? 'Two phones' : 'Skirmish'}</h2>
      <button class="btn primary" onClick=${onStart}>Start</button>
    </header>
    ${error ? html`<p class="setup-error" role="alert">${error}</p>` : null}
    <div class="setup-body">
      <section class="setup-col">
        <h3>Battlefield</h3>
        <${Row} label="Map"><${Select} label="Map" value=${form.map} onChange=${(v) => set({ map: v })}
          options=${[...maps.map((m) => ({ value: m.id, label: `${m.name} (${m.maxPlayers})` })), { value: 'generated', label: 'Generated…' }]} /></${Row}>
        ${generated ? html`
          <${Row} label="Seed"><input type="number" inputmode="numeric" value=${form.genSeed} min="1"
            onChange=${(/** @type {any} */ e) => set({ genSeed: Math.max(1, e.target.value | 0) })} /></${Row}>
          <${Row} label="Size"><${Select} label="Size" value=${form.genSize} onChange=${(v) => set({ genSize: v })}
            options=${SETUP_DEFAULTS.generatedSizes.map((s) => ({ value: s, label: `${s} × ${s}${s >= 96 ? ' (4 players)' : ''}` }))} /></${Row}>` : null}
        <${Row} label="Start positions"><${Select} label="Start positions" value=${form.startPositions} onChange=${(v) => set({ startPositions: v })}
          options=${[{ value: 'random', label: 'Random' }, { value: 'fixed', label: 'Fixed' }]} /></${Row}>
        <h3>You</h3>
        <${Row} label="Faction"><${Select} label="Your faction" value=${form.faction} onChange=${(v) => set({ faction: v })}
          options=${FACTION_IDS.map((f) => ({ value: f, label: FACTIONS[f].name }))} /></${Row}>
        <${Row} label="Colour">${colorDot(form.color)}<${Select} label="Your colour" value=${form.color} onChange=${(v) => set({ color: v })}
          options=${COLORS.map((c) => ({ value: c, label: cap(c) }))} /></${Row}>
        <h3>Opponents</h3>
        ${form.opponents.map((o, k) => o.remote ? html`<${RemoteSlot} key=${k} o=${o} />` : html`<div class="opp" key=${k}>
          ${colorDot(o.color)}
          <${Select} label=${`Opponent ${k + 1} faction`} value=${o.faction} onChange=${(v) => opp(k, { faction: v })} options=${FACTION_IDS.map((f) => ({ value: f, label: FACTIONS[f].name }))} />
          <${Select} label=${`Opponent ${k + 1} colour`} value=${o.color} onChange=${(v) => opp(k, { color: v })} options=${COLORS.map((c) => ({ value: c, label: cap(c) }))} />
          <${Select} label=${`Opponent ${k + 1} difficulty`} value=${o.difficulty} onChange=${(v) => opp(k, { difficulty: v })} options=${DIFFICULTIES.map((d) => ({ value: d, label: cap(d) }))} />
          ${form.opponents.filter((x) => !x.remote).length > (online ? 0 : 1) ? html`<button class="cmd" aria-label="Remove opponent" onClick=${() => set({ opponents: form.opponents.filter((_, i) => i !== k) })}>✕</button>` : null}
        </div>`)}
        ${form.opponents.length + 1 < maxPlayers ? html`<button class="btn" onClick=${() => set({ opponents: [...form.opponents, {
          faction: form.opponents.length % 2 ? 'coalition' : 'union', color: COLORS.find((c) => c !== form.color && !form.opponents.some((o) => o.color === c)) ?? 'green', difficulty: 'normal' }] })}>+ Add AI opponent</button>` : null}
        ${teamOptions(form, online).length > 1 ? html`<${Row} label="Teams"><${Select} label="Teams" value=${form.teams} onChange=${(v) => set({ teams: v })}
          options=${teamOptions(form, online)} /></${Row}>` : null}
      </section>
      <section class="setup-col">
        <h3>Rules</h3>
        <${Row} label="Starting credits"><${Select} label="Starting credits" value=${form.startingCredits} onChange=${(v) => set({ startingCredits: v })}
          options=${SETUP_DEFAULTS.startingCreditsOptions.map((c) => ({ value: c, label: `$${c.toLocaleString('en-US')}` }))} /></${Row}>
        <${Row} label="Starting units"><${Select} label="Starting units" value=${form.startingUnits} onChange=${(v) => set({ startingUnits: v })}
          options=${[{ value: 'mcv', label: 'MCV only' }, { value: 'force', label: 'MCV + 2 vehicles + 4 Riflemen' }]} /></${Row}>
        <${Row} label=${`Tech level ${form.techLevel}`}><input type="range" min="1" max="10" value=${form.techLevel} aria-label="Tech level"
          onInput=${(/** @type {any} */ e) => set({ techLevel: e.target.value | 0 })} /></${Row}>
        <${Row} label="Ore regrowth"><${Select} label="Ore regrowth" value=${form.oreGrowthSeconds} onChange=${(v) => set({ oreGrowthSeconds: v })}
          options=${ORE_GROWTH_OPTIONS.map((s) => ({ value: s, label: s ? `${s} s` : 'Off' }))} /></${Row}>
        <${Row} label="Fog of war"><${Toggle} label="Fog of war" checked=${form.fog} onChange=${(v) => set({ fog: v })} /></${Row}>
        <${Row} label="Crates"><${Toggle} label="Crates" checked=${form.crates} onChange=${(v) => set({ crates: v })} /></${Row}>
        <${Row} label="Short game"><${Toggle} label="Short game" checked=${form.shortGame} onChange=${(v) => set({ shortGame: v })} /></${Row}>
        <${Row} label="Game speed"><${Select} label="Game speed" value=${form.speed} onChange=${(v) => set({ speed: v })}
          options=${Object.keys(GAME_SPEEDS).map((s) => ({ value: s, label: cap(s) }))} /></${Row}>
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
    <header class="screen-head"><button class="btn" onClick=${onBack}>‹ Back</button><h2>${title}</h2><span></span></header>
    <ul class="slot-list">
      ${slots.map((s) => html`<li key=${s.slot} class="slot panel">
        <div class="slot-text"><b>${s.label}</b><span class="muted">${s.at ? `${new Date(s.at).toLocaleString()} · ${s.info ?? ''}` : 'Empty'}</span></div>
        <button class="btn primary" disabled=${mode === 'load' && !s.at} onClick=${() => onPick(s.slot)}>${mode === 'load' ? 'Load' : s.at ? 'Overwrite' : 'Save'}</button>
        ${onDelete && s.at && s.slot !== 'auto' ? html`<button class="cmd" aria-label=${`Delete ${s.label}`} onClick=${() => onDelete(s.slot)}>✕</button>` : null}
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
 */

/** @param {{ settings: AppSettings, onChange: (s: AppSettings) => void, onBack: () => void }} p */
export function SettingsScreen({ settings, onChange, onBack }) {
  const set = (/** @type {Partial<AppSettings>} */ patch) => onChange({ ...settings, ...patch });
  const slider = (/** @type {'effects' | 'voice' | 'ui'} */ k, /** @type {string} */ label) => html`<${Row} label=${label}>
    <input type="range" min="0" max="100" value=${Math.round(settings[k] * 100)} aria-label=${label}
      onInput=${(/** @type {any} */ e) => set({ [k]: (e.target.value | 0) / 100 })} /></${Row}>`;
  return html`<div class="screen settings">
    <header class="screen-head"><button class="btn" onClick=${onBack}>‹ Back</button><h2>Settings</h2><span></span></header>
    <div class="setup-body"><section class="setup-col">
      <${Row} label="Left-handed layout"><${Toggle} label="Left-handed layout" checked=${settings.leftHanded} onChange=${(v) => set({ leftHanded: v })} /></${Row}>
      <${Row} label="Haptics"><${Toggle} label="Haptics" checked=${settings.haptics} onChange=${(v) => set({ haptics: v })} /></${Row}>
      <${Row} label="Scroll at screen edges (mouse)"><${Toggle} label="Scroll at screen edges" checked=${settings.edgePan !== false} onChange=${(v) => set({ edgePan: v })} /></${Row}>
      <${Row} label="Full screen automatically"><${Toggle} label="Full screen automatically" checked=${settings.autoFullscreen !== false} onChange=${(v) => set({ autoFullscreen: v })} /></${Row}>
      ${slider('effects', 'Effects volume')}
      ${slider('voice', 'Voice volume')}
      ${slider('ui', 'Interface volume')}
    </section></div>
  </div>`;
}

/**
 * End of the match (section 18): who won, the time, and each player's numbers.
 * @param {{ outcome: 'victory' | 'defeat' | 'draw', ticks: number,
 *   rows: { name: string, color: string, alive: boolean, stats: Record<string, number> }[],
 *   act: { rematch?: () => void, menu: () => void }, labels?: { rematch?: string, menu?: string, note?: string } }} p
 *   No rematch action shows the note instead (a two-phone guest waits for the host).
 */
export function EndScreen({ outcome, ticks, rows, act, labels = {} }) {
  const title = { victory: 'Victory', defeat: 'Defeat', draw: 'Draw' }[outcome];
  const cols = [
    ['unitsBuilt', 'Units built'], ['unitsLost', 'Units lost'], ['unitsKilled', 'Units killed'],
    ['structuresBuilt', 'Structures built'], ['structuresLost', 'Structures lost'], ['creditsHarvested', 'Credits harvested'],
  ];
  return html`<div class="screen end">
    <h2 class=${`end-title ${outcome}`}>${title}</h2>
    <p class="muted">Match time ${clock(ticks)}</p>
    <div class="end-table-wrap"><table class="end-table">
      <thead><tr><th>Player</th>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr class=${r.alive ? '' : 'out'}>
        <td>${colorDot(r.color)} ${r.name}</td>${cols.map(([k]) => html`<td>${(r.stats[k] ?? 0).toLocaleString('en-US')}</td>`)}</tr>`)}</tbody>
    </table></div>
    <div class="menu-buttons row">
      ${act.rematch ? html`<button class="btn primary" onClick=${act.rematch}>${labels.rematch ?? 'Rematch'}</button>` : null}
      <button class="btn" onClick=${act.menu}>${labels.menu ?? 'Main menu'}</button>
    </div>
    ${labels.note ? html`<p class="muted end-note">${labels.note}</p>` : null}
  </div>`;
}

/** Render a screen (or nothing) into the screens layer. @param {HTMLElement} el @param {any} vnode */
export function showScreen(el, vnode) {
  el.classList.toggle('on', !!vnode);
  render(vnode, el);
}
