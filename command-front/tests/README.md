# Command Front simulation tests

The game's simulation runs headless in Node (no browser, no dependencies):

```sh
cd command-front
node --test 'tests/*.test.mjs'        # about 30 s
```

* `harness.mjs` — loads the sim the way the page does, builds sandboxes and
  AI matches, and checks the world's invariants (occupancy, one vehicle per
  cell, infantry spots, nobody inside buildings or on impassable ground,
  health and cash in range).
* `movement.test.mjs` — group moves, crowds, head-on and crossing squads;
  nothing stacks, nothing deadlocks.
* `air.test.mjs` — hovering aircraft spread out, landings take separate cells.
* `mines.test.mjs` — unlimited mines, each paid for, several layers sharing a
  field, who sets them off.
* `drone.test.mjs` — Terror Drones get inside enemy vehicles and shred them;
  a Service Depot cuts them out; save and load mid-chew.
* `warminer.test.mjs` — the Union harvester's gun fires while it works and on
  the move, without chasing.
* `naval.test.mjs` — every bundled map passes the validator the setup screen
  runs, has one sea touching every base and room for a Naval Yard by the
  shore; a Gunboat sails from each base and shells every other.
* `progress.test.mjs` — the loading line's tasks and downloads.
* `generator.test.mjs` — random maps: always valid, mountains on every one,
  most with a sea reaching every base; the AI plays one and builds a navy.
* `readability.test.mjs` — units drawn bigger as the view zooms out and at
  the size chosen in Settings; attack spots and the arrows to them.
* `importmap.mjs` — lets tests import modules that use the page's import map
  (`simplex-noise`, …).
* `rules.test.mjs` — building, power, refining, production, selling, capture,
  crushing, transports, digging in, repair, combat, every unit type.
* `match.test.mjs` — AI against AI on every map to the end, invariants every
  tick, and determinism (the same seed plays the same game).
* `ai.test.mjs` — the computer player's 0–10 skill: every level earns the
  same per ore load as a human, levels get steadily better at what experience
  brings, old difficulty names become skill levels, a playstyle is picked per
  match, its brain saves and loads mid-match, and skill 10 beats skill 0
  without an attack ever stalling with the army idle at home.

## Tuning the computer player

`tools/ai-bench/` plays headless AI-against-AI matches to measure the skill
levels (see `AI_SKILL` in `src/data/rules.js`):

```sh
node tools/ai-bench/match.mjs --map duel-canyon --seed 3 --skills 8,4
node tools/ai-bench/ladder.mjs --pairs 10-8,8-6,6-4,4-2,2-0 --seeds 3,11,29
node tools/ai-bench/ladder.mjs --pairs 10-5 --patch "10:raidSense=0.3"   # what one value is worth
```

A well-tuned ladder has each level beating the one two below it most of the
time, but not always.
