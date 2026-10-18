// @ts-check
/**
 * Skirmish setup (section 18): the setup form's model, its defaults and
 * how it becomes a match (players, teams, start positions, settings). Pure,
 * so the setup screen stays a dumb form and this can be tested.
 */
import { SETUP_DEFAULTS, GAME_SPEEDS } from '../data/rules.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { createRng } from '../lib/rng.js';
import { createMatch } from '../sim/setup.js';
import { playersForSize } from '../map/generator.js';

/** @typedef {'beginner' | 'easy' | 'normal' | 'hard'} Difficulty */
/**
 * An opponent slot: an AI, or (`remote`) the second phone in a two-phone match,
 * whose player picks their own faction and colour.
 * @typedef {{ faction: 'coalition' | 'union', color: string, difficulty: Difficulty, remote?: boolean }} OpponentForm
 */

/**
 * @typedef {object} SetupForm
 * @property {string} map               A bundled map id, or 'generated'
 * @property {number} genSeed
 * @property {number} genSize           one of GENERATOR.sizes
 * @property {2 | 4} genPlayers         start positions on a generated map (4 needs a Medium map or larger)
 * @property {'coalition' | 'union'} faction
 * @property {string} color
 * @property {OpponentForm[]} opponents 1–3
 * @property {'ffa' | '2v2' | 'coop'} teams   coop: every human (both phones) against every AI
 * @property {number} startingCredits
 * @property {'mcv' | 'force'} startingUnits
 * @property {number} techLevel
 * @property {number} oreGrowthSeconds  0 = off
 * @property {boolean} fog
 * @property {boolean} crates
 * @property {boolean} shortGame
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
    genSize: 96,
    genPlayers: 2,
    faction: 'coalition',
    color: 'blue',
    opponents: [{ faction: 'union', color: 'red', difficulty: /** @type {Difficulty} */ (SETUP_DEFAULTS.difficulty) }],
    teams: /** @type {'ffa'} */ (SETUP_DEFAULTS.teams),
    startingCredits: SETUP_DEFAULTS.startingCredits,
    startingUnits: /** @type {'mcv'} */ (SETUP_DEFAULTS.startingUnits),
    techLevel: SETUP_DEFAULTS.techLevel,
    oreGrowthSeconds: SETUP_DEFAULTS.oreGrowthSeconds,
    fog: SETUP_DEFAULTS.fog,
    crates: SETUP_DEFAULTS.crates,
    shortGame: SETUP_DEFAULTS.shortGame,
    speed: /** @type {'normal'} */ (SETUP_DEFAULTS.speed),
    startPositions: /** @type {'random'} */ (SETUP_DEFAULTS.startPositions),
  };
}

/**
 * How many players the form's map holds: a bundled map's own count, or the
 * generated map's chosen start positions.
 * @param {SetupForm} f @param {{ id: string, maxPlayers: number }[]} maps
 */
export function maxPlayersOf(f, maps) {
  if (f.map === 'generated') return playersForSize(f.genSize, f.genPlayers ?? (f.genSize >= 96 ? 4 : 2));
  return maps.find((m) => m.id === f.map)?.maxPlayers ?? 2;
}

/** Keep the form consistent: opponents fit the map, colours are unique, 2v2 needs four players. @param {SetupForm} f @param {number} maxPlayers */
export function normaliseForm(f, maxPlayers) {
  const out = { ...f, opponents: f.opponents.slice(0, Math.max(1, maxPlayers - 1)).map((o) => ({ ...o })) };
  if (out.genPlayers !== 2 && out.genPlayers !== 4) out.genPlayers = maxPlayers === 4 ? 4 : 2; // forms saved before the choice existed
  const ais = out.opponents.filter((o) => !o.remote).length;
  if (out.teams === '2v2' && out.opponents.length + 1 < 4) out.teams = 'ffa';
  if (out.teams === 'coop' && (!ais || ais === out.opponents.length)) out.teams = 'ffa';
  const used = new Set([out.color]);
  for (const o of out.opponents) {
    if (used.has(o.color)) o.color = COLORS.find((c) => !used.has(c)) ?? o.color;
    used.add(o.color);
  }
  return out;
}

/**
 * Player specs and settings for a form. Start positions are shuffled with
 * the match seed when random; in 2v2 you and the first AI share team 0.
 * @param {SetupForm} f @param {{ starts: any[] }} map @param {number} seed
 */
export function matchOptions(f, map, seed) {
  const players = [
    { faction: f.faction, color: f.color, human: true, difficulty: 'normal' },
    ...f.opponents.map((o) => ({ faction: o.faction, color: o.color, human: !!o.remote, difficulty: o.difficulty })),
  ];
  const order = map.starts.map((_, i) => i);
  if (f.startPositions === 'random') {
    const rng = createRng(`starts:${seed}`);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  const specs = players.map((p, i) => ({
    ...p,
    start: order[i],
    team: f.teams === 'coop' ? (p.human ? 0 : 1) : f.teams === '2v2' ? (i < 2 ? 0 : 1) : i,
  }));
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
      techLevel: f.techLevel,
    },
  };
}

/** Build the world for a form on a loaded map. @param {SetupForm} f @param {any} map @param {number} seed */
export function startMatch(f, map, seed) {
  return createMatch(map, matchOptions(f, map, seed));
}
