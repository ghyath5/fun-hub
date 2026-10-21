// @ts-check
/**
 * Digging in (Red Alert 2's G.I.): a Rifleman told to deploy drops behind
 * sandbags and swaps his rifle for a heavier machine gun with more reach.
 * He holds that spot (Hold Position) until anything makes him move — an
 * order, a scatter, being asked to clear a building's exit — which digs him
 * out on the spot. Deploy again also digs him out.
 */
import { UNITS } from '../data/units.js';

/** Can this unit dig in? @param {any} u */
export const canDig = (u) => !!u && u.kind === 'unit' && !!UNITS[u.type]?.dug;

/** Weapons a dug-in unit fires instead of its own. @param {any} u @returns {string[] | null} */
export const dugWeapons = (u) => (u.dug ? UNITS[u.type]?.dug?.weapons ?? null : null);

/**
 * Dig in where it stands (finishing a step already begun).
 * @param {any} w @param {any} u @param {(u: any) => void} stop  stops the unit's motion (movement.stopUnit)
 */
export function digIn(w, u, stop) {
  if (!canDig(u) || u.dug) return false;
  stop(u);
  u.dug = true;
  u.dugStance = u.stance;
  u.stance = 'hold';
  u.post = u.next ? { x: u.next.x, y: u.next.y } : { x: u.cx, y: u.cy };
  // Each weapon slot starts its cooldown again (the nest gun is set up, not carried in hot).
  for (const st of u.weapons) { st.cd = Math.max(st.cd, 0); st.burst = 0; st.burstCd = 0; }
  w.events.emit('dug', w.tick, { id: u.id, owner: u.owner, on: true });
  return true;
}

/** Climb out of the sandbags. @param {any} w @param {any} u */
export function digOut(w, u) {
  if (!u.dug) return false;
  u.dug = false;
  u.stance = u.dugStance ?? 'guard';
  delete u.dugStance;
  for (const st of u.weapons) { st.burst = 0; st.burstCd = 0; }
  w.events.emit('dug', w.tick, { id: u.id, owner: u.owner, on: false });
  return true;
}
