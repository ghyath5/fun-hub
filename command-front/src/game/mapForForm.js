// @ts-check
/**
 * The map a setup form asks for: a bundled map, or one generated from the
 * form's seed and size (falling back to Duel Canyon when no seed in the run
 * produces a valid map). Deterministic, so two phones given the same form
 * build the same battlefield.
 */
import { loadMap } from '../map/loader.js';
import { validateMap, describe } from '../map/validator.js';
import { generateMap } from '../map/generator.js';

export const FALLBACK_MAP = 'duel-canyon';

/**
 * @param {import('./matchSetup.js').SetupForm} form
 * @returns {Promise<{ map: any, seed: number | null, error: string }>}  seed: the generator's seed when it chose one
 */
export async function mapForForm(form) {
  if (form.map === 'generated') {
    const gen = generateMap({ seed: form.genSeed, size: form.genSize, players: form.genSize >= 96 ? 4 : 2 });
    if (gen) return { map: gen.map, seed: gen.seed, error: '' };
    return { map: await loadMap(FALLBACK_MAP), seed: null, error: 'No valid map came out of 20 seeds; playing Duel Canyon instead.' };
  }
  const map = await loadMap(form.map);
  const report = validateMap(map);
  if (!report.ok) return { map: null, seed: null, error: `Map "${map.name}" cannot be played:\n${describe(report.errors)}` };
  return { map, seed: null, error: '' };
}
