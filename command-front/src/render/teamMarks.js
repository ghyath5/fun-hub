// @ts-check
/**
 * Team colours on the ground, for reading the battle zoomed out: a disc
 * under every unit, in the owner's bright colour with a dark rim (so green
 * reads on grass). Buildings get none: their own team colours and their size
 * read well enough. The discs fade in as the view zooms out (readability.js
 * aidStrength) and are not drawn at all close up.
 * Lives in the ground layer of either view, under the units and buildings.
 * Never gives away what the viewer should not know: disguised Spies and
 * Mirage Tanks and submerged submarines of other sides get no disc.
 */
import { Graphics } from 'pixi.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { RENDER, SIM } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { aidStrength, unitBoost } from './readability.js';

const C = RENDER.cellPx;
const PX_PER_LEPTON = C / SIM.leptonsPerCell;
const RIM = 0x0b0c08;
/** Disc radius in cells at life size: soldiers, and everything else. */
const DISC = { foot: 0.2, other: 0.36 };

/** '#rrggbb' → 0xrrggbb. @param {string} hex */
const hexNum = (hex) => parseInt(hex.slice(1), 16);
const BRIGHT = Object.fromEntries(Object.entries(PLAYER_COLORS).map(([k, c]) => [k, hexNum(c.dot)]));

/** Would a disc give this unit away (a disguise or a hidden sub of another side)? @param {any} world @param {any} e @param {number} viewer */
function hidden(world, e, viewer) {
  if (viewer < 0 || world.allied(e.owner, viewer)) return false;
  const tags = UNITS[e.type].tags;
  return tags.includes('spy') || tags.includes('disguise') || !!e.submerged;
}

export function createTeamMarks() {
  const g = new Graphics();
  return {
    layer: g,
    /**
     * @param {any} world @param {number} alpha  between ticks
     * @param {number} scale  screen px per world px
     * @param {(e: any) => boolean} visible
     * @param {number} viewer  -1: sees everything
     * @param {{ x0: number, y0: number, x1: number, y1: number }} cells  on screen
     */
    draw(world, alpha, scale, visible, viewer, cells) {
      g.clear();
      const cellPx = C * scale;
      const s = aidStrength(cellPx);
      g.visible = s > 0;
      if (!s) return;
      const rim = 1.4 / scale;
      for (const e of world.entities.all()) {
        if (e.dead || e.kind !== 'unit' || e.owner < 0 || e.inside || !visible(e) || hidden(world, e, viewer)) continue;
        const color = BRIGHT[world.players[e.owner].color] ?? 0xffffff;
        if (e.cx < cells.x0 || e.cx > cells.x1 || e.cy < cells.y0 || e.cy > cells.y1) continue;
        const loco = UNITS[e.type].loco;
        const x = (e.px + (e.x - e.px) * alpha) * PX_PER_LEPTON;
        const y = (e.py + (e.y - e.py) * alpha) * PX_PER_LEPTON;
        const r = (loco === 'foot' ? DISC.foot : DISC.other) * C * unitBoost(loco, cellPx);
        g.circle(x, y, r).fill({ color, alpha: 0.65 * s }).stroke({ width: rim, color: RIM, alpha: 0.7 * s });
      }
    },
  };
}
