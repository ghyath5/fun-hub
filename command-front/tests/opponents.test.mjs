// Many computer opponents: every one of them builds up its base, and one that
// loses its refinery and Harvesters with no money left gets its economy going
// again (cancelling what else it paid into, selling what it can spare) instead
// of standing still for the rest of the match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, TPS } from './harness.mjs';
import './importmap.mjs';

const { defaultForm, normaliseForm, matchOptions } = await import('../src/game/matchSetup.js');
const { mapForForm } = await import('../src/game/mapForForm.js');

/** A generated-map match of AIs of these skills, all against all (the human seat stays idle). */
async function freeForAll(skills, seed) {
  const form = normaliseForm({ ...defaultForm(), genSeed: seed, opponents: skills.map((skill, k) => ({ faction: k % 2 ? 'coalition' : 'union', color: 'red', skill, team: k + 2 })) }, 9);
  const { map } = await mapForForm(form, []);
  const o = matchOptions(form, map, seed * 13 + 1);
  return createMatch(map, { ...o, settings: { ...o.settings, victory: false } });
}

const own = (w, pid) => w.entities.all().filter((e) => e.owner === pid && !e.dead);
const buildings = (w, pid) => own(w, pid).filter((e) => e.kind === 'structure').length;
const computers = (w) => w.players.filter((p) => !p.human);

test('with eight computer opponents every one of them builds up a base', async () => {
  const w = await freeForAll([0, 2, 4, 5, 6, 8, 9, 10], 5);
  const peak = new Map();
  for (let t = 0; t < 8 * 60 * TPS; t++) {
    step(w);
    if (t % TPS === 0) for (const p of computers(w)) peak.set(p.id, Math.max(peak.get(p.id) ?? 0, buildings(w, p.id)));
  }
  for (const p of computers(w)) assert.ok(peak.get(p.id) >= 6, `player ${p.id} (skill ${w.ai[p.id].skill}) peaked at ${peak.get(p.id)} buildings`);
});

test('a computer that loses its refinery and Harvesters gets its economy back', async () => {
  const w = await freeForAll([3, 6, 10], 7);
  for (let t = 0; t < 6 * 60 * TPS; t++) step(w);
  const earned = new Map();
  for (const p of computers(w)) {
    earned.set(p.id, p.stats.creditsHarvested);
    for (const e of own(w, p.id)) {
      if (e.harv || (e.kind === 'structure' && e.type === 'refinery')) w.damage.push({ victim: e.id, amount: e.hp * 4, attacker: 0, owner: 0 });
    }
  }
  for (let t = 0; t < 6 * 60 * TPS; t++) step(w);
  for (const p of computers(w)) {
    if (!own(w, p.id).some((e) => e.type === 'constructionYard')) continue; // beaten by a neighbour meanwhile
    assert.ok(p.stats.creditsHarvested > earned.get(p.id), `player ${p.id} (skill ${w.ai[p.id].skill}) never earned again`);
    assert.ok(own(w, p.id).some((e) => e.harv), `player ${p.id} has no Harvester again`);
  }
});
