// @ts-check
/**
 * Build-menu icons (section 14): each unit and structure's own baked art,
 * composited on a dark tile in the player's colour. All tiles are laid out
 * in one atlas and read back from the GPU once, then cut into data URLs for
 * the HUD with a 2D canvas. No icon files exist anywhere.
 */
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';

const SIZE = 56;
const RES = 2;

/** Team-tinted copy of a paint + detail pair. @param {any} t @param {number} tint @param {boolean} centred */
function art(t, tint, centred) {
  const c = new Container();
  const p = new Sprite(t.paint);
  const d = new Sprite(t.detail);
  if (centred) { p.anchor.set(0.5); d.anchor.set(0.5); }
  p.tint = tint;
  c.addChild(p, d);
  // Pre-rendered art: the building image is drawn from its own top-left, with parts on top.
  if (!centred && t.art) {
    for (const s of [p, d]) s.position.set(t.ox, t.oy);
    for (const part of t.parts) {
      const pp = new Sprite(part.paint);
      const pd = new Sprite(part.detail);
      pp.anchor.set(0.5); pd.anchor.set(0.5);
      pp.tint = tint;
      for (const s of [pp, pd]) s.position.set(part.x, part.y);
      c.addChild(pp, pd);
    }
  }
  for (const r of t.rotors ?? []) {
    const rp = new Sprite(r.paint);
    const rd = new Sprite(r.detail);
    rp.anchor.set(0.5); rd.anchor.set(0.5);
    rp.tint = tint;
    for (const s of [rp, rd]) s.position.set(r.x, r.y);
    c.addChild(rp, rd);
  }
  if (t.turret) {
    const tc = new Container();
    const tp = new Sprite(t.turret.paint);
    tp.anchor.set(0.5);
    tp.tint = tint;
    const td = new Sprite(t.turret.detail);
    td.anchor.set(0.5);
    tc.addChild(tp, td);
    if (!centred) tc.position.set(t.w / 2, t.h / 2);
    c.addChild(tc);
  }
  return c;
}

/** One 56 px tile with the art scaled to fit. @param {Container} a @param {number} w @param {number} h @param {number} ox @param {number} oy */
function tile(a, w, h, ox, oy) {
  const box = new Container();
  box.addChild(new Graphics().rect(0, 0, SIZE, SIZE).fill(0x23261c).rect(0, SIZE - 3, SIZE, 3).fill(0x3a3e2c));
  // Small things (infantry) may scale up a lot; the pre-rendered art stays sharp.
  const k = Math.min((SIZE - 8) / w, (SIZE - 8) / h, 6);
  a.scale.set(k);
  a.position.set((SIZE - w * k) / 2 + ox * k, (SIZE - h * k) / 2 + oy * k);
  box.addChild(a);
  return box;
}

/**
 * @param {import('pixi.js').Renderer} renderer
 * @param {Map<string, any>} unitTex
 * @param {Map<string, any>} structTex
 * @param {number} tint
 * @returns {Promise<Record<string, string>>}
 */
export async function makeIcons(renderer, unitTex, structTex, tint) {
  /** @type {[string, Container][]} */
  const tiles = [];
  for (const [type, t] of structTex) {
    // Pre-rendered buildings: frame the whole image minus the shadow margin to the south-east.
    if (t.art) tiles.push([type, tile(art(t, tint, false), t.w - t.ox, t.h - t.oy, -t.ox, -t.oy)]);
    else tiles.push([type, tile(art(t, tint, false), t.w, t.h, 0, 0)]);
  }
  for (const [type, t] of unitTex) {
    const r = Math.max(8, t.radius * 1.4);
    tiles.push([type, tile(art(t, tint, true), r * 2, r * 2, r, r)]);
  }
  const cols = 10;
  const atlas = new Container();
  tiles.forEach(([, box], k) => {
    // Each tile clips its own art, so nothing spills into a neighbour.
    const mask = new Graphics().rect(0, 0, SIZE, SIZE).fill(0xffffff);
    box.addChild(mask);
    box.mask = mask;
    box.position.set((k % cols) * SIZE, Math.floor(k / cols) * SIZE);
    atlas.addChild(box);
  });
  const frame = new Rectangle(0, 0, cols * SIZE, Math.ceil(tiles.length / cols) * SIZE);
  const sheet = /** @type {HTMLCanvasElement} */ (renderer.extract.canvas({ target: atlas, frame, resolution: RES }));
  atlas.destroy({ children: true });

  // The readback's real scale (renderer resolution may multiply ours).
  const k = sheet.width / (cols * SIZE);
  const cut = document.createElement('canvas');
  cut.width = SIZE * RES;
  cut.height = SIZE * RES;
  const g = /** @type {CanvasRenderingContext2D} */ (cut.getContext('2d'));
  /** @type {Record<string, string>} */
  const out = {};
  tiles.forEach(([type], i) => {
    g.clearRect(0, 0, cut.width, cut.height);
    g.drawImage(sheet, (i % cols) * SIZE * k, Math.floor(i / cols) * SIZE * k, SIZE * k, SIZE * k, 0, 0, SIZE * RES, SIZE * RES);
    out[type] = cut.toDataURL('image/png');
  });
  return out;
}
