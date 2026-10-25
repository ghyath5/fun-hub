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
/** STL paint: roofs and upper faces take the team colour. */
const ROOFS = { team: [{ h: [0.45, 1], ny: [0.5, 1] }] };

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

  // ── STL structures (stl.js): the Coalition's own looks, 3D view only ──
  // Uncoloured print models: painted per vertex by rules (team / metal / dark /
  // glow regions in the model's u, v, h fractions) with baked ambient occlusion;
  // `budget` keeps the download small (they are detailed print models).
  { id: 'constructionYard@coalition', kind: 'structure', stl: { file: 'Construction_Yard.stl', ...ROOFS }, w: 3, h: 3, budget: 7000 },
  { id: 'powerPlant@coalition', kind: 'structure', stl: { file: 'Power_Plant.stl', ...ROOFS }, w: 2, h: 2, budget: 6000 },
  { id: 'refinery@coalition', kind: 'structure', stl: { file: 'Refinery.stl', ...ROOFS }, w: 3, h: 3, budget: 7000 },
  { id: 'barracks@coalition', kind: 'structure', stl: { file: 'Barracks.stl', ...ROOFS }, w: 2, h: 2, budget: 6000 },
  { id: 'warFactory@coalition', kind: 'structure', stl: { file: 'War_Factory.stl', ...ROOFS }, w: 3, h: 3, budget: 7000 },
  { id: 'radarDome@coalition', kind: 'structure', stl: { file: 'Airflied.stl', ...ROOFS }, w: 2, h: 2, budget: 6000 },
  { id: 'serviceDepot@coalition', kind: 'structure', stl: { file: 'Service_Depot.stl', ...ROOFS }, w: 3, h: 3, budget: 7000 },
  { id: 'techCenter@coalition', kind: 'structure', stl: { file: 'Battle_Lab.stl', ...ROOFS }, w: 2, h: 2, budget: 6000 },
  { id: 'oreProcessor', kind: 'structure', stl: { file: 'Ore_Purifier.stl', ...ROOFS }, w: 2, h: 2, budget: 6000 },
  { id: 'stormGenerator', kind: 'structure', stl: { file: 'Weather_Control.stl', ...ROOFS }, w: 2, h: 2, budget: 6000 },
  { id: 'pillbox', kind: 'structure', stl: { file: 'Pillbox.stl', ...ROOFS }, w: 1, h: 1, budget: 3500 },
  { id: 'aaGun', kind: 'structure', stl: { file: 'Patriot_Missile.stl', move: [{ box: [0, 1, 0, 0.45], turret: true, to: [113, 4.6, 144.8], rotX: -40 }], ...ROOFS }, turret: ['^turret$'], w: 1, h: 1, budget: 3500 },

  // ── Procedural units (models.js) ───────────────────────────

  // ── Blender models (tools/blender/): parts and pivots from named empties ──
  // Built by `blender -b -P tools/blender/build.py -- <id>` into glb/bl-<id>.glb.
  { id: 'lightTank', kind: 'unit', src: 'bl-lightTank.glb', named: true, budget: 6000, r: 0.46, size: 0.84 },
  { id: 'mediumTank', kind: 'unit', src: 'bl-mediumTank.glb', named: true, budget: 6000, r: 0.51, size: 0.92 },
  { id: 'heavyTank', kind: 'unit', src: 'bl-heavyTank.glb', named: true, budget: 6000, r: 0.56, size: 1.02 },
  { id: 'apc', kind: 'unit', src: 'bl-apc.glb', named: true, budget: 6000, r: 0.46, size: 0.84 },
  { id: 'mineLayer', kind: 'unit', src: 'bl-mineLayer.glb', named: true, budget: 6000, r: 0.44, size: 0.8 },
  { id: 'laserTank', kind: 'unit', src: 'bl-laserTank.glb', named: true, budget: 6000, r: 0.5, size: 0.9 },
  { id: 'arcTank', kind: 'unit', src: 'bl-arcTank.glb', named: true, budget: 6000, r: 0.52, size: 0.94 },
  { id: 'tankDestroyer', kind: 'unit', src: 'bl-tankDestroyer.glb', named: true, budget: 6000, r: 0.55, size: 1.0 },
  { id: 'mirageTank', kind: 'unit', src: 'bl-mirageTank.glb', named: true, budget: 6000, r: 0.5, size: 0.9 },
  { id: 'robotTank', kind: 'unit', src: 'bl-robotTank.glb', named: true, budget: 6000, r: 0.45, size: 0.82 },
  { id: 'battleFortress', kind: 'unit', src: 'bl-battleFortress.glb', named: true, budget: 6000, r: 0.75, size: 1.36 },
  { id: 'harvester', kind: 'unit', src: 'bl-harvester.glb', named: true, budget: 6000, r: 0.72, size: 1.3 },
  { id: 'ranger', kind: 'unit', src: 'bl-ranger.glb', named: true, budget: 6000, r: 0.36, size: 0.66 },
  { id: 'mcv', kind: 'unit', src: 'bl-mcv.glb', named: true, budget: 6000, r: 0.61, size: 1.1 },
  { id: 'artillery', kind: 'unit', src: 'bl-artillery.glb', named: true, budget: 6000, r: 0.61, size: 1.1 },
  { id: 'salvoLauncher', kind: 'unit', src: 'bl-salvoLauncher.glb', named: true, budget: 6000, r: 0.48, size: 0.88 },
  { id: 'flakTrack', kind: 'unit', src: 'bl-flakTrack.glb', named: true, budget: 6000, r: 0.45, size: 0.82 },
  { id: 'demoTruck', kind: 'unit', src: 'bl-demoTruck.glb', named: true, budget: 6000, r: 0.51, size: 0.92 },
  { id: 'terrorDrone', kind: 'unit', src: 'bl-terrorDrone.glb', named: true, budget: 6000, r: 0.28, size: 0.5 },
  { id: 'rifleman', kind: 'unit', src: 'bl-rifleman.glb', named: true, budget: 2000, r: 0.28, size: 0.46 },
  { id: 'rocketTrooper', kind: 'unit', src: 'bl-rocketTrooper.glb', named: true, budget: 2000, r: 0.28, size: 0.5 },
  { id: 'engineer', kind: 'unit', src: 'bl-engineer.glb', named: true, budget: 2000, r: 0.28, size: 0.42 },
  { id: 'grenadier', kind: 'unit', src: 'bl-grenadier.glb', named: true, budget: 2000, r: 0.28, size: 0.44 },
  { id: 'flameTrooper', kind: 'unit', src: 'bl-flameTrooper.glb', named: true, budget: 2000, r: 0.28, size: 0.5 },
  { id: 'medic', kind: 'unit', src: 'bl-medic.glb', named: true, budget: 2000, r: 0.28, size: 0.42 },
  { id: 'spy', kind: 'unit', src: 'bl-spy.glb', named: true, budget: 2000, r: 0.28, size: 0.42 },
  { id: 'thief', kind: 'unit', src: 'bl-thief.glb', named: true, budget: 2000, r: 0.28, size: 0.42 },
  { id: 'guardTrooper', kind: 'unit', src: 'bl-guardTrooper.glb', named: true, budget: 2000, r: 0.28, size: 0.52 },
  { id: 'marksman', kind: 'unit', src: 'bl-marksman.glb', named: true, budget: 2000, r: 0.28, size: 0.6 },
  { id: 'shockTrooper', kind: 'unit', src: 'bl-shockTrooper.glb', named: true, budget: 2000, r: 0.28, size: 0.56 },
  { id: 'flakTrooper', kind: 'unit', src: 'bl-flakTrooper.glb', named: true, budget: 2000, r: 0.28, size: 0.52 },
  { id: 'seal', kind: 'unit', src: 'bl-seal.glb', named: true, budget: 2000, r: 0.28, size: 0.44 },
  { id: 'chronoTrooper', kind: 'unit', src: 'bl-chronoTrooper.glb', named: true, budget: 2000, r: 0.28, size: 0.46 },
  { id: 'rocketeer', kind: 'unit', src: 'bl-rocketeer.glb', named: true, budget: 2000, r: 0.28, size: 0.5 },
  { id: 'desolator', kind: 'unit', src: 'bl-desolator.glb', named: true, budget: 2000, r: 0.28, size: 0.48 },
  { id: 'ivan', kind: 'unit', src: 'bl-ivan.glb', named: true, budget: 2000, r: 0.28, size: 0.42 },
  { id: 'psiCommander', kind: 'unit', src: 'bl-psiCommander.glb', named: true, budget: 2000, r: 0.28, size: 0.4 },
  { id: 'hero', kind: 'unit', src: 'bl-hero.glb', named: true, budget: 2000, r: 0.28, size: 0.46 },
  { id: 'commando', kind: 'unit', src: 'bl-commando.glb', named: true, budget: 2000, r: 0.28, size: 0.46 },
  { id: 'hound', kind: 'unit', src: 'bl-hound.glb', named: true, budget: 2000, r: 0.28, size: 0.5 },
  { id: 'migFighter', kind: 'unit', src: 'bl-migFighter.glb', named: true, budget: 4000, r: 0.57, size: 1.04 },
  { id: 'migInterceptor', kind: 'unit', src: 'bl-migInterceptor.glb', named: true, budget: 4000, r: 0.58, size: 1.06 },
  { id: 'migBomber', kind: 'unit', src: 'bl-migBomber.glb', named: true, budget: 4000, r: 0.68, size: 1.24 },
  { id: 'harrier', kind: 'unit', src: 'bl-harrier.glb', named: true, budget: 4000, r: 0.54, size: 0.98 },
  { id: 'eagleJet', kind: 'unit', src: 'bl-eagleJet.glb', named: true, budget: 4000, r: 0.57, size: 1.04 },
  { id: 'attackPlane', kind: 'unit', src: 'bl-attackPlane.glb', named: true, budget: 4000, r: 0.64, size: 1.16 },
  { id: 'strikeJet', kind: 'unit', src: 'bl-strikeJet.glb', named: true, budget: 4000, r: 0.67, size: 1.22 },
  { id: 'transportHeli', kind: 'unit', src: 'bl-transportHeli.glb', named: true, budget: 4000, r: 0.61, size: 1.1 },
  { id: 'attackHeli', kind: 'unit', src: 'bl-attackHeli.glb', named: true, budget: 4000, r: 0.64, size: 1.16 },
  { id: 'siegeChopper', kind: 'unit', src: 'bl-siegeChopper.glb', named: true, budget: 4000, r: 0.68, size: 1.24 },
  { id: 'siegeAirship', kind: 'unit', src: 'bl-siegeAirship.glb', named: true, budget: 4000, r: 1.1, size: 2.0 },
  { id: 'supportPlane', kind: 'unit', src: 'bl-supportPlane.glb', named: true, budget: 4000, r: 0.91, size: 1.66 },
  { id: 'gunboat', kind: 'unit', src: 'bl-gunboat.glb', named: true, budget: 4000, r: 0.53, size: 0.96 },
  { id: 'destroyer', kind: 'unit', src: 'bl-destroyer.glb', named: true, budget: 4000, r: 0.75, size: 1.36 },
  { id: 'cruiser', kind: 'unit', src: 'bl-cruiser.glb', named: true, budget: 4000, r: 1.02, size: 1.86 },
  { id: 'submarine', kind: 'unit', src: 'bl-submarine.glb', named: true, budget: 4000, r: 0.68, size: 1.24 },
  { id: 'navalTransport', kind: 'unit', src: 'bl-navalTransport.glb', named: true, budget: 4000, r: 0.61, size: 1.1 },
  { id: 'constructionYard@union', kind: 'structure', src: 'bl-constructionYard@union.glb', named: true, w: 3, h: 3, fill: 1, budget: 6000 },
  { id: 'barracks@union', kind: 'structure', src: 'bl-barracks@union.glb', named: true, w: 2, h: 2, fill: 1, budget: 6000 },
  { id: 'warFactory@union', kind: 'structure', src: 'bl-warFactory@union.glb', named: true, w: 3, h: 3, fill: 1, budget: 6000 },
  { id: 'radarDome@union', kind: 'structure', src: 'bl-radarDome@union.glb', named: true, w: 2, h: 2, fill: 1, budget: 6000 },
  { id: 'serviceDepot', kind: 'structure', src: 'bl-serviceDepot.glb', named: true, w: 3, h: 3, fill: 1, budget: 6000 },
  { id: 'advPowerPlant', kind: 'structure', src: 'bl-advPowerPlant.glb', named: true, w: 3, h: 3, fill: 1, budget: 6000 },
  { id: 'silo', kind: 'structure', src: 'bl-silo.glb', named: true, w: 1, h: 1, fill: 1, budget: 3500 },
  { id: 'kennel', kind: 'structure', src: 'bl-kennel.glb', named: true, w: 1, h: 1, fill: 1, budget: 3500 },
  { id: 'helipad', kind: 'structure', src: 'bl-helipad.glb', named: true, w: 2, h: 2, fill: 1, budget: 6000 },
  { id: 'airfield', kind: 'structure', src: 'bl-airfield.glb', named: true, w: 4, h: 3, fill: 1, budget: 6000 },
  { id: 'navalYard', kind: 'structure', src: 'bl-navalYard.glb', named: true, w: 3, h: 3, fill: 1, budget: 6000 },
  { id: 'subPen', kind: 'structure', src: 'bl-subPen.glb', named: true, w: 3, h: 3, fill: 1, budget: 6000 },
  { id: 'industrialPlant', kind: 'structure', src: 'bl-industrialPlant.glb', named: true, w: 3, h: 2, fill: 1, budget: 6000 },
  { id: 'cloneLab', kind: 'structure', src: 'bl-cloneLab.glb', named: true, w: 2, h: 2, fill: 1, budget: 6000 },
  { id: 'phaseShifter', kind: 'structure', src: 'bl-phaseShifter.glb', named: true, w: 2, h: 2, fill: 1, budget: 6000 },
  { id: 'missileSilo', kind: 'structure', src: 'bl-missileSilo.glb', named: true, w: 2, h: 1, fill: 1, budget: 3500 },
  { id: 'gunTurret', kind: 'structure', src: 'bl-gunTurret.glb', named: true, w: 1, h: 1, fill: 1, budget: 3500 },
  { id: 'longGun', kind: 'structure', src: 'bl-longGun.glb', named: true, w: 2, h: 2, fill: 1, budget: 6000 },
  { id: 'camoPillbox', kind: 'structure', src: 'bl-camoPillbox.glb', named: true, w: 1, h: 1, fill: 1, budget: 3500 },
  { id: 'shroudGenerator', kind: 'structure', src: 'bl-shroudGenerator.glb', named: true, w: 1, h: 1, fill: 1, budget: 3500 },
  { id: 'flameTower', kind: 'structure', src: 'bl-flameTower.glb', named: true, w: 1, h: 1, fill: 1, budget: 3500 },
  { id: 'samSite', kind: 'structure', src: 'bl-samSite.glb', named: true, w: 2, h: 1, fill: 1, budget: 3500 },
  { id: 'civilian-house', kind: 'structure', src: 'bl-civilian-house.glb', named: true, w: 1, h: 1, fill: 1, budget: 2000 },
  { id: 'bridgeHut', kind: 'structure', src: 'bl-bridgeHut.glb', named: true, w: 1, h: 1, fill: 1, budget: 2000 },
  { id: 'oreMine', kind: 'structure', src: 'bl-oreMine.glb', named: true, w: 1, h: 1, fill: 0.92, budget: 2000 },
  { id: 'gemMine', kind: 'structure', src: 'bl-gemMine.glb', named: true, w: 1, h: 1, fill: 0.92, budget: 2000 },

  // ── Procedural structures ──────────────────────────────────
];
