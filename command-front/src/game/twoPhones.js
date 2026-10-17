// @ts-check
/**
 * Two phones on one WiFi: pairing, the lobby, starting the match on both
 * phones, the end screen and rematches, leaving, and resyncing if the two
 * simulations ever disagree.
 *
 * The host's phone is player 0 and owns the setup; the other phone is
 * player 1 (the form's first opponent, marked `remote`) and picks only its
 * own faction and colour. AIs added by the host run inside the sim on both
 * phones, so "both phones against the AI" costs nothing extra on the wire.
 *
 * Lobby messages (reliable channel):
 *   guest → host  { k: 'me', faction, color }
 *   host → guest  { k: 'form', form }        after every change
 *   host → guest  { k: 'start', form, seed, epoch }
 *   host → guest  { k: 'lobby' }             back to the lobby for a rematch
 *   either        { k: 'bye' }               leaving (sent by room.close)
 * In a match, netMatch.js handles the lockstep, pause and desync messages;
 * a resync snapshot travels as a chunked blob of kind 'sync'.
 */
import { html } from 'htm/preact';
import { openRoom } from '../net/room.js';
import { createNetMatch } from '../net/netMatch.js';
import { diagnostics } from '../net/link.js';
import { defaultForm, normaliseForm, startMatch, maxPlayersOf } from './matchSetup.js';
import { mapForForm } from './mapForForm.js';
import { snapshot, restore } from '../save/serialize.js';
import { pack, unpack } from '../lib/storage.js';
import { step } from '../sim/world.js';
import { GAME_SPEEDS } from '../data/rules.js';
import { FACTIONS } from '../data/factions.js';
import { showScreen, SetupScreen, EndScreen } from '../ui/screens.js';
import { TwoPhoneMenu, HostPair, JoinPair, DiagPanel, GuestLobby } from '../ui/pairScreens.js';

/** @typedef {import('./matchSetup.js').SetupForm} SetupForm */
/** @typedef {{ faction: 'coalition' | 'union', color: string }} PhoneChoice */

const HOST = 0;
const GUEST = 1;

/**
 * @param {{
 *   screensEl: HTMLElement,
 *   maps: { id: string, name: string, maxPlayers: number }[],
 *   prefs: { get: () => { form?: SetupForm, me?: PhoneChoice }, set: (p: { form?: SetupForm, me?: PhoneChoice }) => void },
 *   play: (world: any, meta: any, net: import('../net/netMatch.js').NetPlay, hooks: any) => Promise<any>,
 *   stop: () => void,
 *   session: () => any,
 *   menu: () => void,
 * }} app
 */
export function createTwoPhones(app) {
  const { screensEl, maps } = app;
  /** @type {import('../net/room.js').Room | null} */
  let room = null;
  /** @type {import('../net/netMatch.js').NetPlay | null} */
  let net = null;
  /** @type {'menu' | 'pairing' | 'lobby' | 'match' | 'end'} */
  let phase = 'menu';
  let epoch = 0;
  /** The match being played (for rematches and resyncs). @type {{ form: SetupForm, seed: number } | null} */
  let current = null;
  /** Host's lobby form. @type {SetupForm | null} */
  let form = null;
  /** Guest: the host's form as last received. @type {SetupForm | null} */
  let hostForm = null;
  /** @type {PhoneChoice} */
  let me = app.prefs.get().me ?? { faction: 'union', color: 'red' };
  /** Re-render whatever screen is up (pairing screens keep their own state here). */
  let redraw = () => {};
  let diagOpen = false;
  let diagText = '';
  let stun = true;
  /** @type {(() => void)[]} */
  let roomOffs = [];

  // ---- Helpers.
  const withDiag = (/** @type {any} */ vnode) => html`${vnode}${diagOpen ? html`<${DiagPanel} text=${diagText} stun=${stun} act=${diagActs} />` : null}`;
  const show = (/** @type {any} */ vnode) => showScreen(screensEl, withDiag(vnode));
  const diagActs = {
    close: () => { diagOpen = false; redraw(); },
    refresh: async () => { const t = await diagnostics.report(); if (t !== diagText) { diagText = t; redraw(); } },
    copy: async () => { try { await navigator.clipboard.writeText(await diagnostics.report()); } catch { /* select by hand */ } },
    stun: async () => { stun = !stun; await diagnostics.setStun(stun); await diagnostics.log(`STUN turned ${stun ? 'on' : 'off'} — go back and start again to apply`); redraw(); },
  };
  const openDiag = async () => { diagOpen = true; diagText = await diagnostics.report(); stun = await diagnostics.stun(); redraw(); };

  /** Close the room and forget the match. */
  function closeRoom() {
    roomOffs.forEach((off) => off());
    roomOffs = [];
    net?.destroy();
    net = null;
    room?.close();
    room = null;
    current = null;
  }

  /** Back to the two-phone menu with a message. @param {string} title @param {string} note */
  function notice(title, note) {
    closeRoom();
    phase = 'menu';
    redraw = () => show(html`<div class="screen menu pair"><div class="notice-card panel">
      <h1>${title}</h1><p class="muted">${note}</p>
      <button class="btn primary" onClick=${open}>OK</button></div></div>`);
    redraw();
  }

  /** Watch the room for the other phone leaving or the link dying outside a match. @param {import('../net/room.js').Room} r */
  function watchRoom(r) {
    roomOffs.push(r.onState((s) => {
      if (phase === 'match') return; // the match shows its own cards
      if (s === 'gone') notice('Lost the other phone', 'The link did not come back. Both phones need the same WiFi.');
      else if (s === 'open' || s === 'down') redraw();
    }));
  }

  // ---- Entry points.
  function open() {
    closeRoom();
    phase = 'menu';
    redraw = () => show(html`<${TwoPhoneMenu} act=${{ host, join: () => join(null), back: app.menu }} />`);
    redraw();
  }

  async function host() {
    closeRoom();
    phase = 'pairing';
    let invite = /** @type {string | null} */ (null);
    let status = 'Preparing the code…';
    let scanning = false;
    redraw = () => show(html`<${HostPair} invite=${invite} status=${status} scanning=${scanning} act=${{
      scan: (/** @type {boolean} */ on) => { scanning = on; redraw(); },
      code: async (/** @type {string} */ code) => {
        status = 'Linking…'; scanning = false; redraw();
        try { await room?.accept(code); } catch (e) { status = `That reply code did not fit: ${/** @type {any} */ (e)?.message ?? e}`; redraw(); }
      },
      back: open,
      diag: openDiag,
      noCamera: () => { scanning = false; status = 'No camera here — paste their reply code instead.'; redraw(); },
    }} />`);
    redraw();
    try {
      const r = await openRoom('host');
      if (phase !== 'pairing') { r.close(); return; }
      room = r;
      watchRoom(r);
      roomOffs.push(r.onState((s) => {
        if (s === 'open' && phase === 'pairing') hostLobby();
        else if (s === 'failed' && phase === 'pairing') { status = 'Could not reach the other phone — open Diagnostics.'; redraw(); }
      }));
      invite = await r.invite();
      status = 'Waiting for the other phone…';
      redraw();
    } catch (e) {
      notice('Two phones cannot start here', String(/** @type {any} */ (e)?.message ?? e));
    }
  }

  /** @param {string | null} code an invite from the URL (the guest's camera opened the host's link) */
  async function join(code) {
    closeRoom();
    phase = 'pairing';
    /** @type {'scan' | 'reply'} */
    let stage = 'scan';
    let reply = /** @type {string | null} */ (null);
    let status = code ? 'Reading the invite…' : '';
    let camera = !!navigator.mediaDevices?.getUserMedia;
    const consume = async (/** @type {string} */ c) => {
      if (!room || stage === 'reply') return;
      stage = 'reply'; status = 'Making the reply code…'; redraw();
      try {
        reply = await room.answer(c);
        status = 'Waiting for the host to scan it…';
      } catch (e) {
        stage = 'scan'; status = `That invite did not fit: ${/** @type {any} */ (e)?.message ?? e}`;
      }
      redraw();
    };
    redraw = () => show(html`<${JoinPair} phase=${stage} reply=${reply} status=${status} camera=${camera} act=${{
      code: consume,
      share: async () => {
        if (!reply) return;
        try {
          if (navigator.share) await navigator.share({ text: reply });
          else { await navigator.clipboard.writeText(reply); status = 'Reply code copied — send it to the host.'; redraw(); }
        } catch { /* cancelled */ }
      },
      back: open,
      diag: openDiag,
      noCamera: () => { camera = false; redraw(); },
    }} />`);
    redraw();
    try {
      const r = await openRoom('guest');
      if (phase !== 'pairing') { r.close(); return; }
      room = r;
      watchRoom(r);
      roomOffs.push(r.onBlob((kind, bytes) => { if (kind === 'sync') fromSync(bytes); }));
      roomOffs.push(r.onState((s) => {
        if (s === 'open' && phase === 'pairing') guestLobby();
        else if (s === 'failed' && phase === 'pairing') { status = 'Could not reach the host — open Diagnostics.'; redraw(); }
      }));
      if (code) await consume(code);
    } catch (e) {
      notice('Two phones cannot start here', String(/** @type {any} */ (e)?.message ?? e));
    }
  }

  // ---- Lobbies.
  /** The host's starting form: the saved one, with the other phone as the first opponent. */
  function hostStartForm() {
    const saved = app.prefs.get().form ?? defaultForm();
    const ais = saved.opponents.filter((o) => !o.remote);
    const remote = saved.opponents.find((o) => o.remote) ?? { faction: me.faction, color: 'red', difficulty: /** @type {'normal'} */ ('normal') };
    const f = { ...saved, opponents: [{ ...remote, remote: true }, ...ais] };
    return normaliseForm(f, maxPlayersOf(f, maps));
  }

  function hostLobby() {
    if (!room) return;
    phase = 'lobby';
    form = form ?? hostStartForm();
    let error = '';
    const r = room;
    const publish = () => { if (form) { r.send({ k: 'form', form }); app.prefs.set({ form }); } };
    r.listen((msg) => {
      if (msg?.k === 'me' && form) {
        const [remote, ...rest] = form.opponents;
        form = normaliseForm({ ...form, opponents: [{ ...remote, faction: msg.faction, color: msg.color, remote: true }, ...rest] }, maxPlayersOf(form, maps));
        publish();
        redraw();
      } else if (msg?.k === 'bye') notice('The other phone left', 'Host again when you are both ready.');
    });
    redraw = () => {
      if (!form) return;
      show(html`<${SetupScreen} online=${true} form=${form} maps=${maps} error=${error || (r.state === 'down' ? 'Reconnecting to the other phone…' : '')}
        onChange=${(/** @type {SetupForm} */ f) => { form = normaliseForm(f, maxPlayersOf(f, maps)); publish(); redraw(); }}
        onStart=${async () => {
          if (!form || r.state !== 'open') return;
          const chosen = await mapForForm(form);
          if (!chosen.map) { error = chosen.error; redraw(); return; }
          form = normaliseForm(form, chosen.map.maxPlayers);
          const seed = chosen.seed ?? Date.now() % 1e9;
          epoch = 0;
          r.send({ k: 'start', form, seed, epoch });
          launch(form, seed, chosen.map);
        }}
        onBack=${open} />`);
    };
    publish();
    redraw();
  }

  function guestLobby() {
    if (!room) return;
    phase = 'lobby';
    const r = room;
    const sendMe = () => { r.send({ k: 'me', ...me }); app.prefs.set({ me }); };
    r.listen((msg) => {
      switch (msg?.k) {
        case 'form': hostForm = msg.form; redraw(); break;
        case 'start': epoch = msg.epoch ?? 0; launch(msg.form, msg.seed, null); break;
        case 'bye': notice('The host left', 'Join again when the host is ready.'); break;
        default: break;
      }
    });
    redraw = () => show(html`<${GuestLobby} form=${hostForm} maps=${maps} me=${me}
      onMe=${(/** @type {PhoneChoice} */ m) => { me = m; sendMe(); redraw(); }} onLeave=${open} />`);
    sendMe();
    redraw();
  }

  // ---- The match.
  const myId = () => (room?.role === 'host' ? HOST : GUEST);

  /** Start (or restart) the match on this phone. @param {SetupForm} f @param {number} seed @param {any} map null: resolve from the form */
  async function launch(f, seed, map) {
    if (!room) return;
    const resolved = map ?? (await mapForForm(f)).map;
    current = { form: f, seed };
    await play(startMatch(f, resolved, seed));
  }

  /** Put a world on screen as a networked session. @param {any} world */
  async function play(world) {
    if (!room || !current) return;
    const r = room;
    net?.destroy();
    phase = 'match';
    showScreen(screensEl, null);
    const f = current.form;
    net = createNetMatch({
      room: r, me: myId(), them: 1 - myId(), epoch, startTick: world.tick,
      ticksPerSecond: GAME_SPEEDS[f.speed].ticksPerSecond,
      step,
      onDesync: (t) => {
        console.warn(`[two phones] desync at tick ${t}`);
        app.session()?.store.set({ link: 'resync' });
        if (r.role === 'host') resync(); else r.send({ k: 'desync' });
      },
      onResyncAsked: () => { if (r.role === 'host') resync(); },
    });
    await app.play(world, { speed: f.speed, form: f, online: true, me: myId() }, net, {
      exit: leave,
      retry: () => r.retry(),
      ended: (/** @type {any} */ result) => ended(result),
    });
  }

  /** Host: copy this phone's world to the other phone, and both restart from that copy. */
  function resync() {
    const s = app.session();
    if (!room || !s || room.role !== 'host') return;
    epoch++;
    const bytes = pack({ snapshot: snapshot(s.world), epoch });
    room.sendBlob('sync', bytes);
    fromSync(bytes);
  }

  /** @param {Uint8Array} bytes */
  async function fromSync(bytes) {
    const data = unpack(bytes);
    epoch = data.epoch;
    app.stop();
    await play(restore(data.snapshot));
  }

  /** Leave mid-match: surrender, tell the other phone, back to the menu. */
  function leave() {
    net?.leave();
    app.stop();
    // Let the last bundle and the goodbye leave before the channels close.
    setTimeout(() => { closeRoom(); app.menu(); }, 200);
    phase = 'menu';
  }

  /** @param {{ tick: number, draw: boolean, winners: number[] }} result */
  function ended(result) {
    const s = app.session();
    if (!s) return;
    const w = s.world;
    const mine = myId();
    const outcome = result.draw ? 'draw' : result.winners.some((id) => w.allied(id, mine)) ? 'victory' : 'defeat';
    const rows = w.players.map((/** @type {any} */ p) => ({
      name: `${p.id === mine ? 'You' : p.human ? 'Other phone' : `AI (${p.difficulty})`} · ${FACTIONS[/** @type {'coalition' | 'union'} */ (p.faction)].name}`,
      color: p.color, alive: p.alive, stats: p.stats,
    }));
    const theyLeft = s.store.get().link === 'left';
    net?.destroy();
    net = null;
    app.stop();
    phase = 'end';
    const r = room;
    let canRematch = !!r && r.state === 'open' && !theyLeft;
    if (r && canRematch) {
      r.listen((msg) => {
        if (msg?.k === 'lobby' && r.role === 'guest') guestLobby();
        else if (msg?.k === 'start' && r.role === 'guest') { epoch = msg.epoch ?? 0; launch(msg.form, msg.seed, null); }
        else if (msg?.k === 'bye') { canRematch = false; redraw(); }
      });
    }
    const toMenu = () => { closeRoom(); app.menu(); };
    redraw = () => show(html`<${EndScreen} outcome=${outcome} ticks=${result.tick} rows=${rows}
      act=${{ rematch: r?.role === 'host' && canRematch ? () => { r.send({ k: 'lobby' }); hostLobby(); } : undefined, menu: toMenu }}
      labels=${{
        rematch: 'Back to the lobby',
        menu: 'Leave',
        note: !canRematch ? 'The other phone has gone.' : r?.role === 'guest' ? 'The host can start a rematch.' : '',
      }} />`);
    redraw();
  }

  return {
    open,
    /** A guest arriving from the host's QR link. @param {string} code */
    joinWith: (code) => join(code),
  };
}
