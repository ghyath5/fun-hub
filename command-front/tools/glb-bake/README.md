# Command Front art studio (GLB → sprite atlas)

The game never loads 3D models. Every GLB (and every procedural model in
`models.js`) is rendered **once, offline** into the same 2D sprite atlas the
game already uses (`assets/art/atlas-N.webp` + `atlas.json`). In the browser a
tank is still two small textured quads, so 100 tanks cost what 100 sprites
cost, and a phone downloads ~1.6 MB of WebP instead of 140 MB of GLB.

```
glb/*.glb ─┐
models.js ─┴─ bake.mjs (three.js in headless Chromium) ─ out/*.png + meta.json
                                                        │
                                   pack.py (paint/detail split, repack) ─ assets/art/
```

* **Units** are rendered straight down, facing north. A turret is either named
  nodes (`turret: ['^turret$']`) or a region cut out of the mesh
  (`split: { above, box }`) — the Apocalypse GLB has no separate turret node,
  so its turret is the part above 34 % of the height inside the centre box.
  Rotors (`rotors: [{ node, r }]`) get their own sprite and spin in game.
* **Structures** are rendered in the game's oblique view: the footprint lands
  exactly on the grid and height rises up the screen by 0.72 per cell, with a
  ground shadow to the south-east. `id@faction` (e.g. `refinery@union`) is a
  look used only by that faction's buildings.
* **Team colour**: `team` picks the pixels that become the grey `paint` layer
  the game tints with the player's colour — a hue (`RED`, `BLUE`), a neutral
  range (`{ neutral: { maxSat, minVal } }`) for grey/camo hulls, or a list.

## Run

```sh
npm install                      # three + playwright-core
# put the GLB files in glb/ (names as in jobs.mjs)
node bake.mjs                    # all jobs, or: node bake.mjs titanTank airfield
python3 pack.py                  # needs Pillow + numpy; writes ../../assets/art/
```

`pack.py` keeps every frame already in the atlas and replaces those with the
same key, so it is safe to re-run. It also writes `out/preview.png` (each new
sprite in the four player colours). After packing, bump `CACHE` in `sw.js`
and list any new `atlas-N.webp` page there.

`explore.mjs <file.glb> <dir>` renders every mesh of a GLB on its own, to
find turret nodes and the right orientation for a new model.

Uses the system Chromium at `/opt/pw-browsers/chromium` (set `CHROMIUM` to
override) with SwiftShader, so it runs on a machine without a GPU.
