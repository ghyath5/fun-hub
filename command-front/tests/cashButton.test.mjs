// The cash button: a setup option that pays the one human in a match against the computer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openMap, order, run, createMatch } from './harness.mjs';
import { CASH_BUTTON } from '../src/data/rules.js';
import './importmap.mjs';

const { defaultForm, matchOptions } = await import('../src/game/matchSetup.js');

/** A match on an open map: player 0 human, player 1 human (two phones) or the computer. */
const match = ({ cashButton, secondHuman = false }) => createMatch(openMap(), {
  seed: 1,
  startingCredits: 5000,
  players: [
    { faction: 'coalition', color: 'blue', human: true, start: 0 },
    { faction: 'union', color: 'red', human: secondHuman, start: 1 },
  ],
  settings: { victory: false, cashButton },
});

const press = (w, pid) => { order(w, pid, 'cash', [], null); run(w, 2); };

test('a press pays the human against the computer', () => {
  const w = match({ cashButton: true });
  press(w, 0);
  press(w, 0);
  assert.equal(w.players[0].cash, 5000 + 2 * CASH_BUTTON.amount);
});

test('the computer cannot press it', () => {
  const w = match({ cashButton: true });
  const before = w.players[1].cash;
  press(w, 1);
  assert.ok(w.players[1].cash <= before);
});

test('nothing happens when the option is off', () => {
  const w = match({ cashButton: false });
  press(w, 0);
  assert.equal(w.players[0].cash, 5000);
});

test('two human players never get it', () => {
  const w = match({ cashButton: true, secondHuman: true });
  press(w, 0);
  press(w, 1);
  assert.equal(w.players[0].cash, 5000);
  assert.equal(w.players[1].cash, 5000);
});

test('the setup form passes the option on, except on two phones', () => {
  const map = { starts: [{}, {}] };
  const solo = { ...defaultForm(), cashButton: true };
  assert.equal(matchOptions(solo, map, 1).settings.cashButton, true);
  assert.equal(matchOptions(defaultForm(), map, 1).settings.cashButton, false);
  const phones = { ...solo, opponents: [{ ...solo.opponents[0], remote: true }] };
  assert.equal(matchOptions(phones, map, 1).settings.cashButton, false);
});
