// @ts-check
/**
 * Alerts (section 18): toasts with per-event throttles, an optional jump
 * location, and the history behind the "!" button (last 5 alert places).
 */
import { ALERTS, CAMERA } from '../data/ui.js';
import { t } from '../lib/i18n.js';

/**
 * @param {{ show: (text: string, at?: {x: number, y: number}) => void, said?: (key: string) => void }} toaster
 *   said: told each alert that is shown (the announcer speaks it)
 * @param {() => number} nowMs
 */
export function createAlerts(toaster, nowMs = () => performance.now()) {
  /** @type {Map<string, number>} */
  const last = new Map();
  /** @type {{x: number, y: number}[]} */
  const places = [];
  let cursor = 0;

  return {
    /**
     * @param {keyof typeof ALERTS} key
     * @param {{ x: number, y: number }} [at]  Cell to jump to
     * @param {string} [scope]  Throttle per scope (e.g. a 10-cell area)
     * @param {string} [text]   Replaces the default text (e.g. "Requires Radar Dome")
     * @returns {boolean} whether it was shown
     */
    raise(key, at, scope = '', text = '') {
      const def = ALERTS[key];
      const k = `${key}|${scope}`;
      const now = nowMs();
      if (def.throttle > 0 && now - (last.get(k) ?? -Infinity) < def.throttle * 1000) return false;
      last.set(k, now);
      toaster.show(text || t(def.text), at);
      toaster.said?.(key);
      if (at) {
        places.unshift(at);
        if (places.length > CAMERA.alertHistory) places.pop();
        cursor = 0;
      }
      return true;
    },
    /** Next place for the "!" button to visit, cycling through recent alerts. */
    nextPlace() {
      if (!places.length) return null;
      const p = places[cursor % places.length];
      cursor++;
      return p;
    },
    get count() { return places.length; },
  };
}

/**
 * Battle sounds (section 18): at most N weapon sounds at once, nearest to
 * the screen centre first; volume falls off with distance; off-screen at 30%.
 * Requests are batched per frame and played in `flush()`.
 * @param {{ play: (name: string, opts?: any) => void }} audio
 * @param {{ maxWeaponSounds: number, offscreenVolume: number }} limits
 */
export function createBattleSounds(audio, limits) {
  /** @type {{ name: string, sx: number, sy: number, weapon: boolean }[]} */
  let queue = [];
  return {
    /** @param {string} name @param {number} sx Screen px @param {number} sy @param {boolean} [weapon] */
    queue(name, sx, sy, weapon = true) {
      queue.push({ name, sx, sy, weapon });
    },
    /** @param {number} w Screen width @param {number} h */
    flush(w, h) {
      if (!queue.length) return;
      const cx = w / 2;
      const cy = h / 2;
      const diag = Math.hypot(w, h);
      const items = queue.map((q) => ({ ...q, d: Math.hypot(q.sx - cx, q.sy - cy) })).sort((a, b) => a.d - b.d);
      queue = [];
      let played = 0;
      for (const it of items) {
        if (it.weapon && played >= limits.maxWeaponSounds) continue;
        const off = it.sx < 0 || it.sy < 0 || it.sx > w || it.sy > h;
        const volume = off ? limits.offscreenVolume : Math.max(limits.offscreenVolume, 1 - it.d / diag);
        audio.play(it.name, { bus: 'effects', volume, pan: Math.max(-1, Math.min(1, (it.sx - cx) / cx)), weapon: it.weapon });
        if (it.weapon) played++;
      }
    },
  };
}
