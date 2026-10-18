// @ts-check
/**
 * Players: identity, alliance, wallet, power and per-player match state.
 * Everything here is plain data so it saves and hashes like the rest of the sim.
 */

/**
 * @typedef {object} PowerState
 * @property {number} produced
 * @property {number} drain
 * @property {number} ratioK     Produced / drain in thousandths (1000 when nothing drains)
 * @property {boolean} low
 * @property {boolean} warning
 */

/**
 * @typedef {object} Player
 * @property {number} id
 * @property {import('../types.js').FactionId} faction
 * @property {string} color      Key of PLAYER_COLORS
 * @property {number} team
 * @property {boolean} human
 * @property {string} difficulty beginner | easy | normal | hard (AI players)
 * @property {number} start      Index into map.starts
 * @property {boolean} alive
 * @property {number} cash       Unlimited: starting credits, refunds, stolen money, crates
 * @property {number} stored     Harvested ore, capped by storage
 * @property {number} capacity   Storage of active refineries and silos
 * @property {number} spendMilli Thousandths of a credit owed by production, not yet charged
 * @property {PowerState} power
 * @property {boolean} powerDirty
 * @property {Record<string, any>} lines    Production lines (milestone 5)
 * @property {Record<string, any>} powers   Support-power charge state (milestone 6)
 * @property {Record<string, number>} flags Once-only alert latches and intel timers
 * @property {Record<string, number>} stats End-screen counters
 * @property {number} [oreValueK]  Ore value factor in thousandths (Hard AI: 1250)
 * @property {number} [eliminatedAt]
 */

/**
 * @param {{ faction: import('../types.js').FactionId, color: string, team?: number, human?: boolean, start: number, difficulty?: string }[]} specs
 * @param {number} [startingCredits]
 * @returns {Player[]}
 */
export function createPlayers(specs, startingCredits = 0) {
  return specs.map((s, id) => ({
    id,
    faction: s.faction,
    color: s.color,
    team: s.team ?? id,
    human: !!s.human,
    difficulty: s.difficulty ?? 'normal',
    start: s.start,
    alive: true,
    cash: startingCredits,
    stored: 0,
    capacity: 0,
    spendMilli: 0,
    power: { produced: 0, drain: 0, ratioK: 1000, low: false, warning: false },
    powerDirty: true,
    lines: {},
    powers: {},
    flags: {},
    stats: {
      unitsBuilt: 0, unitsLost: 0, unitsKilled: 0,
      structuresBuilt: 0, structuresLost: 0, creditsHarvested: 0,
    },
  }));
}

/** Same player or same team. @param {Player[]} players @param {number} a @param {number} b */
export const allied = (players, a, b) => a >= 0 && b >= 0 && (a === b || players[a].team === players[b].team);

/** Credits shown on the HUD: cash + stored ore. @param {Player} p */
export const credits = (p) => p.cash + p.stored;
