// @ts-check
/**
 * A tall flagpole flying a country's flag over a Construction Yard, the
 * flag waving gently (a mesh whose vertices ripple more toward the fly end).
 * World px; the pole stands at (0, 0) and rises up the screen.
 */
import { Container, Graphics, MeshPlane, Texture } from 'pixi.js';
import { flagCanvas } from '../lib/flags.js';

const POLE_H = 70;
const FLAG_W = 54;
const FLAG_H = 36;
const SEG = 12;
const WAVE_AMP = 2.2;
const WAVE_SPEED = 0.004; // radians per ms
const WAVE_LEN = 0.22;    // radians per px along the flag

/** One texture per country, shared by every pole. @type {Map<string, Texture>} */
const textures = new Map();

/** @param {string} country */
function flagTexture(country) {
  let t = textures.get(country);
  if (!t) {
    t = Texture.from(flagCanvas(country, 192, 128));
    t.source.scaleMode = 'linear';
    textures.set(country, t);
  }
  return t;
}

/** @param {string} country  id from data/countries.js */
export function createFlagpole(country) {
  const view = new Container();
  view.label = `flag:${country}`;
  const pole = new Graphics()
    .ellipse(1, 1, 5, 2).fill({ color: 0x000000, alpha: 0.35 }) // foot shadow
    .rect(-1.4, -POLE_H, 2.8, POLE_H).fill(0x8a8f96)
    .rect(-1.4, -POLE_H, 1, POLE_H).fill(0xc9ced4)
    .circle(0, -POLE_H - 2, 2.6).fill(0xe0b84a);
  const flag = new MeshPlane({ texture: flagTexture(country), verticesX: SEG, verticesY: 2 });
  flag.width = FLAG_W;
  flag.height = FLAG_H;
  flag.position.set(1.4, -POLE_H + 1);
  view.addChild(pole, flag);
  const geo = /** @type {any} */ (flag.geometry);
  // Plane vertices are in the texture's own pixels; the mesh is scaled down to FLAG_W × FLAG_H.
  const rest = Float32Array.from(geo.positions);
  const localW = flag.texture.width;
  const amp = WAVE_AMP / flag.scale.y;
  const k = WAVE_LEN / flag.scale.x;
  const phase = Math.random() * Math.PI * 2;
  return {
    view,
    /** Ripple the flag: still at the pole, freest at the fly end. @param {number} now  ms */
    update(now) {
      const pos = geo.positions;
      for (let i = 0; i < pos.length; i += 2) {
        const x = rest[i];
        const free = x / localW;
        pos[i + 1] = rest[i + 1] + Math.sin(now * WAVE_SPEED + phase - x * k) * amp * free;
      }
      geo.getBuffer('aPosition').update();
    },
    destroy() { view.destroy({ children: true }); },
  };
}
