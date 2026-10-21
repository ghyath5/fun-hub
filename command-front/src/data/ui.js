// @ts-check
/** Presentation and input constants (sections 14, 15, 18). Never read by the sim. */

export const GESTURE = Object.freeze({
  tapMs: 250,
  moveTolerancePx: 10,
  doubleTapMs: 300,
  doubleTapPx: 24,
  longPressMs: 400,
  hapticTickMs: 10,
  panFriction: 0.92,
  cycleTapMs: 600,
  minHitPx: 44,
  radialOptionPx: 48,
  radialRadiusPx: 64,
  sellConfirmMs: 2000,
});

export const CAMERA = Object.freeze({
  defaultCellsVisible: 15,
  defaultCellsVisibleSmall: 11, // a phone-sized view (under smallScreenPx tall) starts closer, so units read clearly
  smallScreenPx: 480,
  minCellsVisible: 5,          // zoomed in
  maxCellsVisible: 48,         // zoomed out (never more than the map's own height)
  zoomButtonStep: 1.4,         // the on-screen + and − buttons
  alertHistory: 5,
  glideMs: 320,                // minimap / alert / group jumps
  flingMaxPxPerMs: 4,          // inertia after a flick: top speed,
  flingDecayMs: 325,           //   how fast it eases out,
  flingStopPxPerMs: 0.02,      //   and where it stops
  flingMinPxPerMs: 0.15,       // slower releases do not fling
  velocityWindowMs: 90,        // the last moments of a drag decide the flick
  wheelZoomPerPx: 0.0016,      // mouse wheel / trackpad pinch
  keyPanPxPerS: 1100,          // arrow keys
  edgePx: 10,                  // mouse at the window edge…
  edgePanPxPerS: 1000,         //   …pans this fast
  mouseDragPx: 6,              // a right or middle drag past this pans instead of clicking
});

export const LAYOUT = Object.freeze({
  referenceWidth: 640,
  referenceHeight: 360,
  minWidth: 568,
  minHeight: 320,
  smallScale: 0.9,
  topBarPx: 32,
  sidebarFraction: 0.25,
  sidebarMinPx: 140,
  sidebarMaxPx: 220,
  sidebarCollapsedPx: 44,
  buildIconPx: 56,
  minimapPx: 112,
  minimapMinPx: 96,
  minimapMaxPx: 160,
  commandButtonPx: 44,
  groupButtonPx: 40,
  groups: 5,
  maxToasts: 3,
  toastSeconds: 3,
  panelOpacity: 0.85,
  touchTargetPx: 44,
  touchGapPx: 8,
  minTextPx: 12,
});

export const ALERTS = Object.freeze({
  structureReady: { text: 'Construction complete', throttle: 0 },
  unitReady: { text: 'Unit ready', throttle: 2 },
  insufficientFunds: { text: 'Insufficient funds', throttle: 10 },
  lowPower: { text: 'Low power', throttle: 15 },
  silosNeeded: { text: 'Silos needed', throttle: 20 },
  baseUnderAttack: { text: 'Base under attack', throttle: 10, areaCells: 10 },
  harvesterUnderAttack: { text: 'Harvester under attack', throttle: 15 },
  unitLost: { text: 'Unit lost', throttle: 3 },
  structureLost: { text: 'Structure lost', throttle: 0 },
  structureCaptured: { text: 'Structure captured', throttle: 0 },
  missileLaunch: { text: 'Missile launch detected', throttle: 0 },
  stormDetected: { text: 'Lightning storm detected', throttle: 0 },
  oreDepleted: { text: 'Ore depleted: harvesters wait for the mines to regrow it', throttle: 0 },
  noRefinery: { text: 'No refinery', throttle: 0 },
  placementFailed: { text: 'Cannot build there', throttle: 1 },
  cannotDeploy: { text: 'Cannot deploy here', throttle: 1 },
  powerReady: { text: 'Support power ready', throttle: 0 },
  structureSold: { text: 'Structure sold', throttle: 0 },
  unitsLost: { text: 'Units lost', throttle: 3 },
  mineExploded: { text: 'Mine detonated', throttle: 5 },
});

export const AUDIO = Object.freeze({
  maxWeaponSounds: 8,
  offscreenVolume: 0.3,
  ackThrottleSeconds: 0.5,
  hapticBaseAttackMs: 30,
  hapticReadyMs: 10,
});

export const PERF = Object.freeze({
  dprCap: 2,
  dprCapLowEnd: 1.5,
  benchmarkSeconds: 2,
  slowFrameMs: 20,
  slowFrameWindowSeconds: 3,
});
