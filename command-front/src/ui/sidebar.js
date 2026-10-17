// @ts-check
/**
 * Build sidebar (section 14): six category tabs with progress badges, a
 * 2-column grid of build icons with their states, long-press menus, Sell and
 * Repair mode buttons, and collapse to a 44 px strip of tab badges.
 */
import { html, useState } from 'htm/preact';
import { PressButton } from './press.js';

/** @typedef {import('./model.js').BuildItem} BuildItem */
/** @typedef {import('./model.js').TabInfo} TabInfo */
/** @typedef {import('../sim/catalog.js').LineId} LineId */

/**
 * @typedef {object} SidebarActions
 * @property {(type: string, count: number) => void} build
 * @property {(line: LineId, paused: boolean) => void} setPaused
 * @property {(line: LineId, opts: { type?: string, all?: boolean, active?: boolean }) => void} cancel
 * @property {(line: LineId) => void} cancelReady
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
    opts.push({ id: 'cancelActive', label: 'Cancel' });
    if (unitLine) opts.push({ id: 'queue5', label: 'Queue ×5' });
  } else if (it.state === 'paused') opts.push({ id: 'cancelActive', label: 'Cancel' });
  else if (it.queued) opts.push({ id: 'removeOne', label: 'Remove one' }, { id: 'removeAll', label: 'Remove all' });
  else if (it.state === 'available' && unitLine) opts.push({ id: 'queue5', label: 'Queue ×5' });
  if (it.queued > 1 && it.state !== 'ready') opts.push({ id: 'removeAll', label: 'Cancel all' });
  return opts.filter((o, i) => opts.findIndex((x) => x.label === o.label) === i);
}

/** Tap on an icon, by state. @param {BuildItem} it @param {LineId} line @param {SidebarActions} act */
function tapItem(it, line, act) {
  switch (it.state) {
    case 'available': if (it.wall) act.place(it.type); else act.build(it.type, 1); break;
    case 'building': act.setPaused(line, true); break;
    case 'paused': act.setPaused(line, false); break;
    case 'ready': act.place(it.type); break;
    case 'locked': act.toast(it.label); break;
    case 'limit': act.toast(it.label === 'Unit cap' ? 'Unit cap reached' : 'Build limit reached'); break;
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

/** @param {{ it: BuildItem, line: LineId, icon: string | undefined, act: SidebarActions, openMenu: (it: BuildItem) => void }} p */
function BuildIcon({ it, line, icon, act, openMenu }) {
  const live = it.state === 'building' || it.state === 'paused';
  return html`<${PressButton} class=${`bicon ${it.state}`} aria-label=${`${it.name}, ${it.cost} credits${it.label ? `, ${it.label}` : ''}${it.state === 'ready' ? ', ready' : ''}`}
      tap=${() => tapItem(it, line, act)} longPress=${() => openMenu(it)}>
    ${icon ? html`<img src=${icon} alt="" draggable="false" />` : html`<span class="bicon-name">${it.name}</span>`}
    ${live ? html`<span class="bicon-wipe" style=${wipe(it.progress, it.state === 'paused')}></span>` : null}
    ${it.state === 'locked' ? html`<span class="bicon-lock" aria-hidden="true">🔒</span>` : null}
    ${it.queued > 1 || (it.queued === 1 && !live) ? html`<span class="bicon-badge">${it.queued}</span>` : null}
    ${it.state === 'ready' ? html`<span class="bicon-ready">READY</span>` : null}
    ${it.state === 'paused' ? html`<span class="bicon-hold">${it.label}</span>` : null}
    <span class="bicon-cost">${it.cost ? `$${it.cost}` : it.name}</span>
  </${PressButton}>`;
}

/** Ring badge for a tab: progress of its active item, or READY. @param {{ t: TabInfo }} p */
function TabBadge({ t }) {
  if (t.ready) return html`<span class="tab-ready" aria-label="ready"></span>`;
  if (t.progress < 0) return null;
  return html`<span class="tab-prog" style=${`width:${Math.round(t.progress * 100)}%`}></span>`;
}

/**
 * @param {{ model: { tabs: TabInfo[], items: Record<LineId, BuildItem[]> }, icons: Record<string, string>, tab: LineId,
 *   collapsed: boolean, mode: string | null, act: SidebarActions }} p
 */
export function Sidebar({ model, icons, tab, collapsed, mode, act }) {
  const [menu, setMenu] = useState(/** @type {{ it: BuildItem, opts: { id: string, label: string }[] } | null} */ (null));
  const line = tab;
  const pick = (/** @type {string} */ id) => {
    const it = menu?.it;
    setMenu(null);
    if (!it) return;
    switch (id) {
      case 'queue5': act.build(it.type, 5); break;
      case 'cancelActive': act.cancel(line, { active: true }); break;
      case 'cancelReady': act.cancelReady(line); break;
      case 'removeOne': act.cancel(line, { type: it.type }); break;
      case 'removeAll': act.cancel(line, { all: true }); break;
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
      ${items.length ? items.map((it) => html`<${BuildIcon} key=${it.type} it=${it} line=${line} icon=${icons[it.type]} act=${act}
        openMenu=${(/** @type {BuildItem} */ i) => { const opts = menuFor(i, line); if (opts.length) setMenu({ it: i, opts }); }} />`)
        : html`<p class="bgrid-empty">Nothing to build</p>`}
    </div>
    ${menu ? html`<div class="bmenu-backdrop" onPointerDown=${() => setMenu(null)}>
      <div class="bmenu panel" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
        <div class="bmenu-title">${menu.it.name}</div>
        ${menu.opts.map((o) => html`<button key=${o.id} class="cmd" onClick=${() => pick(o.id)}>${o.label}</button>`)}
      </div>
    </div>` : null}
  </aside>`;
}
