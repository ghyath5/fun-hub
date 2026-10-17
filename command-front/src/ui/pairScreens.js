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
import { COLORS } from '../game/matchSetup.js';
import { drawQr, scanQr, extractCode } from '../net/link.js';

/** @typedef {import('../game/matchSetup.js').SetupForm} SetupForm */

const FACTION_IDS = /** @type {('coalition' | 'union')[]} */ (['coalition', 'union']);
const cap = (/** @type {string} */ s) => s[0].toUpperCase() + s.slice(1);
const dot = (/** @type {string} */ c) => html`<span class="dot" style=${`background:${PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (c)]?.dot ?? '#888'}`}></span>`;

/** @param {{ act: { host: () => void, join: () => void, back: () => void } }} p */
export function TwoPhoneMenu({ act }) {
  return html`<div class="screen menu pair">
    <div class="menu-mark small"><span>TWO</span><b>PHONES</b></div>
    <p class="pair-lead">Play each other — or team up against the AI — on two phones on the same WiFi.
      No app, no account; once linked the phones talk straight to each other.</p>
    <div class="menu-buttons">
      <button class="btn primary" onClick=${act.host}>Host a match</button>
      <p class="pair-sub">Shows a code for the other phone</p>
      <button class="btn" onClick=${act.join}>Join a match</button>
      <p class="pair-sub">Scan the host's code</p>
      <button class="btn" onClick=${act.back}>‹ Back</button>
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

/** The camera, reading QR codes until one is found. @param {{ onCode: (code: string) => void, onFail: () => void }} p */
function Scanner({ onCode, onFail }) {
  const ref = useRef(/** @type {HTMLVideoElement | null} */ (null));
  useEffect(() => {
    let stop = /** @type {(() => void) | null} */ (null);
    let live = true;
    const video = ref.current;
    if (video) {
      scanQr(video, (code) => { if (live) onCode(code); })
        .then((s) => { if (live) stop = s; else s(); })
        .catch(() => { if (live) onFail(); });
    }
    return () => { live = false; stop?.(); };
  }, []);
  return html`<div class="cam"><video ref=${ref} playsinline muted></video><div class="frame"></div></div>`;
}

/** Paste a code by hand (or from a message). @param {{ placeholder: string, onCode: (code: string) => void }} p */
function PasteBox({ placeholder, onCode }) {
  const [value, setValue] = useState('');
  return html`<div class="paste">
    <input type="text" placeholder=${placeholder} value=${value} autocomplete="off" autocapitalize="off" spellcheck=${false}
      onInput=${(/** @type {any} */ e) => setValue(e.target.value)} />
    <button class="btn" disabled=${!extractCode(value)} onClick=${() => onCode(extractCode(value))}>Use</button>
  </div>`;
}

/**
 * Host: the invite QR, then scan (or paste) the reply.
 * @param {{ invite: string | null, status: string, scanning: boolean,
 *   act: { scan: (on: boolean) => void, code: (code: string) => void, back: () => void, diag: () => void, noCamera: () => void } }} p
 */
export function HostPair({ invite, status, scanning, act }) {
  return html`<div class="screen pair-screen">
    <header class="screen-head"><button class="btn" onClick=${act.back}>‹ Back</button><h2>Host</h2>
      <button class="btn" onClick=${act.diag}>Diagnostics</button></header>
    <div class="pair-body">
      <div class="pair-code">
        ${scanning
          ? html`<${Scanner} onCode=${(/** @type {string} */ c) => { act.scan(false); act.code(c); }} onFail=${act.noCamera} />`
          : html`<${QrBox} text=${invite} label="Invite code for the other phone" />`}
      </div>
      <div class="pair-side">
        <ol class="pair-steps">
          <li><b>On the other phone,</b> open the camera and point it at this code. Tap the link it finds.</li>
          <li><b>It shows a reply code.</b> Tap “Scan their reply” and point this phone at it.</li>
        </ol>
        <p class="pair-status" role="status">${status}</p>
        <button class="btn primary" disabled=${!invite} onClick=${() => act.scan(!scanning)}>${scanning ? 'Show my code again' : 'Scan their reply'}</button>
        <${PasteBox} placeholder="…or paste their reply code" onCode=${act.code} />
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
    <header class="screen-head"><button class="btn" onClick=${act.back}>‹ Back</button><h2>Join</h2>
      <button class="btn" onClick=${act.diag}>Diagnostics</button></header>
    <div class="pair-body">
      ${phase === 'scan' ? html`
        <div class="pair-code">
          ${camera ? html`<${Scanner} onCode=${act.code} onFail=${act.noCamera} />` : html`<p class="muted">No camera here — paste the invite instead.</p>`}
        </div>
        <div class="pair-side">
          <p class="pair-lead">Point this phone at the host's code.</p>
          <${PasteBox} placeholder="…or paste the invite link" onCode=${act.code} />
          <p class="pair-status" role="status">${status}</p>
        </div>` : html`
        <div class="pair-code"><${QrBox} text=${reply} label="Reply code for the host phone" /></div>
        <div class="pair-side">
          <p class="pair-lead">Show this reply code to the host phone. It scans it, and you are in.</p>
          <button class="btn" disabled=${!reply} onClick=${act.share}>Share the code instead</button>
          <p class="pair-status" role="status">${status}</p>
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
  return html`<div class="diag-panel panel" role="dialog" aria-label="Connection diagnostics">
    <header class="screen-head"><h2>Diagnostics</h2>
      <span class="diag-btns">
        <button class="btn" onClick=${act.stun}>STUN ${stun ? 'on' : 'off'}</button>
        <button class="btn" onClick=${act.copy}>Copy</button>
        <button class="btn" onClick=${act.close}>Close</button>
      </span></header>
    <pre class="diag-log">${text || 'Nothing logged yet.'}</pre>
    <p class="muted">Most failures: a VPN on either phone, the phones on different WiFi networks, or a guest network that keeps devices apart.</p>
  </div>`;
}

/**
 * The guest's lobby: the host's choices, read-only, and this phone's own
 * faction and colour.
 * @param {{ form: SetupForm | null, maps: { id: string, name: string }[], me: { faction: 'coalition' | 'union', color: string },
 *   onMe: (me: { faction: 'coalition' | 'union', color: string }) => void, onLeave: () => void }} p
 */
export function GuestLobby({ form, maps, me, onMe, onLeave }) {
  const mine = form?.opponents.find((o) => o.remote);
  const color = mine?.color ?? me.color;
  const mapName = !form ? '…' : form.map === 'generated' ? `Generated (${form.genSize} × ${form.genSize}, seed ${form.genSeed})` : maps.find((m) => m.id === form.map)?.name ?? form.map;
  const teams = form?.teams === 'coop' ? 'Both phones vs the AI' : form?.teams === '2v2' ? '2 v 2' : 'Free-for-all';
  return html`<div class="screen setup guest-lobby">
    <header class="screen-head"><button class="btn" onClick=${onLeave}>‹ Leave</button><h2>Two phones</h2><span class="muted">Waiting for the host to start</span></header>
    <div class="setup-body">
      <section class="setup-col">
        <h3>You (Phone 2)</h3>
        <label class="row"><span class="row-label">Faction</span><span class="row-ctl">
          <select aria-label="Your faction" value=${me.faction} onChange=${(/** @type {any} */ e) => onMe({ ...me, faction: e.target.value })}>
            ${FACTION_IDS.map((f) => html`<option value=${f}>${FACTIONS[f].name}</option>`)}
          </select></span></label>
        <label class="row"><span class="row-label">Colour</span><span class="row-ctl">${dot(color)}
          <select aria-label="Your colour" value=${color} onChange=${(/** @type {any} */ e) => onMe({ ...me, color: e.target.value })}>
            ${COLORS.map((c) => html`<option value=${c}>${cap(c)}</option>`)}
          </select></span></label>
      </section>
      <section class="setup-col">
        <h3>The host's setup</h3>
        ${form ? html`
          <div class="row"><span class="row-label">Map</span><span>${mapName}</span></div>
          <div class="row"><span class="row-label">Host</span><span>${dot(form.color)} ${FACTIONS[form.faction].name}</span></div>
          ${form.opponents.filter((o) => !o.remote).map((o, i) => html`<div class="row" key=${i}><span class="row-label">AI ${i + 1}</span><span>${dot(o.color)} ${FACTIONS[o.faction].name} · ${cap(o.difficulty)}</span></div>`)}
          <div class="row"><span class="row-label">Teams</span><span>${teams}</span></div>
          <div class="row"><span class="row-label">Credits · speed</span><span>$${form.startingCredits.toLocaleString('en-US')} · ${cap(form.speed)}</span></div>` : html`<p class="muted">Waiting for the host…</p>`}
      </section>
    </div>
  </div>`;
}
