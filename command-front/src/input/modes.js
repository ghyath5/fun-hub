// @ts-check
/**
 * Input modes that take over the world's gestures (section 15): placing a
 * READY structure, drawing walls, Sell and Repair modes, and picking a point
 * for a rally or an attack-move. Each mode receives gestures first and says
 * whether it used them.
 */
import { RENDER } from '../data/rules.js';
import { GESTURE } from '../data/ui.js';
import { checkPlacement, wallLine, wallPrefix, buildArea } from '../sim/placement.js';
import { structureDef } from '../sim/entities/structures.js';
import { canMine } from '../sim/mines.js';
import { validPowerTarget } from '../sim/systems/supportPowers.js';
import { SUPPORT_POWERS, SPECIALS } from '../data/rules.js';
import { UNITS } from '../data/units.js';

const C = RENDER.cellPx;
/** Box gestures drive placement exactly like a one-finger drag. */
const BOX_AS_PAN = Object.freeze({ boxStart: 'panStart', boxMove: 'panMove', boxEnd: 'panEnd', boxCancel: 'panEnd' });
/** How far (cells) placement looks for a valid first spot round the screen centre. */
const SEARCH_RADIUS = 10;
/** Gestures a placement mode eats so they never select or order anything underneath. */
const SWALLOWED = new Set(['panEnd', 'doubleTap', 'longPress', 'radial', 'secondary']);

/**
 * @typedef {null
 *  | { kind: 'place', type: string, cx: number, cy: number, fx: number, fy: number }
 *  | { kind: 'walls', type: string, start: {x: number, y: number} | null, end: {x: number, y: number} | null }
 *  | { kind: 'sell', armed: number, armedAt: number }
 *  | { kind: 'repair' }
 *  | { kind: 'rally', id: number }
 *  | { kind: 'mines', ids: number[], cells: number[][] }
 *  | { kind: 'power', power: string, unit: number, at: { x: number, y: number } | null, id: number }} Mode
 */

/** Radius (cells) of the ring drawn round a support-power target. @param {string} power */
const ringOf = (power) => {
  const s = /** @type {any} */ (SUPPORT_POWERS)[power];
  return s.revealRadius ?? s.splash ?? (power === 'paradrop' ? 2 : power === 'phaseShift' ? s.fallbackRadius : 1);
};

/**
 * @param {{
 *   world: any, human: number,
 *   issue: (type: string, target: any) => void,
 *   toWorld: (sx: number, sy: number) => { x: number, y: number },
 *   scale: () => number,
 *   centreCell: () => { x: number, y: number },
 *   onScreen: (cell: { x: number, y: number }) => boolean,
 *   structureAt: (cell: {x: number, y: number}) => any,
 *   toast: (text: string) => void,
 *   changed: () => void,
 *   setPan: (on: boolean) => void,
 *   entityAt?: (sx: number, sy: number) => any,
 * }} ctx
 */
export function createModes(ctx) {
  /** @type {Mode} */
  let mode = null;
  /** Where the last placement happened, to reuse when it is on screen. */
  let lastSpot = /** @type {{ x: number, y: number } | null} */ (null);

  const cellAt = (/** @type {number} */ sx, /** @type {number} */ sy) => {
    const p = ctx.toWorld(sx, sy);
    return { x: Math.floor(p.x / C), y: Math.floor(p.y / C) };
  };
  /**
   * The valid top-left nearest to (x, y), searching outward ring by ring and
   * staying on screen; (x, y) itself when nothing nearby fits.
   * @param {string} type @param {number} x @param {number} y
   */
  const nearestValid = (type, x, y) => {
    for (let r = 0; r <= SEARCH_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!ctx.onScreen({ x: x + dx, y: y + dy })) continue;
          if (checkPlacement(ctx.world, ctx.human, type, x + dx, y + dy).ok) return { x: x + dx, y: y + dy };
        }
      }
    }
    return { x, y };
  };
  const set = (/** @type {Mode} */ m) => {
    mode = m;
    ctx.setPan(!(m && (m.kind === 'place' || m.kind === 'walls' || m.kind === 'mines')));
    ctx.changed();
  };

  return {
    get mode() { return mode; },

    /** Enter placement for a READY structure (walls draw a line instead): at the last spot if it is on screen, else the centre. @param {string} type */
    startPlacing(type) {
      const def = structureDef(type);
      if (def.wall) { set({ kind: 'walls', type, start: null, end: null }); return; }
      const at = lastSpot && ctx.onScreen(lastSpot) ? lastSpot : ctx.centreCell();
      const spot = nearestValid(type, at.x - (def.w >> 1), at.y - (def.h >> 1));
      set({ kind: 'place', type, cx: spot.x, cy: spot.y, fx: 0, fy: 0 });
    },
    sell() { set(mode?.kind === 'sell' ? null : { kind: 'sell', armed: 0, armedAt: 0 }); },
    repair() { set(mode?.kind === 'repair' ? null : { kind: 'repair' }); },
    rally(/** @type {number} */ id) { set({ kind: 'rally', id }); },
    cancel() { set(null); },
    /** Lay Mines: taps and drags queue cells for the selected Mine Layers. @param {number[]} ids */
    mines(ids) { set({ kind: 'mines', ids, cells: [] }); },
    /** Lay Mines: cells queued and what they will cost, for the banner; null in any other mode. */
    minesCount() { return mode?.kind === 'mines' ? { queued: mode.cells.length, cost: mode.cells.length * SPECIALS.mineCost } : null; },
    /** Aim a ready support power. @param {string} power */
    power(power) { set({ kind: 'power', power, unit: 0, at: null, id: 0 }); },
    /** Desktop: the ghost follows the mouse while no button is held. @param {number} sx @param {number} sy */
    hover(sx, sy) {
      if (mode?.kind !== 'place') return;
      const c = cellAt(sx, sy);
      const def = structureDef(mode.type);
      const cx = c.x - (def.w >> 1);
      const cy = c.y - (def.h >> 1);
      if (cx !== mode.cx || cy !== mode.cy) { mode.cx = cx; mode.cy = cy; ctx.changed(); }
    },

    /** ✓ in placement: place the ghost (or the valid wall prefix). */
    confirm() {
      if (!mode) return false;
      if (mode.kind === 'place') {
        const check = checkPlacement(ctx.world, ctx.human, mode.type, mode.cx, mode.cy);
        if (!check.ok) return false;
        ctx.issue('place', { type: mode.type, x: mode.cx, y: mode.cy });
        lastSpot = { x: mode.cx + (structureDef(mode.type).w >> 1), y: mode.cy + (structureDef(mode.type).h >> 1) };
        set(null);
        return true;
      }
      if (mode.kind === 'mines') {
        if (!mode.cells.length) return false;
        ctx.issue('layMines', { cells: mode.cells, ids: mode.ids });
        set(null);
        return true;
      }
      if (mode.kind === 'power') {
        const t = this.powerTarget();
        if (!t || !validPowerTarget(ctx.world, ctx.human, /** @type {any} */ (mode.power), t)) return false;
        ctx.issue('power', t);
        set(null);
        return true;
      }
      if (mode.kind === 'walls' && mode.start) {
        const cells = wallLine(mode.start.x, mode.start.y, (mode.end ?? mode.start).x, (mode.end ?? mode.start).y);
        ctx.issue('walls', { type: mode.type, cells });
        set(null);
        return true;
      }
      return false;
    },

    /**
     * Offer a gesture to the active mode.
     * @param {import('./gestures.js').Gesture} g
     * @returns {boolean} consumed
     */
    handle(g) {
      if (!mode) return false;
      const m = mode;
      // A mouse drag (or a finger after a long-press) arrives as a box; in placement it moves things the same way.
      const kind = BOX_AS_PAN[/** @type {keyof typeof BOX_AS_PAN} */ (g.type)] ?? g.type;
      if (kind !== g.type) g = { ...g, type: kind, x0: g.x0, y0: g.y0 };
      if (m.kind === 'place') {
        if (g.type === 'tap') {
          const c = cellAt(g.x, g.y);
          const def = structureDef(m.type);
          m.cx = c.x - (def.w >> 1);
          m.cy = c.y - (def.h >> 1);
          ctx.changed();
          return true;
        }
        if (g.type === 'panStart') { m.fx = g.x0 ?? g.x; m.fy = g.y0 ?? g.y; return true; }
        if (g.type === 'panMove') {
          // The ghost follows the finger's movement, not its position, so the finger never covers it.
          const step = C * ctx.scale();
          const dx = Math.trunc((g.x - m.fx) / step);
          const dy = Math.trunc((g.y - m.fy) / step);
          if (dx || dy) {
            m.cx += dx; m.cy += dy;
            m.fx += dx * step; m.fy += dy * step;
            ctx.changed();
          }
          return true;
        }
        return SWALLOWED.has(g.type);
      }
      if (m.kind === 'walls') {
        if (g.type === 'panStart' || g.type === 'tap') {
          m.start = cellAt(g.x0 ?? g.x, g.y0 ?? g.y);
          m.end = m.start;
          ctx.changed();
          return true;
        }
        if (g.type === 'panMove' && m.start) { m.end = cellAt(g.x, g.y); ctx.changed(); return true; }
        return SWALLOWED.has(g.type);
      }
      if (m.kind === 'mines') {
        if (g.type === 'tap' || g.type === 'panStart' || g.type === 'panMove') {
          const c = cellAt(g.type === 'panStart' ? g.x0 ?? g.x : g.x, g.type === 'panStart' ? g.y0 ?? g.y : g.y);
          const k = m.cells.findIndex(([x, y]) => x === c.x && y === c.y);
          if (k >= 0 && g.type === 'tap') m.cells.splice(k, 1);
          else if (k < 0 && m.cells.length < SPECIALS.minesMaxPerPlayer && canMine(ctx.world, ctx.human, c.x, c.y)) m.cells.push([c.x, c.y]);
          ctx.changed();
          return true;
        }
        return SWALLOWED.has(g.type);
      }
      if (m.kind === 'power' && g.type === 'tap') {
        const spec = /** @type {any} */ (SUPPORT_POWERS)[m.power];
        const c = cellAt(g.x, g.y);
        if (spec.target === 'vehicleOrStructure') {
          const e = ctx.entityAt?.(g.x, g.y);
          m.id = e ? e.id : 0;
          m.at = e ? { x: e.cx, y: e.cy } : c;
        } else if (spec.target === 'ownVehicleThenCell' && !m.unit) {
          const e = ctx.entityAt?.(g.x, g.y);
          if (e && e.owner === ctx.human && e.kind === 'unit' && ['wheel', 'track'].includes(UNITS[e.type].loco)) m.unit = e.id;
          else ctx.toast('Pick one of your vehicles');
        } else m.at = c;
        ctx.changed();
        return true;
      }
      if (m.kind === 'power') return SWALLOWED.has(g.type) || g.type === 'tap';
      if (m.kind === 'sell' && g.type === 'tap') {
        const s = ctx.structureAt(cellAt(g.x, g.y));
        if (!s || s.owner !== ctx.human) return true;
        if (m.armed === s.id && g.t - m.armedAt <= GESTURE.sellConfirmMs) {
          ctx.issue('sell', { id: s.id });
          m.armed = 0;
        } else {
          m.armed = s.id;
          m.armedAt = g.t;
          ctx.toast('Tap again to sell');
        }
        ctx.changed();
        return true;
      }
      if (m.kind === 'repair' && g.type === 'tap') {
        const s = ctx.structureAt(cellAt(g.x, g.y));
        if (s && s.owner === ctx.human) ctx.issue('repair', { id: s.id });
        return true;
      }
      if (m.kind === 'rally' && g.type === 'tap') {
        const c = cellAt(g.x, g.y);
        ctx.issue('rally', { id: m.id, x: c.x, y: c.y });
        set(null);
        return true;
      }
      return false;
    },

    /** The command target a power mode would fire with now (null = not aimed yet). */
    powerTarget() {
      if (mode?.kind !== 'power') return null;
      const spec = /** @type {any} */ (SUPPORT_POWERS)[mode.power];
      if (spec.target === 'none') return { power: mode.power };
      if (spec.target === 'vehicleOrStructure') return mode.id ? { power: mode.power, id: mode.id } : null;
      if (spec.target === 'ownVehicleThenCell') return mode.unit && mode.at ? { power: mode.power, unit: mode.unit, x: mode.at.x, y: mode.at.y } : null;
      return mode.at ? { power: mode.power, x: mode.at.x, y: mode.at.y } : null;
    },
    /**
     * What the overlay should draw this frame, and where ✓ / ✕ go.
     * @param {number} tint @param {{ x0: number, y0: number, x1: number, y1: number }} view
     */
    overlay(tint, view) {
      if (mode?.kind === 'mines') {
        const at = mode.cells.length ? mode.cells[mode.cells.length - 1] : null;
        return { type: '', cx: at ? at[0] : 0, cy: at ? at[1] : 0, cells: mode.cells.map(([x, y]) => ({ x, y, state: /** @type {'ok'} */ ('ok') })), tint, area: null, view,
          ok: mode.cells.length > 0, reason: mode.cells.length ? '' : 'Tap or drag cells', wall: null, anchor: at ? { x: at[0], y: at[1] } : null };
      }
      if (mode?.kind === 'power') {
        const t = this.powerTarget();
        const ok = !!t && validPowerTarget(ctx.world, ctx.human, /** @type {any} */ (mode.power), t);
        const spec = /** @type {any} */ (SUPPORT_POWERS)[mode.power];
        const reason = spec.target === 'ownVehicleThenCell' && !mode.unit ? 'Pick one of your vehicles' : !mode.at && spec.target !== 'none' ? 'Tap the target' : ok ? '' : 'Invalid target';
        const centre = mode.at ?? ctx.centreCell();
        return { type: '', cx: centre.x, cy: centre.y, cells: [], tint, area: null, view, ok, reason,
          ring: mode.at ? { x: mode.at.x, y: mode.at.y, r: ringOf(mode.power), ok } : null, anchor: centre };
      }
      if (!mode || (mode.kind !== 'place' && mode.kind !== 'walls')) return null;
      const w = ctx.world;
      const area = buildArea(w, ctx.human);
      if (mode.kind === 'place') {
        const check = checkPlacement(w, ctx.human, mode.type, mode.cx, mode.cy);
        return { type: mode.type, cx: mode.cx, cy: mode.cy, cells: check.cells, tint, area, view, ok: check.ok, reason: check.reason };
      }
      if (!mode.start) return { type: mode.type, cx: 0, cy: 0, cells: [], tint, area, view, ok: false, reason: 'Drag to draw a wall' };
      const line = wallLine(mode.start.x, mode.start.y, (mode.end ?? mode.start).x, (mode.end ?? mode.start).y);
      const p = w.players[ctx.human];
      const prefix = wallPrefix(w, ctx.human, mode.type, line, p.cash + p.stored);
      const cost = structureDef(mode.type).cost;
      const cells = line.map(([x, y], k) => ({ x, y, state: /** @type {'ok' | 'red'} */ (k < prefix.length ? 'ok' : 'red') }));
      const at = mode.end ?? mode.start;
      return { type: mode.type, cx: at.x, cy: at.y, cells, tint, area, view, ok: prefix.length > 0, reason: '', wall: { cost, total: prefix.length * cost, at } };
    },
  };
}
