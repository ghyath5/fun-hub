// The computer player's skill levels: every level plays by the same rules
// (money, tech, units), only how well it plays changes; its playstyle is picked
// per match; its brain is plain data that saves, loads and plays the same game
// on two phones; and more skill wins more often without the top level being
// unbeatable by the ones below it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMap, createMatch, step, hashWorld, invariants, TPS } from './harness.mjs';
import { snapshot, restore } from '../src/save/serialize.js';
import { oreValueK } from '../src/sim/bonuses.js';
import { buildTicks } from '../src/sim/formulas/production.js';
import { costOf } from '../src/sim/systems/production.js';
import { producersOf } from '../src/sim/catalog.js';
import { skillProfile, skillOf, clampSkill, SKILL_MIN, SKILL_MAX } from '../src/ai/skill.js';
import { AI_STYLES, AI_SKILL_NAMES } from '../src/data/rules.js';
import { armyOf } from '../src/ai/common.js';
import './importmap.mjs';

// The setup form pulls in the map generator, whose noise library resolves through the page's import map.
const { normaliseForm, defaultForm } = await import('../src/game/matchSetup.js');

/** A two-AI match on a bundled map. */
function duel(skills, { map = 'duel-canyon', seed = 3, factions = ['coalition', 'union'] } = {}) {
  return createMatch(loadMap(map), {
    seed,
    players: skills.map((skill, i) => ({ faction: factions[i], color: ['blue', 'red'][i], human: false, skill, start: i })),
    settings: { victory: true },
  });
}

const LEVELS = Array.from({ length: SKILL_MAX - SKILL_MIN + 1 }, (_, i) => SKILL_MIN + i);

test('every skill level earns the same from an ore load as a human', () => {
  const w = createMatch(loadMap('crossroads'), {
    seed: 1,
    players: [
      { faction: 'coalition', color: 'blue', human: true, start: 0 },
      { faction: 'union', color: 'red', human: false, skill: 0, start: 1 },
      { faction: 'coalition', color: 'green', human: false, skill: 10, start: 2 },
    ],
  });
  assert.deepEqual(w.players.map((p) => oreValueK(w, p.id)), [1000, 1000, 1000]);
});

test('even the top level waits the full build time and places buildings at human speed', () => {
  const w = createMatch(loadMap('duel-canyon'), {
    seed: 3,
    players: [
      { faction: 'coalition', color: 'blue', human: false, skill: 10, start: 0 },
      { faction: 'union', color: 'red', human: true, start: 1 },
    ],
  });
  const p = w.players[0];
  /** @type {Record<string, { item: any, start: number, serving: number }>} */
  const running = {};
  let readyAt = -1;
  const placing = [];
  for (let t = 0; t < 5 * 60 * TPS; t++) {
    step(w);
    for (const [id, line] of Object.entries(p.lines)) {
      const head = line.queue[0];
      const cur = running[id];
      if (cur && head !== cur.item) {
        const rule = buildTicks(costOf(cur.item.type), cur.serving, 1000);
        assert.ok(w.tick - cur.start >= rule, `${cur.item.type} took ${w.tick - cur.start} ticks, the rules say ${rule}`);
        delete running[id];
      }
      if (head && head.prog > 0 && !running[id]) running[id] = { item: head, start: w.tick - 1, serving: Math.max(1, producersOf(w, 0, head.type).length) };
    }
    const ready = p.lines.structures?.ready;
    if (ready && readyAt < 0) readyAt = w.tick;
    if (!ready && readyAt >= 0) { placing.push(w.tick - readyAt); readyAt = -1; }
  }
  assert.ok(placing.length >= 4, 'it built a base');
  assert.ok(Math.min(...placing) >= TPS, `fastest placement ${Math.min(...placing)} ticks: no faster than a quick human`);
});

test('skill levels get steadily better at what experience brings', () => {
  const up = ['attention', 'harvesters', 'routeSense', 'targetSense', 'counterSense', 'windowSense', 'focusFire', 'learning', 'powerTiming'];
  const down = ['thinkSeconds', 'buildHesitation', 'buildMistakes', 'productionGaps', 'judgmentError'];
  for (let s = SKILL_MIN + 1; s <= SKILL_MAX; s++) {
    const a = skillProfile(s - 1);
    const b = skillProfile(s);
    for (const k of up) assert.ok(b[k] >= a[k], `${k} rises from ${s - 1} to ${s}`);
    for (const k of down) assert.ok(b[k] <= a[k], `${k} falls from ${s - 1} to ${s}`);
  }
  assert.equal(AI_SKILL_NAMES.length, LEVELS.length, 'a name for every level');
});

test('old difficulty names and odd values become skill levels', () => {
  assert.deepEqual(['beginner', 'easy', 'normal', 'hard'].map((difficulty) => skillOf({ difficulty })), [1, 3, 5, 8]);
  assert.equal(skillOf({ skill: 7 }), 7);
  assert.equal(clampSkill(14), 10);
  assert.equal(clampSkill(-3), 0);
  assert.equal(clampSkill('x'), 5);
  const old = { ...defaultForm(), opponents: [{ faction: 'union', color: 'red', difficulty: 'hard' }] };
  const form = normaliseForm(/** @type {any} */ (old), 2);
  assert.equal(form.opponents[0].skill, 8);
  assert.ok(!('difficulty' in form.opponents[0]));
});

test('each match the computer picks a playstyle, the same one for the same seed', () => {
  const styles = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const a = duel([5, 5], { seed });
    const b = duel([5, 5], { seed });
    assert.equal(a.ai[1].style, b.ai[1].style, `seed ${seed} picks the same style twice`);
    assert.ok(a.ai[1].style in AI_STYLES);
    styles.add(a.ai[1].style);
  }
  assert.ok(styles.size >= 3, `styles vary between matches (${[...styles]})`);
});

test('the same seed plays the same game at every skill, and a save picks up exactly where it was', () => {
  const a = duel([10, 0], { seed: 9 });
  const b = duel([10, 0], { seed: 9 });
  for (let t = 0; t < 6 * 60 * TPS; t++) {
    step(a);
    step(b);
    if (t % 300 === 0) assert.equal(hashWorld(a), hashWorld(b), `diverged by tick ${a.tick}`);
  }
  const back = restore(JSON.parse(JSON.stringify(snapshot(a))));
  for (let t = 0; t < 3 * 60 * TPS; t++) { step(a); step(back); }
  assert.equal(hashWorld(back), hashWorld(a), 'the loaded game plays on the same');
});

test('a brain from an older save is replaced by a fresh one', () => {
  const w = duel([6, 6]);
  w.ai[1] = { pid: 1, difficulty: 'hard', cfg: {} };
  for (let t = 0; t < 30; t++) step(w);
  assert.equal(w.ai[1].v, w.ai[0].v);
  assert.equal(w.ai[1].skill, w.players[1].skill);
});

test('the top level beats the bottom one, and attacks never stall with the army idle at home', () => {
  let wins = 0;
  for (const [seed, factions] of [[3, ['coalition', 'union']], [3, ['union', 'coalition']], [11, ['coalition', 'union']], [11, ['union', 'coalition']]]) {
    const w = duel([10, 0], { seed, factions });
    const stuck = [0, 0];
    let bad = null;
    for (let t = 0; t < 30 * 60 * TPS && !w.result && !bad; t++) {
      step(w);
      if (t % 150) continue;
      bad = invariants(w);
      for (const p of w.players) {
        const ai = w.ai[p.id];
        const away = ai.wave ? ai.wave.ids.length : 0;
        const idle = armyOf(w, p.id).filter((u) => !u.task && !ai.wave?.ids.includes(u.id)).length;
        stuck[p.id] = away > 0 && away <= 1 && idle >= 10 ? stuck[p.id] + 10 : 0;
        assert.ok(stuck[p.id] < 60, `player ${p.id} (skill ${p.skill}) left one unit attacking and ${idle} at home for a minute`);
      }
    }
    assert.equal(bad, null);
    if (w.result?.winners.length === 1 && w.players[w.result.winners[0]].skill === 10) wins++;
  }
  assert.ok(wins >= 3, `skill 10 beat skill 0 in ${wins} of 4`);
});
