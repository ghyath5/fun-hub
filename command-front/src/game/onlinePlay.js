// @ts-check
/**
 * Playing online: the game browser, creating and joining games, the lobby,
 * the match on both sides, the end screen and rematches.
 *
 * It is the two-phone flow (twoPhones.js) with a different way of meeting:
 * instead of scanning each other's codes on one WiFi, players find each
 * other through the lobby server, anywhere. The match itself is the same
 * deterministic lockstep (net/netMatch.js), run over an online room
 * (net/online/room.js) that looks to it exactly like the WiFi one.
 *
 * The host is player 0 and owns the setup; the guest is player 1 (the
 * form's first opponent, marked `remote`) and picks its own faction, colour
 * and country. A host's game stays open when a guest leaves, and the next
 * player can take the seat.
 *
 * Lobby messages (the room delivers each once, in order):
 *   guest → host  { k: 'me', faction, color, country }
 *   host → guest  { k: 'form', form, name, public }   after every change
 *   host → guest  { k: 'start', form, seed, epoch, lag }
 *   host → guest  { k: 'lobby' }                      back to the lobby for a rematch
 *   either        { k: 'bye' }                        leaving (sent by room.close)
 * `lag` is the lockstep's input delay in seconds, chosen by the host from
 * the measured round trip so that both players use the same one.
 *
 * The other player is a stranger: everything received is checked before it
 * is used, and only ever shown as text.
 */
import { html } from 'htm/preact';
import { createLobbyClient, LobbyError } from '../net/online/lobbyClient.js';
import { openOnlineRoom } from '../net/online/room.js';
import { createNetMatch } from '../net/netMatch.js';
import { LOCKSTEP } from '../net/lockstep.js';
import { ONLINE, serverUrls, lagFor } from '../data/online.js';
import { defaultForm, normaliseForm, startMatch, maxPlayersOf, COLORS } from './matchSetup.js';
import { teamForNewOpponent } from './teams.js';
import { mapForForm } from './mapForForm.js';
import { snapshot, restore } from '../save/serialize.js';
import { pack, unpack } from '../lib/storage.js';
import { step } from '../sim/world.js';
import { GAME_SPEEDS, SETUP_DEFAULTS } from '../data/rules.js';
import { FACTIONS } from '../data/factions.js';
import { skillOf, skillName } from '../ai/skill.js';
import { t } from '../lib/i18n.js';
import { track } from '../lib/progress.js';
import { PATHS, setRoute, linkTo } from '../lib/route.js';
import { showScreen, SetupScreen, EndScreen } from '../ui/screens.js';
import { GuestLobby, BuildMismatch } from '../ui/pairScreens.js';
import { OnlineBrowser, LobbyStrip, linkWords, NAME_MAX, GAME_NAME_MAX } from '../ui/onlineScreens.js';
import { BUILD } from '../data/build.js';
import { updateGame } from './update.js';

/** @typedef {import('./matchSetup.js').SetupForm} SetupForm */
/** @typedef {{ faction: 'coalition' | 'union', color: string, country?: string }} Choice */
/** @typedef {import('../lib/route.js').Route} Route */

const HOST = 0;
const GUEST = 1;
/** How long an entry link waits for the server before giving up (ms). */
const ENTRY_WAIT_MS = 12000;

/** What the server said, in the player's words. */
const WHY = Object.freeze({
  gone: 'That game is no longer open.',
  full: 'That game is already full.',
  none: 'No game is waiting right now.',
  busy: 'Still busy with the last request — try again in a moment.',
  crowded: 'The server is full right now. Try again in a few minutes.',
  offline: 'Could not reach the online server. Check your connection.',
  timeout: 'The online server did not answer. Try again.',
});

/** The game speeds with the lockstep's input delay stretched to `lag` seconds (netMatch derives the delay from them). @param {number} lag */
const speedsFor = (lag) => Object.fromEntries(Object.entries(GAME_SPEEDS).map(([id, g]) => [id, { ticksPerSecond: (g.ticksPerSecond * lag) / LOCKSTEP.delaySeconds }]));

/** A host's form as received from a stranger: null unless it is shaped like one. @param {any} f @returns {SetupForm | null} */
function checkedForm(f) {
  try {
    if (!f || typeof f !== 'object' || typeof f.map !== 'string' || !Array.isArray(f.opponents) || !f.opponents.length || f.opponents.length > 8) return null;
    if (!Object.hasOwn(FACTIONS, f.faction) || !Object.hasOwn(GAME_SPEEDS, f.speed) || !COLORS.includes(f.color)) return null;
    for (const o of f.opponents) if (!o || !Object.hasOwn(FACTIONS, o.faction) || !COLORS.includes(o.color)) return null;
    if (!f.opponents[0].remote) return null;
    for (const k of ['genSeed', 'genSize', 'startingCredits', 'techLevel', 'oreGrowthSeconds']) if (!Number.isFinite(f[k])) return null;
    return f;
  } catch { return null; }
}

/** A guest's choice as received from a stranger. @param {any} m @returns {Choice | null} */
function checkedChoice(m) {
  if (!m || !Object.hasOwn(FACTIONS, m.faction) || !COLORS.includes(m.color)) return null;
  return { faction: m.faction, color: m.color, country: typeof m.country === 'string' && /^[a-z]{0,3}$/.test(m.country) ? m.country : '' };
}

/**
 * @param {{
 *   screensEl: HTMLElement,
 *   maps: { id: string, name: string, maxPlayers: number }[],
 *   prefs: { get: () => { form?: SetupForm, me?: Choice, name?: string }, set: (p: { form?: SetupForm, me?: Choice, name?: string }) => void },
 *   play: (world: any, meta: any, net: import('../net/netMatch.js').NetPlay, hooks: any) => Promise<any>,
 *   stop: () => void,
 *   session: () => any,
 *   menu: () => void,
 * }} app
 */
export function createOnline(app) {
  const { screensEl, maps } = app;
  /** @type {import('../net/online/lobbyClient.js').LobbyClient | null} */
  let client = null;
  /** @type {import('../net/online/room.js').OnlineRoom | null} */
  let room = null;
  /** @type {import('../net/netMatch.js').NetPlay | null} */
  let net = null;
  /** @type {'off' | 'browse' | 'lobby' | 'match' | 'end'} */
  let phase = 'off';
  let epoch = 0;
  /** The match being played (for rematches and resyncs). @type {{ form: SetupForm, seed: number, lag: number } | null} */
  let current = null;
  /** Host's lobby form. @type {SetupForm | null} */
  let form = null;
  /** Guest: the host's form as last received. @type {SetupForm | null} */
  let hostForm = null;
  /** The lobby this player is in. @type {{ id: string, name: string, public: boolean } | null} */
  let lobby = null;
  /** @type {Choice} */
  let me = app.prefs.get().me ?? { faction: 'union', color: 'red' };
  let name = (app.prefs.get().name ?? '').slice(0, NAME_MAX) || `${t('Player')} ${100 + Math.floor(Math.random() * 900)}`;
  /** Browser: what is being asked of the server, and the last thing that went wrong. */
  let busy = '';
  let error = '';
  /** A line under the lobby strip (link copied, a player left…). */
  let note = '';
  /** @type {any} */ let noteTimer = 0;
  let redraw = () => {};
  /** @type {(() => void)[]} */ let roomOffs = [];
  /** @type {(() => void)[]} */ let clientOffs = [];
  /** Host lobby: stop watching for players taking or leaving the seat. */
  let offPeer = () => {};
  /** The link badge as last drawn, so the lobby is redrawn only when it reads differently. */
  let linkShown = '';
  const LOST_GAME = 'The connection was lost for too long and the game closed.';

  const show = (/** @type {any} */ vnode) => showScreen(screensEl, vnode);
  const say = (/** @type {string} */ text, ms = 4000) => {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note = ''; if (phase === 'lobby') redraw(); }, ms);
    if (phase === 'lobby') redraw();
  };
  const explain = (/** @type {any} */ e) => t(WHY[/** @type {keyof typeof WHY} */ (e instanceof LobbyError ? e.code : 'offline')] ?? WHY.offline);

  // ---- The server connection.
  function connect() {
    if (client && client.state !== 'closed') return client;
    for (const off of clientOffs) off();
    const c = createLobbyClient({ urls: serverUrls(), name, build: BUILD, log: (line) => console.debug(`[online] ${line}`) });
    client = c;
    const refresh = () => { if (phase === 'browse' || phase === 'lobby') redraw(); };
    clientOffs = [
      c.on('state', refresh), c.on('lobbies', refresh), c.on('online', refresh),
      c.on('lobby', (m) => { if (lobby && room?.role === 'guest' && m.lobby) { lobby = { id: lobby.id, name: String(m.lobby.name ?? lobby.name), public: !!m.lobby.public }; refresh(); } }),
      // The server speaks a newer protocol than this copy of the game.
      c.on('fatal', () => { if (phase !== 'match') mismatch(true); }),
    ];
    return c;
  }
  function disconnect() {
    for (const off of clientOffs) off();
    clientOffs = [];
    client?.close();
    client = null;
  }
  /** Resolves true once the server link is up (false if it takes too long). */
  function whenOnline() {
    const c = connect();
    if (c.state === 'online') return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (/** @type {boolean} */ ok) => { off(); clearTimeout(timer); resolve(ok); };
      const off = c.on('state', (s) => { if (s === 'online') done(true); else if (s === 'closed') done(false); });
      const timer = setTimeout(() => done(false), ENTRY_WAIT_MS);
    });
  }

  /** Close the room and forget the match; the server connection stays. */
  function closeRoom() {
    roomOffs.forEach((off) => off());
    roomOffs = [];
    offPeer();
    offPeer = () => {};
    net?.destroy();
    net = null;
    room?.close();
    room = null;
    current = null;
    lobby = null;
    form = null;
    hostForm = null;
    note = '';
  }

  /** This copy of the game and the other side's differ. @param {boolean} mineOlder */
  function mismatch(mineOlder) {
    closeRoom();
    phase = 'off';
    redraw = () => show(html`<${BuildMismatch} mineOlder=${mineOlder} act=${{ update: updateGame, leave: () => browse() }} />`);
    redraw();
  }

  // ---- The browser.
  /** @param {string} [message] something to tell the player on arrival */
  function browse(message = '') {
    closeRoom();
    phase = 'browse';
    busy = '';
    error = message;
    setRoute(PATHS.online, { replace: location.hash.startsWith('#/online') });
    const c = connect();
    c.subscribe(true);
    redraw = () => show(html`<${OnlineBrowser} state=${c.state} online=${c.online} lobbies=${c.lobbies} build=${BUILD} name=${name}
      busy=${busy} error=${error} unconfigured=${c.unconfigured}
      act=${{ quick, create, join, rename, back: leaveOnline, dismiss: () => { error = ''; redraw(); } }} />`);
    redraw();
  }

  /** @param {string} next */
  function rename(next) {
    const clean = next.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (!clean || clean === name) { redraw(); return; }
    name = clean;
    app.prefs.set({ name });
    // The server learns a name at hello: say hello again under the new one.
    disconnect();
    if (phase === 'browse') browse();
  }

  /** Run a server request from the browser, showing progress and failures. @template T @param {string} what @param {() => Promise<T>} fn @returns {Promise<T | null>} */
  async function ask(what, fn) {
    if (busy) return null;
    busy = what;
    error = '';
    redraw();
    try {
      return await fn();
    } catch (e) {
      if (e instanceof LobbyError && e.code === 'build') { mismatch(BUILD < Number(e.detail?.build ?? 0)); return null; }
      if (e instanceof LobbyError && e.code === 'none') throw e;
      if (phase === 'browse') { error = explain(e); }
      return null;
    } finally {
      busy = '';
      if (phase === 'browse') redraw();
    }
  }

  async function create() {
    const c = connect();
    const start = hostStartForm();
    const gameName = t("{name}'s game", { name }).slice(0, GAME_NAME_MAX);
    const made = await ask('create', () => c.host({ name: gameName, public: true, info: infoOf(start) }));
    if (!made || phase !== 'browse') return;
    c.subscribe(false);
    lobby = { id: made.lobby.id, name: made.lobby.name, public: made.lobby.public };
    visited.add(lobby.id);
    form = start;
    openRoom('host', null);
    setRoute(PATHS.game(lobby.id));
    hostLobby();
  }

  /** @param {string} id @param {{ lobby: any, peer: { name: string } }} seat */
  function seated(id, seat) {
    client?.subscribe(false);
    lobby = { id: seat.lobby.id ?? id, name: String(seat.lobby.name ?? ''), public: seat.lobby.public !== false };
    visited.add(lobby.id);
    openRoom('guest', { name: String(seat.peer?.name ?? '') });
    setRoute(PATHS.game(lobby.id));
    guestLobby();
  }

  /** @param {string} id */
  async function join(id) {
    const c = connect();
    const seat = await ask('join', () => c.join(id));
    if (seat && phase === 'browse') seated(id, seat);
  }

  async function quick() {
    const c = connect();
    try {
      const seat = await ask('quick', () => c.quick());
      if (seat && phase === 'browse') seated(seat.lobby.id, seat);
    } catch {
      // Nobody is waiting: become the game the next player finds.
      await create();
      if (phase === 'lobby') say(t('No game was waiting, so you are hosting one. The next player to tap Quick match joins you.'), 9000);
    }
  }

  /** Leave online play altogether. */
  function leaveOnline() {
    closeRoom();
    disconnect();
    phase = 'off';
    app.menu();
  }

  // ---- Rooms.
  /** @param {'host' | 'guest'} role @param {{ name: string } | null} peer */
  function openRoom(role, peer) {
    const r = openOnlineRoom({ client: /** @type {any} */ (client), role, peer, log: (line) => console.debug(`[online] ${line}`) });
    room = r;
    roomOffs.push(r.onBlob((kind, bytes) => { if (kind === 'sync' && r.role === 'guest') fromSync(bytes); }));
    roomOffs.push(r.onStats((st) => {
      const words = linkWords(st);
      if (words === linkShown) return;
      linkShown = words;
      if (phase === 'lobby') redraw();
    }));
    roomOffs.push(r.onState((s) => {
      if (phase === 'match') { if (s === 'open') publishState(); return; } // the match shows its own cards
      if (phase === 'lobby' && s === 'gone') browse(t(r.role === 'host' ? LOST_GAME : 'The game closed: the host is gone.'));
      else if (phase === 'lobby' || phase === 'end') redraw();
    }));
    return r;
  }

  /** What the game list shows about a form. @param {SetupForm} f */
  function infoOf(f) {
    return {
      map: f.map === 'generated' ? 'Generated map' : maps.find((m) => m.id === f.map)?.name ?? f.map,
      ais: f.opponents.filter((o) => !o.remote).length,
      speed: f.speed,
      credits: f.startingCredits,
    };
  }
  /** Host: keep the list's entry for this game current. */
  const publishState = () => { if (room?.role === 'host') client?.info({ state: phase === 'match' ? 'playing' : 'open' }); };

  async function share() {
    if (!lobby) return;
    const url = linkTo(PATHS.game(lobby.id));
    const text = t('Play Command Front with me: {name}', { name: lobby.name });
    try {
      if (navigator.share) { await navigator.share({ title: 'Command Front', text, url }); return; }
      await navigator.clipboard.writeText(url);
      say(t('Link copied. Send it to a friend.'));
    } catch (e) {
      if (/** @type {any} */ (e)?.name !== 'AbortError') say(url, 15000); // no share sheet, no clipboard: show it to copy by hand
    }
  }

  const strip = () => {
    const r = room;
    if (!r || !lobby || !client) return null;
    return html`<${LobbyStrip} role=${r.role} name=${lobby.name} code=${lobby.id} isPublic=${lobby.public}
      peer=${r.peer ? r.peer.name || t('Player') : null} stats=${r.peer ? r.stats() : null} server=${client.state} note=${note}
      act=${{
        share,
        rename: (/** @type {string} */ n) => { if (!lobby || !n) { redraw(); return; } lobby = { ...lobby, name: n.slice(0, GAME_NAME_MAX) }; client?.info({ name: lobby.name }); redraw(); },
        setPublic: (/** @type {boolean} */ on) => { if (!lobby) return; lobby = { ...lobby, public: on }; client?.info({ public: on }); redraw(); },
      }} />`;
  };

  // ---- Lobbies.
  /** The host's starting form: the saved one, with the other player as the first opponent. */
  function hostStartForm() {
    const saved = app.prefs.get().form ?? defaultForm();
    const ais = saved.opponents.filter((o) => !o.remote);
    const remote = saved.opponents.find((o) => o.remote) ?? { faction: me.faction, color: 'red', skill: SETUP_DEFAULTS.skill, team: teamForNewOpponent({ ...saved, opponents: ais }) };
    const f = { ...saved, cashButton: false, opponents: [{ ...remote, remote: true }, ...ais] };
    return normaliseForm(f, maxPlayersOf(f, maps));
  }

  function hostLobby() {
    const r = room;
    if (!r) return;
    phase = 'lobby';
    form = form ?? hostStartForm();
    let problem = '';
    /** The guest has told us its side (a match needs it). */
    let guestReady = false;
    const publish = () => {
      if (!form) return;
      app.prefs.set({ form });
      client?.info({ info: infoOf(form), state: 'open' });
      if (r.peer) r.send({ k: 'form', form, name: lobby?.name, public: lobby?.public });
    };
    offPeer();
    offPeer = r.onPeer((p) => {
      if (phase !== 'lobby') return;
      guestReady = false;
      if (p) { publish(); say(t('{name} joined.', { name: p.name || t('Player') })); }
      redraw();
    });
    r.listen((msg) => {
      if (phase !== 'lobby') return;
      if (msg?.k === 'me' && form) {
        const choice = checkedChoice(msg);
        if (!choice) return;
        guestReady = true;
        const [remote, ...rest] = form.opponents;
        form = normaliseForm({ ...form, opponents: [{ ...remote, ...choice, remote: true }, ...rest] }, maxPlayersOf(form, maps));
        publish();
        redraw();
      } else if (msg?.k === 'bye') {
        const who = r.peer?.name || t('Player');
        guestReady = false;
        if (!r.reopen()) { browse(t(LOST_GAME)); return; }
        publishState();
        say(t('{name} left. The game is open for the next player.', { name: who }), 6000);
      }
    });
    redraw = () => {
      if (!form) return;
      const waiting = !r.peer ? t('Share the link, or just wait: the next player to tap Quick match joins you.') : !guestReady || r.state !== 'open' ? t('Connecting to the other player…') : '';
      show(html`<${SetupScreen} online=${true} form=${form} maps=${maps} error=${t(problem)}
        title=${t('Online game')} banner=${strip()} startBlocked=${waiting}
        remote=${{ name: r.peer ? r.peer.name || t('Player') : t('Open seat'), note: r.peer ? '' : t('waiting for a player') }}
        onChange=${(/** @type {SetupForm} */ f) => { form = normaliseForm({ ...f, cashButton: false }, maxPlayersOf(f, maps)); publish(); redraw(); }}
        onStart=${async () => {
          if (!form || !r.peer || !guestReady || r.state !== 'open') return;
          const chosen = await track(mapForForm(form));
          if (!chosen.map) { problem = chosen.error; redraw(); return; }
          if (!r.peer || r.state !== 'open' || phase !== 'lobby') return; // the guest left while the map was made
          form = normaliseForm(form, chosen.map.maxPlayers);
          const seed = chosen.seed ?? Date.now() % 1e9;
          const lag = lagFor(r.stats().rtt);
          epoch = 0;
          r.send({ k: 'start', form, seed, epoch, lag });
          launch(form, seed, lag, chosen.map);
        }}
        onBack=${() => browse()} />`);
    };
    publish();
    redraw();
  }

  function guestLobby() {
    const r = room;
    if (!r) return;
    phase = 'lobby';
    const sendMe = () => { r.send({ k: 'me', ...me }); app.prefs.set({ me }); };
    r.listen((msg) => {
      if (phase !== 'lobby') return;
      switch (msg?.k) {
        case 'form': {
          const f = checkedForm(msg.form);
          if (f) { hostForm = f; if (lobby && typeof msg.name === 'string') lobby = { ...lobby, name: msg.name.slice(0, GAME_NAME_MAX), public: msg.public !== false }; redraw(); }
          break;
        }
        case 'start': begin(msg); break;
        case 'bye': browse(t('The host closed the game.')); break;
        default: break;
      }
    });
    redraw = () => show(html`<${GuestLobby} form=${hostForm} maps=${maps} me=${me}
      title=${t('Online game')} you=${t('You')} hostName=${r.peer?.name || t('Host')} banner=${strip()}
      onMe=${(/** @type {Choice} */ m) => { me = m; sendMe(); redraw(); }} onLeave=${() => browse()} />`);
    sendMe();
    redraw();
  }

  /** Guest: the host started a match. @param {any} msg */
  function begin(msg) {
    const f = checkedForm(msg.form);
    if (!f || !Number.isFinite(msg.seed)) return;
    epoch = Number.isInteger(msg.epoch) ? msg.epoch : 0;
    const lag = Math.min(ONLINE.lagMaxSeconds, Math.max(ONLINE.lagMinSeconds, Number(msg.lag) || ONLINE.lagMinSeconds));
    launch(f, msg.seed, lag, null);
  }

  // ---- The match.
  const myId = () => (room?.role === 'host' ? HOST : GUEST);

  /** Start (or restart) the match. @param {SetupForm} f @param {number} seed @param {number} lag @param {any} map null: resolve from the form */
  async function launch(f, seed, lag, map) {
    if (!room) return;
    try {
      const resolved = map ?? (await track(mapForForm(f))).map;
      if (!resolved) throw new Error('no map');
      current = { form: f, seed, lag };
      await play(startMatch(f, resolved, seed));
    } catch (e) {
      console.warn('[online] the match could not start', e);
      browse(t('The match could not start on this device.'));
    }
  }

  /** Put a world on screen as a networked session. @param {any} world */
  async function play(world) {
    if (!room || !current) return;
    const r = room;
    net?.destroy();
    phase = 'match';
    publishState();
    showScreen(screensEl, null);
    const f = current.form;
    // `internet` tells the HUD to word its link cards for players who are not in the same room.
    const match = Object.assign(createNetMatch({
      room: /** @type {any} */ (r), me: myId(), them: 1 - myId(), epoch, startTick: world.tick,
      speeds: speedsFor(current.lag), speed: f.speed,
      step,
      onDesync: (tick) => {
        console.warn(`[online] desync at tick ${tick}`);
        app.session()?.store.set({ link: 'resync' });
        if (r.role === 'host') resync(); else r.send({ k: 'desync' });
      },
      onResyncAsked: () => { if (r.role === 'host') resync(); },
    }), { internet: true });
    net = match;
    await app.play(world, { speed: f.speed, form: f, online: true, internet: true, me: myId() }, match, {
      exit: leave,
      retry: () => r.retry(),
      ended: (/** @type {any} */ result) => ended(result),
      speedChanged: (/** @type {SetupForm['speed']} */ speed) => { if (current) current = { ...current, form: { ...current.form, speed } }; },
    });
  }

  /** Host: copy this side's world to the other player, and both restart from that copy. */
  function resync() {
    const s = app.session();
    if (!room || !s || room.role !== 'host') return;
    epoch++;
    const bytes = pack({ snapshot: snapshot(s.world), epoch, speed: current?.form.speed });
    room.sendBlob('sync', bytes);
    fromSync(bytes);
  }

  /** @param {Uint8Array} bytes */
  async function fromSync(bytes) {
    if (phase !== 'match' || !current) return;
    try {
      const data = unpack(bytes);
      if (!Number.isInteger(data.epoch) || data.epoch <= epoch - (room?.role === 'host' ? 1 : 0)) return; // an old or repeated copy
      epoch = data.epoch;
      if (Object.hasOwn(GAME_SPEEDS, data.speed)) current = { ...current, form: { ...current.form, speed: data.speed } };
      const world = restore(data.snapshot);
      app.stop();
      await play(world);
    } catch (e) {
      console.warn('[online] the resync copy could not be used', e);
    }
  }

  /** Leave mid-match: surrender, tell the other player, back to the browser. */
  function leave() {
    net?.leave();
    app.stop();
    phase = 'off';
    // Let the last bundle and the goodbye leave before the room closes.
    setTimeout(() => browse(), 250);
  }

  /** @param {{ tick: number, draw: boolean, winners: number[] }} result */
  function ended(result) {
    const s = app.session();
    if (!s) return;
    const w = s.world;
    const mine = myId();
    const r = room;
    const peerName = r?.peer?.name || t('Player');
    const outcome = result.draw ? 'draw' : result.winners.some((id) => w.allied(id, mine)) ? 'victory' : 'defeat';
    const rows = w.players.map((/** @type {any} */ p) => ({
      name: `${p.id === mine ? t('You') : p.human ? peerName : t('AI ({level})', { level: `${skillOf(p)} · ${t(skillName(skillOf(p)))}` })} · ${t(FACTIONS[/** @type {'coalition' | 'union'} */ (p.faction)].name)}`,
      color: p.color, country: p.country, alive: p.alive, stats: p.stats,
    }));
    const theyLeft = s.store.get().link === 'left';
    net?.destroy();
    net = null;
    app.stop();
    phase = 'end';
    /** The other player is still here for another match. */
    let together = !!r && r.state === 'open' && !theyLeft;
    if (r) {
      r.listen((msg) => {
        if (msg?.k === 'lobby' && r.role === 'guest') guestLobby();
        else if (msg?.k === 'start' && r.role === 'guest') begin(msg);
        else if (msg?.k === 'bye') { together = false; redraw(); }
      });
    }
    /** Host: back to the lobby — with the same player, or open for the next. */
    const toLobby = () => {
      if (!r) return;
      if (together) r.send({ k: 'lobby' }); else if (!r.reopen()) { browse(t(LOST_GAME)); return; }
      hostLobby();
    };
    redraw = () => show(html`<${EndScreen} outcome=${outcome} ticks=${result.tick} rows=${rows}
      act=${{ rematch: r?.role === 'host' && r.state !== 'closed' ? toLobby : undefined, menu: () => browse() }}
      labels=${{
        rematch: t('Back to the lobby'),
        menu: t('Leave'),
        note: !together ? t('The other player has gone.') : r?.role === 'guest' ? t('The host can start a rematch.') : '',
      }} />`);
    redraw();
  }

  // ---- Entry.
  /** Games this player has been in since the page opened. */
  const visited = new Set();
  /**
   * Open online play at an address: the browser, a new game, or a game by its code.
   * @param {Route} route
   * @param {{ history?: boolean }} [o] history: the player got here with Back or Forward, not by opening a link.
   *   Going back through a game already left, or through "new game", opens the browser — not that game again.
   */
  async function open(route, { history = false } = {}) {
    if (phase === 'match') return;
    if (history && (route.name === 'create' || (route.name === 'game' && visited.has(route.id)))) route = { name: 'online' };
    if (route.name === 'create' || route.name === 'game') {
      closeRoom();
      phase = 'browse';
      busy = route.name === 'create' ? 'create' : 'join';
      error = '';
      const c = connect();
      redraw = () => show(html`<${OnlineBrowser} state=${c.state} online=${c.online} lobbies=${c.lobbies} build=${BUILD} name=${name}
        busy=${busy} error=${error} unconfigured=${c.unconfigured}
        act=${{ quick, create, join, rename, back: leaveOnline, dismiss: () => { error = ''; redraw(); } }} />`);
      redraw();
      if (c.unconfigured) return;
      const up = await whenOnline();
      if (phase !== 'browse') return;
      busy = '';
      if (!up) { browse(t(WHY.offline)); return; }
      browse();
      if (route.name === 'create') await create(); else await join(route.id);
      return;
    }
    browse();
  }

  return {
    open,
    /** Is online play on screen (not the main menu)? */
    get active() { return phase !== 'off'; },
    /** Close everything quietly (the player navigated away with Back). */
    shut() { closeRoom(); disconnect(); phase = 'off'; },
  };
}
