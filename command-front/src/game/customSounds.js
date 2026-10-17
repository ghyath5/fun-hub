// @ts-check
/**
 * Custom sounds (Settings): the player picks audio files named after the
 * sounds they replace; they are stored on this device and handed to the
 * audio module, which prefers them over the built-in set. Nothing is uploaded.
 */
import { customNameOf, customNameOfFile } from '../data/sounds.js';
import { saveCustomSounds, loadCustomSounds } from '../lib/storage.js';

/** Largest single file accepted, and the most kept in all. */
export const CUSTOM_LIMITS = Object.freeze({ fileBytes: 5 * 1024 * 1024, totalBytes: 40 * 1024 * 1024 });

/**
 * Every name a file can take, sorted: announcer lines, unit replies, effects.
 * @param {string[]} soundNames  internal names (audio.names())
 */
export function customNames(soundNames) {
  const rank = (/** @type {string} */ n) => (n.startsWith('eva.') ? 0 : n.startsWith('sfx.') ? 2 : 1);
  return [...new Set(soundNames.map(customNameOf))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Which sound each file replaces. A file matches a name exactly (any case),
 * or the part after the dot when only one name has it ("constructionComplete.mp3").
 * @param {{ name: string, size: number }[]} files
 * @param {string[]} names  from customNames
 * @returns {{ matched: { file: number, name: string }[], unknown: string[], tooBig: string[] }}  file: index into files
 */
export function matchFiles(files, names) {
  const exact = new Map(names.map((n) => [n.toLowerCase(), n]));
  /** @type {Map<string, string[]>} */
  const byKey = new Map();
  for (const n of names) {
    const key = n.slice(n.indexOf('.') + 1).toLowerCase();
    byKey.set(key, [...(byKey.get(key) ?? []), n]);
  }
  const out = { matched: /** @type {{ file: number, name: string }[]} */ ([]), unknown: /** @type {string[]} */ ([]), tooBig: /** @type {string[]} */ ([]) };
  files.forEach((f, i) => {
    if (f.size > CUSTOM_LIMITS.fileBytes) { out.tooBig.push(f.name); return; }
    const want = customNameOfFile(f.name);
    const hit = exact.get(want) ?? (byKey.get(want)?.length === 1 ? byKey.get(want)?.[0] : undefined);
    if (hit) out.matched.push({ file: i, name: hit });
    else out.unknown.push(f.name);
  });
  return out;
}

/** Stored files grouped for the audio module: name → contents. @param {import('../lib/storage.js').CustomSound[]} list */
export function groupCustom(list) {
  /** @type {Map<string, ArrayBuffer[]>} */
  const map = new Map();
  for (const s of list) map.set(s.name, [...(map.get(s.name) ?? []), s.bytes]);
  return map;
}

/**
 * The custom-sound library: load at start, add picked files, remove all.
 * @param {{ setCustom: (m: Map<string, ArrayBuffer[]>) => Promise<void>, names: () => Promise<string[]> }} audio
 */
export function createCustomSounds(audio) {
  /** @type {import('../lib/storage.js').CustomSound[]} */
  let list = [];
  const apply = () => audio.setCustom(groupCustom(list));
  return {
    get count() { return list.length; },
    /** Names that have a file of the player's, for the settings list. */
    get replaced() { return [...new Set(list.map((s) => s.name))].sort(); },
    async load() {
      list = await loadCustomSounds().catch(() => []);
      if (list.length) await apply();
    },
    /** Every name a file can take. */
    async names() { return customNames(await audio.names()); },
    /**
     * Keep the files that name a sound; report the rest.
     * @param {File[]} files
     * @returns {Promise<{ added: number, unknown: string[], tooBig: string[], full: boolean }>}
     */
    async add(files) {
      const { matched, unknown, tooBig } = matchFiles(files, await this.names());
      let total = list.reduce((s, x) => s + x.bytes.byteLength, 0);
      let added = 0;
      let full = false;
      for (const m of matched) {
        const f = files[m.file];
        if (total + f.size > CUSTOM_LIMITS.totalBytes) { full = true; break; }
        // The same file picked twice replaces itself rather than adding a variant.
        list = list.filter((s) => !(s.name === m.name && s.file === f.name));
        list.push({ name: m.name, file: f.name, bytes: await f.arrayBuffer() });
        total += f.size;
        added++;
      }
      await saveCustomSounds(list);
      await apply();
      return { added, unknown, tooBig, full };
    },
    async clear() {
      list = [];
      await saveCustomSounds(list);
      await apply();
    },
  };
}
