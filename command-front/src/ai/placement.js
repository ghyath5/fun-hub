// @ts-check
/**
 * Where the AI puts a building (section 16): valid cells only, compact (close
 * to the base centre), with a 1-cell lane around every building and never on
 * refinery docks, factory exits or the depot pad. Defenses go on the side
 * facing the enemy, within 6 cells of the base edge. Deterministic: ties go
 * to the lowest cell index.
 */
import { AI } from '../data/rules.js';
import { checkPlacement, checkDeploy } from '../sim/placement.js';
import { structureDef, cellAt } from '../sim/entities/structures.js';

/** @typedef {import('../sim/world.js').World} World */

/** How far from the base centre the search looks (cells). */
const SEARCH = 14;

/** Own structures (not walls). @param {World} w @param {number} pid */
const ownBuildings = (w, pid) => w.entities.all().filter((e) => e.kind === 'structure' && e.owner === pid && !e.dead && !structureDef(e.type).wall);

/** Centre of the player's base in cells (yard first, else the average of its buildings, else its start). @param {World} w @param {number} pid */
export function baseCentre(w, pid) {
  const own = ownBuildings(w, pid);
  const yard = own.find((e) => structureDef(e.type).role === 'yard');
  if (yard) return { x: yard.cx + 1, y: yard.cy + 1 };
  if (own.length) {
    return {
      x: Math.round(own.reduce((a, e) => a + e.cx + e.w / 2, 0) / own.length),
      y: Math.round(own.reduce((a, e) => a + e.cy + e.h / 2, 0) / own.length),
    };
  }
  const s = w.map.starts[w.players[pid].start];
  return { x: s.x, y: s.y };
}

/** Cells that must stay open: docks, exits and pads of own buildings, with a 1-cell margin. @param {World} w @param {number} pid */
function keepClear(w, pid) {
  const keep = new Set();
  for (const s of ownBuildings(w, pid)) {
    const d = structureDef(s.type);
    for (const off of [d.exit, d.dock, d.pad]) {
      if (!off) continue;
      const c = cellAt(s, off);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) keep.add((c.y + dy) * w.map.width + c.x + dx);
    }
  }
  return keep;
}

/** Does a footprint keep a 1-cell lane to every other building (and off reserved cells)? */
function laneOk(w, x, y, def, keep) {
  const W = w.map.width;
  for (let cy = y - 1; cy <= y + def.h; cy++) {
    for (let cx = x - 1; cx <= x + def.w; cx++) {
      if (cx < 0 || cy < 0 || cx >= W || cy >= w.map.height) continue;
      const i = cy * W + cx;
      const inside = cx >= x && cx < x + def.w && cy >= y && cy < y + def.h;
      if (inside && keep.has(i)) return false;
      if (!inside && w.occ.bld[i] && !structureDef(w.entities.get(w.occ.bld[i])?.type ?? '')?.wall) return false;
    }
  }
  return true;
}

/**
 * Best top-left cell for a structure, or null when nothing fits.
 * @param {World} w @param {number} pid @param {string} type @param {{ x: number, y: number } | null} enemy  Where the enemy is (for defenses)
 */
export function choosePlacement(w, pid, type, enemy) {
  const def = structureDef(type);
  const c = baseCentre(w, pid);
  const keep = keepClear(w, pid);
  const defense = def.line === 'defenses';
  const own = ownBuildings(w, pid);
  let best = null;
  let bestScore = Infinity;
  for (let y = c.y - SEARCH; y <= c.y + SEARCH; y++) {
    for (let x = c.x - SEARCH; x <= c.x + SEARCH; x++) {
      if (x < 0 || y < 0 || x + def.w > w.map.width || y + def.h > w.map.height) continue;
      const dc = (x + def.w / 2 - c.x) ** 2 + (y + def.h / 2 - c.y) ** 2;
      let score = dc;
      if (defense && enemy) {
        // Facing the enemy, near the edge of the base.
        const de = (x - enemy.x) ** 2 + (y - enemy.y) ** 2;
        const edge = Math.min(...own.map((s) => Math.max(Math.abs(s.cx - x), Math.abs(s.cy - y))));
        if (edge > AI.shared.defenseEdgeDistance) continue;
        score = de + dc * 0.25;
      }
      if (score >= bestScore) continue;
      if (!def.wall && !laneOk(w, x, y, def, keep)) continue;
      const check = checkPlacement(w, pid, type, x, y);
      if (!check.ok || check.amber) continue;
      best = { x, y };
      bestScore = score;
    }
  }
  return best;
}

/** Where an MCV can unfold near a point (its own cell first). @param {World} w @param {any} mcv */
export function deploySpot(w, mcv) {
  return checkDeploy(w, mcv).ok;
}
