// @ts-check
/**
 * Acceptance 16 benchmark (open the game with `?bench`): 200 units
 * attack-moving across Duel Canyon for 60 s while frame times are recorded.
 * The verdict (average fps ≥ 50, no frame above 50 ms) shows on screen and
 * lands in `window.__bench`.
 */
import { loadMap } from '../map/loader.js';
import { createMatch } from '../sim/setup.js';
import { enqueue } from '../sim/world.js';
import { spawnUnit } from '../sim/entities/units.js';
import { createSession } from './session.js';

const DURATION_MS = 60_000;
const MIX = ['lightTank', 'rifleman', 'mediumTank', 'rifleman', 'ranger', 'rocketTrooper', 'heavyTank', 'grenadier'];

/** @param {{ hudEl: HTMLElement, worldEl: HTMLElement, screensEl: HTMLElement, audio: any, seconds?: number }} el */
export async function runBenchmark({ hudEl, worldEl, screensEl, audio, seconds }) {
  const map = await loadMap('duel-canyon');
  const world = createMatch(map, {
    seed: 16,
    players: [
      { faction: 'coalition', color: 'blue', human: true, start: 0 },
      { faction: 'union', color: 'red', human: true, start: 1 },
    ],
    settings: { revealMap: true, victory: false, oreGrowthSeconds: 0 },
  });
  // 100 units a side in blocks behind each start, then everyone attack-moves to the far corner.
  for (const p of world.players) {
    const s = map.starts[p.start];
    const dir = s.x < map.width / 2 ? 1 : -1;
    let n = 0;
    for (let k = 0; n < 100 && k < 300; k++) {
      const x = s.x + dir * (2 + (k % 10));
      const y = s.y + dir * (Math.floor(k / 10) - 4);
      if (spawnUnit(world, MIX[k % MIX.length], p.id, x, y)) n++;
    }
  }
  for (const p of world.players) {
    const goal = map.starts[1 - p.start];
    const ids = world.entities.all().filter((e) => e.kind === 'unit' && e.owner === p.id && e.type !== 'mcv').map((e) => e.id);
    enqueue(world, { tick: 0, playerId: p.id, type: 'attackMove', entityIds: ids, target: { x: goal.x, y: goal.y } });
  }
  screensEl.classList.remove('on');
  const session = await createSession({ world, human: 0, hudEl, worldEl, audio, speed: 'normal' });
  document.body.classList.add('ready');
  // Watch the middle of the map.
  session.view.camera.home(Math.floor(map.width / 2), Math.floor(map.height / 2));

  const frames = /** @type {number[]} */ ([]);
  const limit = (seconds ?? DURATION_MS / 1000) * 1000;
  const start = performance.now();
  await new Promise((done) => {
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (now - start < limit) requestAnimationFrame(tick); else done(null);
    };
    requestAnimationFrame(tick);
  });
  const body = frames.slice(30); // the first frames include start-up work
  const avgMs = body.reduce((a, b) => a + b, 0) / Math.max(1, body.length);
  const result = {
    seconds: limit / 1000,
    frames: body.length,
    avgFps: Math.round(1000 / avgMs),
    worstMs: Math.round(Math.max(...body)),
    pass: 1000 / avgMs >= 50 && Math.max(...body) <= 50,
  };
  /** @type {any} */ (window).__bench = result;
  session.toaster.show(`Benchmark: ${result.avgFps} fps average, worst frame ${result.worstMs} ms — ${result.pass ? 'PASS' : 'below target'}`);
  console.info('[bench]', result);
  return result;
}
