// @ts-check
/**
 * Online screens: the game browser (who is online, open games, quick match,
 * create, join by code), and the strip a lobby shows above its setup — the
 * game's name and code, the share link, and how well the two players are
 * connected. They work held upright as well as sideways.
 */
import { html, useState, useEffect } from 'htm/preact';
import { t, int } from '../lib/i18n.js';

/** @typedef {import('../net/online/lobbyClient.js').LobbyCard} LobbyCard */
/** @typedef {import('../net/online/lobbyClient.js').ClientState} ClientState */

/** Longest player name and game name (the server cuts at the same lengths). */
export const NAME_MAX = 24;
export const GAME_NAME_MAX = 32;

/**
 * Connection to the lobby server, as a small badge: a dot and a few words.
 * @param {{ state: ClientState, online: number }} p
 */
export function OnlineBadge({ state, online }) {
  if (state === 'online') return html`<span class="net-badge ok" role="status"><i></i>${online === 1 ? t('1 player online') : t('{n} players online', { n: int(online) })}</span>`;
  if (state === 'closed') return html`<span class="net-badge bad" role="status"><i></i>${t('Offline')}</span>`;
  return html`<span class="net-badge wait" role="status"><span class="spin"></span>${state === 'connecting' ? t('Connecting…') : t('Reconnecting…')}</span>`;
}

/**
 * A text field that reports its value when the player is done with it
 * (Enter or leaving the field), not on every key.
 * @param {{ value: string, max: number, label: string, onDone: (v: string) => void, placeholder?: string, upper?: boolean }} p
 */
function Field({ value, max, label, onDone, placeholder = '', upper = false }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = () => { const v = draft.trim(); if (v !== value) onDone(v); };
  return html`<input type="text" class="field" maxlength=${max} aria-label=${label} placeholder=${placeholder} value=${draft}
    autocomplete="off" autocapitalize=${upper ? 'characters' : 'off'} spellcheck=${false} enterkeyhint="done"
    onInput=${(/** @type {any} */ e) => setDraft(upper ? e.target.value.toUpperCase() : e.target.value)}
    onBlur=${done} onKeyDown=${(/** @type {any} */ e) => { if (e.key === 'Enter') e.target.blur(); }} />`;
}

/** What a listed game says under its name. @param {LobbyCard} l */
const detail = (l) => [l.host, l.map ? t(l.map) : '', l.ais ? (l.ais === 1 ? t('1 AI') : t('{n} AIs', { n: l.ais })) : t('No AI')].filter(Boolean).join(' · ');

/**
 * One game in the list.
 * @param {{ lobby: LobbyCard, build: number, busy: boolean, onJoin: (id: string) => void }} p
 */
function GameRow({ lobby: l, build, busy, onJoin }) {
  const otherBuild = l.build !== build;
  const full = l.players >= l.max || l.state !== 'open';
  const why = otherBuild ? t('Other version') : l.state === 'playing' ? t('Playing') : full ? t('Full') : '';
  return html`<li class=${`game-row panel${why ? ' off' : ''}`}>
    <div class="game-text"><b dir="auto">${l.name}</b><span class="muted" dir="auto">${detail(l)}</span></div>
    <span class="game-seats" aria-label=${t('{n} of {max} players', { n: l.players, max: l.max })}>
      ${Array.from({ length: l.max }, (_, i) => html`<i key=${i} class=${i < l.players ? 'on' : ''}></i>`)}
      <b>${l.players}/${l.max}</b></span>
    ${why ? html`<span class="game-why">${why}</span>` : html`<button class="btn primary" disabled=${busy} onClick=${() => onJoin(l.id)}>${t('Join')}</button>`}
  </li>`;
}

/**
 * The online browser.
 * @param {{
 *   state: ClientState, online: number, lobbies: LobbyCard[], build: number, name: string,
 *   busy: string, error: string, unconfigured: boolean,
 *   act: { quick: () => void, create: () => void, join: (id: string) => void, rename: (name: string) => void, back: () => void, dismiss: () => void },
 * }} p
 *   busy: what is being done right now ('' when idle); error: the last thing that went wrong
 */
export function OnlineBrowser({ state, online, lobbies, build, name, busy, error, unconfigured, act }) {
  const [code, setCode] = useState('');
  const ready = state === 'online' && !busy;
  const open = lobbies.filter((l) => l.players < l.max && l.state === 'open' && l.build === build).length;
  if (unconfigured) {
    return html`<div class="screen menu pair"><div class="notice-card panel">
      <h1>${t('Online play is not set up yet')}</h1>
      <p class="muted">${t('This copy of the game has no online server configured. Playing against the computer and on two phones over WiFi work as always.')}</p>
      <button class="btn primary" onClick=${act.back}>${t('OK')}</button></div></div>`;
  }
  return html`<div class="screen online">
    <header class="screen-head"><button class="btn" onClick=${act.back}>${t('‹ Back')}</button><h2>${t('Online')}</h2>
      <${OnlineBadge} state=${state} online=${online} /></header>
    ${error ? html`<p class="setup-error dismissable" role="alert" onClick=${act.dismiss}>${error}<span aria-hidden="true">✕</span></p>` : null}
    <div class="online-body">
      <section class="online-side box">
        <label class="stack"><span class="cap">${t('Your name')}</span>
          <${Field} value=${name} max=${NAME_MAX} label=${t('Your name')} onDone=${act.rename} /></label>
        <button class="btn primary big" disabled=${!ready} onClick=${act.quick}>
          ${busy === 'quick' ? html`<span class="spin"></span>` : null}${t('Quick match')}</button>
        <p class="cap-note">${open ? t('Joins a waiting game at once') : t('No game is waiting: this opens one for the next player')}</p>
        <button class="btn" disabled=${!ready} onClick=${act.create}>${busy === 'create' ? html`<span class="spin"></span>` : null}${t('Create a game')}</button>
        <div class="stack"><span class="cap">${t('Have a game code?')}</span>
          <form class="paste" onSubmit=${(/** @type {any} */ e) => { e.preventDefault(); if (ready && code.length >= 4) act.join(code); }}>
            <input type="text" class="field code" maxlength="10" placeholder="K7QF2" aria-label=${t('Game code')} value=${code} dir="ltr"
              autocomplete="off" autocapitalize="characters" spellcheck=${false} enterkeyhint="go"
              onInput=${(/** @type {any} */ e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <button class="btn" type="submit" disabled=${!ready || code.length < 4}>${busy === 'join' ? html`<span class="spin"></span>` : null}${t('Join')}</button>
          </form></div>
      </section>
      <section class="online-list">
        <h3 class="list-head"><span>${t('Games')}</span><span class="muted">${lobbies.length ? t('{open} open · {n} listed', { open, n: lobbies.length }) : ''}</span></h3>
        ${state !== 'online' && !lobbies.length ? html`<div class="empty-card"><span class="spin big"></span><p class="muted">${state === 'connecting' ? t('Connecting to the server…') : t('Reconnecting to the server…')}</p></div>`
          : lobbies.length ? html`<ul class="game-list">${lobbies.map((l) => html`<${GameRow} key=${l.id} lobby=${l} build=${build} busy=${!ready} onJoin=${act.join} />`)}</ul>`
          : html`<div class="empty-card"><p><b>${t('No games yet')}</b></p><p class="muted">${t('Create one and it shows here for every player online — or tap Quick match and wait for the next player.')}</p></div>`}
      </section>
    </div>
  </div>`;
}

/** How the two players are connected, in a few words. @param {{ path: 'direct' | 'relay' | 'none', rtt: number | null }} s */
export const linkWords = (s) => (s.path === 'none' ? t('Reconnecting…')
  : `${s.rtt == null ? '…' : t('{n} ms', { n: Math.max(1, Math.round(s.rtt)) })} · ${s.path === 'direct' ? t('direct') : t('relay')}`);

/** Signal bars for a round trip. @param {{ path: string, rtt: number | null }} s */
const bars = (s) => (s.path === 'none' || s.rtt == null ? 0 : s.rtt < 90 ? 4 : s.rtt < 180 ? 3 : s.rtt < 320 ? 2 : 1);

/**
 * The link to the other player as a badge with signal bars.
 * @param {{ stats: { path: 'direct' | 'relay' | 'none', rtt: number | null } }} p
 */
export function LinkBadge({ stats }) {
  const n = bars(stats);
  return html`<span class=${`link-badge${stats.path === 'none' ? ' bad' : ''}`} role="status" title=${stats.path === 'direct' ? t('Connected straight to the other player') : t('Connected through the server')}>
    <span class="bars" aria-hidden="true">${[1, 2, 3, 4].map((i) => html`<i key=${i} class=${i <= n ? 'on' : ''}></i>`)}</span>${linkWords(stats)}</span>`;
}

/**
 * The strip above an online lobby.
 * Host: the game's name (editable), whether it is listed, its code and share link, and the other player.
 * Guest: the same, read-only.
 * @param {{
 *   role: 'host' | 'guest', name: string, code: string, isPublic: boolean,
 *   peer: string | null, stats: { path: 'direct' | 'relay' | 'none', rtt: number | null } | null, server: ClientState, note: string,
 *   act: { rename?: (name: string) => void, setPublic?: (on: boolean) => void, share: () => void },
 * }} p
 */
export function LobbyStrip({ role, name, code, isPublic, peer, stats, server, note, act }) {
  const host = role === 'host';
  return html`<div class="lobby-strip box">
    <div class="strip-main">
      ${host && act.rename ? html`<${Field} value=${name} max=${GAME_NAME_MAX} label=${t('Game name')} onDone=${act.rename} />` : html`<b class="strip-name" dir="auto">${name}</b>`}
      <span class="code-chip" dir="ltr" aria-label=${t('Game code')}>${code}</span>
      <button class="btn small" onClick=${act.share}>${t('Share link')}</button>
      ${host && act.setPublic ? html`<label class="strip-toggle"><input type="checkbox" class="toggle" checked=${isPublic}
        onChange=${(/** @type {any} */ e) => act.setPublic?.(e.target.checked)} /><span>${t('Listed')}</span></label>` : null}
    </div>
    <div class="strip-status" role="status">
      ${server !== 'online' ? html`<span class="net-badge wait"><span class="spin"></span>${t('Reconnecting to the server…')}</span>`
        : peer === null ? html`<span class="net-badge wait"><span class="spin"></span>${t('Waiting for a player…')}</span>`
        : html`<span class="peer-chip"><i></i><b dir="auto">${peer}</b></span>${stats ? html`<${LinkBadge} stats=${stats} />` : null}`}
      ${note ? html`<span class="strip-note">${note}</span>` : null}
    </div>
  </div>`;
}
