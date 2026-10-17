// @ts-check
/**
 * Gestures → intents (section 15, gesture table). Only this module turns a
 * tap into a selection change or a Command; game logic never sees pointer events.
 */
import { hitsAt, createCycler } from './hitTest.js';
import { UNITS } from '../data/units.js';
import { RENDER, SIM } from '../data/rules.js';
import { GESTURE, AUDIO } from '../data/ui.js';
import { canAttack } from '../sim/targeting.js';
import { contextOrder } from './context.js';
import { isTransport } from '../sim/transports.js';
import { isAircraft } from '../sim/air.js';

/** @typedef {import('./gestures.js').Gesture} Gesture */
/** @typedef {import('./hitTest.js').Candidate} Candidate */

const PX_PER_LEPTON = RENDER.cellPx / SIM.leptonsPerCell;
/** Units a box never picks while it also holds a combat unit ("Smart box"). */
const NON_COMBAT_BOX = new Set(['harvester', 'mcv']);

/**
 * @typedef {object} IntentContext
 * @property {any} world
 * @property {number} human                      Player id of the human
 * @property {import('./selection.js').Selection} selection
 * @property {(cmd: import('../types.js').Command) => void} issue
 * @property {(sx: number, sy: number) => { x: number, y: number }} toWorld   Screen px → world px
 * @property {(wx: number, wy: number) => { x: number, y: number }} toScreen  World px → screen px
 * @property {() => number} scale               Screen px per world px
 * @property {() => { w: number, h: number }} screen
 * @property {(type: string) => number} radiusOf World px
 * @property {{ pulse: (cell: {x: number, y: number}, kind: 'move' | 'attackMove' | 'attack' | 'reject') => void,
 *   ack: (kind?: 'move' | 'attack') => void, picked: () => void, info: (e: any) => void, tap: () => void }} feedback
 *   ack: the selection was given an order; picked: own units were just selected
 * @property {{ addMode: () => boolean, smartBox: () => boolean, targetMode?: () => string | null, setTargetMode?: (m: string | null) => void }} modes
 * @property {(menu: RadialMenu | null) => void} [radial]  Show or hide the radial menu
 * @property {(id: number) => void} [selectStructure]   Select an own structure (0 clears it)
 * @property {(e: any) => boolean} [visible]             Can the human see this entity (shroud / fog)?
 */

/** @typedef {{ id: string, label: string }} RadialOption */
/** @typedef {{ x: number, y: number, options: RadialOption[] }} RadialMenu */

const STANCE_CYCLE = /** @type {const} */ (['guard', 'hold', 'holdFire']);
const RADIAL_GROUND = [
  { id: 'attackMove', label: 'Attack-Move' },
  { id: 'forceFire', label: 'Force-Fire' },
  { id: 'guardArea', label: 'Guard Here' },
  { id: 'waypoint', label: 'Waypoint' },
];

/** @param {IntentContext} ctx */
export function createIntents(ctx) {
  const cycler = createCycler();
  /** The unit a first tap selected, so a double-tap can widen it to its type. */
  let lastTapUnit = /** @type {number | null} */ (null);
  /** The move a first tap issued, so a double-tap can upgrade it to attack-move. */
  let lastMove = /** @type {{ cell: {x: number, y: number}, ids: number[] } | null} */ (null);
  let lastAck = 0;

  /** Orders that send units at something rather than somewhere: they answer with an attack line. */
  const ATTACKING = new Set(['attack', 'attackMove', 'forceFire', 'c4', 'enter']);
  /** Units answer an order, at most twice a second. @param {string} type  the command */
  const ackOnce = (type) => {
    const now = performance.now();
    if (now - lastAck < AUDIO.ackThrottleSeconds * 1000) return;
    lastAck = now;
    ctx.feedback.ack(ATTACKING.has(type) ? 'attack' : 'move');
  };
  /** Own units were selected: the picked group answers (unless an order just spoke). */
  const pickedOnce = () => {
    if (!selectedUnits().length) return;
    lastAck = performance.now();
    ctx.feedback.picked();
  };

  /** Own mobile units currently selected. */
  const selectedUnits = () => ctx.selection.list()
    .map((id) => ctx.world.entities.get(id))
    .filter((e) => e && e.owner === ctx.human && e.kind === 'unit' && !e.inside);

  const visible = (/** @type {any} */ e) => e.owner === ctx.human || (ctx.visible ? ctx.visible(e) : true);

  /** Every unit and structure on or near screen as a hit candidate. */
  function candidates() {
    const { w, h } = ctx.screen();
    const s = ctx.scale();
    const units = selectedUnits();
    /** @type {Candidate[]} */
    const out = [];
    for (const e of ctx.world.entities.all()) {
      if (e.dead || e.inside || !visible(e)) continue;
      if (e.kind === 'unit') {
        if (e.owner !== ctx.human && ctx.world.allied(e.owner, ctx.human) && !(units.length && contextOrder(ctx.world, units, e))) continue;
        const p = ctx.toScreen(e.x * PX_PER_LEPTON, e.y * PX_PER_LEPTON);
        const r = ctx.radiusOf(e.type) * s;
        if (p.x < -r || p.y < -r || p.x > w + r || p.y > h + r) continue;
        const cls = e.owner === ctx.human ? (units.length && contextOrder(ctx.world, units, e) ? 'context' : 'own') : 'enemy';
        out.push({ id: e.id, x: p.x, y: p.y, r, cls });
      } else if (e.kind === 'structure') {
        const a = ctx.toScreen(e.cx * RENDER.cellPx, e.cy * RENDER.cellPx);
        const b = ctx.toScreen((e.cx + e.w) * RENDER.cellPx, (e.cy + e.h) * RENDER.cellPx);
        if (b.x < 0 || b.y < 0 || a.x > w || a.y > h) continue;
        let cls = /** @type {import('./hitTest.js').HitClass} */ ('structure');
        if (units.length && contextOrder(ctx.world, units, e)) cls = 'context';
        else if (e.owner >= 0 && !ctx.world.allied(e.owner, ctx.human)) cls = 'enemy';
        out.push({ id: e.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.min(b.x - a.x, b.y - a.y) / 2, cls, rect: { x0: a.x, y0: a.y, x1: b.x, y1: b.y } });
      }
    }
    return out;
  }

  /** @param {number} sx @param {number} sy */
  function cellAt(sx, sy) {
    const p = ctx.toWorld(sx, sy);
    return { x: Math.floor(p.x / RENDER.cellPx), y: Math.floor(p.y / RENDER.cellPx) };
  }

  /** @param {string} type @param {{x: number, y: number}} cell @param {number[]} ids */
  function order(type, cell, ids) {
    const m = ctx.world.map;
    if (cell.x < 0 || cell.y < 0 || cell.x >= m.width || cell.y >= m.height || ids.length === 0) {
      ctx.feedback.pulse(cell, 'reject');
      return;
    }
    ctx.issue({ tick: ctx.world.tick, playerId: ctx.human, type, entityIds: ids, target: { x: cell.x, y: cell.y } });
    ctx.feedback.pulse(cell, type === 'attackMove' ? 'attackMove' : 'move');
    ackOnce(type);
  }

  /** Move the selection to a screen point. @param {number} x @param {number} y */
  function moveTo(x, y) {
    const units = selectedUnits();
    if (units.length === 0) return false;
    const cell = cellAt(x, y);
    const m = ctx.world.map;
    const onOre = cell.x >= 0 && cell.y >= 0 && cell.x < m.width && cell.y < m.height && m.bales[cell.y * m.width + cell.x] > 0;
    // Harvesters tapped onto ore harvest there; everyone else moves (section 15, row 7).
    const harvesters = onOre ? units.filter((u) => u.harv) : [];
    const movers = units.filter((u) => !harvesters.includes(u)).map((u) => u.id);
    if (harvesters.length) {
      issueAt('harvest', harvesters.map((u) => u.id), cell);
      ctx.feedback.pulse(cell, 'move');
    }
    if (movers.length) {
      order('move', cell, movers);
      lastMove = { cell, ids: movers };
    }
    return true;
  }

  /** Issue a command that targets an entity or cell. @param {string} type @param {number[]} ids @param {any} target */
  function issueAt(type, ids, target) {
    ctx.issue({ tick: ctx.world.tick, playerId: ctx.human, type, entityIds: ids, target });
    ackOnce(type);
  }

  /** Units in the selection able to hurt an enemy; tapping it attacks with those only. @param {any} e */
  function attackWith(e) {
    const able = selectedUnits().filter((u) => canAttack(u, e));
    const cell = e.kind === 'structure' ? { x: e.cx + (e.w >> 1), y: e.cy + (e.h >> 1) } : { x: e.cx, y: e.cy };
    if (able.length === 0) {
      ctx.feedback.pulse(cell, 'reject');
      ctx.feedback.info(e);
      return;
    }
    issueAt('attack', able.map((u) => u.id), { id: e.id });
    ctx.feedback.pulse(cell, 'attack');
  }

  /** What the last long-press was over, so the radial pick knows its target. */
  let radialAt = /** @type {{ cell: {x: number, y: number}, entity: number | null } | null} */ (null);

  /** Long-press lifted without moving: open the radial menu (section 15, rows 10 and 11). @param {Gesture} g */
  function radial(g) {
    const units = selectedUnits();
    const hit = hitsAt(candidates(), g.x, g.y, units.length > 0)[0] ?? null;
    if (units.length === 0) {
      if (hit) ctx.feedback.info(ctx.world.entities.get(hit.id));
      return;
    }
    radialAt = { cell: cellAt(g.x, g.y), entity: hit ? hit.id : null };
    let options = RADIAL_GROUND;
    if (hit) {
      const e = ctx.world.entities.get(hit.id);
      options = [{ id: 'forceFire', label: 'Force-Fire' }];
      if (e && ctx.world.allied(e.owner, ctx.human) && !(units.length === 1 && units[0].id === e.id)) options.push({ id: 'escort', label: 'Escort' });
      options.push({ id: 'info', label: 'Info' });
    }
    ctx.radial?.({ x: g.x, y: g.y, options });
  }

  /** @param {Gesture} g */
  function tap(g) {
    const hasSel = selectedUnits().length > 0;
    if (ctx.modes.targetMode?.() === 'attackMove') {
      ctx.modes.setTargetMode?.(null);
      const ids = selectedUnits().map((e) => e.id);
      if (ids.length) order('attackMove', cellAt(g.x, g.y), ids);
      return;
    }
    const hit = cycler.pick(hitsAt(candidates(), g.x, g.y, hasSel), g.x, g.y, g.t);
    lastTapUnit = null;
    lastMove = null;
    const e = hit ? ctx.world.entities.get(hit.id) : null;
    if (hit && hit.cls === 'context') {
      const o = contextOrder(ctx.world, selectedUnits(), e);
      if (o) {
        issueAt(o.type, o.ids, o.target);
        ctx.feedback.pulse({ x: e.cx, y: e.cy }, 'move');
        return;
      }
    }
    if (hit && e.kind === 'unit' && e.owner === ctx.human) {
      ctx.selectStructure?.(0);
      if (ctx.modes.addMode()) ctx.selection.toggle(hit.id);
      else ctx.selection.set([hit.id]);
      lastTapUnit = hit.id;
      ctx.feedback.tap();
      pickedOnce();
      return;
    }
    if (hit && hit.cls === 'enemy') {
      if (hasSel) attackWith(e);
      else ctx.feedback.info(e);
      return;
    }
    if (hit && e.kind === 'structure') {
      if (e.owner === ctx.human) {
        ctx.selection.clear();
        ctx.selectStructure?.(e.id);
        ctx.feedback.tap();
      } else ctx.feedback.info(e);
      return;
    }
    ctx.selectStructure?.(0);
    if (!moveTo(g.x, g.y)) ctx.selection.clear();
  }

  /** Desktop right-click: attack an enemy under the cursor, otherwise move there. @param {Gesture} g */
  function secondary(g) {
    const hits = hitsAt(candidates(), g.x, g.y, true);
    const ctxHit = hits.find((h) => h.cls === 'context');
    const o = ctxHit ? contextOrder(ctx.world, selectedUnits(), ctx.world.entities.get(ctxHit.id)) : null;
    if (o) { issueAt(o.type, o.ids, o.target); return; }
    const hit = hits.find((h) => h.cls === 'enemy');
    if (hit) attackWith(ctx.world.entities.get(hit.id));
    else moveTo(g.x, g.y);
  }

  /** @param {Gesture} g */
  function doubleTap(g) {
    if (lastTapUnit != null) {
      const first = ctx.world.entities.get(lastTapUnit);
      if (!first) return;
      const { w, h } = ctx.screen();
      const same = [];
      for (const e of ctx.world.entities.all()) {
        if (e.dead || e.kind !== 'unit' || e.owner !== ctx.human || e.type !== first.type) continue;
        const p = ctx.toScreen(e.x * PX_PER_LEPTON, e.y * PX_PER_LEPTON);
        if (p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h) same.push(e.id);
      }
      ctx.selection.set(same);
      pickedOnce();
      return;
    }
    if (lastMove) {
      order('attackMove', lastMove.cell, lastMove.ids);
      lastMove = null;
    }
  }

  /** Box select: own mobile units only; Smart box drops Harvesters and MCVs when combat units are inside. @param {Gesture} g */
  function box(g) {
    const x0 = Math.min(g.x0 ?? g.x, g.x);
    const x1 = Math.max(g.x0 ?? g.x, g.x);
    const y0 = Math.min(g.y0 ?? g.y, g.y);
    const y1 = Math.max(g.y0 ?? g.y, g.y);
    const inside = [];
    for (const e of ctx.world.entities.all()) {
      if (e.dead || e.kind !== 'unit' || e.owner !== ctx.human) continue;
      const p = ctx.toScreen(e.x * PX_PER_LEPTON, e.y * PX_PER_LEPTON);
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) inside.push(e);
    }
    let picked = inside;
    if (ctx.modes.smartBox() && inside.some((e) => !NON_COMBAT_BOX.has(e.type))) {
      picked = inside.filter((e) => !NON_COMBAT_BOX.has(e.type));
    }
    const ids = picked.map((e) => e.id);
    if (ctx.modes.addMode()) ctx.selection.set([...ctx.selection.ids, ...ids]);
    else ctx.selection.set(ids);
    if (ids.length) pickedOnce();
  }

  return {
    /** @param {Gesture} g */
    handle(g) {
      switch (g.type) {
        case 'tap': tap(g); break;
        case 'doubleTap': doubleTap(g); break;
        case 'boxEnd': box(g); break;
        case 'secondary': secondary(g); break; // desktop right-click
        case 'radial': radial(g); break;
        default: break;
      }
    },
    /** A radial option was chosen. @param {string} id */
    radialPick(id) {
      ctx.radial?.(null);
      const at = radialAt;
      radialAt = null;
      const ids = selectedUnits().map((e) => e.id);
      if (!at || ids.length === 0) return;
      const target = at.entity ? { id: at.entity } : at.cell;
      switch (id) {
        case 'attackMove': order('attackMove', at.cell, ids); break;
        case 'guardArea': order('guardArea', at.cell, ids); break;
        case 'waypoint': issueAt('waypoint', ids, at.cell); ctx.feedback.pulse(at.cell, 'move'); break;
        case 'forceFire': issueAt('forceFire', ids, target); ctx.feedback.pulse(at.cell, 'attack'); break;
        case 'escort': if (at.entity) issueAt('escort', ids, { id: at.entity }); break;
        case 'info': if (at.entity) ctx.feedback.info(ctx.world.entities.get(at.entity)); break;
        default: break;
      }
    },
    /** Guard → Hold Position → Hold Fire → Guard, for the whole selection. */
    cycleStance() {
      const units = selectedUnits();
      if (!units.length) return null;
      const next = STANCE_CYCLE[(STANCE_CYCLE.indexOf(units[0].stance) + 1) % STANCE_CYCLE.length];
      issueAt('stance', units.map((u) => u.id), { stance: next });
      return next;
    },
    /** Select all own units of one type, from the summary chips. @param {string} type */
    narrowTo(type) {
      ctx.selection.set(selectedUnits().filter((e) => e.type === type).map((e) => e.id));
    },
    /** Select every own unit of the selected types on screen. */
    selectSameType() {
      const types = new Set(selectedUnits().map((e) => e.type));
      const { w, h } = ctx.screen();
      const ids = [];
      for (const e of ctx.world.entities.all()) {
        if (e.dead || e.kind !== 'unit' || e.owner !== ctx.human || !types.has(e.type)) continue;
        const p = ctx.toScreen(e.x * PX_PER_LEPTON, e.y * PX_PER_LEPTON);
        if (p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h) ids.push(e.id);
      }
      ctx.selection.set(ids);
    },
    /** A command with no target (Stop, Scatter, Deploy) for the selection. @param {string} type @param {(u: any) => boolean} [only] */
    simple(type, only = () => true) {
      const ids = selectedUnits().filter(only).map((e) => e.id);
      if (ids.length === 0) return;
      ctx.issue({ tick: ctx.world.tick, playerId: ctx.human, type, entityIds: ids, target: null });
      ackOnce(type);
    },
    /** The best visible entity under a screen point (any owner), or null. @param {number} x @param {number} y */
    entityAt(x, y) {
      const h = hitsAt(candidates(), x, y, false)[0];
      return h ? ctx.world.entities.get(h.id) : null;
    },
    /** Selected units that pass a test, by id. @param {(u: any) => boolean} test */
    selectedIds(test) {
      return selectedUnits().filter(test).map((u) => u.id);
    },
    /** Harvest button: each selected Harvester resumes harvesting near where it stands. */
    harvestHere() {
      for (const u of selectedUnits()) {
        if (u.harv) issueAt('harvest', [u.id], { x: u.cx, y: u.cy });
      }
    },
    /** Selection summary for the HUD: count and up to 6 types. */
    summary() {
      const units = selectedUnits();
      /** @type {Map<string, number>} */
      const counts = new Map();
      for (const e of units) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      const types = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6)
        .map(([type, count]) => ({ type, count, name: UNITS[type].name }));
      const stance = units.length ? units[0].stance : 'guard';
      const can = {
        deploy: units.some((u) => u.type === 'mcv'),
        harvest: units.some((u) => u.harv),
        unload: units.some((u) => isTransport(u) && u.cargo?.length > 0),
        mines: units.some((u) => UNITS[u.type].tags.includes('mineLayer')),
        returnPad: units.some((u) => isAircraft(u)),
      };
      return { count: units.length, types, stance, can };
    },
    /** Screen centre of the selection, or null. */
    selectionCentre() {
      const units = selectedUnits();
      if (!units.length) return null;
      let sx = 0;
      let sy = 0;
      for (const e of units) { sx += e.x; sy += e.y; }
      return ctx.toScreen((sx / units.length) * PX_PER_LEPTON, (sy / units.length) * PX_PER_LEPTON);
    },
    /** Long-press threshold re-exported for the HUD's own buttons. */
    longPressMs: GESTURE.longPressMs,
  };
}
