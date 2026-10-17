// @ts-check
/**
 * Audio adapter: Howler.js owns the one AudioContext (classic script →
 * globals Howl, Howler); ZzFX only builds sample arrays. ZzFX's module makes
 * its own context at import, so it is imported lazily after unlock and that
 * spare context is closed straight away — playback always goes through Howler.ctx.
 */
import { AUDIO } from '../data/ui.js';

/** @typedef {'effects' | 'voice' | 'ui'} Bus */

/**
 * Original sound effects as ZzFX parameter lists, generated in code.
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

export function createAudio() {
  const H = /** @type {any} */ (globalThis).Howler;
  /** @type {Record<Bus, GainNode> | null} */
  let buses = null;
  /** @type {Map<string, AudioBuffer>} */
  const buffers = new Map();
  let active = 0;
  let unlocked = false;
  /** Bus levels chosen in Settings (applied when the buses exist). @type {Record<Bus, number>} */
  const levels = { effects: 1, voice: 1, ui: 1 };

  async function unlock() {
    if (unlocked || !H) return;
    unlocked = true;
    H.volume(1); // creates Howler.ctx if it does not exist yet
    const ctx = /** @type {AudioContext} */ (H.ctx);
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    buses = {
      effects: ctx.createGain(),
      voice: ctx.createGain(),
      ui: ctx.createGain(),
    };
    for (const [bus, g] of Object.entries(buses)) {
      g.gain.value = levels[/** @type {Bus} */ (bus)];
      g.connect(H.masterGain ?? ctx.destination);
    }
    const { ZZFX } = await import('zzfx');
    ZZFX.audioContext?.close?.().catch(() => {});
    ZZFX.audioContext = ctx;
    for (const [name, params] of Object.entries(SOUNDS)) {
      const samples = ZZFX.buildSamples(...params);
      const buf = ctx.createBuffer(1, samples.length, ZZFX.sampleRate);
      buf.getChannelData(0).set(samples);
      buffers.set(name, buf);
    }
  }

  /**
   * @param {string} name
   * @param {{ bus?: Bus, volume?: number, pan?: number, weapon?: boolean }} [opts]
   */
  function play(name, opts = {}) {
    const buf = buffers.get(name);
    if (!buf || !buses) return;
    if (opts.weapon && active >= AUDIO.maxWeaponSounds) return;
    const ctx = /** @type {AudioContext} */ (H.ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    src.connect(pan).connect(gain).connect(buses[opts.bus ?? 'effects']);
    if (opts.weapon) {
      active++;
      src.onended = () => { active--; };
    }
    src.start();
  }

  /** @param {Bus} bus @param {number} v */
  function setBusVolume(bus, v) {
    levels[bus] = v;
    if (buses) buses[bus].gain.value = v;
  }

  return { unlock, play, setBusVolume, get unlocked() { return unlocked; } };
}
