// @ts-check
/**
 * Who speaks when (section 18): the battlefield announcer in the human
 * player's faction voice, and units answering when picked or ordered.
 * Lines are named in data/sounds.js and played by lib/audio.js.
 */
import { ALERT_LINES, announcerOf, voiceSetOf, lineName } from '../data/sounds.js';

/** @typedef {'select' | 'move' | 'attack'} ReplyKind */

/**
 * @param {{ audio: ReturnType<typeof import('../lib/audio.js').createAudio>, world: any, human: number }} p
 */
export function createVoices({ audio, world, human }) {
  const faction = world.players[human].faction;
  const eva = announcerOf(faction);

  /** The unit that answers for a group: the most numerous talking type, ties to the first picked. @param {any[]} units */
  function speaker(units) {
    /** @type {Map<string, number>} */
    const count = new Map();
    for (const u of units) count.set(u.type, (count.get(u.type) ?? 0) + 1);
    let best = null;
    for (const u of units) if (!best || /** @type {number} */ (count.get(u.type)) > /** @type {number} */ (count.get(best.type))) best = u;
    return best;
  }

  return {
    /** Speak an announcer line by key (see tools/audio/lines.py ANNOUNCER). @param {string} key */
    announce(key) {
      audio.announce(lineName(eva, key));
    },
    /** An alert was shown: say it, if it has a line. @param {string} alertKey */
    alert(alertKey) {
      const key = ALERT_LINES[/** @type {keyof typeof ALERT_LINES} */ (alertKey)];
      if (key) audio.announce(lineName(eva, key));
    },
    /**
     * Units answer: picked, sent somewhere, or sent at a target.
     * @param {ReplyKind} kind @param {any[]} units  the human's own units
     */
    reply(kind, units) {
      const u = speaker(units);
      if (!u) return;
      const set = voiceSetOf(u.type, faction);
      if (set) audio.reply(lineName(set, kind));
      else if (u.type === 'hound') audio.play(kind === 'attack' ? 'bite' : 'growl', { bus: 'voice', volume: 0.7 });
    },
    /** Decode this side's lines ahead of need, so the first replies are not late. */
    async preload() {
      const sets = [eva, `${faction}-infantry`, `${faction}-vehicle`, `${faction}-aircraft`, `${faction}-naval`, 'engineer', 'harvester', 'mcv',
        ...(faction === 'union' ? [] : ['medic', 'spy', 'thief', 'commando'])];
      const wanted = sets.map((s) => lineName(s, ''));
      const all = await audio.names();
      // The announcer first: it speaks at the start of the match.
      await audio.preload(all.filter((n) => n.startsWith(wanted[0])));
      await audio.preload(all.filter((n) => wanted.slice(1).some((w) => n.startsWith(w))));
    },
  };
}
