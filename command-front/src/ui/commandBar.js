// @ts-check
/**
 * Command bar, selection summary, control groups and the enemy info card
 * (section 14). Reads a HUD snapshot; acts only through the callbacks it is given.
 */
import { html } from 'htm/preact';
import { PressButton } from './press.js';
import { healthBand } from '../sim/formulas/combat.js';
import { GESTURE } from '../data/ui.js';
import { SPECIALS } from '../data/rules.js';
import { toUi } from './fit.js';
import { t, textLang } from '../lib/i18n.js';

const STANCE_LABEL = { guard: 'Guard', hold: 'Hold', holdFire: 'No fire' };

/**
 * @typedef {object} SelectionInfo
 * @property {number} count
 * @property {{ type: string, name: string, count: number }[]} types
 * @property {'guard' | 'hold' | 'holdFire'} [stance]
 * @property {{ deploy?: boolean, harvest?: boolean, unload?: boolean, mines?: boolean, returnPad?: boolean }} [can]   Contextual buttons that apply
 */

/** Short label for a type chip: initials for multi-word names, else the first three letters. @param {string} name */
const abbrev = (name) => {
  // Arabic letters do not abbreviate: the first word, shortened.
  if (textLang() === 'ar') return name.split(' ')[0].slice(0, 5);
  const words = name.split(' ');
  return (words.length > 1 ? words.map((w) => w[0]).join('') : name.slice(0, 3)).toUpperCase();
};

/**
 * @param {{ sel: SelectionInfo, onTop: boolean, addMode: boolean, selectMode: boolean, targetMode: string | null,
 *   act: { stop: () => void, scatter: () => void, same: () => void, deselect: () => void, narrow: (t: string) => void,
 *     toggleAdd: () => void, toggleSelect: () => void, stance: () => void, attackMove: () => void,
 *     deploy: () => void, harvest: () => void, unload: () => void, mines: () => void, returnPad: () => void } }} p
 */
export function CommandBar({ sel, onTop, addMode, selectMode, targetMode, act }) {
  if (!sel.count) return null;
  return html`<section class=${`cmdbar panel ${onTop ? 'top' : ''}`} aria-label=${t('Commands')}>
    <div class="cmd-row">
      <button class="cmd" onClick=${act.stop}>${t('Stop')}</button>
      <button class="cmd" onClick=${act.stance} title=${t('Guard → Hold Position → Hold Fire')}>${t(STANCE_LABEL[sel.stance ?? 'guard'])}</button>
      <button class=${`cmd ${targetMode === 'attackMove' ? 'on' : ''}`} aria-pressed=${targetMode === 'attackMove'} onClick=${act.attackMove} title=${t('Next tap: attack-move there')}>${t('A-Move')}</button>
      <button class="cmd" onClick=${act.scatter}>${t('Scatter')}</button>
      ${sel.can?.deploy ? html`<button class="cmd ctx" onClick=${act.deploy}>${t('Deploy')}</button>` : null}
      ${sel.can?.harvest ? html`<button class="cmd ctx" onClick=${act.harvest}>${t('Harvest')}</button>` : null}
      ${sel.can?.unload ? html`<button class="cmd ctx" onClick=${act.unload}>${t('Unload')}</button>` : null}
      ${sel.can?.mines ? html`<button class=${`cmd ctx ${targetMode === 'mines' ? 'on' : ''}`} onClick=${act.mines}>${t('Mines')}</button>` : null}
      ${sel.can?.returnPad ? html`<button class="cmd ctx" onClick=${act.returnPad}>${t('Return')}</button>` : null}
      <button class="cmd" onClick=${act.same} title=${t('Select all of these types on screen')}>${t('Same')}</button>
      <button class=${`cmd ${addMode ? 'on' : ''}`} aria-pressed=${addMode} onClick=${act.toggleAdd} title=${t('Taps add or remove units')}>${t('Add')}</button>
      <button class=${`cmd ${selectMode ? 'on' : ''}`} aria-pressed=${selectMode} onClick=${act.toggleSelect} title=${t('One-finger drag draws a selection box')}>${t('Box')}</button>
      <button class="cmd" onClick=${act.deselect} aria-label=${t('Deselect')}>✕</button>
    </div>
    <div class="sel-row">
      <span class="sel-count">${t('{n} sel:', { n: sel.count })}</span>
      ${sel.types.map((t) => html`<button key=${t.type} class="chip" onClick=${() => act.narrow(t.type)} title=${t.name}>
        <b>${abbrev(t.name)}</b> ×${t.count}</button>`)}
    </div>
  </section>`;
}

/**
 * Control groups (section 15) on the left edge: tap a number to select its
 * units — or, when it is empty and units are selected, to save them as that
 * group; double-tap to centre on them; hold to save the selection over it.
 * The column folds away behind its toggle.
 * @param {{ sizes: number[], collapsed: boolean, act: { recall: (n: number) => void, tap: (n: number) => void, centre: (n: number) => void,
 *   assign: (n: number) => void, toggle: () => void } }} p
 */
export function ControlGroups({ sizes, collapsed, act }) {
  return html`<nav class=${`groups ${collapsed ? 'collapsed' : ''}`} aria-label=${t('Control groups')}>
    <button class="group-toggle" dir="ltr" aria-expanded=${!collapsed} onClick=${act.toggle}
      aria-label=${collapsed ? t('Show control groups') : t('Hide control groups')}>${collapsed ? '›' : '‹'}</button>
    ${collapsed ? null : sizes.map((n, i) => html`<${PressButton} key=${i} class=${`group ${n ? '' : 'empty'}`}
      aria-label=${n ? t('Group {g}, {n} units. Tap to select, hold to replace', { g: i + 1, n }) : t('Group {g}, empty. Select units, then tap to save them here', { g: i + 1 })}
      tap=${() => act.tap(i)} doubleTap=${() => act.centre(i)} longPress=${() => act.assign(i)}>
      <span class="g-num">${i + 1}</span>${n ? html`<span class="g-count">${n}</span>` : null}
    </${PressButton}>`)}
  </nav>`;
}

/** @param {{ card: { name: string, hp: number, maxHp: number, owner: string } | null }} p */
export function InfoCard({ card }) {
  if (!card) return null;
  const band = healthBand(card.hp, card.maxHp);
  return html`<div class="infocard panel" role="status">
    <div class="ic-name">${card.name} <span class="muted">· ${card.owner}</span></div>
    <div class="ic-bar"><span class=${`ic-fill ${band}`} style=${`width:${Math.round((card.hp / card.maxHp) * 100)}%`}></span></div>
    <div class="ic-hp">${card.hp} / ${card.maxHp}</div>
  </div>`;
}

/**
 * Radial menu (section 15): up to 4 options of 48 px on a 64 px radius round
 * the lift point, kept inside the screen. A tap anywhere else closes it.
 * @param {{ menu: { x: number, y: number, options: { id: string, label: string }[] } | null, pick: (id: string) => void, close: () => void }} p
 */
export function RadialMenu({ menu, pick, close }) {
  if (!menu) return null;
  const R = GESTURE.radialRadiusPx;
  const S = GESTURE.radialOptionPx;
  const vw = toUi(window.innerWidth);
  const vh = toUi(window.innerHeight);
  const cx = Math.min(vw - R - S / 2 - 4, Math.max(R + S / 2 + 4, toUi(menu.x)));
  const cy = Math.min(vh - R - S / 2 - 4, Math.max(R + S / 2 + 4, toUi(menu.y)));
  const n = menu.options.length;
  return html`<div class="radial-backdrop" onPointerDown=${close}>
    <div class="radial-hub" style=${`left:${cx}px;top:${cy}px`}></div>
    ${menu.options.map((o, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + Math.cos(a) * R - S / 2;
      const y = cy + Math.sin(a) * R - S / 2;
      return html`<button key=${o.id} class="radial-opt panel" style=${`left:${x}px;top:${y}px;width:${S}px;height:${S}px`}
        onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()} onClick=${() => pick(o.id)}>${t(o.label)}</button>`;
    })}
  </div>`;
}

const BANNER_TEXT = {
  attackMove: 'Tap where to attack-move',
  sell: 'Sell: tap a structure',
  repair: 'Repair: tap a structure',
  rally: 'Tap the rally point',
  walls: 'Drag to draw the wall',
  mines: 'Lay mines: tap or drag cells',
  power: 'Aim the support power',
};

/**
 * Banner while the next tap picks a target or a mode is on; Lay Mines also counts the mines
 * queued and what they will cost.
 * @param {{ mode: string | null, count?: { queued: number, cost: number } | null, cancel: () => void }} p
 */
export function TargetBanner({ mode, count, cancel }) {
  if (!mode || mode === 'place') return null;
  if (mode === 'power' || mode === 'mines' || mode === 'walls') {
    const tally = mode === 'mines' && count?.queued ? html` <b class="mine-count">${count.queued} × $${SPECIALS.mineCost} = $${count.cost}</b>` : null;
    return html`<div class=${`target-banner panel ${mode}`} role="status">${t(BANNER_TEXT[mode])}${tally}</div>`;
  }
  const text = t(BANNER_TEXT[/** @type {keyof typeof BANNER_TEXT} */ (mode)] ?? 'Tap a target');
  return html`<div class=${`target-banner panel ${mode}`} role="status">${text}<button class="cmd" onClick=${cancel} aria-label=${t('Cancel')}>✕</button></div>`;
}

/**
 * @typedef {ReturnType<typeof import('./model.js').structureCard>} StructureInfo
 */

/**
 * Command bar for a selected structure (section 14): Sell, Repair, Rally,
 * Set Primary, and the HP / power readout.
 * @param {{ s: StructureInfo | null, onTop: boolean, sellArmed: boolean, rallyMode: boolean,
 *   act: { sell: () => void, repair: () => void, rally: () => void, primary: () => void, deselect: () => void } }} p
 */
export function StructureBar({ s, onTop, sellArmed, rallyMode, act }) {
  if (!s) return null;
  const band = healthBand(s.hp, s.maxHp);
  const pw = s.power > 0 ? `+${s.power}` : `${s.power}`;
  return html`<section class=${`cmdbar panel ${onTop ? 'top' : ''}`} aria-label=${t('{name} commands', { name: s.name })}>
    <div class="sb-card">
      <span class="sb-name">${s.name}${s.primary ? html` <b class="sb-prim">${t('PRIMARY')}</b>` : null}</span>
      <span class="ic-bar sb-hp"><span class=${`ic-fill ${band}`} style=${`width:${Math.round((s.hp / s.maxHp) * 100)}%`}></span></span>
      <span class="sb-nums">${s.hp}/${s.maxHp}${s.power ? html` · ${t('PWR')} ${pw}` : null}</span>
    </div>
    ${s.own ? html`<div class="cmd-row">
      <button class=${`cmd ${sellArmed ? 'danger' : ''}`} disabled=${!s.canSell} onClick=${act.sell}>${sellArmed ? t('Confirm') : t('Sell')}</button>
      <button class=${`cmd ${s.repairing ? 'on' : ''}`} aria-pressed=${s.repairing} disabled=${!s.canRepair} onClick=${act.repair}>${t('Repair')}</button>
      ${s.canRally ? html`<button class=${`cmd ${rallyMode ? 'on' : ''}`} onClick=${act.rally}>${t('Rally')}</button>` : null}
      ${s.canPrimary ? html`<button class=${`cmd ${s.primary ? 'on' : ''}`} onClick=${act.primary}>${t('Primary')}</button>` : null}
      <button class="cmd" onClick=${act.deselect} aria-label=${t('Deselect')}>✕</button>
    </div>` : null}
  </section>`;
}

/**
 * Floating ✓ Place / ✕ Cancel pair above the ghost, flipped below near the top edge (section 15).
 * @param {{ at: { x: number, y: number, ok: boolean, reason: string } | null, place: () => void, cancel: () => void }} p
 */
export function PlaceControls({ at, place, cancel }) {
  if (!at) return null;
  return html`<div class="placectl" style=${`left:${Math.round(toUi(at.x))}px;top:${Math.round(toUi(at.y))}px`}>
    <button class="cmd place-ok" disabled=${!at.ok} onClick=${place} aria-label=${t('Place')}>✓</button>
    <button class="cmd" onClick=${cancel} aria-label=${t('Cancel placement')}>✕</button>
    ${!at.ok && at.reason ? html`<span class="place-why">${t(at.reason)}</span>` : null}
  </div>`;
}
