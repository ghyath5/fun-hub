// @ts-check
/**
 * Two-phone screens: choosing host or join, the pairing codes (QR, camera,
 * paste, share), the connection diagnostics, and the guest's lobby. Pairing
 * is the Fun Hub's: the host shows an invite QR that the other phone's
 * normal camera opens; that phone shows a reply QR the host scans.
 *
 * These screens work held upright too — people pair phones in portrait.
 */
import { html, useEffect, useRef, useState } from 'htm/preact';
import { FACTIONS, PLAYER_COLORS } from '../data/factions.js';
import { COLORS, maxPlayersOf } from '../game/matchSetup.js';
import { CountryButton, Flag } from './countryPicker.js';
import { drawQr, scanQr, extractCode, CameraError, diagnostics } from '../net/link.js';
import { t } from '../lib/i18n.js';

/** @typedef {import('../game/matchSetup.js').SetupForm} SetupForm */

const FACTION_IDS = /** @type {('coalition' | 'union')[]} */ (['coalition', 'union']);
const cap = (/** @type {string} */ s) => t(s[0].toUpperCase() + s.slice(1));
const dot = (/** @type {string} */ c) => html`<span class="dot" style=${`background:${PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (c)]?.dot ?? '#888'}`}></span>`;

/** @param {{ act: { host: () => void, join: () => void, back: () => void } }} p */
export function TwoPhoneMenu({ act }) {
  return html`<div class="screen menu pair">
    <div class="menu-mark small"><span>TWO</span><b>PHONES</b></div>
    <p class="pair-lead">${t('Play each other — or team up against the AI — on two phones on the same WiFi. No app, no account; once linked the phones talk straight to each other.')}</p>
    <div class="menu-buttons">
      <button class="btn primary" onClick=${act.host}>${t('Host a match')}</button>
      <p class="pair-sub">${t('Shows a code for the other phone')}</p>
      <button class="btn" onClick=${act.join}>${t('Join a match')}</button>
      <p class="pair-sub">${t("Scan the host's code")}</p>
      <button class="btn" onClick=${act.back}>${t('‹ Back')}</button>
    </div>
  </div>`;
}

/** A QR code for some text, drawn by the pairing engine. @param {{ text: string | null, label: string }} p */
function QrBox({ text, label }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !text) return;
    setFallback(false);
    drawQr(el, text).then((ok) => { if (!ok) setFallback(true); }).catch(() => setFallback(true));
  }, [text]);
  if (!text) return html`<div class="qr-box waiting" aria-busy="true"><span class="spin big"></span></div>`;
  return html`<div class="qr-wrap">
    <div class="qr-box" ref=${ref} role="img" aria-label=${label}></div>
    ${fallback ? html`<textarea class="qr-text" readonly value=${text}></textarea>` : null}
  </div>`;
}

/** What to tell the player when the camera will not start, by CameraError kind. */
const CAMERA_HELP = Object.freeze({
  denied: 'The camera is blocked for this site. Allow the camera in the browser (the icon next to the address, or Settings → Site settings → Camera), then tap Try again.',
  insecure: 'The camera only works on the secure https:// address of the game.',
  unsupported: 'This browser cannot use the camera. Paste the code below instead.',
  missing: 'No camera was found on this device. Paste the code below instead.',
  busy: 'The camera is busy — close any other app or tab using it, then tap Try again.',
});

/**
 * The camera, reading QR codes until one is found. When the camera will not
 * start it says why, offers Try again, and the paste box stays available.
 * @param {{ onCode: (code: string) => void, onFail: (kind: string) => void }} p
 */
function Scanner({ onCode, onFail }) {
  const ref = useRef(/** @type {HTMLVideoElement | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stop = /** @type {(() => void) | null} */ (null);
    let live = true;
    const video = ref.current;
    if (video && !error) {
      scanQr(video, (code) => { if (live) onCode(code); })
        .then((s) => { if (live) stop = s; else s(); })
        .catch((/** @type {any} */ e) => {
          if (!live) return;
          const kind = e instanceof CameraError ? e.kind : 'busy';
          diagnostics.log(`camera failed: ${e?.message ?? e}`);
          setError(kind);
          onFail(kind);
        });
    }
    return () => { live = false; stop?.(); };
  }, [attempt, error]);
  if (error) {
    const retry = error === 'denied' || error === 'busy';
    return html`<div class="cam cam-error" role="alert">
      <p>${t(CAMERA_HELP[/** @type {keyof typeof CAMERA_HELP} */ (error)] ?? CAMERA_HELP.busy)}</p>
      ${retry ? html`<button class="btn primary" onClick=${() => { setError(null); setAttempt(attempt + 1); }}>${t('Try again')}</button>` : null}
    </div>`;
  }
  return html`<div class="cam"><video ref=${ref} playsinline muted autoplay></video><div class="frame"></div></div>`;
}

/** Paste a code by hand (or from a message). @param {{ placeholder: string, onCode: (code: string) => void }} p */
function PasteBox({ placeholder, onCode }) {
  const [value, setValue] = useState('');
  return html`<div class="paste">
    <input type="text" placeholder=${placeholder} value=${value} autocomplete="off" autocapitalize="off" spellcheck=${false}
      onInput=${(/** @type {any} */ e) => setValue(e.target.value)} />
    <button class="btn" disabled=${!extractCode(value)} onClick=${() => onCode(extractCode(value))}>${t('Use')}</button>
  </div>`;
}

/**
 * Host: the invite QR, then scan (or paste) the reply.
 * @param {{ invite: string | null, status: string, scanning: boolean,
 *   act: { scan: (on: boolean) => void, code: (code: string) => void, back: () => void, diag: () => void, noCamera: () => void } }} p
 */
export function HostPair({ invite, status, scanning, act }) {
  return html`<div class="screen pair-screen">
    <header class="screen-head"><button class="btn" onClick=${act.back}>${t('‹ Back')}</button><h2>${t('Host')}</h2>
      <button class="btn" onClick=${act.diag}>${t('Diagnostics')}</button></header>
    <div class="pair-body">
      <div class="pair-code">
        ${scanning
          ? html`<${Scanner} onCode=${(/** @type {string} */ c) => { act.scan(false); act.code(c); }} onFail=${act.noCamera} />`
          : html`<${QrBox} text=${invite} label=${t('Invite code for the other phone')} />`}
      </div>
      <div class="pair-side">
        <ol class="pair-steps">
          <li>${t('On the other phone, open the camera and point it at this code. Tap the link it finds.')}</li>
          <li>${t('It shows a reply code. Tap “Scan their reply” and point this phone at it.')}</li>
        </ol>
        <p class="pair-status" role="status">${t(status)}</p>
        <button class="btn primary" disabled=${!invite} onClick=${() => act.scan(!scanning)}>${scanning ? t('Show my code again') : t('Scan their reply')}</button>
        <${PasteBox} placeholder=${t('…or paste their reply code')} onCode=${act.code} />
      </div>
    </div>
  </div>`;
}

/**
 * Guest: scan (or paste) the invite, then show the reply.
 * @param {{ phase: 'scan' | 'reply', reply: string | null, status: string, camera: boolean,
 *   act: { code: (code: string) => void, share: () => void, back: () => void, diag: () => void, noCamera: () => void } }} p
 */
export function JoinPair({ phase, reply, status, camera, act }) {
  return html`<div class="screen pair-screen">
    <header class="screen-head"><button class="btn" onClick=${act.back}>${t('‹ Back')}</button><h2>${t('Join')}</h2>
      <button class="btn" onClick=${act.diag}>${t('Diagnostics')}</button></header>
    <div class="pair-body">
      ${phase === 'scan' ? html`
        <div class="pair-code">
          ${camera ? html`<${Scanner} onCode=${act.code} onFail=${act.noCamera} />` : html`<div class="cam cam-error"><p>${t(CAMERA_HELP[isSecureContext ? 'unsupported' : 'insecure'])}</p></div>`}
        </div>
        <div class="pair-side">
          <p class="pair-lead">${t("Point this phone at the host's code.")}</p>
          <${PasteBox} placeholder=${t('…or paste the invite link')} onCode=${act.code} />
          <p class="pair-status" role="status">${t(status)}</p>
        </div>` : html`
        <div class="pair-code"><${QrBox} text=${reply} label=${t('Reply code for the host phone')} /></div>
        <div class="pair-side">
          <p class="pair-lead">${t('Show this reply code to the host phone. It scans it, and you are in.')}</p>
          <button class="btn" disabled=${!reply} onClick=${act.share}>${t('Share the code instead')}</button>
          <p class="pair-status" role="status">${t(status)}</p>
        </div>`}
    </div>
  </div>`;
}

/**
 * The pairing engine's connection log — the first thing to read when two
 * phones will not link.
 * @param {{ text: string, stun: boolean, act: { close: () => void, copy: () => void, stun: () => void, refresh: () => void } }} p
 */
export function DiagPanel({ text, stun, act }) {
  useEffect(() => {
    const t = setInterval(act.refresh, 1000);
    return () => clearInterval(t);
  }, []);
  return html`<div class="diag-panel panel" role="dialog" aria-label=${t('Connection diagnostics')}>
    <header class="screen-head"><h2>${t('Diagnostics')}</h2>
      <span class="diag-btns">
        <button class="btn" onClick=${act.stun}>STUN ${stun ? t('on') : t('off')}</button>
        <button class="btn" onClick=${act.copy}>${t('Copy')}</button>
        <button class="btn" onClick=${act.close}>${t('Close')}</button>
      </span></header>
    <pre class="diag-log" dir="ltr">${text || t('Nothing logged yet.')}</pre>
    <p class="muted">${t('Most failures: a VPN on either phone, the phones on different WiFi networks, or a guest network that keeps devices apart.')}</p>
  </div>`;
}

/**
 * The guest's lobby: the host's choices, read-only, and this phone's own
 * faction and colour.
 * @param {{ form: SetupForm | null, maps: { id: string, name: string, maxPlayers: number }[], me: { faction: 'coalition' | 'union', color: string, country?: string },
 *   onMe: (me: { faction: 'coalition' | 'union', color: string, country?: string }) => void, onLeave: () => void }} p
 */
export function GuestLobby({ form, maps, me, onMe, onLeave }) {
  const mine = form?.opponents.find((o) => o.remote);
  const color = mine?.color ?? me.color;
  const mapName = !form ? '…' : form.map === 'generated' ? t('Generated ({size} × {size}, {n} players, seed {seed})', { size: form.genSize, n: maxPlayersOf(form, maps), seed: form.genSeed }) : t(maps.find((m) => m.id === form.map)?.name ?? form.map);
  const teams = form?.teams === 'coop' ? t('Both phones vs the AI') : form?.teams === '2v2' ? '2 v 2' : t('Free-for-all');
  return html`<div class="screen setup guest-lobby">
    <header class="screen-head"><button class="btn" onClick=${onLeave}>${t('‹ Leave')}</button><h2>${t('Two phones')}</h2><span class="muted">${t('Waiting for the host to start')}</span></header>
    <div class="setup-body">
      <section class="setup-col">
        <h3>${t('You (Phone 2)')}</h3>
        <label class="row"><span class="row-label">${t('Faction')}</span><span class="row-ctl">
          <select aria-label=${t('Your faction')} value=${me.faction} onChange=${(/** @type {any} */ e) => onMe({ ...me, faction: e.target.value })}>
            ${FACTION_IDS.map((f) => html`<option value=${f}>${t(FACTIONS[f].name)}</option>`)}
          </select></span></label>
        <label class="row"><span class="row-label">${t('Colour')}</span><span class="row-ctl">${dot(color)}
          <select aria-label=${t('Your colour')} value=${color} onChange=${(/** @type {any} */ e) => onMe({ ...me, color: e.target.value })}>
            ${COLORS.map((c) => html`<option value=${c}>${cap(c)}</option>`)}
          </select></span></label>
        <div class="row"><span class="row-label">${t('Country')}</span><span class="row-ctl">
          <${CountryButton} label=${t('Your country')} value=${me.country} onPick=${(/** @type {string} */ v) => onMe({ ...me, country: v })} /></span></div>
      </section>
      <section class="setup-col">
        <h3>${t("The host's setup")}</h3>
        ${form ? html`
          <div class="row"><span class="row-label">${t('Map')}</span><span>${mapName}</span></div>
          <div class="row"><span class="row-label">${t('Host')}</span><span>${dot(form.color)} <${Flag} id=${form.country} /> ${t(FACTIONS[form.faction].name)}</span></div>
          ${form.opponents.filter((o) => !o.remote).map((o, i) => html`<div class="row" key=${i}><span class="row-label">${t('AI {n}', { n: i + 1 })}</span><span>${dot(o.color)} <${Flag} id=${o.country} /> ${t(FACTIONS[o.faction].name)} · ${cap(o.difficulty)}</span></div>`)}
          <div class="row"><span class="row-label">${t('Teams')}</span><span>${teams}</span></div>
          <div class="row"><span class="row-label">${t('Credits · speed')}</span><span>$${form.startingCredits.toLocaleString('en-US')} · ${cap(form.speed)}</span></div>` : html`<p class="muted">${t('Waiting for the host…')}</p>`}
      </section>
    </div>
  </div>`;
}
