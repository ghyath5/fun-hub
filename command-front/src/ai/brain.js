// @ts-check
/**
 * AI brain (section 16): one per computer player. It plays by the human's
 * rules — it only issues Commands, sees through its own shroud and pays for
 * everything — and keeps its memory in plain data on the world (`w.ai`), so
 * saves and replays hold it.
 *
 * It plays like a person of its skill. It looks at the battlefield every
 * so often (its reaction time) and can only handle so many jobs in one look
 * (its attention): pressing jobs first — a fight, a base under attack, a
 * building waiting to be placed — then the rest in turn. A green player in a
 * fight forgets its base; an expert does everything every look. Each match
 * it also picks a playstyle at random, which its skill then plays well or
 * badly.
 */
import { AI_STYLES } from '../data/rules.js';
import { ticks } from '../core/fixed.js';
import { skillProfile } from './skill.js';
import { seedFrom, pickOne, jitter } from './dice.js';
import { updateIntel } from './intel.js';
import { manageBase, manageRepairs, manageYard } from './base.js';
import { manageProduction, chooseFavourites } from './production.js';
import { keepHomeGuard, senseThreat, defend, campaign, raids, scouting, micro, captures, airStrikes, powers, fleet, lastStand } from './army.js';
import { armyOf, fightValueOf } from './common.js';

/** @typedef {import('../sim/world.js').World} World */

/** Bumped when the brain's memory changes shape: older brains (from saves) start afresh. */
export const AI_STATE_VERSION = 3;

const STYLE_IDS = /** @type {(keyof typeof AI_STYLES)[]} */ (Object.keys(AI_STYLES));

/** A fresh brain. @param {World} w @param {number} pid @param {number} skill */
export function createAiState(w, pid, skill) {
  const ai = {
    v: AI_STATE_VERSION,
    pid,
    skill,
    /** Its own dice (dice.js). */
    dice: seedFrom(`${w.seed}:ai:${pid}`),
    /** Playstyle for this match (AI_STYLES). @type {keyof typeof AI_STYLES} */
    style: 'balanced',
    /** A green player's favourite units. @type {string[]} */
    favourites: [],
    /** Enemy structures as last seen. @type {import('./intel.js').KnownStructure[]} */
    known: [],
    /** Enemy units as last seen. @type {import('./intel.js').Sighting[]} */
    seen: [],
    /** The enemy army's believed value over the last minute. @type {{ at: number, value: number }[]} */
    foeLog: [],
    /** HP of own buildings and Harvesters at the last look (attacks show up as drops). @type {Record<string, number>} */
    hp: {},
    /** Home guard unit ids. @type {number[]} */
    defense: [],
    /** The attack in progress. @type {any} */
    wave: null,
    /** The raid in progress. @type {any} */
    raid: null,
    waveCount: 0,
    nextWaveAt: 0,
    lastWaveEnd: 0,
    nextRaidAt: ticks(180),
    scouted: false,
    scoutId: 0,
    nextScoutAt: 0,
    scoutCursor: 0,
    lastStand: false,
    /** Does water link our base to an enemy's (naval build steps)? null = not worked out yet. @type {boolean | null} */
    naval: null,
    /** No room for a naval yard by the water yet: naval steps wait until this tick, so the rest of the build order goes on. */
    navalRetryAt: 0,
    /** Where the base was last hit (planes strike there first), or null. @type {{x: number, y: number} | null} */
    threatAt: null,
    /** Earliest tick for the next timed air strike. */
    nextStrike: 0,
    /** Tick from which each build line may start its next item (its hesitation); 0 = not decided. */
    buildAt: { structures: 0, defenses: 0 },
    /** Tick at which a finished building on each line gets placed (its hands); 0 = not decided. */
    placeAt: { structures: 0, defenses: 0 },
    /** Tick at which an MCV gets unfolded; 0 = not decided. */
    deployAt: 0,
    /** When each Harvester was last sent running from an attack. @type {Record<string, number>} */
    fled: {},
    /** Last tick it sold a building to pay for a refinery. */
    soldAt: 0,
    /** When a support power became ready. @type {Record<string, number>} */
    readySince: {},
    nextThinkAt: 1 + pid * 3,
    /** Where the round of non-pressing jobs carries on next look. */
    jobCursor: 0,
    /** Grows after attacks that worked and shrinks after ones that failed (scales the edge it wants). */
    confidence: 1,
    /** Failed attacks per approach side (DIR8 index). */
    failedDirs: [0, 0, 0, 0, 0, 0, 0, 0],
    /** Counters for the bench and tests. @type {Record<string, number>} */
    stats: {},
  };
  ai.style = pickOne(ai, STYLE_IDS);
  ai.favourites = chooseFavourites(ai, w.players[pid].faction);
  return ai;
}

/** @typedef {ReturnType<typeof createAiState>} AiState */

/**
 * Run as many jobs as its attention allows: pressing ones first, in order,
 * then the others in turn from where the last look left off.
 * @param {AiState} ai @param {number} attention @param {[boolean, () => void][]} jobs  [pressing, run]
 */
function attend(ai, attention, jobs) {
  let budget = Math.max(1, Math.round(attention));
  if (budget >= jobs.length) { for (const [, run] of jobs) run(); return; }
  for (const [pressing, run] of jobs) {
    if (!budget) return;
    if (pressing) { run(); budget--; }
  }
  const rest = jobs.filter(([pressing]) => !pressing);
  const ran = Math.min(budget, rest.length);
  for (let k = 0; k < ran; k++) rest[(ai.jobCursor + k) % rest.length][1]();
  if (rest.length) ai.jobCursor = (ai.jobCursor + ran) % rest.length;
}

/** One look at the battlefield for one computer player. @param {World} w @param {AiState} ai */
export function think(w, ai) {
  const p = w.players[ai.pid];
  if (!p.alive) return;
  const cfg = skillProfile(ai.skill);
  const style = AI_STYLES[ai.style];
  updateIntel(w, ai, cfg);
  if (manageYard(w, ai, cfg)) { lastStand(w, ai, cfg); return; }
  const army = armyOf(w, ai.pid);
  const threat = senseThreat(w, ai, cfg);
  keepHomeGuard(w, ai, style, army);
  const placing = !!(p.lines.structures?.ready || p.lines.defenses?.ready);
  attend(ai, cfg.attention, [
    [!!threat.at || threat.harvesters.length > 0, () => defend(w, ai, cfg, army, threat)],
    [!!ai.wave, () => campaign(w, ai, cfg, style, army)],
    [placing, () => manageBase(w, ai, cfg, style, fightValueOf(army))],
    [false, () => manageProduction(w, ai, cfg, style, army)],
    [ai.wave?.stage === 'attack' && cfg.focusFire >= 0.3, () => micro(w, ai, cfg, army)],
    [!!ai.raid, () => raids(w, ai, cfg, style, army)],
    [false, () => scouting(w, ai, cfg, army)],
    [false, () => { airStrikes(w, ai, cfg, army); powers(w, ai, cfg, army); }],
    [false, () => { manageRepairs(w, ai, cfg); captures(w, ai, cfg); fleet(w, ai, cfg); }],
  ]);
}

/** Ticks until its next look: its reaction time, give or take a quarter. @param {AiState} ai */
export const nextLook = (ai) => Math.max(1, ticks(jitter(ai, skillProfile(ai.skill).thinkSeconds, 0.25)));
