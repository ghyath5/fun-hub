// @ts-check
/**
 * The info card opened from a build icon's ⓘ (or its long-press menu): a
 * unit's or building's picture, cost and build time, what it is for and
 * what beats it, its headline numbers, weapons, how hard it hits each kind
 * of target, and its traits. The data comes from ui/codex.js.
 */
import { html, useEffect } from 'htm/preact';
import { t } from '../lib/i18n.js';

/** @typedef {import('./codex.js').CodexEntry} CodexEntry */

/** While open, Escape closes the card ahead of the game's own Escape handling. @param {() => void} close @param {boolean} open */
function useEscape(close, open) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, open]);
}

/** One labelled paragraph, skipped when empty. @param {{ label: string, text: string, tone?: string }} p */
const Para = ({ label, text, tone = '' }) => (text ? html`<p class=${`cx-para ${tone}`}><b>${label}</b> ${text}</p>` : null);

/** @param {{ entry: CodexEntry }} p */
function EffectBars({ entry }) {
  if (!entry.effect.length) return null;
  return html`<section class="cx-block">
    <h3>${t('Damage per second against')}</h3>
    <ul class="cx-bars">
      ${entry.effect.map((e) => html`<li key=${e.label} class=${e.dps ? '' : 'none'}>
        <span class="cx-bar-label">${e.label}</span>
        <span class="cx-bar"><span style=${`width:${Math.round(e.share * 100)}%`}></span></span>
        <span class="cx-bar-num">${e.dps ? e.dps : '—'}</span>
      </li>`)}
    </ul>
  </section>`;
}

/** @param {{ entry: CodexEntry }} p */
function Weapons({ entry }) {
  if (!entry.weapons.length) return null;
  return html`<section class="cx-block">
    <h3>${entry.weapons.length > 1 ? t('Weapons') : t('Weapon')}</h3>
    ${entry.weapons.map((w) => html`<div key=${w.name} class="cx-weapon">
      <div class="cx-weapon-name">${w.name} <span class="cx-targets">${w.targets}</span></div>
      <div class="cx-weapon-nums">
        <span><i>${t('Damage')}</i> ${w.damage}</span><span><i>${t('Every')}</i> ${w.every}</span><span><i>${t('Range')}</i> ${w.range}</span>
      </div>
      ${w.notes.length ? html`<div class="cx-weapon-notes">${w.notes.join(' · ')}</div>` : null}
    </div>`)}
  </section>`;
}

/**
 * @param {{ entry: CodexEntry | null, icon: string | undefined, close: () => void }} p
 */
export function CodexCard({ entry, icon, close }) {
  useEscape(close, !!entry);
  if (!entry) return null;
  return html`<div class="cx-backdrop" onPointerDown=${close}>
    <article class="cx panel" role="dialog" aria-modal="true" aria-label=${t('{name} information', { name: entry.name })}
      onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
      <button class="cx-close" aria-label=${t('Close')} onClick=${close}>✕</button>
      <header class="cx-head">
        ${icon ? html`<img class="cx-icon" src=${icon} alt="" draggable="false" />` : null}
        <div>
          <h2>${entry.name}</h2>
          <div class="cx-sub">${entry.kind}${entry.side ? ` · ${entry.side}` : ''}</div>
          <div class="cx-price">
            ${entry.cost ? html`<span class="cx-cost">$${entry.cost.toLocaleString('en-US')}</span>` : null}
            ${entry.buildSeconds ? html`<span class="cx-time">${t('{n} s to build', { n: entry.buildSeconds })}</span>` : null}
          </div>
        </div>
      </header>
      <div class="cx-body">
        <div class="cx-col">
          <${Para} label="" text=${entry.about} />
          <${Para} label=${t('Best used for:')} text=${entry.bestFor} tone="good" />
          <${Para} label=${t('Weak against:')} text=${entry.weakTo} tone="bad" />
          ${entry.requires.length ? html`<p class="cx-para muted-line"><b>${t('Needs:')}</b> ${entry.requires.join(t(', '))}</p>` : null}
          ${entry.traits.length ? html`<ul class="cx-traits">${entry.traits.map((t) => html`<li key=${t}>${t}</li>`)}</ul>` : null}
        </div>
        <div class="cx-col">
          <dl class="cx-stats">
            ${entry.stats.map((s) => html`<div key=${s.label}><dt>${s.label}</dt><dd>${s.value}</dd></div>`)}
          </dl>
          <${Weapons} entry=${entry} />
          <${EffectBars} entry=${entry} />
        </div>
      </div>
    </article>
  </div>`;
}
