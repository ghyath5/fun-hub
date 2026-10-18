// @ts-check
/**
 * Audio adapter: Howler.js owns the one AudioContext (classic script →
 * globals Howl, Howler); everything plays through three buses (effects,
 * voice, ui) whose levels come from Settings.
 *
 * Sounds come from three places, first match wins:
 *   1. the player's own files (Settings → Custom sounds), kept on the device;
 *   2. the rendered sound set in assets/sound (index: sounds.json), decoded
 *      on first use — effects right after unlock, voices as they are needed;
 *   3. small ZzFX blips generated in code, for interface clicks and as a
 *      stand-in while a sample is still loading or when it cannot load.
 *
 * Voices have two channels: the announcer speaks one line at a time from a
 * short queue; unit replies never cut each other off — the newest waits its turn.
 */
import { AUDIO } from '../data/ui.js';
import { SOUND_INDEX, customNameOf } from '../data/sounds.js';

/** @typedef {'effects' | 'voice' | 'ui'} Bus */
/** @typedef {{ bus?: Bus, volume?: number, pan?: number, weapon?: boolean }} PlayOpts */

/**
 * Generated stand-ins, as ZzFX parameter lists.
 * @type {Record<string, number[]>}
 */
export const SOUNDS = {
  tap:      [0.4, 0, 880, 0, 0.01, 0.03, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5],
  ack:      [0.5, 0.05, 520, 0.01, 0.03, 0.06, 1, 1.5, 0, 0, 120, 0.03],
  reject:   [0.5, 0, 140, 0.01, 0.05, 0.1, 2, 2, 0, 0, 0, 0, 0, 0.3],
  rifle:    [0.6, 0.1, 300, 0, 0.01, 0.06, 4, 2, 0, 0, 0, 0, 0, 1.4],
  cannon:   [0.9, 0.1, 80, 0, 0.04, 0.3, 4, 3, -2, 0, 0, 0, 0, 1.2],
  boom:     [1, 0.1, 50, 0.02, 0.2, 0.7, 4, 2.5, -1, 0, 0, 0, 0, 1.6],
  mg:       [0.5, 0.1, 260, 0, 0.01, 0.04, 4, 1.8, 0, 0, 0, 0, 0, 1.2],
  thump:    [0.8, 0.1, 70, 0.01, 0.06, 0.35, 4, 2.2, -3, 0, 0, 0, 0, 1],
  missile:  [0.6, 0.1, 400, 0.02, 0.15, 0.25, 4, 1, -8, 0, 0, 0, 0, 0.8],
  flame:    [0.6, 0.2, 120, 0.05, 0.25, 0.25, 4, 0.5, 0, 0, 0, 0, 0, 2],
  zap:      [0.6, 0.05, 900, 0.01, 0.08, 0.2, 2, 0.5, -30, 0, 0, 0, 0.04, 0],
  snipe:    [0.6, 0.05, 700, 0, 0.01, 0.12, 4, 3, -10, 0, 0, 0, 0, 0.6],
  heal:     [0.3, 0, 880, 0.02, 0.06, 0.12, 0, 1.2, 0, 0, 440, 0.06],
  bite:     [0.4, 0.2, 180, 0, 0.02, 0.06, 4, 1, 0, 0, 0, 0, 0, 1],
  small:    [0.5, 0.1, 140, 0, 0.04, 0.18, 4, 2, -2, 0, 0, 0, 0, 1],
  ready:    [0.5, 0, 660, 0.01, 0.08, 0.2, 0, 1.3, 0, 0, 220, 0.08],
};
/** Stand-ins for rendered effects that have no blip of their own. */
const STAND_IN = /** @type {Record<string, string>} */ ({ heavy: 'cannon', bigBoom: 'boom', die: 'small', place: 'thump', deploy: 'thump', growl: 'bite' });

/** How many announcer lines may wait their turn; older ones are dropped. */
const QUEUE_MAX = 2;
/** A queued line older than this is no longer news. */
const STALE_MS = 3500;
/** A unit reply that waited longer than this behind another is dropped. */
const REPLY_FRESH_MS = 1500;

/**
 * @param {{ index?: string, load?: (url: string) => Promise<ArrayBuffer> }} [opts]
 */
export function createAudio(opts = {}) {
  const H = /** @type {any} */ (globalThis).Howler;
  const indexUrl = opts.index ?? SOUND_INDEX;
  const base = indexUrl.slice(0, indexUrl.lastIndexOf('/') + 1);
  const load = opts.load ?? (async (/** @type {string} */ url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.arrayBuffer();
  });

  /** @type {Record<Bus, GainNode> | null} */
  let buses = null;
  /** @type {AudioContext | null} */
  let ctx = null;
  /** ZzFX stand-ins. @type {Map<string, AudioBuffer>} */
  const blips = new Map();
  /** Rendered sounds by name → file URLs, from sounds.json. @type {Map<string, string[]>} */
  const files = new Map();
  /** Decoded rendered sounds. @type {Map<string, AudioBuffer[]>} */
  const samples = new Map();
  /** Decodes in flight. @type {Map<string, Promise<AudioBuffer[] | null>>} */
  const loading = new Map();
  /** The player's own files, by custom name (see customNameOf). @type {Map<string, AudioBuffer[]>} */
  const custom = new Map();
  /** Raw custom files waiting for the context to exist. @type {Map<string, ArrayBuffer[]> | null} */
  let customRaw = null;
  let active = 0;
  let unlocked = false;
  /** @type {Promise<void> | null} */
  let indexReady = null;
  /** Bus levels chosen in Settings (applied when the buses exist). @type {Record<Bus, number>} */
  const levels = { effects: 1, voice: 1, ui: 1 };

  /** Fetch the index of rendered sounds. */
  function readIndex() {
    indexReady ??= (async () => {
      try {
        const doc = JSON.parse(new TextDecoder().decode(await load(indexUrl)));
        for (const [name, list] of Object.entries(doc.sfx ?? {})) files.set(name, /** @type {string[]} */ (list).map((f) => base + f));
        for (const [set, keys] of Object.entries(doc.voice ?? {})) {
          for (const [key, list] of Object.entries(/** @type {Record<string, string[]>} */ (keys))) files.set(`voice:${set}:${key}`, list.map((f) => base + f));
        }
        // Arabic voices (Settings → Language → Voices) are `voice:<set>@ar:<key>`; a line
        // with no Arabic recording falls back to the English one, so nothing goes silent.
        for (const [name, urls] of [...files]) {
          if (name.startsWith('voice:')) files.set(name.replace(/^voice:([^:]+):/, 'voice:$1@ar:'), urls);
        }
        for (const [set, keys] of Object.entries(doc.voiceAr ?? {})) {
          for (const [key, list] of Object.entries(/** @type {Record<string, string[]>} */ (keys))) files.set(`voice:${set}@ar:${key}`, list.map((f) => base + f));
        }
      } catch (e) {
        console.warn('[audio] sound set unavailable, using generated blips', e);
      }
    })();
    return indexReady;
  }

  /** @param {ArrayBuffer} bytes */
  const decode = (bytes) => /** @type {AudioContext} */ (ctx).decodeAudioData(bytes.slice(0));

  /** Decode a rendered sound's variants (once). @param {string} name */
  function fetchSample(name) {
    if (samples.has(name)) return Promise.resolve(samples.get(name) ?? null);
    const urls = files.get(name);
    if (!urls || !ctx) return Promise.resolve(null);
    let p = loading.get(name);
    if (!p) {
      p = Promise.all(urls.map(async (u) => decode(await load(u))))
        .then((bufs) => { samples.set(name, bufs); return bufs; })
        .catch((e) => { console.warn('[audio]', name, e); samples.set(name, []); return null; })
        .finally(() => loading.delete(name));
      loading.set(name, p);
    }
    return p;
  }

  async function decodeCustom() {
    if (!ctx || !customRaw) return;
    const raw = customRaw;
    customRaw = null;
    custom.clear();
    for (const [name, list] of raw) {
      const bufs = [];
      for (const bytes of list) {
        try { bufs.push(await decode(bytes)); } catch (e) { console.warn('[audio] custom sound could not be read:', name, e); }
      }
      if (bufs.length) custom.set(name, bufs);
    }
  }

  /** Resolves once the buses exist (after the first successful unlock). */
  /** @type {(v?: any) => void} */
  let markReady = () => {};
  const readyPromise = new Promise((r) => { markReady = r; });

  /** Resume a context the browser suspended (tab hidden, phone call): call on any gesture. */
  function wake() {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  async function unlock() {
    if (unlocked || !H) return;
    unlocked = true;
    H.volume(1); // creates Howler.ctx if it does not exist yet
    ctx = /** @type {AudioContext} */ (H.ctx);
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    buses = { effects: ctx.createGain(), voice: ctx.createGain(), ui: ctx.createGain() };
    for (const [bus, g] of Object.entries(buses)) {
      g.gain.value = levels[/** @type {Bus} */ (bus)];
      g.connect(H.masterGain ?? ctx.destination);
    }
    // ZzFX's module makes its own context at import: close it and lend it ours.
    const { ZZFX } = await import('zzfx');
    ZZFX.audioContext?.close?.().catch(() => {});
    ZZFX.audioContext = ctx;
    for (const [name, params] of Object.entries(SOUNDS)) {
      const data = ZZFX.buildSamples(...params);
      const buf = ctx.createBuffer(1, data.length, ZZFX.sampleRate);
      buf.getChannelData(0).set(data);
      blips.set(name, buf);
    }
    await decodeCustom();
    await readIndex();
    markReady();
    // Effects are short and used constantly: have them all ready.
    for (const name of files.keys()) if (!name.startsWith('voice:')) fetchSample(name);
  }

  /** Every recording of a sound that is ready to play now. @param {string} name */
  function ready(name) {
    const own = custom.get(customNameOf(name));
    if (own?.length) return own;
    const got = samples.get(name);
    if (got?.length) return got;
    if (!got) fetchSample(name); // for next time
    return null;
  }

  /** Start one buffer on a bus. @param {AudioBuffer} buf @param {PlayOpts} o */
  function start(buf, o) {
    const c = /** @type {AudioContext} */ (ctx);
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = o.volume ?? 1;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
    src.connect(pan).connect(gain).connect(/** @type {Record<Bus, GainNode>} */ (buses)[o.bus ?? 'effects']);
    src.start();
    return src;
  }

  /** @template T @param {T[]} list */
  const any = (list) => list[Math.floor(Math.random() * list.length)];

  /**
   * Play an effect or interface sound.
   * @param {string} name @param {PlayOpts} [o]
   */
  function play(name, o = {}) {
    if (!buses) return;
    if (o.weapon && active >= AUDIO.maxWeaponSounds) return;
    const list = ready(name);
    const buf = list ? any(list) : blips.get(name) ?? blips.get(STAND_IN[name]);
    if (!buf) return;
    const src = start(buf, o);
    if (o.weapon) {
      active++;
      src.onended = () => { active--; };
    }
  }

  // ---- Voices.
  /** @type {{ name: string, at: number, volume: number }[]} */
  const queue = [];
  /** @type {AudioBufferSourceNode | null} */
  let speaking = null;
  /** @type {AudioBufferSourceNode | null} */
  let replying = null;

  function nextLine() {
    if (speaking || !buses) return;
    const now = performance.now();
    while (queue.length && now - queue[0].at > STALE_MS) queue.shift();
    const line = queue.shift();
    if (!line) return;
    const list = ready(line.name);
    if (!list) {
      // Not decoded yet: wait for it (it is news for a few seconds), then try again.
      fetchSample(line.name).then((bufs) => {
        if (bufs?.length) queue.unshift(line); // a line that cannot load is dropped
        nextLine();
      });
      return;
    }
    speaking = start(any(list), { bus: 'voice', volume: line.volume });
    speaking.onended = () => { speaking = null; nextLine(); };
  }

  /**
   * The announcer: lines wait their turn; a line already waiting is not queued twice.
   * @param {string} name @param {number} [volume]
   */
  function announce(name, volume = 1) {
    if (!buses) return;
    if (!files.has(name) && !custom.has(customNameOf(name))) return;
    if (queue.some((l) => l.name === name)) return;
    queue.push({ name, at: performance.now(), volume });
    while (queue.length > QUEUE_MAX) queue.shift();
    nextLine();
  }

  /** The newest reply asked for while another was still speaking (played next, if still fresh). @type {{ name: string, volume: number, at: number } | null} */
  let pendingReply = null;

  /** Start a reply and, when it ends, the one that waited behind it. @param {AudioBuffer[]} list @param {number} volume */
  function speakReply(list, volume) {
    const src = start(any(list), { bus: 'voice', volume });
    replying = src;
    src.onended = () => {
      if (replying !== src) return;
      replying = null;
      const next = pendingReply;
      pendingReply = null;
      if (!next || performance.now() - next.at > REPLY_FRESH_MS) return;
      const bufs = ready(next.name);
      if (bufs) speakReply(bufs, next.volume);
    };
  }

  /**
   * A unit's reply. A line is never cut off mid-word: a reply asked for
   * while another is speaking waits for it to finish (only the newest waits,
   * and only while it is still fresh). Falls back to a blip while the line loads.
   * @param {string} name @param {number} [volume]
   */
  function reply(name, volume = 0.9) {
    if (!buses) return;
    const list = ready(name);
    if (!list) { play('ack', { bus: 'voice', volume: 0.5 }); return; }
    if (replying) { pendingReply = { name, volume, at: performance.now() }; return; }
    speakReply(list, volume);
  }

  /** Decode lines ahead of need (a faction's voices at match start). @param {string[]} names */
  async function preload(names) {
    await readIndex();
    for (const n of names) if (files.has(n)) await fetchSample(n);
  }

  /**
   * Replace sounds with the player's own files (custom name → file contents).
   * @param {Map<string, ArrayBuffer[]>} raw
   */
  async function setCustom(raw) {
    customRaw = raw;
    if (ctx) await decodeCustom();
    else custom.clear();
  }

  /** Every sound name the game can play (rendered set and blips), once the index is read. */
  async function names() {
    await readIndex();
    return [...new Set([...files.keys(), ...Object.keys(SOUNDS)])];
  }

  /** @param {Bus} bus @param {number} v */
  function setBusVolume(bus, v) {
    levels[bus] = v;
    if (buses) buses[bus].gain.value = v;
  }

  return { unlock, wake, whenReady: () => readyPromise, play, announce, reply, preload, setCustom, names, setBusVolume, get unlocked() { return unlocked; } };
}
