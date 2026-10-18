// @ts-check
/**
 * Placement mode visuals (section 15): the ghost structure, each footprint
 * cell green / amber / red, the build area as a faint outline, and wall lines
 * with their running cost.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { RENDER } from '../data/rules.js';

const C = RENDER.cellPx;
const COLORS = { ok: 0x7fd04a, amber: 0xe0a43a, red: 0xd0543a };

/**
 * @param {Map<string, any>} textures structure textures
 * @param {string} [faction]  the viewer's faction, for faction-specific building looks
 */
export function createPlacementOverlay(textures, faction = '') {
  const layer = new Container();
  const area = new Graphics();
  const cells = new Graphics();
  const ghost = new Container();
  ghost.alpha = 0.6;
  const label = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 11, fill: 0xf0e6c8, stroke: { color: 0x1b1d16, width: 3 } } });
  layer.addChild(area, ghost, cells, label);
  let ghostType = '';

  return {
    layer,
    /**
     * @param {null | { type: string, cx: number, cy: number, cells: { x: number, y: number, state: 'ok' | 'amber' | 'red' }[], tint: number,
     *   area: ((x: number, y: number) => boolean) | null, view: { x0: number, y0: number, x1: number, y1: number },
     *   wall?: { cost: number, total: number, at: {x: number, y: number} } | null, ring?: { x: number, y: number, r: number, ok: boolean } | null }} p
     * @param {number} viewScale
     */
    draw(p, viewScale) {
      area.clear();
      cells.clear();
      label.text = '';
      if (!p) { ghost.visible = false; return; }
      // Build area: cell edges where the area ends, within the visible region only.
      const w = 1 / viewScale;
      const inArea = p.area;
      if (inArea) {
        for (let y = p.view.y0; y <= p.view.y1; y++) {
          for (let x = p.view.x0; x <= p.view.x1; x++) {
            if (!inArea(x, y)) continue;
            if (!inArea(x, y - 1)) area.moveTo(x * C, y * C).lineTo((x + 1) * C, y * C);
            if (!inArea(x, y + 1)) area.moveTo(x * C, (y + 1) * C).lineTo((x + 1) * C, (y + 1) * C);
            if (!inArea(x - 1, y)) area.moveTo(x * C, y * C).lineTo(x * C, (y + 1) * C);
            if (!inArea(x + 1, y)) area.moveTo((x + 1) * C, y * C).lineTo((x + 1) * C, (y + 1) * C);
          }
        }
        area.stroke({ width: w * 1.5, color: 0xf0e6c8, alpha: 0.35 });
      }
      if (p.ring) {
        const color = p.ring.ok ? COLORS.ok : COLORS.red;
        const cx = (p.ring.x + 0.5) * C;
        const cy = (p.ring.y + 0.5) * C;
        area.circle(cx, cy, (p.ring.r + 0.5) * C).fill({ color, alpha: 0.12 }).stroke({ width: w * 2, color, alpha: 0.9 });
        area.moveTo(cx - C * 0.4, cy).lineTo(cx + C * 0.4, cy).moveTo(cx, cy - C * 0.4).lineTo(cx, cy + C * 0.4).stroke({ width: w * 2, color });
      }
      for (const c of p.cells) {
        cells.rect(c.x * C + 1, c.y * C + 1, C - 2, C - 2).fill({ color: COLORS[c.state], alpha: 0.32 }).stroke({ width: w, color: COLORS[c.state], alpha: 0.9 });
      }
      if (p.type && p.type !== ghostType) {
        ghost.removeChildren().forEach((ch) => ch.destroy());
        const tex = textures.get(`${p.type}@${faction}`) ?? textures.get(p.type);
        if (tex) {
          const paint = new Sprite(tex.paint);
          paint.tint = p.tint;
          const detail = new Sprite(tex.detail);
          // Pre-rendered buildings start above and left of their footprint.
          for (const s of [paint, detail]) s.position.set(tex.ox ?? 0, tex.oy ?? 0);
          ghost.addChild(paint, detail);
          for (const part of tex.parts ?? []) {
            const pp = new Sprite(part.paint);
            pp.anchor.set(0.5);
            pp.tint = p.tint;
            const pd = new Sprite(part.detail);
            pd.anchor.set(0.5);
            for (const s of [pp, pd]) s.position.set(part.x, part.y);
            ghost.addChild(pp, pd);
          }
        }
        ghostType = p.type;
      }
      ghost.visible = !p.wall && !!p.type;
      ghost.position.set(p.cx * C, p.cy * C);
      if (p.wall) {
        label.text = `$${p.wall.total}`;
        label.scale.set(1 / Math.max(viewScale, 0.5));
        label.position.set(p.wall.at.x * C + C, p.wall.at.y * C - C * 0.6);
      }
    },
  };
}
