// What the studio renders. Units: `r` is the half-side of the square sprite
// and `size` the model's longest ground extent, in cells; a turret is either
// named nodes (`turret`) or a region cut out of the model (`split`).
// Structures: `w` × `h` footprint in cells; `skin` makes it the look of one
// faction only (atlas key `<id>@<faction>`). `team` picks the pixels that take
// the player colour (hue in degrees ± tol, min saturation); `team3d`, when
// given, replaces it for the 3D model (export.mjs), whose texels are unlit.
// Sources: glb/<file> (not committed — the 3D files are large) or a
// procedural model from models.js.

const RED = { hue: 0, tol: 18, sat: 0.42, val: 0.18 };
const BLUE = { hue: 218, tol: 22, sat: 0.3, val: 0.2 };

export const JOBS = [
  // ── GLB units ──────────────────────────────────────────────
  { id: 'titanTank', kind: 'unit', src: 'apocalypse.glb', rot: [0, -90, 0], r: 0.65, size: 1.2, split: { above: 0.34, box: [0.2, 0.8, 0, 0.66] }, pivot: [0.5, 0.5], team: [RED, { neutral: { maxSat: 0.34, minVal: 0.42 } }], team3d: RED, look3d: { desaturate: 0.85 } },
  { id: 'rotaryTank', kind: 'unit', src: 'lowpoly_gatling_tank_-_rocket.glb', rot: [0, 0, 0], r: 0.48, size: 0.9, split: { above: 0.55 }, team: { neutral: { maxSat: 0.12, minVal: 0.62 } } },
  { id: 'ifv', kind: 'unit', src: 'ifv_vehicle_red_alert_2.glb', rot: [0, 0, 0], r: 0.45, size: 0.85, hide: ['^Object_2$'], split: { above: 0.6 }, team: BLUE },
  { id: 'ballisticLauncher', kind: 'unit', src: 'red_alert_2_-__soviet_v3_rocket_launcher.glb', rot: [0, 0, 0], r: 0.55, size: 1.05, team: RED },

  // ── GLB structures ─────────────────────────────────────────
  { id: 'arcTower', kind: 'structure', src: 'red_alert_2_-_soviet_tesla_coil.glb', w: 1, h: 1, team: RED },
  { id: 'beamTower', kind: 'structure', src: 'red_alert_2_-_allied_prism_tower.glb', w: 1, h: 1, team: BLUE },
  { id: 'sentryGun', kind: 'structure', src: 'red_alert_2_-_soviet_sentry_gun.glb', w: 1, h: 1, team: RED },
  { id: 'aegisProjector', kind: 'structure', src: 'iron_curtain_red_alert_2.glb', w: 2, h: 2, team: RED },
  { id: 'sensorArray', kind: 'structure', src: 'psi_beacon.glb', w: 1, h: 1, team: RED },
  { id: 'powerPlant@union', kind: 'structure', src: 'red_alert_2_-_soviet_tesla_reactor.glb', rot: [0, 90, 0], w: 2, h: 2, fill: 1.08, team: RED },
  { id: 'refinery@union', kind: 'structure', src: 'red_alert_2_russia_ore_refinery.glb', w: 3, h: 3, team: RED },
  { id: 'techCenter@union', kind: 'structure', src: 'lunar_command_base_yuris_revenge.glb', w: 2, h: 2, fill: 0.98, look: { set: '#7f8892', metalness: 0.5, roughness: 0.45 }, team: { neutral: { maxSat: 0.06, minVal: 0.8 } } },

  // ── Procedural units (models.js) ───────────────────────────
  { id: 'tankDestroyer', kind: 'unit', proc: 'tankDestroyer', r: 0.5, size: 0.94, team: RED },
  { id: 'mirageTank', kind: 'unit', proc: 'mirageTank', r: 0.48, size: 0.86, turret: ['^turret$'], team: RED },
  { id: 'robotTank', kind: 'unit', proc: 'robotTank', r: 0.45, size: 0.8, turret: ['^turret$'], team: RED },
  { id: 'battleFortress', kind: 'unit', proc: 'battleFortress', r: 0.72, size: 1.32, turret: ['^turret$'], pivot: [0.5, 0.5], team: RED },
  { id: 'terrorDrone', kind: 'unit', proc: 'terrorDrone', r: 0.26, size: 0.44, team: RED },
  { id: 'demoTruck', kind: 'unit', proc: 'demoTruck', r: 0.5, size: 0.92, team: RED },
  { id: 'siegeChopper', kind: 'unit', proc: 'siegeChopper', r: 0.64, size: 1.24, rotors: [{ node: 'rotor0', r: 0.64 }], team: RED },
  { id: 'migFighter', kind: 'unit', proc: 'migFighter', r: 0.56, size: 1.04, team: RED },
  { id: 'migInterceptor', kind: 'unit', proc: 'migInterceptor', r: 0.56, size: 1.06, team: RED },
  { id: 'migBomber', kind: 'unit', proc: 'migBomber', r: 0.66, size: 1.24, team: RED },
  { id: 'harrier', kind: 'unit', proc: 'harrier', r: 0.54, size: 0.98, team: RED },
  { id: 'eagleJet', kind: 'unit', proc: 'eagleJet', r: 0.56, size: 1.04, team: RED },
  { id: 'seal', kind: 'unit', proc: 'seal', r: 0.28, size: 0.44, team: RED },
  { id: 'chronoTrooper', kind: 'unit', proc: 'chronoTrooper', r: 0.28, size: 0.46, team: RED },
  { id: 'rocketeer', kind: 'unit', proc: 'rocketeer', r: 0.3, size: 0.5, team: RED },
  { id: 'desolator', kind: 'unit', proc: 'desolator', r: 0.28, size: 0.48, team: RED },
  { id: 'ivan', kind: 'unit', proc: 'ivan', r: 0.28, size: 0.42, team: RED },
  { id: 'psiCommander', kind: 'unit', proc: 'psiCommander', r: 0.28, size: 0.4, team: RED },
  { id: 'hero', kind: 'unit', proc: 'hero', r: 0.28, size: 0.46, team: RED },

  // ── Procedural structures ──────────────────────────────────
  { id: 'airfield', kind: 'structure', proc: 'airfield', w: 4, h: 3, fill: 1, team: RED },
];
