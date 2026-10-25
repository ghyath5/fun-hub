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
* `mines.test.mjs` — unlimited mines, who sets them off.
* `rules.test.mjs` — building, power, refining, production, selling, capture,
  crushing, transports, digging in, repair, combat, every unit type.
* `match.test.mjs` — AI against AI on every map to the end, invariants every
  tick, and determinism (the same seed plays the same game).
