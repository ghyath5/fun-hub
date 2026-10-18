// @ts-check
/** Build a match: players, the world and each player's starting units at their start position. */
import { createPlayers } from './players.js';
import { createWorld } from './world.js';
import { spawnUnit } from './entities/units.js';
import { placeStructure } from './entities/structures.js';
import { STARTING_FORCE, SETUP_DEFAULTS, SHROUD } from '../data/rules.js';
import { spiral } from './nav.js';
import { revealCircle, rebuildVision } from './systems/shroud.js';
import { installAi } from './systems/ai.js';
import { AI } from '../data/rules.js';

/**
 * @param {import('../types.js').MapData} map
 * @param {{ seed: string | number, players: Parameters<typeof createPlayers>[0], startingUnits?: keyof typeof STARTING_FORCE,
 *   startingCredits?: number, settings?: Partial<import('./world.js').MatchSettings> }} opts
 */
export function createMatch(map, opts) {
  const players = createPlayers(opts.players, opts.startingCredits ?? SETUP_DEFAULTS.startingCredits);
  const world = createWorld({ map, seed: opts.seed, players, settings: opts.settings });
  // Neutral buildings and bridge repair huts from the map.
  for (const n of map.neutral ?? []) placeStructure(world, n.type, -1, n.x, n.y, { buildUp: false });
  for (const b of map.bridges ?? []) if (b.hut) placeStructure(world, 'bridgeHut', -1, b.hut[0], b.hut[1], { buildUp: false });
  const force = STARTING_FORCE[opts.startingUnits ?? 'mcv'];
  for (const p of players) {
    const s = map.starts[p.start];
    const kit = force[p.faction];
    // Vehicles take the first cells of a spiral round the start; infantry gather behind them.
    const cells = spiral(s.x, s.y, 3);
    kit.forEach((type, k) => {
      const [x, y] = cells[Math.min(k, cells.length - 1)];
      spawnUnit(world, type, p.id, x, y, { facing: s.y * 2 < map.height ? 128 : 0 });
    });
    revealCircle(world, p.team, s.x, s.y, SHROUD.startRevealRadius);
  }
  rebuildVision(world);
  for (const p of players) {
    // Each AI level earns its own share of ore value (section 16): Beginner 0.6 up to Hard 1.25.
    const level = /** @type {{ oreValueFactor?: number } | undefined} */ (AI[/** @type {keyof typeof AI} */ (p.difficulty)]);
    if (!p.human) p.oreValueK = Math.round((level?.oreValueFactor ?? 1) * 1000);
  }
  installAi(world);
  return world;
}
