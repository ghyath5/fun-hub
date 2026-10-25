# Command Front art studio (GLB → game models and sprites)

The GLB files feed both of the game's battlefield views:

* **3D view (default):** `export.mjs` turns each GLB into a compact model in
  `assets/models/` (`models.bin`, `models.json`, one WebP atlas per model),
  which the game's three.js renderer (`src/render3d/`) draws instanced, lit and
  shadowed. 140 MB of GLB files become about 2.3 MB.
* **Classic 2D view:** `bake.mjs` + `pack.py` render every model **once,
  offline** into the sprite atlas (`assets/art/atlas-N.webp` + `atlas.json`).

Every other unit and building is a procedural model in
`src/render3d/models/` (built from the kit in `src/render3d/kit.js`), built in
the browser at match start — no files to download.

```
glb/*.glb ─┬─ export.mjs (three.js in headless Chromium + meshoptimizer) ─ assets/models/
           └─ bake.mjs (three.js in headless Chromium) ─ out/*.png + meta.json
                                         │
                    pack.py (paint/detail split, repack) ─ assets/art/
```

## 3D models (`export.mjs`)

For each GLB job in `jobs.mjs`, `exporter.js` (in the browser) normalises the
model exactly as the sprite studio does (`prep.js`: one unit is one map cell;
units centred on their pivot facing north; structures on their footprint) and
merges each moving part (`body`, `turret`, `rotorN`) into one geometry. All of
a model's textures are packed into one atlas whose **alpha is the team-colour
weight**; untextured surfaces keep their colour per vertex, and each material's
average metalness and roughness go per vertex too (the game lights baked models
physically). Then `export.mjs` welds, simplifies each part to a phone-sized
triangle budget (meshoptimizer: gentle first, sloppy only as a last resort),
rebuilds creased normals, quantises (positions 16-bit, normals 8-bit) and
writes the blob, the index and the WebP atlases (Pillow, `exact` so the colour
under transparent texels survives).

**STL sources** (`stl: { file, … }` jobs, files in `stl/`, not committed):
3D-print models are one bare solid with no colour, so `stl.js` paints them
per vertex — concrete, a darker base plate, and the regions its rules name
(`team`, `metal`, `dark`, `glow`, by position in the model's bounds and by
which way the surface faces) — and bakes ambient occlusion into the colours
(three-mesh-bvh ray casts), so seams and floor tiles read on a phone. A
print layout that put a part beside its base is re-assembled with `move`
(a moved region can become the turret). `budget` sets the triangle count.
These are 3D-only: `bake.mjs` skips them and the Classic 2D view keeps its
sprites.

Job options for the 3D model only: `team3d` (team surfaces, when the sprite's
rule — tuned on lit renders — does not suit unlit texels),
`look3d: { desaturate }` (grey what is not team paint, e.g. camouflage) and
`tile` (atlas tile size, px: a model whose one texture carries all its
detail). Materials sharing an image share its tile; a model with no
untextured surface has no white tile. A metalness/roughness map is read per
vertex. Units may have a faction look too (`harvester@union`).

## Sprites (`bake.mjs` + `pack.py`)

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

`pack.py` also writes `decor-0.webp`, the flat terrain decor (ore, gems,
craters, rubble) on its own page, so the 3D view loads the ground without the
sprite pages.

## Run

```sh
npm install                      # three, playwright-core, meshoptimizer, three-mesh-bvh
# put the GLB files in glb/ and the STL files in stl/ (names as in jobs.mjs)
node export.mjs                  # 3D models, or: node export.mjs titanTank
node bake.mjs                    # sprites, or: node bake.mjs titanTank airfield
python3 pack.py                  # needs Pillow + numpy; writes ../../assets/art/
```

`pack.py` keeps every frame already in the atlas and replaces those with the
same key, so it is safe to re-run; `--decor-only` just rewrites the decor
page. It also writes `out/preview.png` (each new sprite in the four player
colours). After either step, bump `CACHE` in `sw.js` and list any new file
there.

`explore.mjs <file.glb> <dir>` renders every mesh of a GLB on its own, to
find turret nodes and the right orientation for a new model.

Uses the system Chromium at `/opt/pw-browsers/chromium` (set `CHROMIUM` to
override) with SwiftShader, so it runs on a machine without a GPU.

In the game, `?showcase` (or `?showcase=battle`, `?showcase=naval`) lines up
every model; `?gfx=2d|low|medium|high` picks the view and the 3D quality.
