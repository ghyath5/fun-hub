// @ts-check
/**
 * AI army (section 16): an early scout, a defense group (25% of the army)
 * that answers attacks within 15 cells of base, attack waves that gather 15
 * cells short of their target and then attack-move, retreat after losing
 * 70% of their value, unit micro by difficulty, Hard Engineers capturing
 * red buildings near the front, air strikes, and support powers.
 */
import { AI, SIM } from '../data/rules.js';
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { structureDef, isActive } from '../sim/entities/structures.js';
import { canAttack } from '../sim/targeting.js';
import { SCOUTS, MIN_WAVE } from './buildOrders.js';
import { baseCentre } from './placement.js';
import { ticks, isqrt } from '../core/fixed.js';

/** @typedef {import('../sim/world.js').World} World */
/** @typedef {ReturnType<typeof import('./brain.js').createAiState>} AiState */

const L = SIM.leptonsPerCell;
const GATHER_TICKS = ticks(20);
const HUNT_RADIUS = 8;

const tags = (/** @type {any} */ u) => UNITS[u.type].tags;
/** Commands that act on units (pointless without any). */
const UNIT_COMMANDS = new Set(['move', 'attackMove', 'attack', 'enter', 'depot', 'deploy', 'guardArea']);
const NON_ARMY = ['harvester', 'mcv', 'engineer', 'spy', 'thief', 'mineLayer', 'support', 'transport'];

/** Combat units the AI can send anywhere. @param {World} w @param {number} pid */
export function armyOf(w, pid) {
  return w.entities.all().filter((u) => u.kind === 'unit' && !u.dead && !u.inside && u.owner === pid
    && u.weapons.length > 0 && !tags(u).some((t) => NON_ARMY.includes(t)) && !tags(u).includes('medic'));
}

/** @param {World} w @param {AiState} ai @param {string} type @param {number[]} ids @param {any} target */
export function issue(w, ai, type, ids, target) {
  if (UNIT_COMMANDS.has(type) && !ids.length) return;
  w.queue.push({ tick: w.tick, playerId: ai.pid, type, entityIds: ids, target });
}

const cellOfUnit = (/** @type {any} */ u) => ({ x: u.cx, y: u.cy });
const dist2 = (/** @type {{x: number, y: number}} */ a, /** @type {{x: number, y: number}} */ b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const isPlane = (/** @type {any} */ u) => tags(u).includes('plane');

/** Remember enemy structures this player can see (the AI only knows what its shroud shows). @param {World} w @param {AiState} ai */
export function updateKnowledge(w, ai) {
  const seen = new Map(ai.known.map((k) => [k.id, k]));
  for (const e of w.entities.all()) {
    if (e.kind !== 'structure' || e.dead || e.owner < 0 || w.allied(e.owner, ai.pid)) continue;
    if (!w.visibleTo(ai.pid, e)) continue;
    seen.set(e.id, { id: e.id, type: e.type, owner: e.owner, x: e.cx + (e.w >> 1), y: e.cy + (e.h >> 1), cost: structureDef(e.type).cost ?? 0 });
  }
  // Forget what is gone: a known building whose cell is visible but which no longer exists there.
  ai.known = [...seen.values()].filter((k) => {
    const e = w.entities.get(k.id);
    if (e && !e.dead && !w.allied(e.owner, ai.pid)) return true;
    return !w.cellVisible(ai.pid, k.x, k.y);
  }).sort((a, b) => a.id - b.id);
}

/** Where the enemies started (the AI's one classic advantage). @param {World} w @param {AiState} ai */
function enemyStarts(w, ai) {
  return w.players.filter((p) => p.alive && !w.allied(p.id, ai.pid)).map((p) => w.map.starts[p.start]);
}

/** What the next attack should aim at. @param {World} w @param {AiState} ai */
export function chooseTarget(w, ai) {
  const base = baseCentre(w, ai.pid);
  let pool = ai.known;
  if (ai.difficulty === 'hard') {
    const soft = ai.known.filter((k) => ['refinery', 'power', 'silo'].includes(structureDef(k.type).role));
    if (soft.length) pool = soft;
  }
  let best = null;
  for (const k of pool) if (!best || dist2(k, base) < dist2(best, base)) best = k;
  if (best) return { x: best.x, y: best.y };
  const starts = enemyStarts(w, ai);
  return starts.length ? starts.reduce((a, s) => (dist2(s, base) < dist2(a, base) ? s : a)) : null;
}

/** Point 15 cells short of the target, toward our base. @param {World} w @param {{x: number, y: number}} t @param {{x: number, y: number}} base */
function stagingPoint(w, t, base) {
  const dx = base.x - t.x;
  const dy = base.y - t.y;
  const d = Math.max(1, isqrt(dx * dx + dy * dy));
  const s = Math.min(d, AI.shared.stagingDistance);
  return {
    x: Math.max(0, Math.min(w.map.width - 1, t.x + Math.trunc((dx * s) / d))),
    y: Math.max(0, Math.min(w.map.height - 1, t.y + Math.trunc((dy * s) / d))),
  };
}

const valueOf = (/** @type {World} */ w, /** @type {number[]} */ ids) => ids.reduce((a, id) => {
  const u = w.entities.get(id);
  return a + (u && !u.dead ? UNITS[u.type].cost : 0);
}, 0);

/** Send one cheap fast unit to look at the enemy start. @param {World} w @param {AiState} ai @param {any[]} army */
function scout(w, ai, army) {
  if (ai.scouted) return;
  const pick = SCOUTS.map((t) => army.find((u) => u.type === t && !ai.defense.includes(u.id))).find(Boolean);
  const to = enemyStarts(w, ai)[0];
  if (!pick || !to) return;
  issue(w, ai, 'move', [pick.id], { x: to.x, y: to.y });
  ai.scouted = true;
}

/** Keep about a quarter of the army at home. @param {World} w @param {AiState} ai @param {any[]} army */
function keepDefense(w, ai, army) {
  const alive = new Set(army.map((u) => u.id));
  ai.defense = ai.defense.filter((id) => alive.has(id));
  const inWave = new Set(ai.wave?.ids ?? []);
  const want = Math.floor(army.length * AI.shared.defenseShare);
  for (const u of army) {
    if (ai.defense.length >= want) break;
    if (!ai.defense.includes(u.id) && !inWave.has(u.id) && !isPlane(u)) ai.defense.push(u.id);
  }
}

/** Own buildings or Harvesters losing HP near the base: send the defense group and idle units. @param {World} w @param {AiState} ai @param {any[]} army */
function defend(w, ai, army) {
  const base = baseCentre(w, ai.pid);
  const r2 = AI.shared.defendRadius ** 2;
  /** @type {{x: number, y: number} | null} */
  let threat = null;
  const hp = /** @type {Record<string, number>} */ ({});
  for (const e of w.entities.all()) {
    if (e.dead || e.owner !== ai.pid || !(e.kind === 'structure' || e.harv)) continue;
    hp[e.id] = e.hp;
    const at = e.kind === 'structure' ? { x: e.cx, y: e.cy } : cellOfUnit(e);
    if (!threat && (ai.hp[e.id] ?? e.hp) > e.hp && dist2(at, base) <= r2) threat = at;
  }
  ai.hp = hp;
  ai.threatAt = threat;
  if (!threat) return;
  // Aim at the nearest visible enemy round the spot, else the spot itself.
  let foe = null;
  for (const e of w.spatial.near(threat.x * L + L / 2, threat.y * L + L / 2, HUNT_RADIUS * L)) {
    if (e.dead || e.kind !== 'unit' || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e)) continue;
    if (!foe || dist2(cellOfUnit(e), threat) < dist2(cellOfUnit(foe), threat)) foe = e;
  }
  const to = foe ? cellOfUnit(foe) : threat;
  const inWave = new Set(ai.wave?.stage === 'attack' ? ai.wave.ids : []);
  const ids = army.filter((u) => !isPlane(u) && !inWave.has(u.id) && (ai.defense.includes(u.id) || !u.task)).map((u) => u.id);
  issue(w, ai, 'attackMove', ids, to);
}

/** Launch, steer and retreat attack waves. @param {World} w @param {AiState} ai @param {any[]} army @param {any} cfg */
function waves(w, ai, army, cfg) {
  const base = baseCentre(w, ai.pid);
  const wave = ai.wave;
  if (wave) {
    wave.ids = wave.ids.filter((id) => w.entities.get(id) && !w.entities.get(id).dead);
    const value = valueOf(w, wave.ids);
    if (!wave.ids.length) { ai.wave = null; return; }
    if (value < wave.startValue * (1 - AI.shared.retreatLossFraction)) {
      issue(w, ai, 'move', wave.ids, base);
      ai.wave = null;
      return;
    }
    const units = wave.ids.map((id) => w.entities.get(id));
    if (wave.stage === 'gather') {
      const there = units.filter((u) => dist2(cellOfUnit(u), wave.staging) <= 16).length;
      if (there * 4 >= units.length * 3 || w.tick - wave.since > GATHER_TICKS) {
        wave.stage = 'attack';
        wave.since = w.tick;
        issue(w, ai, 'attackMove', units.filter((u) => !isPlane(u)).map((u) => u.id), wave.target);
      }
      return;
    }
    // Attacking: when everyone has stopped, move on to the next target.
    if (units.every((u) => !u.task && !u.order)) {
      const next = chooseTarget(w, ai);
      if (!next) return;
      wave.target = next;
      issue(w, ai, 'attackMove', units.filter((u) => !isPlane(u)).map((u) => u.id), next);
    }
    return;
  }
  if (w.tick < ai.nextWave) return;
  const target = chooseTarget(w, ai);
  if (!target) return;
  const free = army.filter((u) => !ai.defense.includes(u.id) && !isPlane(u) && (!u.task || u.task.type === 'move'));
  if (free.length < MIN_WAVE) return;
  const ids = free.map((u) => u.id);
  const staging = stagingPoint(w, target, base);
  ai.wave = { ids, startValue: valueOf(w, ids), stage: 'gather', target, staging, since: w.tick };
  ai.nextWave = w.tick + ticks(cfg.waveSeconds);
  ai.waveCount++;
  issue(w, ai, 'move', ids, staging);
}

/** Final attack when the base is gone. @param {World} w @param {AiState} ai @param {any[]} army */
function lastStand(w, ai, army) {
  const target = chooseTarget(w, ai);
  if (!target || ai.lastStand) return;
  ai.lastStand = true;
  const all = w.entities.all().filter((u) => u.kind === 'unit' && u.owner === ai.pid && !u.dead && !u.inside && u.weapons.length);
  issue(w, ai, 'attackMove', all.map((u) => u.id), target);
}

/** Normal and Hard: badly hurt vehicles go for repairs; Hard also focuses fire. @param {World} w @param {AiState} ai @param {any[]} army */
function micro(w, ai, army) {
  if (ai.cfg.micro === 'none') return;
  const depot = w.entities.all().find((e) => e.kind === 'structure' && e.owner === ai.pid && isActive(e) && e.type === 'serviceDepot');
  if (depot) {
    for (const u of army) {
      if (u.task?.type === 'depot') continue;
      if (!['wheel', 'track'].includes(UNITS[u.type].loco)) continue;
      if (u.hp * 100 < u.maxHp * Math.round(AI.shared.retreatHpFraction * 100)) issue(w, ai, 'depot', [u.id], { id: depot.id });
    }
  }
  if (ai.difficulty !== 'hard' || ai.wave?.stage !== 'attack') return;
  // Focus fire: the weakest visible enemy unit near the wave.
  const units = ai.wave.ids.map((id) => w.entities.get(id)).filter(Boolean);
  if (!units.length) return;
  const cx = Math.round(units.reduce((a, u) => a + u.x, 0) / units.length);
  const cy = Math.round(units.reduce((a, u) => a + u.y, 0) / units.length);
  let weak = null;
  for (const e of w.spatial.near(cx, cy, 6 * L)) {
    if (e.dead || e.kind !== 'unit' || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e) || e.hp * 2 >= e.maxHp) continue;
    if (!weak || e.hp < weak.hp) weak = e;
  }
  if (!weak) return;
  const able = units.filter((u) => canAttack(u, weak)).slice(0, 4).map((u) => u.id);
  issue(w, ai, 'attack', able, { id: weak.id });
}

/** Every ammo weapon of an aircraft full? @param {any} u */
const fullyArmed = (u) => UNITS[u.type].weapons.every((id, k) => WEAPONS[id].ammo === 0 || u.weapons[k].ammo >= WEAPONS[id].ammo);

/** Seconds between strikes on the attack target when nothing more pressing calls the planes. */
const STRIKE_GAP = ticks(45);

/**
 * Air strikes, as Red Alert 2's computer flies them: the rearmed planes
 * waiting on their pads go together at one target — first whoever is hitting
 * the base, then what the attack wave is fighting, then (once attacks have
 * begun, every STRIKE_GAP) the defences and factories at the attack target.
 * Within reach of the spot they pick the costliest enemy most of them can hurt.
 * @param {World} w @param {AiState} ai @param {any[]} army
 */
function airStrikes(w, ai, army) {
  const ready = army.filter((u) => isPlane(u) && u.landed && !u.task && fullyArmed(u));
  if (!ready.length) return;
  /** @type {{ at: {x: number, y: number}, timed: boolean }[]} */
  const spots = [];
  if (ai.threatAt) spots.push({ at: ai.threatAt, timed: false });
  if (ai.wave?.stage === 'attack') {
    const units = ai.wave.ids.map((id) => w.entities.get(id)).filter((u) => u && !u.dead);
    if (units.length) {
      spots.push({ at: {
        x: Math.floor(units.reduce((a, u) => a + u.cx, 0) / units.length),
        y: Math.floor(units.reduce((a, u) => a + u.cy, 0) / units.length),
      }, timed: false });
    }
  }
  if (w.tick >= ai.firstAttack && w.tick >= (ai.nextStrike ?? 0)) {
    const t = chooseTarget(w, ai);
    if (t) spots.push({ at: t, timed: true });
  }
  for (const spot of spots) {
    let best = null;
    let bestScore = -1;
    for (const e of w.spatial.near(spot.at.x * L + L / 2, spot.at.y * L + L / 2, HUNT_RADIUS * L)) {
      if (e.dead || e.inside || e.owner < 0 || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e)) continue;
      const able = ready.filter((u) => canAttack(u, e)).length;
      if (!able) continue;
      const def = e.kind === 'structure' ? structureDef(e.type) : UNITS[e.type];
      if (e.kind === 'structure' && (def.wall || def.tags.includes('neutral'))) continue;
      // Value × how many planes can join; defences count double (they are what shoots the army).
      const score = (def.cost ?? 0) * able * (e.kind === 'structure' && def.line === 'defenses' ? 2 : 1);
      if (score > bestScore || (score === bestScore && best && e.id < best.id)) { bestScore = score; best = e; }
    }
    if (!best) continue;
    issue(w, ai, 'attack', ready.filter((u) => canAttack(u, best)).map((u) => u.id), { id: best.id });
    if (spot.timed) ai.nextStrike = w.tick + STRIKE_GAP;
    return;
  }
}

/** Hard: Engineers take red-health enemy buildings near the front. @param {World} w @param {AiState} ai */
function captures(w, ai) {
  if (!ai.cfg.engineerCapture) return;
  const engineers = w.entities.all().filter((u) => u.kind === 'unit' && u.owner === ai.pid && !u.dead && !u.inside && u.type === 'engineer' && !u.task);
  if (!engineers.length) return;
  const base = baseCentre(w, ai.pid);
  const front = ai.wave?.target ?? base;
  let best = null;
  for (const e of w.entities.all()) {
    if (e.kind !== 'structure' || e.dead || e.owner < 0 || w.allied(e.owner, ai.pid) || !w.visibleTo(ai.pid, e)) continue;
    const d = structureDef(e.type);
    if (d.line === 'defenses' || d.capturable === false || e.hp * 4 > e.maxHp) continue;
    if (dist2({ x: e.cx, y: e.cy }, front) > 20 * 20) continue;
    if (!best || e.hp < best.hp) best = e;
  }
  if (best) issue(w, ai, 'enter', [engineers[0].id], { id: best.id });
}

/** Fire ready support powers by the section 16 rules. @param {World} w @param {AiState} ai @param {any[]} army */
function powers(w, ai, army) {
  if (ai.cfg.supportPowers === 'no') return;
  const p = w.players[ai.pid];
  const attacking = ai.wave?.stage === 'attack';
  const ready = (/** @type {string} */ id) => p.powers[id]?.ready;
  const fire = (/** @type {any} */ t) => issue(w, ai, 'power', [], t);
  if (ready('satelliteUplink')) fire({ power: 'satelliteUplink' });
  if (ready('spyPlane') && (ai.wave?.stage === 'gather' || !ai.known.length)) {
    const t = chooseTarget(w, ai);
    if (t) fire({ power: 'spyPlane', x: t.x, y: t.y });
  }
  if (ready('atomicStrike') && ai.known.length && (ai.cfg.supportPowers !== 'timed' || attacking)) {
    // The known cell with the highest total cost of enemy structures within 3 cells.
    let best = null;
    let bestValue = -1;
    for (const k of ai.known) {
      const value = ai.known.filter((o) => dist2(o, k) <= 9).reduce((a, o) => a + o.cost, 0);
      if (value > bestValue) { bestValue = value; best = k; }
    }
    if (best) fire({ power: 'atomicStrike', x: best.x, y: best.y });
  }
  if (ready('lightningStorm') && ai.known.length && (ai.cfg.supportPowers !== 'timed' || attacking)) {
    // The storm over the enemy's most valuable cluster of buildings, like the missile.
    let best = null;
    let bestValue = -1;
    for (const k of ai.known) {
      const value = ai.known.filter((o) => dist2(o, k) <= 25).reduce((a, o) => a + o.cost, 0);
      if (value > bestValue) { bestValue = value; best = k; }
    }
    if (best) fire({ power: 'lightningStorm', x: best.x, y: best.y });
  }
  if (ready('paradrop')) {
    const harv = w.entities.all().find((e) => e.kind === 'unit' && e.harv && !e.dead && !w.allied(e.owner, ai.pid) && w.visibleTo(ai.pid, e) && w.isExplored(ai.pid, e.cx, e.cy));
    if (harv) fire({ power: 'paradrop', x: harv.cx, y: harv.cy });
  }
  if (ready('aegisField') && attacking) {
    const lead = ai.wave.ids.map((id) => w.entities.get(id)).find((u) => u && (u.type === 'titanTank' || u.type === 'heavyTank'));
    if (lead) fire({ power: 'aegisField', id: lead.id });
  }
  if (ready('phaseShift')) {
    const ref = ai.known.find((k) => structureDef(k.type).role === 'refinery');
    const tank = army.filter((u) => ['wheel', 'track'].includes(UNITS[u.type].loco)).sort((a, b) => UNITS[b.type].cost - UNITS[a.type].cost || a.id - b.id)[0];
    if (ref && tank && w.isExplored(ai.pid, ref.x, ref.y + 2)) fire({ power: 'phaseShift', unit: tank.id, x: ref.x, y: ref.y + 2 });
  }
}

/** Everything the army does in one think. @param {World} w @param {AiState} ai @param {boolean} baseGone */
export function thinkArmy(w, ai, baseGone) {
  const army = armyOf(w, ai.pid);
  if (baseGone) { lastStand(w, ai, army); return; }
  scout(w, ai, army);
  keepDefense(w, ai, army);
  defend(w, ai, army);
  if (w.tick >= ai.firstAttack) waves(w, ai, army, ai.cfg);
  micro(w, ai, army);
  airStrikes(w, ai, army);
  captures(w, ai);
  powers(w, ai, army);
}
