// @ts-check
/**
 * Info card view model: everything the build menu's ⓘ card shows about one
 * unit or building, read straight from the rule tables so the numbers can
 * never drift from the game. Pure (no DOM), so it is unit-tested.
 */
import { UNITS } from '../data/units.js';
import { STRUCTURES, STRUCTURE_SIGHT } from '../data/structures.js';
import { WEAPONS } from '../data/weapons.js';
import { WARHEADS } from '../data/warheads.js';
import { BONUSES, POWER, SIM, SUPPORT_POWERS, PLACEMENT, COMBAT, SHROUD } from '../data/rules.js';
import { codexText } from '../data/codex.js';
import { buildTicks } from '../sim/formulas/production.js';
import { t as tr, nameOf, weaponNameOf, codexOf, list as listOf } from '../lib/i18n.js';

/** @typedef {{ label: string, value: string }} Stat */
/** @typedef {{ name: string, damage: string, every: string, range: string, targets: string, notes: string[] }} WeaponLine */
/** @typedef {{ label: string, dps: number, share: number }} Effect */
/**
 * @typedef {object} CodexEntry
 * @property {string} type
 * @property {string} name
 * @property {string} kind        Infantry, Vehicle, Aircraft, Ship, Building, Defense or Wall
 * @property {string} side        Coalition, Union or Both sides
 * @property {number} cost
 * @property {number} buildSeconds  With one factory at full power (0: not built in a factory)
 * @property {string} about
 * @property {string} bestFor
 * @property {string} weakTo
 * @property {Stat[]} stats       Headline numbers
 * @property {WeaponLine[]} weapons
 * @property {Effect[]} effect    Damage per second against each kind of target (empty: unarmed)
 * @property {string[]} traits
 * @property {string[]} requires  Building names needed first
 */

/** What its armour is called. */
const ARMOR_LABEL = Object.freeze({ none: 'None (soft)', light: 'Light', heavy: 'Heavy', wood: 'Building', concrete: 'Concrete' });
const KIND_OF_LINE = Object.freeze({ infantry: 'Infantry', vehicles: 'Vehicle', aircraft: 'Aircraft', naval: 'Ship', structures: 'Building', defenses: 'Defense' });
const SIDE_LABEL = Object.freeze({ coalition: 'Coalition', union: 'Union', both: 'Both sides' });
const LAYER_LABEL = Object.freeze({ G: 'Ground', A: 'Air', N: 'Ships', S: 'Submarines' });
const ONLY_LABEL = Object.freeze({ infantry: 'Infantry only', friendlyInfantry: 'Heals friendly infantry', subs: 'Submarines only', ships: 'Ships only' });

/**
 * The kinds of target the effect bars compare, with the armour and layer
 * that stand for each. `only` lists the weapon restrictions that still allow it.
 */
export const TARGETS = Object.freeze([
  { label: 'Infantry', armor: 'none', layer: 'G', only: ['infantry'] },
  { label: 'Light vehicles', armor: 'light', layer: 'G', only: [] },
  { label: 'Tanks', armor: 'heavy', layer: 'G', only: [] },
  { label: 'Aircraft', armor: 'light', layer: 'A', only: [] },
  { label: 'Ships', armor: 'heavy', layer: 'N', only: ['ships'] },
  { label: 'Buildings', armor: 'wood', layer: 'G', only: [] },
  { label: 'Defenses', armor: 'concrete', layer: 'G', only: [] },
]);

/** Damage per second that fills an effect bar; bars grow with the square root, so small differences stay visible. */
export const EFFECT_FULL_DPS = 80;

/** Trim a number for display: 4.75 → "4.75", 2.0 → "2", 0.333 → "0.33". @param {number} n */
const num = (n) => String(Math.round(n * 100) / 100);

/** A speed in words and cells per second. @param {number} speed */
function speedLabel(speed) {
  const word = speed < 1 ? 'Slow' : speed < 2 ? 'Medium' : speed < 3 ? 'Fast' : 'Very fast';
  return tr('{word} {n}/s', { word: tr(word), n: num(speed) });
}

/** Names of the buildings filling a role for a side ("navalyard" → "Naval Yard" or "Sub Pen"). @param {string} role @param {string} faction */
export function roleNames(role, faction) {
  const defs = Object.values(STRUCTURES).filter((d) => d.role === role);
  const mine = defs.filter((d) => d.faction === faction || d.faction === 'both');
  return [...new Set((mine.length ? mine : defs).map((d) => nameOf(d.id, d.name)))].join(tr(' or '));
}

/** Damage a weapon deals per second to one kind of target (0 if it cannot hit it). @param {any} w @param {typeof TARGETS[number]} t */
export function weaponDps(w, t) {
  if (w.damage <= 0 || !w.warhead || !w.hits.includes(t.layer)) return 0;
  if (w.only && !t.only.includes(w.only)) return 0;
  const pct = WARHEADS[w.warhead][t.armor] ?? 0;
  return (w.damage * w.burst * pct) / 100 / Math.max(w.cooldown, 0.05);
}

/** One line of the weapons list. @param {any} w @returns {WeaponLine} */
function weaponLine(w) {
  const heal = w.damage < 0;
  /** @type {string[]} */
  const notes = [];
  if (w.effect === 'mindControl') notes.push(tr('takes control of the target instead of damaging it'));
  if (w.warhead === 'Drone') notes.push(tr('vehicles only'));
  if (w.warhead === 'Rad') notes.push(tr('deadly to infantry, weak against armour'));
  if (w.splash) notes.push(tr('splash {n} cells', { n: num(w.splash) }));
  if (w.minRange) notes.push(tr('not closer than {n} cells', { n: num(w.minRange) }));
  if (w.ammo) notes.push(tr('{n} shots, then rearms', { n: w.ammo }));
  if (w.powered) notes.push(tr('needs power'));
  if (w.chargeUp) notes.push(tr('{n} s to charge', { n: num(w.chargeUp) }));
  return {
    name: weaponNameOf(w.id, w.name),
    damage: heal ? tr('heals {n}', { n: -w.damage }) : w.effect === 'mindControl' ? tr('control') : w.burst > 1 ? `${w.damage} × ${w.burst}` : String(w.damage),
    every: tr('{n} s', { n: num(w.cooldown) }),
    range: tr('{n} cells', { n: num(w.range) }),
    targets: w.only ? tr(ONLY_LABEL[w.only] ?? w.only) : listOf(w.hits.map((/** @type {keyof typeof LAYER_LABEL} */ h) => tr(LAYER_LABEL[h]))),
    notes,
  };
}

/** Best damage per second against each kind of target, over all its weapons. @param {any[]} weapons @returns {Effect[]} */
function effectOf(weapons) {
  if (!weapons.some((w) => w.damage > 0)) return [];
  return TARGETS.map((t) => {
    const dps = Math.max(0, ...weapons.map((w) => weaponDps(w, t)));
    return { label: tr(t.label), dps: Math.round(dps * 10) / 10, share: Math.min(1, Math.sqrt(dps / EFFECT_FULL_DPS)) };
  });
}

/** Headline attack: the strongest single volley ("35 × 2", or the healing). @param {any[]} weapons */
function attackLabel(weapons) {
  if (!weapons.length) return tr('None');
  const best = weapons.reduce((a, b) => (Math.abs(b.damage * b.burst) > Math.abs(a.damage * a.burst) ? b : a));
  return weaponLine(best).damage;
}

/** Traits of a unit. @param {any} d @param {string} faction */
function unitTraits(d, faction) {
  const t = [];
  if (d.capacity) t.push(tr('Carries {n} infantry', { n: d.capacity }));
  if (d.crusher === 'infantry') t.push(tr('Runs over infantry'));
  if (d.crusher === 'sandbags') t.push(tr('Runs over infantry and sandbag walls'));
  if (d.tags.includes('selfRepair')) t.push(tr('Repairs itself below {pct}% health', { pct: Math.round(COMBAT.titanSelfRepairBelow * 100) }));
  if (d.tags.includes('detectsSpies')) t.push(tr('Sees through Spy disguises'));
  if (d.tags.includes('detectsSubs')) t.push(tr('Detects submerged submarines nearby'));
  if (d.tags.includes('submarine')) t.push(tr('Hidden underwater until it fires'));
  if (d.limit) t.push(tr('Only {n} at a time', { n: d.limit }));
  if (d.tags.includes('jumpjet')) t.push(tr('Flies over everything with a jetpack; only anti-air can hit it'));
  else if (d.loco === 'air') t.push(d.tags.includes('heli') && !d.pad ? tr('Needs a free parking spot on a Helipad or an Airfield (4 spots); rearms and repairs there') : tr('Needs a free parking spot on an Airfield (4 spots); rearms and repairs there'));
  if (d.tags.includes('disguise')) t.push(tr('Hidden from enemies while it stands still, unless they come within {n} cells', { n: SHROUD.camoRevealRadius }));
  if (d.tags.includes('psi')) t.push(tr('Takes control of up to 3 enemy units; they return to their owners if he dies'));
  if (d.tags.includes('kamikaze')) t.push(tr('Destroyed by its own blast'));
  if (d.tags.includes('demolition')) t.push(tr('Explodes when destroyed, damaging everything nearby'));
  if (d.tags.includes('mindImmune')) t.push(tr('Immune to mind control'));
  if (d.tags.includes('c4')) t.push(tr('Plants C4 on enemy buildings'));
  if (d.slots > 1) t.push(tr('Takes two places in a transport'));
  if (faction === 'union' && d.line === 'infantry' && !BONUSES.noClone.includes(d.id)) t.push(tr('A Clone Lab trains a free twin'));
  if (faction === 'union' && BONUSES.industryLines.includes(d.line)) t.push(tr('{pct}% cheaper with an Industrial Plant', { pct: Math.round((1 - BONUSES.industryCostFactor) * 100) }));
  return t;
}

/** Traits of a building. @param {any} d @param {string} [faction]  the viewer's: support powers of the other side are left out */
function structureTraits(d, faction) {
  const t = [];
  if (d.power > 0) t.push(tr('Produces {n} power', { n: d.power }));
  if (d.power < 0) t.push(tr('Uses {n} power', { n: -d.power }));
  if (d.padSpots?.length > 1) t.push(tr('Parks, rearms and repairs {n} aircraft', { n: d.padSpots.length }));
  if (d.storage) t.push(tr('Stores ${n} of ore money', { n: d.storage.toLocaleString('en-US') }));
  if (d.tags.includes('freeHarvester')) t.push(tr('Comes with a free Harvester'));
  if (d.tags.includes('limitOne')) t.push(tr('Only one per player'));
  if (POWER.disabledAtLowPower.includes(d.id) || POWER.disabledAtLowPower.includes(d.role) || d.tags.includes('powered')) t.push(tr('Switches off at low power'));
  if (d.tags.includes('camo')) t.push(tr('Hidden until enemies come within {n} cells or it fires', { n: SHROUD.camoRevealRadius }));
  if (d.water) t.push(tr('Built on water'));
  if (d.wall) t.push(tr('Drag to build a line of up to {n}', { n: PLACEMENT.wallMaxCells }));
  if (d.tags.includes('crushable')) t.push(tr('Heavy vehicles can crush it'));
  if (d.line === 'structures' && d.capturable && !d.wall) t.push(tr('Enemy Engineers can capture it'));
  for (const id of d.powers) {
    const p = SUPPORT_POWERS[/** @type {keyof typeof SUPPORT_POWERS} */ (id)];
    if (faction && /** @type {any} */ (p).faction && /** @type {any} */ (p).faction !== faction) continue;
    t.push(tr('Support power: {name}, ready every {n} min', { name: nameOf(p.id, p.name), n: num(p.chargeSeconds / 60) }));
  }
  return t;
}

/**
 * Everything the info card shows for a buildable type.
 * @param {string} type
 * @param {string} faction  the viewer's side, for side-specific names and bonuses
 * @param {number} [price]  the price right now, if it differs from the list price
 * @returns {CodexEntry | null}
 */
export function codexEntry(type, faction, price) {
  const unit = UNITS[type];
  const d = /** @type {any} */ (unit ?? STRUCTURES[type]);
  if (!d) return null;
  const text = codexOf(type, codexText(type));
  const weapons = (unit ? unit.weapons : d.weapon ? [d.weapon] : []).map((/** @type {string} */ id) => WEAPONS[id]);
  const range = Math.max(0, ...weapons.filter((w) => w.damage).map((w) => w.range));
  const cost = price ?? d.cost;
  /** @type {Stat[]} */
  const stats = [];
  if (weapons.length) stats.push({ label: tr('Attack'), value: attackLabel(weapons) });
  stats.push({ label: tr('Health'), value: String(d.hp) }, { label: tr('Armour'), value: tr(ARMOR_LABEL[/** @type {keyof typeof ARMOR_LABEL} */ (d.armor)] ?? d.armor) });
  if (range) stats.push({ label: tr('Range'), value: tr('{n} cells', { n: num(range) }) });
  if (unit) stats.push({ label: tr('Speed'), value: speedLabel(unit.speed) }, { label: tr('Sight'), value: tr('{n} cells', { n: unit.sight }) });
  else {
    if (d.power) stats.push({ label: tr('Power'), value: d.power > 0 ? `+${d.power}` : String(d.power) });
    stats.push({ label: tr('Size'), value: `${d.w} × ${d.h}` });
    if (!d.weapon && d.sight > STRUCTURE_SIGHT) stats.push({ label: tr('Sight'), value: tr('{n} cells', { n: d.sight }) });
  }
  return {
    type,
    name: nameOf(type, d.name),
    kind: tr(d.wall ? 'Wall' : KIND_OF_LINE[/** @type {keyof typeof KIND_OF_LINE} */ (d.line)]),
    side: tr(SIDE_LABEL[/** @type {keyof typeof SIDE_LABEL} */ (d.faction)] ?? ''),
    cost,
    buildSeconds: cost && !d.wall ? Math.round(buildTicks(cost, 1) / SIM.ticksPerSecond) : 0,
    about: text.about,
    bestFor: text.bestFor,
    weakTo: text.weakTo ?? '',
    stats,
    weapons: weapons.map(weaponLine),
    effect: effectOf(weapons),
    traits: unit ? unitTraits(unit, faction) : structureTraits(d, faction),
    requires: d.requires.map((/** @type {string} */ r) => roleNames(r, faction)),
  };
}
