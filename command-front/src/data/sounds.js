// @ts-check
/**
 * Which sound plays for what (section 18). The sounds themselves are
 * rendered by tools/audio into assets/sound/ and listed in its sounds.json;
 * this file only names them. Presentation only — never read by the sim.
 *
 * Names:  'cannon'                       an effect (sounds.json "sfx")
 *         'voice:eva-union:lowPower'     a spoken line (sounds.json "voice")
 */
import { UNITS } from './units.js';
import { WEAPONS } from './weapons.js';

export const SOUND_INDEX = './assets/sound/sounds.json';

/** Announcer line for each alert (src/data/ui.js ALERTS); alerts not listed stay silent. */
export const ALERT_LINES = Object.freeze({
  structureReady: 'constructionComplete',
  unitReady: 'unitReady',
  insufficientFunds: 'insufficientFunds',
  lowPower: 'lowPower',
  silosNeeded: 'silosNeeded',
  baseUnderAttack: 'baseUnderAttack',
  harvesterUnderAttack: 'harvesterUnderAttack',
  unitLost: 'unitLost',
  unitsLost: 'unitLost',
  structureLost: 'structureLost',
  structureCaptured: 'structureCaptured',
  missileLaunch: 'missileLaunch',
  oreDepleted: 'oreDepleted',
  noRefinery: 'noRefinery',
  placementFailed: 'cannotBuild',
  cannotDeploy: 'cannotDeploy',
  powerReady: 'powerReady',
  structureSold: 'structureSold',
  mineExploded: 'mineDetonated',
});

/** Unit classes with a voice of their own, by unit tag; everyone else speaks for their kind of unit. */
const SPECIAL_VOICES = Object.freeze({ engineer: 'engineer', medic: 'medic', spy: 'spy', thief: 'thief', c4: 'commando', harvester: 'harvester', mcv: 'mcv' });
const KIND_OF_LOCO = Object.freeze({ foot: 'infantry', wheel: 'vehicle', track: 'vehicle', air: 'aircraft', float: 'naval' });

/**
 * Voice set a unit answers with, or null for units that do not talk (Hounds
 * growl instead). Faction is the player's, so a captured vehicle speaks for
 * its new owner.
 * @param {string} type @param {string} faction
 * @returns {string | null}
 */
export function voiceSetOf(type, faction) {
  const def = UNITS[type];
  if (!def || def.tags.includes('support')) return null;
  if (type === 'hound') return null;
  for (const [tag, set] of Object.entries(SPECIAL_VOICES)) if (def.tags.includes(tag)) return set;
  return `${faction === 'union' ? 'union' : 'coalition'}-${KIND_OF_LOCO[def.loco]}`;
}

/** Announcer voice set for a faction. @param {string} faction */
export const announcerOf = (faction) => (faction === 'union' ? 'eva-union' : 'eva-coalition');

/** Name of a spoken line. @param {string} set @param {string} key */
export const lineName = (set, key) => `voice:${set}:${key}`;

/**
 * Sound of a weapon being fired.
 * @param {string} weapon @param {string} look  render/combatFx.js lookOf(weapon)
 */
export function shotSound(weapon, look) {
  const w = WEAPONS[weapon];
  if (look === 'tracer') return w.cooldown < 1 ? 'mg' : 'rifle';
  if (look === 'shell') return w.damage >= 40 ? 'heavy' : 'cannon';
  if (look === 'arc') return w.damage >= 150 ? 'heavy' : 'thump';
  return { snipe: 'snipe', missile: 'missile', flame: 'flame', beam: 'zap', heal: 'heal', bite: 'bite' }[look] ?? 'rifle';
}

/**
 * The name a player gives a file to replace a sound (Settings → Custom
 * sounds): one name covers both sides, so "constructionComplete.mp3"
 * replaces the line for Coalition and Union alike.
 *   effects             sfx.cannon
 *   announcer           eva.constructionComplete
 *   unit replies        infantry.select, vehicle.attack, engineer.move, …
 * @param {string} name  internal sound name
 */
export function customNameOf(name) {
  if (!name.startsWith('voice:')) return `sfx.${name}`;
  const [, set, key] = name.split(':');
  if (set.startsWith('eva-')) return `eva.${key}`;
  return `${set.replace(/^(coalition|union)-/, '')}.${key}`;
}

/**
 * Friendly name of a dropped file: extension and a variant suffix
 * ("-2", " (2)", "_3") removed, compared without case.
 * @param {string} filename
 */
export function customNameOfFile(filename) {
  return filename.replace(/\.[a-z0-9]+$/i, '').replace(/(\s*\(\d+\)|[-_ ]\d+)$/, '').trim().toLowerCase();
}
