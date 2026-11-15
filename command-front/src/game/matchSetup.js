// @ts-check
/**
 * Skirmish setup (section 18): the setup form's model, its defaults and
 * how it becomes a match (players, teams, start positions, settings). Pure,
 * so the setup screen stays a dumb form and this can be tested.
 */
import { SETUP_DEFAULTS, GAME_SPEEDS } from '../data/rules.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { createMatch } from '../sim/setup.js';
import { GENERATOR, capacityOf, smallestSizeFor } from '../map/generator.js';
import { skillOf } from '../ai/skill.js';
import { MAX_OPPONENTS, migrateTeams, tidyTeams, seatsOf, startsForSeats } from './teams.js';

/**
 * An opponent slot: an AI, or (`remote`) the second phone in a two-phone match,
 * whose player picks their own faction and colour. skill: the AI's 0–10
 * experience (forms saved before the slider carry `difficulty` instead).
 * team: its side (teams.js); seats on the same team are allies.
 * @typedef {{ faction: 'coalition' | 'union', color: string, country?: string, skill: number, team?: number, difficulty?: string, remote?: boolean }} OpponentForm
 */

/**
 * @typedef {object} SetupForm
 * @property {string} map               A bundled map id, or 'generated'
 * @property {number} genSeed
 * @property {number} genSize           one of GENERATOR.sizes
 * @property {number} genPlayers         bases on a generated map: one per player (kept in step by normaliseForm)
 * @property {'coalition' | 'union'} faction
 * @property {string} color
 * @property {string} [country]         flag the player flies ('' = none)
 * @property {number} [team]             your side (teams.js)
 * @property {OpponentForm[]} opponents 1–8, as many as the map has room for
 * @property {number} startingCredits
 * @property {'mcv' | 'force'} startingUnits
 * @property {number} techLevel
 * @property {number} oreGrowthSeconds  0 = off
 * @property {boolean} fog
 * @property {boolean} crates
 * @property {boolean} shortGame
 * @property {boolean} [cashButton]     show the cash button in the match (against the computer only)
 * @property {keyof typeof GAME_SPEEDS} speed
 * @property {'random' | 'fixed'} startPositions
 */

export const COLORS = Object.keys(PLAYER_COLORS);
export const ORE_GROWTH_OPTIONS = [0, 60, 90, 120];

/** @returns {SetupForm} */
export function defaultForm() {
  return {
    map: SETUP_DEFAULTS.map,
    genSeed: 1 + (Date.now() % 99999),
    genSize: 128,
    genPlayers: 2,
    faction: 'coalition',
    color: 'blue',
    country: '',
    team: 0,
    opponents: [{ faction: 'union', color: 'red', country: 'eg', skill: SETUP_DEFAULTS.skill, team: 1 }],
    startingCredits: SETUP_DEFAULTS.startingCredits,
    startingUnits: /** @type {'mcv'} */ (SETUP_DEFAULTS.startingUnits),
    techLevel: SETUP_DEFAULTS.techLevel,
    oreGrowthSeconds: SETUP_DEFAULTS.oreGrowthSeconds,
    fog: SETUP_DEFAULTS.fog,
    crates: SETUP_DEFAULTS.crates,
    shortGame: SETUP_DEFAULTS.shortGame,
    cashButton: SETUP_DEFAULTS.cashButton,
    speed: /** @type {'normal'} */ (SETUP_DEFAULTS.speed),
    startPositions: /** @type {'random'} */ (SETUP_DEFAULTS.startPositions),
  };
}

/** Players in the match: you and every opponent. @param {SetupForm} f */
export const playersOf = (f) => 1 + f.opponents.length;

/**
 * How many players the form's map has room for: a bundled map's own count;
 * a generated map grows to fit, up to nine.
 * @param {SetupForm} f @param {{ id: string, maxPlayers: number }[]} maps
 */
export function maxPlayersOf(f, maps) {
  if (f.map === 'generated') return GENERATOR.maxPlayers;
  return maps.find((m) => m.id === f.map)?.maxPlayers ?? 2;
}

/**
 * Keep the form consistent: opponents fit the map (a generated map grows to
 * fit them), every seat has a team, colours are unique, every AI has a 0–10
 * skill. Forms saved before any of these are brought up to date.
 * @param {SetupForm} f @param {number} maxPlayers
 */
export function normaliseForm(f, maxPlayers) {
  const room = Math.max(1, Math.min(MAX_OPPONENTS, maxPlayers - 1));
  let out = /** @type {SetupForm} */ (migrateTeams(/** @type {any} */ ({ ...f, opponents: f.opponents.map(({ difficulty, ...o }) => ({ ...o, skill: skillOf({ skill: o.skill, difficulty }) })) })));
  out = tidyTeams({ ...out, opponents: out.opponents.slice(0, room) });
  if (out.map === 'generated') {
    out.genPlayers = playersOf(out);
    if (capacityOf(out.genSize) < out.genPlayers) out.genSize = smallestSizeFor(out.genPlayers);
  }
  const used = new Set([out.color]);
  for (const o of out.opponents) {
    if (used.has(o.color)) o.color = COLORS.find((c) => !used.has(c)) ?? o.color;
    used.add(o.color);
  }
  return out;
}

/**
 * Player specs and settings for a form. Each seat plays for its team; start
 * positions are fixed or shuffled with the match seed, allies side by side.
 * @param {SetupForm} f @param {{ starts: any[], width: number, height: number }} map @param {number} seed
 */
export function matchOptions(f, map, seed) {
  const players = [
    { faction: f.faction, color: f.color, country: f.country ?? '', human: true },
    ...f.opponents.map((o) => ({ faction: o.faction, color: o.color, country: o.country ?? '', human: !!o.remote, skill: skillOf(o) })),
  ];
  const teams = seatsOf(f).map((s) => s.team);
  const starts = startsForSeats(teams, map.starts, map, f.startPositions === 'random', seed);
  const specs = players.map((p, i) => ({ ...p, start: starts[i], team: teams[i] }));
  return {
    seed,
    players: /** @type {any} */ (specs),
    startingUnits: f.startingUnits,
    startingCredits: f.startingCredits,
    settings: {
      oreGrowthSeconds: f.oreGrowthSeconds,
      fog: f.fog,
      crates: f.crates,
      shortGame: f.shortGame,
      cashButton: !!f.cashButton && !f.opponents.some((o) => o.remote),
      techLevel: f.techLevel,
    },
  };
}

/** Build the world for a form on a loaded map. @param {SetupForm} f @param {any} map @param {number} seed */
export function startMatch(f, map, seed) {
  return createMatch(map, matchOptions(f, map, seed));
}
