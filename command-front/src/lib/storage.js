// @ts-check
/**
 * Saves and settings: JSON → gzip (fflate) → IndexedDB (idb-keyval).
 * Every save carries a format version and is refused whole on a mismatch.
 */
import { get, set, del, keys, createStore } from 'idb-keyval';
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { VICTORY } from '../data/rules.js';

const store = createStore('command-front', 'kv');

/** @param {object} data */
export function pack(data) {
  return gzipSync(strToU8(JSON.stringify({ v: VICTORY.saveFormatVersion, data })));
}

/** @param {Uint8Array} bytes */
export function unpack(bytes) {
  const doc = JSON.parse(strFromU8(gunzipSync(bytes)));
  if (doc?.v !== VICTORY.saveFormatVersion) {
    throw new Error(`This save was made by a different version of the game (format ${doc?.v}, need ${VICTORY.saveFormatVersion}).`);
  }
  return doc.data;
}

/** @param {string} slot @param {object} state @param {string} [info] One line shown in the slot list */
export async function saveGame(slot, state, info = '') {
  await set(`save:${slot}`, { at: new Date().toISOString(), info, bytes: pack(state) }, store);
}

/** @param {string} slot */
export async function loadGame(slot) {
  const rec = await get(`save:${slot}`, store);
  return rec ? unpack(rec.bytes) : null;
}

/** @param {string} slot */
export const deleteGame = (slot) => del(`save:${slot}`, store);

export async function listSaves() {
  const all = /** @type {string[]} */ (await keys(store));
  const out = [];
  for (const k of all.filter((k) => String(k).startsWith('save:'))) {
    const rec = await get(k, store);
    out.push({ slot: String(k).slice(5), at: rec?.at, info: rec?.info ?? '' });
  }
  return out;
}

/** @param {object} settings */
export const saveSettings = (settings) => set('settings', settings, store);
export const loadSettings = async () => (await get('settings', store)) ?? {};
