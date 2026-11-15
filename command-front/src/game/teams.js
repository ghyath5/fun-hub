// @ts-check
/**
 * Sides in a match (section 18): who fights whom. Every seat — you, then
 * each opponent (an AI, or the second phone) — has a team; seats on the same
 * team are allies, every other team is an enemy. So any arrangement works:
 * all against all, you and two AIs against five, three against two, four
 * against four, one against everyone, or several teams at once.
 *
 * Presets fill the teams in one tap. Splitting into 2–4 teams is balanced by
 * skill, not just by count: the strongest computer players are dealt out
 * first, each to the side that is weakest so far (a person counts as a mid
 * skill), so teams come out even in size and in strength.
 *
 * Pure, so the setup screen stays a dumb form and this can be tested.
 */
import { createRng } from '../lib/rng.js';

/** @typedef {import('./matchSetup.js').SetupForm} SetupForm */

/** Team names, one per possible seat. */
export const TEAM_LETTERS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);

/** Most opponents in a match (with you, nine players). */
export const MAX_OPPONENTS = 8;

/** How strong a person counts as when teams are balanced by skill. */
const HUMAN_SKILL = 5;

/**
 * Every seat in setup order: you first, then each opponent.
 * @param {SetupForm} form
 * @returns {{ team: number, human: boolean, skill: number }[]}
 */
export function seatsOf(form) {
  return [
    { team: form.team ?? 0, human: true, skill: HUMAN_SKILL },
    ...form.opponents.map((o, k) => ({ team: o.team ?? k + 1, human: !!o.remote, skill: o.remote ? HUMAN_SKILL : o.skill })),
  ];
}

/** The form with these teams, seat by seat (you first). @param {SetupForm} form @param {number[]} teams */
function withTeams(form, teams) {
  return { ...form, team: teams[0], opponents: form.opponents.map((o, k) => ({ ...o, team: teams[k + 1] })) };
}

/**
 * Renumber teams in order of first appearance (you are always A), so the
 * letters stay A, B, C… with no gaps.
 * @param {SetupForm} form
 */
export function tidyTeams(form) {
  /** @type {Map<number, number>} */
  const map = new Map();
  const teams = seatsOf(form).map((s) => {
    const t = Number.isInteger(s.team) && s.team >= 0 ? s.team : map.size;
    if (!map.has(t)) map.set(t, map.size);
    return /** @type {number} */ (map.get(t));
  });
  return withTeams(form, teams);
}

/**
 * Deal seats into k teams, even in size and in skill: people first (you on
 * A), then computer players strongest first, each to the team with the
 * fewest members, then the least skill so far.
 * @param {{ human: boolean, skill: number }[]} seats @param {number} k
 */
function balanced(seats, k) {
  const teams = new Array(seats.length).fill(0);
  const size = new Array(k).fill(0);
  const power = new Array(k).fill(0);
  const order = seats.map((s, i) => i).sort((a, b) => {
    if (a === 0 || b === 0) return a === 0 ? -1 : 1;
    if (seats[a].human !== seats[b].human) return seats[a].human ? -1 : 1;
    return seats[b].skill - seats[a].skill || a - b;
  });
  for (const i of order) {
    let best = 0;
    for (let t = 1; t < k; t++) {
      if (size[t] < size[best] || (size[t] === size[best] && power[t] < power[best])) best = t;
    }
    teams[i] = best;
    size[best]++;
    power[best] += seats[i].skill;
  }
  return teams;
}

/**
 * One-tap arrangements that make sense for this many seats.
 * @param {SetupForm} form @returns {{ id: string, label: string }[]}  labels are English (look them up with t())
 */
export function presetsFor(form) {
  const seats = seatsOf(form);
  const people = seats.filter((s) => s.human).length;
  const out = [{ id: 'ffa', label: 'All against all' }];
  if (seats.length >= 3) out.push({ id: 'oneVsAll', label: 'You against all' });
  if (seats.length >= 3) out.push({ id: 'teams2', label: '2 even teams' });
  if (seats.length >= 5) out.push({ id: 'teams3', label: '3 even teams' });
  if (seats.length >= 7) out.push({ id: 'teams4', label: '4 even teams' });
  if (people >= 2 && people < seats.length) out.push({ id: 'peopleVsAi', label: 'Phones against the computer' });
  return out;
}

/**
 * The form with a preset's teams.
 * @param {SetupForm} form @param {string} id
 */
export function applyPreset(form, id) {
  const seats = seatsOf(form);
  const teams = id === 'oneVsAll' ? seats.map((_, i) => (i === 0 ? 0 : 1))
    : id === 'peopleVsAi' ? seats.map((s) => (s.human ? 0 : 1))
    : id === 'teams2' ? balanced(seats, 2)
    : id === 'teams3' ? balanced(seats, 3)
    : id === 'teams4' ? balanced(seats, 4)
    : seats.map((_, i) => i);
  return tidyTeams(withTeams(form, teams));
}

/** Which preset the form's teams match, or '' (custom). @param {SetupForm} form */
export function presetOf(form) {
  const now = JSON.stringify(seatsOf(tidyTeams(form)).map((s) => s.team));
  return presetsFor(form).find((p) => JSON.stringify(seatsOf(applyPreset(form, p.id)).map((s) => s.team)) === now)?.id ?? '';
}

/**
 * The sides of a match: each team with its seats (indices into seatsOf) and
 * total skill, in letter order.
 * @param {SetupForm} form
 * @returns {{ team: number, seats: number[], skill: number }[]}
 */
export function sidesOf(form) {
  /** @type {Map<number, { team: number, seats: number[], skill: number }>} */
  const sides = new Map();
  seatsOf(form).forEach((s, i) => {
    const side = sides.get(s.team) ?? { team: s.team, seats: [], skill: 0 };
    side.seats.push(i);
    side.skill += s.skill;
    sides.set(s.team, side);
  });
  return [...sides.values()].sort((a, b) => a.team - b.team);
}

/** Why the sides cannot fight (English, for t()), or '' when they can. @param {SetupForm} form */
export function sidesProblem(form) {
  return sidesOf(form).length < 2 ? 'Everyone is on the same team. Put at least one player on another team.' : '';
}

/**
 * The team for an opponent being added: its own team when everyone is on
 * their own (all against all); otherwise the smallest team that is not
 * yours, so a new opponent is an enemy and the sides stay even.
 * @param {SetupForm} form
 */
export function teamForNewOpponent(form) {
  const sides = sidesOf(form);
  const seats = seatsOf(form);
  if (sides.length === seats.length) return Math.max(...seats.map((s) => s.team)) + 1;
  const mine = form.team ?? 0;
  const enemies = sides.filter((s) => s.team !== mine).sort((a, b) => a.seats.length - b.seats.length || a.team - b.team);
  return enemies[0]?.team ?? mine + 1;
}

/**
 * Teams from a form saved before seats had their own team (the old
 * 'ffa' | '2v2' | 'coop' choice).
 * @param {SetupForm & { teams?: string }} form
 */
export function migrateTeams(form) {
  if (form.team !== undefined && form.opponents.every((o) => o.team !== undefined)) return form;
  const seats = seatsOf({ ...form, team: 0, opponents: form.opponents.map((o, k) => ({ ...o, team: k + 1 })) });
  const teams = form.teams === '2v2' ? seats.map((_, i) => (i < 2 ? 0 : 1))
    : form.teams === 'coop' ? seats.map((s) => (s.human ? 0 : 1))
    : seats.map((_, i) => i);
  const { teams: _old, ...rest } = form;
  return tidyTeams(withTeams(/** @type {SetupForm} */ (rest), teams));
}

/** An angle-like order round the map centre from plain arithmetic (0–4, clockwise from +x). @param {number} dx @param {number} dy */
function roundOrder(dx, dy) {
  const p = dx / ((Math.abs(dx) + Math.abs(dy)) || 1);
  return dy < 0 ? 3 + p : 1 - p;
}

/**
 * Which start each seat takes. Fixed: seat i at start i. Random: shuffled
 * with the match seed — and when there are teams, allies take neighbouring
 * starts round the map, so each side has a front and a back rather than
 * enemies wedged between friends.
 * @param {number[]} teams  team per seat
 * @param {{ x: number, y: number }[]} starts @param {{ width: number, height: number }} size
 * @param {boolean} random @param {number} seed
 * @returns {number[]}  start index per seat
 */
export function startsForSeats(teams, starts, size, random, seed) {
  const order = starts.map((_, i) => i);
  if (!random) return teams.map((_, i) => order[i]);
  const rng = createRng(`starts:${seed}`);
  const shuffle = (/** @type {number[]} */ list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const allAlone = new Set(teams).size === teams.length;
  if (allAlone) return shuffle(order).slice(0, teams.length);
  // Starts round the ring from a random one; sides in a random order, each taking the next starts.
  const cx = (size.width - 1) / 2;
  const cy = (size.height - 1) / 2;
  const ring = order.sort((a, b) => roundOrder(starts[a].x - cx, starts[a].y - cy) - roundOrder(starts[b].x - cx, starts[b].y - cy) || a - b);
  const from = rng.int(ring.length);
  const around = ring.map((_, k) => ring[(from + k) % ring.length]);
  const sides = shuffle([...new Set(teams)]);
  const out = new Array(teams.length).fill(-1);
  let next = 0;
  for (const team of sides) {
    for (const seat of shuffle(teams.map((t, i) => i).filter((i) => teams[i] === team))) out[seat] = around[next++];
  }
  return out;
}
