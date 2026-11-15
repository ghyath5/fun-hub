// Sides: up to eight opponents of any skill, on any teams — all against all,
// you against everyone, even teams balanced by skill, the phones against the
// computer — allies starting side by side, and big matches that play out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, invariants, TPS } from './harness.mjs';
import './importmap.mjs';

const { defaultForm, normaliseForm, matchOptions, maxPlayersOf } = await import('../src/game/matchSetup.js');
const { presetsFor, applyPreset, sidesOf, sidesProblem, seatsOf, migrateTeams, teamForNewOpponent, startsForSeats, MAX_OPPONENTS } = await import('../src/game/teams.js');
const { generateMap } = await import('../src/map/generator.js');

/** A form with AIs of these skills (all against all). */
function formWith(skills, extra = {}) {
  const f = defaultForm();
  return normaliseForm({ ...f, ...extra, opponents: skills.map((skill, k) => ({ faction: k % 2 ? 'coalition' : 'union', color: 'red', skill, team: k + 1 })) }, 9);
}

const teamsOf = (form) => seatsOf(form).map((s) => s.team);

test('presets cover all against all, you against all, and 2–4 even teams', () => {
  const f = formWith([5, 5, 5, 5, 5, 5, 5]);
  assert.deepEqual(presetsFor(f).map((p) => p.id), ['ffa', 'oneVsAll', 'teams2', 'teams3', 'teams4']);
  assert.deepEqual(teamsOf(applyPreset(f, 'ffa')), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(teamsOf(applyPreset(f, 'oneVsAll')), [0, 1, 1, 1, 1, 1, 1, 1]);
  const four = sidesOf(applyPreset(f, 'teams2'));
  assert.deepEqual(four.map((s) => s.seats.length), [4, 4], '4 against 4');
  assert.deepEqual(sidesOf(applyPreset(formWith([5, 5, 5, 5]), 'teams2')).map((s) => s.seats.length), [3, 2], '3 against 2');
  assert.deepEqual(sidesOf(applyPreset(f, 'teams4')).map((s) => s.seats.length), [2, 2, 2, 2]);
});

test('even teams are balanced by skill, not just by count', () => {
  const f = applyPreset(formWith([10, 9, 1, 0, 8, 2]), 'teams2');
  const [a, b] = sidesOf(f);
  assert.equal(Math.abs(a.seats.length - b.seats.length) <= 1, true);
  assert.ok(Math.abs(a.skill - b.skill) <= 3, `skill ${a.skill} against ${b.skill}`);
  assert.equal(f.team, 0, 'you lead team A');
});

test('the phones can team up against the computer', () => {
  const f = normaliseForm({ ...defaultForm(), opponents: [
    { faction: 'union', color: 'red', skill: 5, remote: true },
    { faction: 'union', color: 'green', skill: 7 },
    { faction: 'coalition', color: 'gold', skill: 3 },
  ] }, 9);
  assert.ok(presetsFor(f).some((p) => p.id === 'peopleVsAi'));
  assert.deepEqual(teamsOf(applyPreset(f, 'peopleVsAi')), [0, 0, 1, 1]);
});

test('one team only cannot start; letters stay tidy', () => {
  const f = normaliseForm({ ...formWith([5, 5]), team: 3, opponents: formWith([5, 5]).opponents.map((o) => ({ ...o, team: 3 })) }, 9);
  assert.deepEqual(teamsOf(f), [0, 0, 0]);
  assert.ok(sidesProblem(f));
  assert.equal(sidesProblem(formWith([5])), '');
});

test('a new opponent is an enemy that keeps the sides even', () => {
  const ffa = formWith([5, 5]);
  assert.equal(teamForNewOpponent(ffa), 3, 'all against all: a new side');
  const twoVsOne = normaliseForm({ ...ffa, opponents: ffa.opponents.map((o, k) => ({ ...o, team: k === 0 ? 0 : 1 })) }, 9);
  assert.equal(teamForNewOpponent(twoVsOne), 1, 'joins the smaller enemy side');
});

test('forms from before the team pickers keep their sides', () => {
  const base = { ...defaultForm(), opponents: [5, 5, 5].map((skill) => ({ faction: 'union', color: 'red', skill })) };
  delete base.team;
  assert.deepEqual(teamsOf(migrateTeams({ ...base, teams: '2v2' })), [0, 0, 1, 1]);
  assert.deepEqual(teamsOf(migrateTeams({ ...base, teams: 'ffa' })), [0, 1, 2, 3]);
  const coop = { ...base, teams: 'coop', opponents: [{ ...base.opponents[0], remote: true }, ...base.opponents.slice(1)] };
  assert.deepEqual(teamsOf(migrateTeams(coop)), [0, 0, 1, 1]);
  assert.ok(!('teams' in migrateTeams({ ...base, teams: 'ffa' })));
});

test('up to eight opponents; a generated map grows to fit them, a bundled one keeps its room', () => {
  const many = Array.from({ length: 10 }, () => 5);
  const gen = formWith(many, { map: 'generated', genSize: 64 });
  assert.equal(gen.opponents.length, MAX_OPPONENTS);
  assert.equal(gen.genPlayers, 9);
  assert.ok(gen.genSize >= 128, `size grew to ${gen.genSize}`);
  const cross = normaliseForm({ ...gen, map: 'crossroads' }, maxPlayersOf({ ...gen, map: 'crossroads' }, [{ id: 'crossroads', maxPlayers: 4 }]));
  assert.equal(cross.opponents.length, 3);
});

test('random starts put allies side by side round the map', () => {
  const g = generateMap({ seed: 5, size: 128, players: 8 });
  const teams = [0, 0, 0, 0, 1, 1, 1, 1];
  const cx = (g.map.width - 1) / 2;
  const cy = (g.map.height - 1) / 2;
  const ring = g.map.starts.map((s, i) => ({ i, a: Math.atan2(s.y - cy, s.x - cx) })).sort((p, q) => p.a - q.a).map((p) => p.i);
  for (let seed = 1; seed <= 20; seed++) {
    const starts = startsForSeats(teams, g.map.starts, g.map, true, seed);
    assert.equal(new Set(starts).size, 8, 'every seat has its own start');
    // Round the ring, the teams change hands exactly twice: each side is one unbroken arc.
    const owner = ring.map((start) => teams[starts.indexOf(start)]);
    const changes = owner.filter((t, k) => t !== owner[(k + 1) % owner.length]).length;
    assert.equal(changes, 2, `seed ${seed}: ${owner.join('')}`);
  }
});

test('a 4 against 4 match of computer players plays out with allies never at war', () => {
  const g = generateMap({ seed: 3, size: 128, players: 8 });
  const form = applyPreset(formWith([2, 4, 6, 8, 3, 5, 7]), 'teams2');
  const options = matchOptions(form, g.map, 11);
  options.players = options.players.map((p, i) => ({ ...p, human: false, skill: i === 0 ? 5 : p.skill }));
  const w = createMatch(g.map, { ...options, settings: { ...options.settings, victory: true } });
  let bad = null;
  for (let t = 0; t < 12 * 60 * TPS && !w.result && !bad; t++) {
    step(w);
    if (t % 300) continue;
    bad = invariants(w);
    for (const p of w.players) {
      const ai = w.ai[p.id];
      assert.ok(ai.known.every((k) => !w.allied(k.owner, p.id)), `player ${p.id} marked an ally's building as a target`);
      assert.ok(ai.seen.every((s) => !w.allied(s.owner, p.id)), `player ${p.id} counted an ally as an enemy`);
    }
  }
  assert.equal(bad, null);
  if (w.result) {
    const sides = new Set(w.result.winners.map((id) => w.players[id].team));
    assert.equal(sides.size, 1, 'one side won');
  }
});
