// @ts-check
/**
 * Changing a structure's owner (section 10, capture effects): HP unchanged;
 * the old owner's production there holds or moves on by itself (lines look
 * for producers every tick); a docked Harvester leaves with its cargo (its
 * state machine sees the refinery is no longer its owner's); both players'
 * power and storage are recomputed; support-power charge restarts for the
 * new owner (the support-power system resets charges whose building is gone).
 */
import { refreshStorage, structureDef } from './entities/structures.js';

/** @typedef {import('./world.js').World} World */

/** @param {World} w @param {any} s @param {number} to */
export function captureStructure(w, s, to) {
  const from = s.owner;
  if (from === to) return;
  s.owner = to;
  w.structureEpoch++;
  s.primary = false;
  s.rally = null;
  s.repairing = false;
  s.selling = 0;
  s.dockQueue = [];
  s.docked = 0;
  s.linked = 0;
  s.target = 0;
  for (const pid of [from, to]) {
    if (pid < 0) continue;
    w.players[pid].powerDirty = true;
    refreshStorage(w, pid);
  }
  // Units of the new owner (and allies) stop shooting at it at once (section 9).
  for (const u of w.entities.all()) {
    if (u.kind === 'unit' && u.target === s.id && w.allied(u.owner, to)) {
      u.target = 0;
      if (u.task?.target === s.id) u.task = null;
    }
  }
  if (to >= 0) w.players[to].stats.structuresCaptured = (w.players[to].stats.structuresCaptured ?? 0) + 1;
  w.events.emit('structureCaptured', w.tick, { id: s.id, type: s.type, from, to, cx: s.cx, cy: s.cy, role: structureDef(s.type)?.role ?? '' });
}
