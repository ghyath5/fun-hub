// @ts-check
/**
 * Every rule constant that is not a per-object table (sections 3–13, 16, 18, 19).
 * Durations are seconds at Normal speed, distances cells, money credits.
 * Systems read these; nothing in src/sim/ hard-codes a number from the spec.
 */

export const SIM = Object.freeze({
  ticksPerSecond: 15,          // Normal speed; every duration in data is seconds at this rate
  leptonsPerCell: 256,
  facings: 256,
  facingTolerance: 8,          // must face next cell / target within ±8
  maxCatchUpTicks: 4,          // per rendered frame (more at the fastest speeds: ticks per second / 20)
  hashEveryTicks: 60,
});

export const GAME_SPEEDS = Object.freeze({
  slow: { name: 'Slow', ticksPerSecond: 10 },
  normal: { name: 'Normal', ticksPerSecond: 15 },
  fast: { name: 'Fast', ticksPerSecond: 20 },
  fastest: { name: 'Fastest', ticksPerSecond: 30 },
  veryFast: { name: 'Very fast', ticksPerSecond: 45 },
  superFast: { name: 'Super fast', ticksPerSecond: 75 },
});

export const RENDER = Object.freeze({
  cellPx: 24,                  // one cell at zoom 1.0
  chunkPx: 512,
  atlasMaxPx: 2048,
});

export const ECONOMY = Object.freeze({
  oreBaleValue: 25,
  gemBaleValue: 50,
  oreCellMax: 12,
  gemCellMax: 4,
  harvesterCapacity: 28,
  harvestSecondsPerBale: 10 / 15,
  unloadSecondsPerBale: 3 / 15,
  oreGrowthSeconds: 90,
  oreGrowthOptions: [0, 60, 90, 120],  // 0 = off
  spreadMinBales: 9,
  spreadCapAbsolute: 30,
  spreadCapFraction: 0.02,
  // Ore and gem mines: every mineSeconds each mine adds bales to random cells
  // within mineRadius (Chebyshev), so a field never runs dry for good.
  // Off when ore regrowth is off.
  mineSeconds: 10,
  mineRadius: 3,
  minePulseBales: { ore: 6, gem: 2 },
  mineClump: { ore: 3, gem: 2 },       // most bales one cell gets per pulse
  silosNeededFraction: 0.9,
  // Harvester search (section 5)
  seekLocalRadius: 20,
  gemPreference: 4,
  preferNearLast: 6,
  nextCellRadius: 3,
  refineryDetourCells: 10,
  dockQueueRadius: 3,
  freeHarvesterSpawnRadius: 3,
  // Coalition harvesters reappear on the refinery dock when full (Red Alert
  // 2's Chrono Miner) — from at least chronoMinCells away — and carry less
  // to make up for it.
  chronoCapacity: 20,
  chronoMinCells: 6,
});

/** What the support buildings do (sim/bonuses.js). */
export const BONUSES = Object.freeze({
  processorOreFactor: 1.25,     // Ore Processor: harvested ore and gems are worth 25% more
  industryCostFactor: 0.75,     // Industrial Plant: vehicles, aircraft and ships cost 25% less
  industryLines: ['vehicles', 'aircraft', 'naval'],
  noClone: ['engineer', 'spy', 'thief', 'commando', 'hound'], // Clone Lab copies every other infantry unit
});

export const POWER = Object.freeze({
  lowPowerBelow: 1,            // r < 1 is low power
  minProductionFactor: 0.25,
  warningBelow: 1.1,
  disabledAtLowPower: ['radar', 'arcTower', 'beamTower', 'longGun', 'sensorArray', 'shroudGenerator', 'aaGun', 'samSite', 'supportCharging'],
});

export const PRODUCTION = Object.freeze({
  secondsPer1000: 40,
  secondsPer1000Classic: 48,
  bonusPerExtraFactory: 0.4,
  bonusMaxFactories: 4,
  minBuildSeconds: 2,
  queueMax: 50,
  lineOrder: ['structures', 'defenses', 'infantry', 'vehicles', 'aircraft', 'naval'],
  cancelRefund: 1,
  exitBlockedSwitchSeconds: 3,
  buildUpSeconds: 1.5,
});

export const PLACEMENT = Object.freeze({
  adjacency: 2,                // Chebyshev distance to an own completed non-wall structure
  /** Naval yards reach further: a base's 12×12 build area keeps the coast a few cells off, so a yard by the shore is in reach of the Construction Yard itself. */
  navalAdjacency: 7,
  clearWaitSeconds: 2,
  wallMaxCells: 20,
  mcvDeploySeconds: 2,
  mcvFootprint: 3,
  invalidFlashSeconds: 1,
});

export const SELL = Object.freeze({
  seconds: 1.5,
  refundFraction: 0.5,
  survivorCostDivisor: 400,
  survivorMax: 5,
  engineerCostThreshold: 1500,
  destroyedSurvivorFactor: 0.5,
  destroyedSurvivorHpFraction: 0.5,
});

export const REPAIR = Object.freeze({
  stepSeconds: 1,
  hpFractionPerStep: 0.02,
  costFractionPerStep: 0.005,
  depotHpFractionPerSecond: 0.05,
  depotCostFractionPerStep: 0.0125,
  padHpFractionPerSecond: 0.02,
  padRearmSeconds: 1,
});

export const COMBAT = Object.freeze({
  splashEdgeFalloff: 0.25,
  proneSeconds: 3,
  proneDamageFactor: 0.5,
  proneSpeedFactor: 0.5,
  guardLeash: 8,
  scanSeconds: 0.5,
  scanStagger: 8,
  titanSelfRepairBelow: 0.5,
  titanSelfRepairPerSecond: 0.01,
  healthGreenAbove: 0.5,
  healthAmberAbove: 0.25,
  // Target acquisition score (section 9), in cells of distance each factor is worth:
  //   inRange     something the unit can shoot right now beats chasing a "better" one
  //   wounded     finish what is nearly dead (× the share of HP it has lost)
  //   focus       join allies already firing at it (per ally, up to focusMax) …
  //   overkill    … unless they will kill it anyway (their damage ≥ its HP × overkillAt)
  //   attackingMe answer whoever is shooting at this unit
  score: {
    canDamageMe: 6, multiplierWeight: 3, structurePenalty: 4, uselessPenalty: 10, uselessBelow: 0.1, stickiness: 3,
    inRange: 6, wounded: 3, focus: 0.8, focusMax: 3, overkill: 4, overkillAt: 1.3, attackingMe: 2,
  },
});

export const SPECIALS = Object.freeze({
  engineerCaptureAtOrBelow: 0.25,
  engineerDamageFraction: 0.33,
  spyIntelSeconds: 180,
  sonarPulseSeconds: 30,
  spyRevealRadius: 10,
  houndSpyDetect: 5,
  thiefStealFraction: 0.5,
  c4PlantSeconds: 1,
  c4FuseSeconds: 3,
  houndLeapRange: 2,
  houndLeapSeconds: 0.4,
  medicSight: 3,
  mineLaySeconds: 0.6,
  /** Credits each mine costs as it goes down; a Mine Layer carries no load and lays for as long as the money lasts. */
  mineCost: 25,
  /** No cap on the mines a player may have down (Infinity). */
  minesMaxPerPlayer: Infinity,
});

/**
 * Terror Drones (Red Alert 2): a drone that lands on an enemy ground vehicle
 * climbs inside and shreds it from within — chewDamage every chewSeconds, so
 * a Heavy Tank lasts about 6 s — until the vehicle dies or a Service Depot
 * cuts the drone out.
 */
export const DRONE = Object.freeze({
  chewDamage: 20,
  chewSeconds: 0.25,
});

export const TRANSPORT = Object.freeze({
  capacity: 5,
  loadGiveUpSeconds: 10,
  unloadSecondsEach: 0.3,
  heliLandSearch: 3,
  ejectDamageFraction: 0.5,
  bigSlots: 2,                 // Titan, Harvester, MCV in a naval transport
});

export const AIRCRAFT = Object.freeze({
  planeCircleSeconds: 12,       // a plane sent somewhere circles there this long, then flies home
  orphanPlaneCrashSeconds: 60,
  planeTurnRate: 8,             // facing units per tick: planes bank round in arcs, never on the spot
  heliAlignBefore: 24,          // helicopters turn on the spot until within this of their heading, then fly
  hoverSpacing: 176,            // leptons: hovering aircraft closer than this drift apart (never stacked)
  hoverPush: 6,                 // ...by up to this much a tick each
  planeHuntCells: 2,            // a circling plane with ammo attacks enemies this far beyond its sight
  planeRetargetCells: 4,        // its target gone, a plane with ammo left strikes another this close to it
});

export const SUBMARINE = Object.freeze({
  surfaceSeconds: 1,
  submergeSeconds: 1,
  submergeDelaySeconds: 4,
  destroyerDetect: 4,
});

export const SUPPORT_POWERS = Object.freeze({
  spyPlane:        { id: 'spyPlane', name: 'Spy Plane', faction: 'union', chargeSeconds: 180, oneUse: false, target: 'cell', revealRadius: 10 },
  paradrop:        { id: 'paradrop', name: 'Paradrop', faction: 'union', chargeSeconds: 360, oneUse: false, target: 'exploredLand', unit: 'rifleman', count: 5 },
  satelliteUplink: { id: 'satelliteUplink', name: 'Satellite Uplink', faction: 'coalition', chargeSeconds: 480, oneUse: true, target: 'none' },
  phaseShift:      { id: 'phaseShift', name: 'Phase Shift', faction: 'coalition', chargeSeconds: 420, oneUse: false, target: 'ownVehicleThenCell', fallbackRadius: 3 },
  aegisField:      { id: 'aegisField', name: 'Aegis Field', faction: 'union', chargeSeconds: 660, oneUse: false, target: 'vehicleOrStructure', durationSeconds: 45 },
  lightningStorm:  { id: 'lightningStorm', name: 'Lightning Storm', faction: 'coalition', chargeSeconds: 720, oneUse: false, target: 'anyCell', durationSeconds: 14, boltEverySeconds: 0.35, radius: 5, delaySeconds: 3 },
  atomicStrike:    { id: 'atomicStrike', name: 'Atomic Strike', faction: 'union', chargeSeconds: 780, oneUse: false, target: 'anyCell', flightSeconds: 6, damage: 1000, warhead: 'HE', splash: 3 },
});

export const SHROUD = Object.freeze({
  startRevealRadius: 10,
  updateEveryTicks: 4,
  generatorRadius: 10,
  generatorEverySeconds: 2,
  camoRevealRadius: 2,
  camoRevealAfterFireSeconds: 3,
});

export const MOVEMENT = Object.freeze({
  /** Infantry per cell, as in Red Alert 2: three, far enough apart that soldiers never overlap. */
  infantrySpots: 3,
  /**
   * Sub-cell spots in leptons from the cell's top-left. No two share a row,
   * a column or a diagonal (even across cells), so soldiers walking their
   * lanes in any of the 8 directions never pass through one another; at rest
   * they stand ~0.43 cell apart.
   */
  spotOffsets: [[56, 76], [96, 180], [200, 132]],
  /** A vehicle's (and an aircraft's) point in its cell. */
  cellCentre: [128, 128],
  /**
   * A soldier picks a spot whose walk stays this far from the others'
   * centres when one is free, leptons (a cell is 256); he never waits for
   * one, so crowds and narrow passes keep flowing.
   */
  infantryClearance: 44,
  tileCostBase: 100,           // EasyStar tile cost = 100 / speed%
  friendlyUnitPointCost: 5,
  iterationsPerCalculation: 4000,
  unreachableSearch: 10,
  reserveWaitSeconds: 1,
  sidestepAfterSeconds: 0.33,  // blocked by a friend on the move: keep right round him after this
  sidestepAgainSeconds: 1,
  sidestepMax: 6,              // dodges per order at most
  blockedCellSeconds: 2,
  stuckRepathSeconds: 3,
  stuckIdleSeconds: 8,
  reservedCellScatterSeconds: 2,
  formationMaxSpan: 6,
  flowFieldMinUnits: 8,
  spawnSearch: 3,
  headOnBackoffSeconds: 1,
  squeezePastSeconds: 1.5,     // two friends nose to nose with no way round squeeze past each other after this
});

export const LIMITS = Object.freeze({
  unitsPerPlayer: 300,
});

export const VICTORY = Object.freeze({
  autosaveSeconds: 120,
  manualSlots: 3,
  saveFormatVersion: 1,
});

export const CRATES = Object.freeze({
  everySeconds: 120,
  maxOnMap: 3,
  effects: [
    { id: 'cash', weight: 35, min: 500, max: 2000 },
    { id: 'unit', weight: 15 },
    { id: 'heal', weight: 15, radius: 5 },
    { id: 'reveal', weight: 10 },
    { id: 'armor', weight: 10, factor: 1.5 },
    { id: 'speed', weight: 10, factor: 1.5 },
    { id: 'explode', weight: 5, damage: 200, warhead: 'HE', splash: 1.5 },
  ],
});

/** Lowest tech level at which each role appears (section 7). Items take the max over their own role and requirements. */
export const TECH_LEVEL_OF_ROLE = Object.freeze({
  yard: 1, power: 1, refinery: 1, silo: 1, barracks: 1, kennel: 1, wall: 1, defense: 1,
  factory: 3,
  radar: 5, navalyard: 5,
  depot: 7, helipad: 7, airfield: 7,
  tech: 9,
  superA: 10, superB: 10, superC: 10, superD: 10,
  sensor: 5, processor: 7, industry: 7, cloning: 9,
});
export const SUPPORT_POWER_TECH_LEVEL = 10;

/**
 * Computer players (section 16). Every level plays by the human's rules: the
 * same income per ore load, the same tech, the same units and the same fog.
 * The 0–10 skill slider changes only how well it plays — like a person's
 * experience. Each AI_SKILL entry is its value at skill 0, 5 and 10; levels in
 * between are interpolated (ai/skill.js). Entries named "…Sense" are 0–1.
 */
export const AI_SKILL = Object.freeze({
  // Perception and attention
  thinkSeconds:          [2.5, 1.2, 0.6],   // reaction time: seconds between looks at the battlefield
  attention:             [2, 4, 9],         // jobs it can handle in one look (base, army, scouting, …)
  placeSeconds:          [8, 4, 2],         // hands: seconds to place a finished building or unfold an MCV, like tapping it into place
  // Economy
  buildHesitation:       [14, 4, 1.5],      // seconds before it starts the next building (opening the menu and picking it)
  buildMistakes:         [0.35, 0.1, 0],    // chance to build something out of order
  productionGaps:        [0.45, 0.12, 0],   // chance to leave a factory idle on a look
  harvesters:            [2, 4, 8],         // Harvesters it keeps working (at most three per refinery)
  earlyGuard:            [8, 4, 3],         // units it trains while setting up its economy (more delays the economy)
  refineries:            [1, 2, 3],
  oreSense:              [0, 0.5, 1],       // ≥ 0.5: new refineries go next to the ore
  powerHeadroom:         [0.95, 1.05, 1.15], // < 1: notices power only once it runs short
  siloAt:                [1.01, 0.9, 0.8],  // storage share that prompts a silo (> 1: never)
  repairBelow:           [0.35, 0.6, 0.75],
  // Information
  scoutSeconds:          [0, 240, 150],     // seconds between scouting runs (0: never after the first look)
  memorySeconds:         [20, 90, 240],     // how long it remembers enemy units it saw
  judgmentError:         [0.5, 0.25, 0.1],  // ± share it misjudges strength by
  // Strategy
  attackAdvantage:       [0, 1, 1.3],       // its power over the enemy's it wants before attacking
  minWave:               [3, 5, 6],         // fewest units it attacks with
  patienceSeconds:       [60, 150, 180],    // how long it waits for an edge before it grows impatient
  windowSense:           [0, 0.5, 1],       // notices openings: the enemy army away, or just beaten
  targetSense:           [0, 0.5, 1],       // 0: nearest building; 1: economy and production, around the guns
  routeSense:            [0, 0.5, 1],       // 0: straight line; 1: the safest side, with a feint
  raidSense:             [0, 0.2, 0.7],     // small raids on lightly guarded Harvesters and refineries
  counterSense:          [0, 0.5, 0.8],     // builds what beats the enemy's army instead of favourites
  recallSense:           [0, 0.5, 1],       // brings the army home when the base is in real danger
  defendRadius:          [10, 15, 22],      // cells round the base it keeps an eye on
  learning:              [0, 0.4, 1],       // remembers what failed in this match (routes, confidence)
  // Battle
  retreatRatio:          [0, 0.4, 0.5],     // pulls out when its side of a fight drops below this
  retreatLoss:           [0.9, 0.75, 0.65], // … or once an attack has lost this share of its value, unless it is clearly winning
  regroup:               [0.2, 1, 1],       // ≥ 0.5: reinforcements gather and join as a group
  focusFire:             [0, 0.5, 1],
  pullBackHp:            [0, 0.25, 0.4],    // damaged vehicles go for repairs below this health
  harvesterCare:         [0, 0.6, 1],       // loaded Harvesters under fire run for the refinery
  captureSense:          [0, 0.3, 1],       // ≥ 0.6: Engineers take damaged buildings near the front
  powerTiming:           [0, 0.5, 1],       // 0: fires superweapons at once; 1: at the best target, with an attack
});

/** Names of the skill levels, 0–10. */
export const AI_SKILL_NAMES = Object.freeze([
  'Recruit', 'Rookie', 'Novice', 'Casual', 'Regular', 'Skilled', 'Experienced', 'Veteran', 'Expert', 'Elite', 'Commander',
]);

/** Saves and settings from before the slider: their difficulty as a skill. */
export const LEGACY_SKILL = Object.freeze({ beginner: 1, easy: 3, normal: 5, hard: 8 });

/**
 * Playstyles: each computer player picks one at random when the match starts
 * (skill decides how well it plays it). aggression divides the advantage it
 * wants; waveSize and patience scale its attacks; defenses: towers it builds;
 * homeGuard: share of the army kept at home; raids and fast scale raiding and
 * fast units in its production.
 */
export const AI_STYLES = Object.freeze({
  balanced: { aggression: 1,    waveSize: 1,   patience: 1,   defenses: 6,  homeGuard: 0.2,  raids: 1,   fast: 1 },
  rusher:   { aggression: 1.35, waveSize: 0.7, patience: 0.6, defenses: 2,  homeGuard: 0.1,  raids: 1,   fast: 1.3 },
  turtle:   { aggression: 0.8,  waveSize: 1.5, patience: 1.7, defenses: 12, homeGuard: 0.35, raids: 0.5, fast: 0.8 },
  raider:   { aggression: 1,    waveSize: 1,   patience: 1,   defenses: 4,  homeGuard: 0.2,  raids: 2.5, fast: 1.6 },
});

/** Rules every computer player shares, whatever its skill. */
export const AI = Object.freeze({
  shared: {
    armyMax: 80,              // most combat units it keeps (phone performance; the same at every level)
    fleetSize: 4,             // warships it keeps when water links its base to an enemy's
    repairMinCredits: 500,
    stagingDistance: 15,
    defenseEdgeDistance: 6,
    gatherSeconds: 20,        // longest an attack waits at its staging point for stragglers
    feintLeadSeconds: 8,      // how long a feint fights before the main attack goes in
    regroupSeconds: 25,       // pause after an attack ends before the next is considered
    techArmyShare: 0.75,      // a building costing 1000+ (not one that makes money or units) waits until the army is worth this × its price, or the money is there
    raidSeconds: 150,         // average gap between raids at raid sense 1
  },
});

/** "MCV + 2 light vehicles + 4 Riflemen" starting option (section 18), per faction. */
export const STARTING_FORCE = Object.freeze({
  mcv: { coalition: ['mcv'], union: ['mcv'] },
  force: {
    coalition: ['mcv', 'lightTank', 'ranger', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
    union: ['mcv', 'heavyTank', 'heavyTank', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
  },
});

export const SETUP_DEFAULTS = Object.freeze({
  map: 'generated',
  opponents: 1,
  skill: 5,
  teams: 'ffa',
  startingCredits: 5000,
  startingCreditsOptions: [2500, 5000, 10000],
  startingUnits: 'mcv',
  techLevel: 10,
  oreGrowthSeconds: 90,
  fog: false,              // Fog of war (optional): explored ground out of sight dims and hides what moves there
  crates: false,
  shortGame: false,
  speed: 'normal',
  startPositions: 'random',
});
