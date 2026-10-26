// @ts-check
/**
 * A glow on the ground where the base is under attack (src/ui/threats.js):
 * a soft red light that breathes over the spot, feathered to nothing at its
 * edge, and a faint wave that keeps rolling out from it, so the fight is
 * found at a glance without a hard drawn ring. Red for the base, amber for a
 * harvester. It lies on the ground layer of either view, under the units
 * and buildings, like light thrown on the earth.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { RENDER } from '../data/rules.js';
import { THREATS } from '../data/ui.js';

const C = RENDER.cellPx;
const COLOR = { base: 0xff3020, harvester: 0xffa030 };
/** One breath of the glow and one roll of the wave, ms. */
const BREATH_MS = 1400;
const WAVE_MS = 1600;
/** Glow radius, cells; never smaller on screen than MIN_PX. */
const RADIUS = 2.6;
const MIN_PX = 34;
const TEX = 128;

/** A white disc fading to nothing, or (ring) a soft band, as a texture to tint. @param {boolean} ring */
function softTexture(ring) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const h = TEX / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  if (ring) {
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0)');
    grad.addColorStop(0.82, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    // A smooth falloff (roughly Gaussian) so the edge is never seen.
    for (let k = 0; k <= 10; k++) {
      const f = k / 10;
      grad.addColorStop(f, `rgba(255,255,255,${(Math.exp(-4.2 * f * f) - Math.exp(-4.2)) / (1 - Math.exp(-4.2))})`);
    }
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, TEX, TEX);
  return Texture.from(c);
}

export function createThreatRings() {
  const layer = new Container();
  /** @type {Texture | null} */
  let glowTex = null;
  /** @type {Texture | null} */
  let waveTex = null;
  /** @type {{ glow: Sprite, wave: Sprite }[]} */
  const pool = [];
  const make = () => {
    glowTex ??= softTexture(false);
    waveTex ??= softTexture(true);
    const glow = new Sprite(glowTex);
    const wave = new Sprite(waveTex);
    for (const s of [glow, wave]) { s.anchor.set(0.5); layer.addChild(s); }
    wave.blendMode = 'add';
    const item = { glow, wave };
    pool.push(item);
    return item;
  };
  return {
    layer,
    /**
     * @param {readonly import('../ui/threats.js').Threat[]} list
     * @param {number} scale  screen px per world px
     * @param {number} now  ms, on the same clock as the threats
     */
    draw(list, scale, now) {
      let n = 0;
      for (const s of list) {
        // Fades over the last second of the hold, and in over the first moment.
        const fade = Math.min(1, (THREATS.holdMs - (now - s.last)) / 1000, (now - s.first) / 250 + 0.2);
        if (fade <= 0) continue;
        const item = pool[n] ?? make();
        n++;
        const x = (s.x + 0.5) * C;
        const y = (s.y + 0.5) * C;
        const r = Math.max(RADIUS * C, MIN_PX / scale);
        const breath = 0.5 - 0.5 * Math.cos(((now - s.first) % BREATH_MS) / BREATH_MS * Math.PI * 2);
        const color = COLOR[s.kind] ?? COLOR.base;
        item.glow.visible = item.wave.visible = true;
        item.glow.tint = color;
        item.glow.position.set(x, y);
        item.glow.width = item.glow.height = r * 2 * (0.92 + 0.1 * breath);
        item.glow.alpha = (0.42 + 0.22 * breath) * fade;
        const p = ((now - s.first) % WAVE_MS) / WAVE_MS;
        item.wave.tint = color;
        item.wave.position.set(x, y);
        item.wave.width = item.wave.height = r * 2 * (0.6 + 1.1 * p);
        item.wave.alpha = Math.sin(p * Math.PI) * 0.55 * fade;
      }
      for (let k = n; k < pool.length; k++) pool[k].glow.visible = pool[k].wave.visible = false;
    },
  };
}
