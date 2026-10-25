// Shared test harness: runs the game's simulation headless in Node (the sim
// is plain ES modules; the page's two classic scripts are loaded as globals
// the same way index.html does), with match builders and the invariants
// every test checks.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
for (const f of ['easystar.min.js', 'seedrandom.min.js']) {
  if (f === 'easystar.min.js' && globalThis.EasyStar) continue;
  if (f === 'seedrandom.min.js' && Math.seedrandom) continue;
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'vendor', f), 'utf8'), { filename: f });
}

const { createMatch } = await import('../src/sim/setup.js');
const world = await import('../src/sim/world.js');
const { parseMap } = await import('../src/map/loader.js');
const units = await import('../src/sim/entities/units.js');
const structures = await import('../src/sim/entities/structures.js');
const { UNITS } = await import('../src/data/units.js');
const { STRUCTURES } = await import('../src/data/structures.js');
const { MOVEMENT, SIM } = await import('../src/data/rules.js');

export const { step, hashWorld } = world;
export const { spawnUnit } = units;
export const { placeStructure, drivable } = structures;
export { UNITS, STRUCTURES, MOVEMENT, SIM, createMatch };
export const L = SIM.leptonsPerCell;
export const TPS = SIM.ticksPerSecond;

/** A map from maps/<id>.json. */
export function loadMap(id) {
  return parseMap(JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', `${id}.json`), 'utf8')));
}

/** A flat, open map of grass. */
export function openMap(W = 56, H = 44) {
  const n = W * H;
  return {
    id: 'test', name: 'Test', width: W, height: H, maxPlayers: 2, theme: 'temperate',
    terrain: new Uint8Array(n), bales: new Uint8Array(n), gem: new Uint8Array(n),
    starts: [{ x: 4, y: 4 }, { x: W - 5, y: H - 5 }], bridges: [], neutral: [],
  };
}

/**
 * A two-player sandbox on an open map with no starting units: blue
 * (coalition, player 0) and red (union, player 1), both human-driven.
 */
export function sandbox({ seed = 1, map = openMap(), factions = ['coalition', 'union'], credits } = {}) {
  const w = createMatch(map, {
    seed,
    ...(credits !== undefined ? { startingCredits: credits } : {}),
    players: [
      { faction: factions[0], color: 'blue', human: true, start: 0 },
      { faction: factions[1], color: 'red', human: true, start: 1 },
    ],
    settings: { victory: false, revealMap: true },
  });
  for (const e of w.entities.all()) if (e.kind === 'unit') removeUnit(w, e);
  return w;
}

/** Take a unit off the map cleanly (its cells freed). */
export function removeUnit(w, e) {
  units.vacate(w, e, e.cx, e.cy, e.spot);
  if (e.next) units.vacate(w, e, e.next.x, e.next.y, e.next.spot);
  w.entities.remove(e);
}

/** Issue a command for this tick, the way the lockstep does. */
export function order(w, playerId, type, entityIds, target) {
  world.enqueue(w, { type, playerId, entityIds, target, tick: w.tick });
}

/** Spawn `count` units of `types` (cycled) for a player in a block from (x0, y0), `cols` wide. */
export function squad(w, owner, types, count, x0, y0, cols = 5) {
  const ids = [];
  for (let k = 0; ids.length < count && k < count * 6; k++) {
    const type = types[k % types.length];
    const u = spawnUnit(w, type, owner, x0 + (k % cols), y0 + Math.floor(k / cols), { air: UNITS[type].loco === 'air' });
    if (u) {
      if (UNITS[type].loco === 'air') u.landed = false;
      ids.push(u.id);
    }
  }
  return ids;
}

/** Run n ticks; `each(w, t)` after every tick may return a string to report a failure. */
export function run(w, n, each) {
  for (let t = 0; t < n; t++) {
    step(w);
    if (each) {
      const bad = each(w, t);
      if (bad) return bad;
    }
  }
  return null;
}

export const live = (w, ids) => ids.map((id) => w.entities.get(id)).filter((e) => e && !e.dead);
export const isFoot = (e) => UNITS[e.type].loco === 'foot';
export const isAir = (e) => UNITS[e.type].loco === 'air';
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Every rule of the world's bookkeeping that must hold after any tick.
 * Returns the first broken one as a message, or null.
 */
export function invariants(w) {
  const W = w.map.width, H = w.map.height;
  const occ = w.occ;
  const SPOTS = MOVEMENT.infantrySpots;
  const ids = new Set();
  for (const e of w.entities.all()) {
    if (e.dead) continue;
    ids.add(e.id);
    if (e.kind === 'structure') {
      if (!(e.hp > 0 && e.hp <= e.maxHp)) return `structure ${e.type}#${e.id} hp ${e.hp}/${e.maxHp}`;
      continue;
    }
    if (e.kind !== 'unit') continue;
    const tag = `${e.type}#${e.id}@${e.cx},${e.cy} t${w.tick}`;
    if (!(e.hp > 0 && e.hp <= e.maxHp)) return `${tag} hp ${e.hp}/${e.maxHp}`;
    if (e.inside) continue;
    if (![e.x, e.y].every(Number.isInteger)) return `${tag} position not whole leptons ${e.x},${e.y}`;
    if (e.x < 0 || e.y < 0 || e.x >= W * L || e.y >= H * L) return `${tag} off the map ${e.x},${e.y}`;
    if (e.cx !== Math.floor(e.x / L) && !e.next && !isAir(e)) return `${tag} cell ${e.cx} does not match x ${e.x}`;
    if (isAir(e)) continue;
    const loco = UNITS[e.type].loco;
    if (!w.nav.passable(loco, e.cx, e.cy)) return `${tag} stands on ground its ${loco} cannot cross`;
    const i = e.cy * W + e.cx;
    if (e.squeeze) continue; // squeezing past a friend: its old cell is already handed over
    if (isFoot(e)) {
      if (!(e.spot >= 0 && e.spot < SPOTS)) return `${tag} infantry without a spot (${e.spot})`;
      if (occ.inf[i * SPOTS + e.spot] !== e.id) return `${tag} not in its spot ${e.spot} (holds ${occ.inf[i * SPOTS + e.spot]})`;
    } else if (occ.veh[i] !== e.id) return `${tag} vehicle not recorded in its cell (holds ${occ.veh[i]})`;
    const b = occ.bld[i] ? w.entities.get(occ.bld[i]) : null;
    if (b && !b.dead && !drivable(b, e.cx, e.cy)) return `${tag} inside ${b.type}#${b.id}`;
  }
  // Every occupancy record points at a live unit that is in, or entering, that cell.
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = Math.floor(i / W);
    const here = (e) => (e.cx === x && e.cy === y) || (e.next && e.next.x === x && e.next.y === y);
    if (occ.veh[i]) {
      const e = w.entities.get(occ.veh[i]);
      if (!e || e.dead || !here(e)) return `cell ${x},${y} records vehicle #${occ.veh[i]} that is not there`;
      // A vehicle and infantry share a cell's records only while the soldiers step out of it
      // (scattering from a crusher), or as a crusher drives onto enemies it is about to crush;
      // never with the soldier still standing where the vehicle is.
      for (let s = 0; occ.infCount[i] && s < SPOTS; s++) {
        const v = w.entities.get(occ.inf[i * SPOTS + s]);
        if (!v) continue;
        const leaving = v.next && (v.next.x !== x || v.next.y !== y);
        const crushing = UNITS[e.type].crusher !== 'none' && !w.allied(v.owner, e.owner);
        if (!leaving && !crushing) return `cell ${x},${y} holds ${e.type}#${e.id} and soldier #${v.id} together`;
        if (leaving && !crushing && Math.hypot(v.x - e.x, v.y - e.y) < 100) return `soldier #${v.id} under ${e.type}#${e.id} in ${x},${y}`;
      }
    }
    let n = 0;
    for (let s = 0; s < SPOTS; s++) {
      const id = occ.inf[i * SPOTS + s];
      if (!id) continue;
      n++;
      const e = w.entities.get(id);
      if (!e || e.dead || !here(e)) return `cell ${x},${y} spot ${s} records soldier #${id} that is not there`;
    }
    if (n !== occ.infCount[i]) return `cell ${x},${y} infantry count ${occ.infCount[i]} but ${n} recorded`;
  }
  for (const p of w.players) {
    if (!(p.cash >= 0 && Number.isFinite(p.cash))) return `player ${p.id} cash ${p.cash}`;
  }
  return null;
}

/** Soldiers whose centres are closer than this are standing in each other. */
export const STACKED = 24;

/** Count stacked pairs this tick among `es` (soldiers with soldiers, hovering aircraft with each other). */
export function stackedPairs(es) {
  let n = 0;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j];
    if (isFoot(a) !== isFoot(b) || (isAir(a) !== isAir(b))) continue;
    const lim = isAir(a) ? 96 : STACKED;
    if (dist(a, b) < lim) n++;
  }
  return n;
}
