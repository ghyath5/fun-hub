// @ts-check
/**
 * Who fights whom, on the setup screens: a team picker for each seat, the
 * one-tap presets, and the sides read out as "A: … vs B: …" with each side's
 * total skill so uneven sides show at a glance. Shared by the host's setup
 * and the second phone's lobby.
 */
import { html } from 'htm/preact';
import { PLAYER_COLORS } from '../data/factions.js';
import { t } from '../lib/i18n.js';
import { TEAM_LETTERS, seatsOf, sidesOf, presetsFor, presetOf, sidesProblem } from '../game/teams.js';

/** @typedef {import('../game/matchSetup.js').SetupForm} SetupForm */

const dot = (/** @type {string} */ c) => html`<span class="dot" style=${`background:${PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (c)]?.dot ?? '#888'}`}></span>`;

/**
 * A seat's team, as letters: one more than the seats in use, so any seat can
 * break off on its own.
 * @param {{ form: SetupForm, value: number, onPick: (team: number) => void, label: string }} p
 */
export function TeamPick({ form, value, onPick, label }) {
  const letters = TEAM_LETTERS.slice(0, Math.min(TEAM_LETTERS.length, seatsOf(form).length));
  return html`<select class="team-pick" aria-label=${label} value=${String(value)}
    onChange=${(/** @type {any} */ e) => onPick(Number(e.target.value))}>
    ${letters.map((l, i) => html`<option key=${l} value=${String(i)}>${t('Team {letter}', { letter: l })}</option>`)}
  </select>`;
}

/**
 * Seat names for the read-out: "you" is this phone's player.
 * @param {SetupForm} form @param {'host' | 'guest'} viewer
 * @param {{ host?: string, remote?: string }} [names] what to call the other human's seat (an online player's name) instead of "Host" / "Phone 2"
 */
function seatNames(form, viewer, names = {}) {
  let ai = 0;
  return [
    viewer === 'host' ? t('You') : names.host ?? t('Host'),
    ...form.opponents.map((o) => (o.remote ? (viewer === 'guest' ? t('You') : names.remote ?? t('Phone 2')) : t('AI {n} ({skill})', { n: ++ai, skill: o.skill }))),
  ];
}

/**
 * The presets (host only) and the sides.
 * @param {{ form: SetupForm, viewer?: 'host' | 'guest', onChange?: (preset: string) => void, seatLabels?: { host?: string, remote?: string } }} p
 */
export function SidesPanel({ form, viewer = 'host', onChange, seatLabels }) {
  const sides = sidesOf(form);
  const names = seatNames(form, viewer, seatLabels);
  const colors = [form.color, ...form.opponents.map((o) => o.color)];
  const current = presetOf(form);
  const problem = sidesProblem(form);
  return html`<div class="sides">
    ${onChange ? html`<div class="presets" role="group" aria-label=${t('Quick sides')}>
      ${presetsFor(form).map((p) => html`<button key=${p.id} class=${`chip${p.id === current ? ' on' : ''}`} aria-pressed=${p.id === current}
        onClick=${() => onChange(p.id)}>${t(p.label)}</button>`)}
    </div>` : null}
    <ol class="side-list">
      ${sides.map((side, k) => html`<li key=${side.team}>
        ${k ? html`<span class="vs">${t('vs')}</span>` : null}
        <b class="side-letter">${TEAM_LETTERS[side.team]}</b>
        ${side.seats.map((i) => html`<span class="side-seat" key=${i}>${dot(colors[i])}${names[i]}</span>`)}
        <span class="muted side-skill">${t('skill {n}', { n: side.skill })}</span>
      </li>`)}
    </ol>
    ${problem ? html`<p class="setup-error" role="alert">${t(problem)}</p>` : null}
  </div>`;
}
