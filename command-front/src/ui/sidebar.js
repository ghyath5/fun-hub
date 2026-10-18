// @ts-check
/**
 * Build sidebar (section 14): six category tabs with progress badges, a
 * 2-column grid of build icons with their states, long-press menus, Sell and
 * Repair mode buttons, and collapse to a 44 px strip of tab badges.
 */
import { html, useCallback, useState } from 'htm/preact';
import { PressButton } from './press.js';
import { CodexCard } from './codexCard.js';
import { codexEntry } from './codex.js';
import { PRODUCTION } from '../data/rules.js';


/** What a tap on an item that cannot be started says, by its label (ui/model.js REASON_LABEL). */
const LIMIT_TOAST = /** @type {Record<string, string>} */ ({
  'Unit cap': 'Unit cap reached',
  'No free pad': 'Every pad already has an aircraft: build another pad, or lose an aircraft first',
});
/** @typedef {import('./model.js').BuildItem} BuildItem */
/** @typedef {import('./model.js').TabInfo} TabInfo */
/** @typedef {import('../sim/catalog.js').LineId} LineId */

/**
 * @typedef {object} SidebarActions
 * @property {(type: string, count: number) => void} build
 * @property {(line: LineId, paused: boolean) => void} setPaused
 * @property {(line: LineId, opts: { type?: string, all?: boolean, active?: boolean }) => void} cancel
 * @property {(line: LineId) => void} cancelReady
 * @property {(line: LineId) => void} queueFull   a unit line is at its queue limit
 * @property {(type: string) => void} place
 * @property {(text: string) => void} toast
 * @property {(tab: LineId) => void} tab
 * @property {() => void} collapse
 * @property {() => void} sell
 * @property {() => void} repair
 */

const UNIT_LINES = new Set(['infantry', 'vehicles', 'aircraft', 'naval']);

/** Long-press menu for an icon in its current state (section 14 table). @param {BuildItem} it @param {LineId} line */
function menuFor(it, line) {
  const unitLine = UNIT_LINES.has(line);
  /** @type {{ id: string, label: string }[]} */
  const opts = [];
  if (it.state === 'ready') opts.push({ id: 'cancelReady', label: 'Cancel (refund)' });
  else if (it.state === 'building') {
    // A tap on a unit queues another, so pausing a unit lives here instead.
    if (unitLine) opts.push({ id: 'pause', label: 'Pause' }, { id: 'queue5', label: 'Queue ×5' });
    opts.push({ id: 'cancelActive', label: 'Cancel' });
  } else if (it.state === 'paused') {
    if (unitLine) opts.push({ id: 'resume', label: 'Resume' });
    opts.push({ id: 'cancelActive', label: 'Cancel' });
  }
  else if (it.queued) opts.push({ id: 'removeOne', label: 'Remove one' }, { id: 'removeAll', label: 'Remove all' });
  else if (it.state === 'available' && unitLine) opts.push({ id: 'queue5', label: 'Queue ×5' });
  if (it.queued > 1 && it.state !== 'ready') opts.push({ id: 'removeAll', label: 'Cancel all' });
  opts.push({ id: 'info', label: 'Info' });
  return opts.filter((o, i) => opts.findIndex((x) => x.label === o.label) === i);
}

/**
 * Tap on an icon, by state. On a unit line a tap always means "one more"
 * (resuming a paused line first); on Base and Defenses, which build one
 * thing at a time, a tap on the item in progress pauses or resumes it.
 * @param {BuildItem} it @param {LineId} line @param {SidebarActions} act @param {number} lineQueued
 */
function tapItem(it, line, act, lineQueued) {
  if (UNIT_LINES.has(line) && ['available', 'building', 'paused'].includes(it.state)) {
    if (it.state === 'paused') act.setPaused(line, false);
    if (lineQueued >= PRODUCTION.queueMax) act.queueFull(line);
    else act.build(it.type, 1);
    return;
  }
  switch (it.state) {
    case 'available': if (it.wall) act.place(it.type); else act.build(it.type, 1); break;
    case 'building': act.setPaused(line, true); break;
    case 'paused': act.setPaused(line, false); break;
    case 'ready': act.place(it.type); break;
    case 'locked': act.toast(it.label); break;
    case 'limit': act.toast(LIMIT_TOAST[it.label] ?? 'Build limit reached'); break;
    case 'busy': act.toast('Already building'); break;
    default: break;
  }
}

/** Clockwise wipe of what is left to build. @param {number} progress @param {boolean} grey */
const wipe = (progress, grey) => {
  const deg = Math.round(progress * 360);
  const shade = grey ? 'rgba(90,90,84,.72)' : 'rgba(8,9,6,.62)';
  return `background: conic-gradient(transparent 0deg ${deg}deg, ${shade} ${deg}deg 360deg)`;
};

/**
 * One build icon with its ⓘ button in the top-left corner (a sibling, not a
 * child, so pressing it never counts as a press on the icon).
 * @param {{ it: BuildItem, line: LineId, lineQueued: number, icon: string | undefined, act: SidebarActions,
 *   openMenu: (it: BuildItem) => void, openInfo: (it: BuildItem) => void }} p
 */
function BuildIcon({ it, line, lineQueued, icon, act, openMenu, openInfo }) {
  const live = it.state === 'building' || it.state === 'paused';
  return html`<div class="bcell">
  <${PressButton} class=${`bicon ${it.state}`} aria-label=${`${it.name}, ${it.cost} credits${it.label ? `, ${it.label}` : ''}${it.state === 'ready' ? ', ready' : ''}`}
      tap=${() => tapItem(it, line, act, lineQueued)} longPress=${() => openMenu(it)}>
    ${icon ? html`<img src=${icon} alt="" draggable="false" />` : html`<span class="bicon-name">${it.name}</span>`}
    ${live ? html`<span class="bicon-wipe" style=${wipe(it.progress, it.state === 'paused')}></span>` : null}
    ${it.state === 'locked' ? html`<span class="bicon-lock" aria-hidden="true">🔒</span>` : null}
    ${it.queued > 1 || (it.queued === 1 && !live) ? html`<span class="bicon-badge">${it.queued}</span>` : null}
    ${it.state === 'ready' ? html`<span class="bicon-ready">READY</span>` : null}
    ${it.state === 'paused' ? html`<span class="bicon-hold">${it.label}</span>` : null}
    <span class="bicon-cost">${it.cost ? `$${it.cost}` : it.name}</span>
  </${PressButton}>
  <button class="bicon-info" aria-label=${`About ${it.name}`} onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}
    onClick=${() => openInfo(it)}><span aria-hidden="true">i</span></button>
  </div>`;
}

/** Ring badge for a tab: progress of its active item, or READY. @param {{ t: TabInfo }} p */
function TabBadge({ t }) {
  if (t.ready) return html`<span class="tab-ready" aria-label="ready"></span>`;
  if (t.progress < 0) return null;
  return html`<span class="tab-prog" style=${`width:${Math.round(t.progress * 100)}%`}></span>`;
}

/**
 * @param {{ model: { tabs: TabInfo[], items: Record<LineId, BuildItem[]>, faction: string }, icons: Record<string, string>, tab: LineId,
 *   collapsed: boolean, mode: string | null, act: SidebarActions }} p
 */
export function Sidebar({ model, icons, tab, collapsed, mode, act }) {
  const [menu, setMenu] = useState(/** @type {{ it: BuildItem, opts: { id: string, label: string }[] } | null} */ (null));
  const [info, setInfo] = useState(/** @type {BuildItem | null} */ (null));
  const closeInfo = useCallback(() => setInfo(null), []);
  const line = tab;
  const pick = (/** @type {string} */ id) => {
    const it = menu?.it;
    setMenu(null);
    if (!it) return;
    switch (id) {
      case 'queue5': act.build(it.type, 5); break;
      case 'pause': act.setPaused(line, true); break;
      case 'resume': act.setPaused(line, false); break;
      case 'cancelActive': act.cancel(line, { active: true }); break;
      case 'cancelReady': act.cancelReady(line); break;
      case 'removeOne': act.cancel(line, { type: it.type }); break;
      case 'removeAll': act.cancel(line, { all: true }); break;
      case 'info': setInfo(it); break;
      default: break;
    }
  };

  if (collapsed) {
    return html`<aside class="sidebar collapsed panel" aria-label="Build menu (collapsed)">
      <button class="sb-toggle" aria-label="Show build menu" onClick=${act.collapse}>«</button>
      ${model.tabs.filter((t) => t.items).map((t) => html`<button key=${t.id} class=${`tab mini ${t.ready ? 'ready' : ''}`}
        onClick=${() => { act.tab(t.id); act.collapse(); }}>${t.label}<${TabBadge} t=${t} /></button>`)}
    </aside>`;
  }

  const items = model.items[line] ?? [];
  return html`<aside class="sidebar panel" aria-label="Build menu">
    <div class="sb-head">
      <button class=${`sb-mode ${mode === 'sell' ? 'on sell' : ''}`} aria-pressed=${mode === 'sell'} onClick=${act.sell} title="Sell mode">$ Sell</button>
      <button class=${`sb-mode ${mode === 'repair' ? 'on' : ''}`} aria-pressed=${mode === 'repair'} onClick=${act.repair} title="Repair mode">🔧</button>
      <button class="sb-toggle" aria-label="Hide build menu" onClick=${act.collapse}>»</button>
    </div>
    <div class="tabs" role="tablist">
      ${model.tabs.map((t) => html`<button key=${t.id} role="tab" aria-selected=${t.id === line}
        class=${`tab ${t.id === line ? 'on' : ''} ${t.ready ? 'ready' : ''}`} disabled=${!t.items} onClick=${() => act.tab(t.id)}>
        ${t.label}<${TabBadge} t=${t} /></button>`)}
    </div>
    <div class="bgrid" role="tabpanel">
      ${items.length ? items.map((it) => html`<${BuildIcon} key=${it.type} it=${it} line=${line} lineQueued=${model.tabs.find((t) => t.id === line)?.queued ?? 0} icon=${icons[it.type]} act=${act}
        openMenu=${(/** @type {BuildItem} */ i) => setMenu({ it: i, opts: menuFor(i, line) })} openInfo=${setInfo} />`)
        : html`<p class="bgrid-empty">Nothing to build</p>`}
    </div>
    ${menu ? html`<div class="bmenu-backdrop" onPointerDown=${() => setMenu(null)}>
      <div class="bmenu panel" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
        <div class="bmenu-title">${menu.it.name}</div>
        ${menu.opts.map((o) => html`<button key=${o.id} class="cmd" onClick=${() => pick(o.id)}>${o.label}</button>`)}
      </div>
    </div>` : null}
    ${info ? html`<${CodexCard} entry=${codexEntry(info.type, model.faction, info.cost)} icon=${icons[info.type]} close=${closeInfo} />` : null}
  </aside>`;
}
