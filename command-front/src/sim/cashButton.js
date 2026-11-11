// @ts-check
/**
 * The cash button: a setup option for matches against the computer. The one
 * human in the match gets CASH_BUTTON.amount per press; computer players
 * never do, and a match with two humans (two phones) has no button at all.
 * The wait between presses is the HUD's (real seconds, whatever the game speed).
 */
import { CASH_BUTTON } from '../data/rules.js';

/** @typedef {import('./world.js').World} World */

/** May this player press the cash button in this match? @param {World} w @param {number} pid */
export function cashButtonFor(w, pid) {
  const p = w.players[pid];
  return !!w.settings.cashButton && !!p?.human && p.alive && !w.result && w.players.filter((x) => x.human).length === 1;
}

/** Apply one press; false when the button is not this player's to press. @param {World} w @param {number} pid */
export function pressCashButton(w, pid) {
  if (!cashButtonFor(w, pid)) return false;
  w.players[pid].cash += CASH_BUTTON.amount;
  return true;
}
