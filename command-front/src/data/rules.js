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
  navalAdjacency: 4,
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
  depotMineReloadSeconds: 2,
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
  mineLaySeconds: 1,
  mineCarry: 5,
  minesMaxPerPlayer: 50,
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
  infantrySpots: 5,
  /** Sub-cell spots in leptons from the cell's top-left: centre, then the four corners. */
  spotOffsets: [[128, 128], [64, 64], [192, 64], [64, 192], [192, 192]],
  tileCostBase: 100,           // EasyStar tile cost = 100 / speed%
  friendlyUnitPointCost: 5,
  iterationsPerCalculation: 4000,
  unreachableSearch: 10,
  reserveWaitSeconds: 1,
  blockedCellSeconds: 2,
  stuckRepathSeconds: 3,
  stuckIdleSeconds: 8,
  reservedCellScatterSeconds: 2,
  formationMaxSpan: 6,
  flowFieldMinUnits: 8,
  spawnSearch: 3,
  headOnBackoffSeconds: 1,
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
 * AI difficulty levels, easiest first. armyCap: most combat units it keeps
 * (it stops training at the cap); maxDefenses: most defense towers (walls not
 * counted); skipRoles: buildings it never builds; oreValueFactor: its income
 * per bale relative to a human's.
 */
export const AI = Object.freeze({
  beginner: { thinkSeconds: 3,   harvestersPerRefinery: 1, maxRefineries: 1, firstAttackSeconds: 900, waveSeconds: 420, supportPowers: 'no', engineerCapture: false, oreValueFactor: 0.6, micro: 'none',
    armyCap: 6, maxDefenses: 0, skipRoles: ['helipad', 'airfield', 'navalyard', 'tech', 'superA', 'superB', 'superC', 'superD', 'processor', 'industry', 'cloning', 'sensor'] },
  easy:   { thinkSeconds: 2,   harvestersPerRefinery: 1, maxRefineries: 1, firstAttackSeconds: 600, waveSeconds: 300, supportPowers: 'no', engineerCapture: false, oreValueFactor: 0.8, micro: 'none',
    armyCap: 12, maxDefenses: 2, skipRoles: ['tech', 'superA', 'superB', 'superC', 'superD', 'cloning'] },
  normal: { thinkSeconds: 1,   harvestersPerRefinery: 2, maxRefineries: 2, firstAttackSeconds: 360, waveSeconds: 210, supportPowers: 'yes', engineerCapture: false, oreValueFactor: 1.0, micro: 'retreat',
    armyCap: 40, maxDefenses: 8, skipRoles: [] },
  hard:   { thinkSeconds: 0.5, harvestersPerRefinery: 3, maxRefineries: 3, firstAttackSeconds: 240, waveSeconds: 150, supportPowers: 'timed', engineerCapture: true, oreValueFactor: 1.25, micro: 'full',
    armyCap: 80, maxDefenses: 12, skipRoles: [] },
  shared: {
    powerHeadroom: 1.1,
    siloAtFraction: 0.8,
    repairBelow: 0.75,
    repairMinCredits: 500,
    defenseShare: 0.25,
    defendRadius: 15,
    stagingDistance: 15,
    retreatLossFraction: 0.7,
    retreatHpFraction: 0.25,
    defenseEdgeDistance: 6,
    budgetMsPerTick: 1,
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
  difficulty: 'normal',
  teams: 'ffa',
  startingCredits: 5000,
  startingCreditsOptions: [2500, 5000, 10000],
  startingUnits: 'mcv',
  techLevel: 10,
  oreGrowthSeconds: 90,
  crates: false,
  shortGame: false,
  speed: 'normal',
  startPositions: 'random',
});
