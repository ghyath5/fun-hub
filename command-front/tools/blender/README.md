# Command Front Blender models

Most units and buildings in the 3D view are modelled in Blender from Python
scripts here, then packed for the game by `../glb-bake/export.mjs`.

```
models/*.py ── build.py (Blender, headless) ── ../glb-bake/glb/bl-<id>.glb + out/<id>.png
                                                     │
                       ../glb-bake/export.mjs <id> ──┴── ../../assets/models/
```

* `kit.py` — the building blocks: palette materials (team paint, metals,
  glowing lamps and energy), chamfered primitives, hulls, tracks, wheels,
  barrels, rotors, propellers, soldiers' parts and buildings' parts, the
  ambient-occlusion bake (into each vertex colour; its alpha is the team
  weight) and the GLB export.
* `models/` — one builder per unit or building, registered with
  `@model('id')`: `tanks.py`, `vehicles.py`, `infantry.py`, `air.py`,
  `naval.py`, `buildings.py`, `defenses.py`.
* Conventions: front is +Y (north), up is +Z, the ground is z = 0. A unit is
  about 1 long (the exporter scales it to the job's `size`); a building is
  modelled on its footprint in cells (`kit.at`: cell (x, y) is Blender
  (x, -y)), front facing south.
* Moving parts hang under empties named for what they do, placed where they
  turn: `turret`, `barrel` (turns with the turret, kicks back when it fires),
  `wheelN` (rolls), `treadN` (track links slide one `pitch`, a custom
  property), `rotorN` (spins about up), `propN` (spins about forward),
  `spinN` (buildings: dishes, cranes, rings), `legL`/`legR`/`armL`/`armR`
  (swing as a soldier walks), `drumN` (a harvester's drum: turns while it
  harvests). A tread may instead carry `slide` (the direction its links run,
  for one straight run of a belt) or `arc` (a bend's signed radius round its
  wheel), so a whole belt can circulate.

## Finished models (`rig.py`)

A model made elsewhere (its own .blend, textured) is rigged rather than
built: `rig.py` splits its meshes into the parts above — wheels from the
round islands of its track meshes, the track links sorted onto the belt's
runs and bends round the wheels, a drum and a turret by rules in `SOURCES` —
re-packs its texture by area (running gear at a quarter of the density),
bakes colour × ambient occlusion, metalness and roughness at 1024 px, and
writes `../glb-bake/glb/bl-<id>.glb` plus `out/<id>.png` and
`out/<id>-parts.png` (each moving part in its own colour). The sources are
not committed; pass the .blend:

```sh
$BLENDER -b --factory-startup -P tools/blender/rig.py -- harvester@union ~/Downloads/harvester/harvester.blend
$BLENDER -b --factory-startup -P tools/blender/rig.py -- harvester@coalition ~/Downloads/chrono_miner/chrono_miner.blend
cd tools/glb-bake && CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node export.mjs harvester@union harvester@coalition
```

A unit id with `@<faction>` is that side's own look of the unit (the game
falls back to the plain id).

## Run

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
$BLENDER -b --factory-startup -P tools/blender/build.py -- lightTank heavyTank   # or -- --all
python3 tools/blender/sheet.py lightTank heavyTank    # contact sheet of the previews (Pillow)
cd tools/glb-bake && CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node export.mjs lightTank heavyTank
```

Each model needs a job in `../glb-bake/jobs.mjs` (`src: 'bl-<id>.glb', named: true`,
plus `size` for units or `w`, `h` for buildings). Bump `CACHE` in `sw.js` after
exporting.
