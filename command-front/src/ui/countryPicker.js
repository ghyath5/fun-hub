// @ts-check
/**
 * Country picker (setup screen and two-phone lobby): a button showing the
 * chosen flag; tapping it opens a sheet of every flag to choose from. Do
 * not put it inside a <label>: a label forwards every click inside it to its
 * first button, which would reopen the sheet as soon as a flag is picked.
 */
import { html, useState } from 'htm/preact';
import { COUNTRIES, countryOf } from '../data/countries.js';
import { flagUrl } from '../lib/flags.js';
import { t, textLang } from '../lib/i18n.js';

/** A country's name in the current language. @param {any} c */
const countryName = (c) => (!c ? '' : textLang() === 'ar' ? c.ar ?? c.name : c.name);

/** A small flag image, or nothing for "no flag". @param {{ id: string | undefined, cls?: string }} p */
export const Flag = ({ id, cls = 'flag' }) => (countryOf(id) ? html`<img class=${cls} src=${flagUrl(/** @type {string} */ (id))} alt=${countryName(countryOf(id))} />` : null);

/**
 * @param {{ value: string | undefined, onPick: (id: string) => void, label: string, compact?: boolean }} p
 *   compact: just the flag (opponent rows); otherwise the flag and the country's name
 */
export function CountryButton({ value, onPick, label, compact = false }) {
  const [open, setOpen] = useState(false);
  const c = countryOf(value);
  const pick = (/** @type {string} */ id) => { setOpen(false); onPick(id); };
  return html`<span class="country-pick">
    <button type="button" class=${`btn country-btn ${compact ? 'compact' : ''}`} aria-label=${label}
      onClick=${(/** @type {Event} */ e) => { e.preventDefault(); setOpen(true); }}>
      ${c ? html`<${Flag} id=${c.id} />` : html`<span class="flag none">?</span>`}${compact ? null : html`<span>${c ? countryName(c) : t('Choose a country')}</span>`}
    </button>
    ${open ? html`<div class="country-sheet" role="dialog" aria-label=${label} onClick=${() => setOpen(false)}>
      <div class="country-grid" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
        <h3>${label}</h3>
        <div class="country-list">
          <button type="button" class=${`country-item ${!c ? 'on' : ''}`} onClick=${() => pick('')}><span class="flag none">–</span><span>${t('No flag')}</span></button>
          ${COUNTRIES.map((k) => html`<button type="button" key=${k.id} class=${`country-item ${k.id === c?.id ? 'on' : ''}`} onClick=${() => pick(k.id)}>
            <${Flag} id=${k.id} /><span>${countryName(k)}<small>${textLang() === 'ar' ? k.name : k.ar}</small></span></button>`)}
        </div>
      </div>
    </div>` : null}
  </span>`;
}
