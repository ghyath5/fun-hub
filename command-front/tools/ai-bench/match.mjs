// One headless AI-vs-AI match, reported as JSON: who won and how each computer
// player played (style, attacks and how they ended, raids, scouting, income,
// kills and losses, army size over time). Used by ladder.mjs; handy alone too.
//
//   node tools/ai-bench/match.mjs --map duel-canyon --seed 3 --skills 8,4 [--factions coalition,union] [--minutes 40]
import { parseArgs } from 'node:util';
import { loadMap, createMatch, step, TPS } from '../../tests/harness.mjs';
import { armyOf } from '../../src/ai/common.js';
import { tuneSkill } from '../../src/ai/skill.js';

/**
 * Play one match to the end (or the time limit).
 * @param {{ map: string, seed: number, skills: number[], factions: string[], minutes: number, patch?: Record<number, Record<string, number>> }} spec
 *   patch: per skill level, values to play it with instead of the table's (tuning)
 */
export function playMatch(spec) {
  for (const [level, values] of Object.entries(spec.patch ?? {})) tuneSkill(Number(level), values);
  const map = loadMap(spec.map);
  const w = createMatch(map, {
    seed: spec.seed,
    players: spec.skills.map((skill, i) => ({ faction: spec.factions[i % spec.factions.length], color: ['blue', 'red', 'green', 'yellow'][i], human: false, skill, start: i })),
    settings: { victory: true },
  });
  const peak = w.players.map(() => 0);
  const timeline = w.players.map(() => /** @type {any[]} */ ([]));
  const minute = 60 * TPS;
  for (let t = 0; t < spec.minutes * minute && !w.result; t++) {
    step(w);
    if (w.tick % (15 * TPS)) continue;
    for (const p of w.players) {
      const army = armyOf(w, p.id).length;
      peak[p.id] = Math.max(peak[p.id], army);
      if (w.tick % minute === 0) timeline[p.id].push({ min: w.tick / minute, army, harvested: p.stats.creditsHarvested });
    }
  }
  const winners = w.result ? w.result.winners : [];
  return {
    map: spec.map,
    seed: spec.seed,
    minutes: +(w.tick / minute).toFixed(1),
    winners: winners.map((id) => w.players[id].skill),
    winnerIds: winners,
    players: w.players.map((p) => ({
      id: p.id, skill: p.skill, faction: p.faction, style: w.ai[p.id]?.style, alive: p.alive,
      stats: w.ai[p.id]?.stats ?? {}, confidence: +(w.ai[p.id]?.confidence ?? 1).toFixed(2),
      harvested: p.stats.creditsHarvested, killed: p.stats.unitsKilled, lost: p.stats.unitsLost,
      structuresLost: p.stats.structuresLost, peakArmy: peak[p.id], timeline: timeline[p.id],
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: o } = parseArgs({
    options: {
      map: { type: 'string', default: 'duel-canyon' },
      seed: { type: 'string', default: '1' },
      skills: { type: 'string', default: '5,5' },
      factions: { type: 'string', default: 'coalition,union' },
      minutes: { type: 'string', default: '40' },
    },
  });
  const result = playMatch({
    map: o.map, seed: Number(o.seed), skills: o.skills.split(',').map(Number),
    factions: o.factions.split(','), minutes: Number(o.minutes),
  });
  console.log(JSON.stringify(result));
}
