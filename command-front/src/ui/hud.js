// @ts-check
/**
 * HUD root (section 14): top bar, sidebar, command bars, control groups,
 * toasts, mode banners, placement controls, radial menu and the pause sheet.
 * Renders a snapshot; every action goes through the callbacks it is given.
 */
import { html, render } from 'htm/preact';
import { useSnapshot } from './store.js';
import { Toasts } from './toasts.js';
import { CommandBar, ControlGroups, InfoCard, RadialMenu, TargetBanner, StructureBar, PlaceControls } from './commandBar.js';
import { Sidebar } from './sidebar.js';
import { Minimap } from './minimap.js';
import { LinkCard } from './linkCard.js';
import { t, int } from '../lib/i18n.js';
import { GAME_SPEEDS } from '../data/rules.js';

/** A map's name in the current language ("Huge 128×128 #42": the size word is translated). @param {string} name */
const mapLabel = (name) => name.replace(/^[A-Za-z][A-Za-z ]*?(?= \d|$)/, (w) => t(w));

/**
 * @typedef {object} HudState
 * @property {number} credits
 * @property {number} powerProduced
 * @property {number} powerDrain
 * @property {number} powerPreview     Change the structure being placed would make (0 = none)
 * @property {boolean} paused
 * @property {string} mapName
 * @property {number} cellsVisible
 * @property {import('./toasts.js').Toast[]} toasts
 * @property {string | null} hash    Debug state hash
 * @property {import('./commandBar.js').SelectionInfo} sel
 * @property {number[]} groups        Units per control group
 * @property {boolean} groupsCollapsed The control-group column is folded away
 * @property {boolean} barTop         Command bar moved to the top so it never covers the selection
 * @property {boolean} addMode
 * @property {boolean} selectMode
 * @property {{ name: string, hp: number, maxHp: number, owner: string } | null} card
 * @property {{ x: number, y: number, options: { id: string, label: string }[] } | null} radial
 * @property {string | null} targetMode   attackMove | sell | repair | rally | place | walls
 * @property {number} alertCount
 * @property {ReturnType<typeof import('./model.js').sidebarModel>} sidebar
 * @property {Record<string, string>} icons
 * @property {import('../sim/catalog.js').LineId} tab
 * @property {boolean} collapsed
 * @property {import('./commandBar.js').StructureInfo | null} structure
 * @property {boolean} sellArmed
 * @property {{ x: number, y: number, ok: boolean, reason: string } | null} placeAt
 * @property {{ id: string, name: string, progress: number, ready: boolean }[]} powers  Support powers with charge
 * @property {string | null} intel     Spy intelligence line (enemy credits)
 * @property {boolean} radar
 * @property {boolean} mapCollapsed
 * @property {boolean} confirmSurrender
 * @property {boolean} defeated      Eliminated while others play on (Watch / Exit)
 * @property {boolean} watching
 * @property {string | null} hint    First-match hint
 * @property {boolean} ended
 * @property {boolean} online      Two-phone match: no saves, shared pause
 * @property {string} speed         Game speed (a GAME_SPEEDS key)
 * @property {import('../net/netMatch.js').LinkCard} link  The other phone's state
 * @property {boolean} [linkDismissed]
 */

/**
 * @typedef {object} HudActions
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {(speed: string) => void} [speed]  change the game speed (single player)
 * @property {(at: {x: number, y: number}) => void} jump
 * @property {() => void} fullscreen
 * @property {Parameters<typeof CommandBar>[0]['act']} cmd
 * @property {Parameters<typeof ControlGroups>[0]['act']} groups
 * @property {(id: string) => void} radialPick
 * @property {() => void} radialClose
 * @property {() => void} cancelTarget
 * @property {() => void} alertJump
 * @property {(dir: 1 | -1) => void} zoom   the + and − buttons
 * @property {import('./sidebar.js').SidebarActions} build
 * @property {Parameters<typeof StructureBar>[0]['act']} structure
 * @property {() => void} place
 * @property {(id: string) => void} power
 * @property {(c: HTMLCanvasElement | null) => void} minimapCanvas
 * @property {(fx: number, fy: number) => void} minimapJump
 * @property {() => void} minimapToggle
 * @property {() => void} save
 * @property {() => void} load
 * @property {() => void} exit
 * @property {import('./linkCard.js').LinkActions} [link]
 * @property {() => void} surrender
 * @property {() => void} watch
 * @property {() => void} dismissHint
 */

/** Support-power button with a charge ring (section 14). @param {{ p: { id: string, name: string, progress: number, ready: boolean }, fire: (id: string) => void }} props */
function PowerButton({ p, fire }) {
  const deg = Math.round(p.progress * 360);
  const short = p.short ?? p.name.split(' ').map((w) => w[0]).join('');
  return html`<button class=${`pw-btn ${p.ready ? 'ready' : ''}`} aria-label=${p.ready ? t('{name}, ready', { name: p.name }) : t('{name}, {pct}% charged', { name: p.name, pct: Math.round(p.progress * 100) })}
    title=${p.name} onClick=${() => fire(p.id)} style=${`--deg:${deg}deg`}><span>${short}</span></button>`;
}

/** @param {{ produced: number, drain: number, preview: number }} p */
function PowerBar({ produced, drain, preview }) {
  const nextProduced = produced + Math.max(0, preview);
  const nextDrain = drain - Math.min(0, preview);
  const ratio = nextDrain === 0 ? 1 : nextProduced / nextDrain;
  const fill = Math.max(0, Math.min(1, nextDrain === 0 ? 0 : nextDrain / Math.max(nextProduced, 1)));
  const tone = nextDrain === 0 ? 'ok' : ratio < 1 ? 'low' : ratio < 1.1 ? 'warn' : 'ok';
  const label = preview ? `${t('PWR')} ${nextProduced}/${nextDrain}*` : `${t('PWR')} ${produced}/${drain}`;
  return html`<div class=${`power ${tone} ${preview ? 'preview' : ''}`} role="meter" aria-label=${t('Power')} aria-valuenow=${produced} aria-valuemax=${Math.max(produced, drain)}>
    <span class="power-fill" style=${`width:${Math.round(fill * 100)}%`}></span>
    <span class="power-label">${label}</span>
  </div>`;
}

/**
 * @param {{ store: ReturnType<typeof import('./store.js').createStore<HudState>>, actions: HudActions }} props
 */
function Hud({ store, actions }) {
  const s = useSnapshot(store);
  const placing = s.targetMode === 'place' || s.targetMode === 'walls' || s.targetMode === 'mines' || s.targetMode === 'power';
  return html`
    <header class="topbar panel">
      <span class="credits" aria-label=${t('Credits')}>$ ${int(s.credits)}</span>
      <${PowerBar} produced=${s.powerProduced} drain=${s.powerDrain} preview=${s.powerPreview} />
      ${s.powers.map((p) => html`<${PowerButton} key=${p.id} p=${p} fire=${actions.power} />`)}
      ${s.intel ? html`<span class="intel" title=${t('Spy intelligence')}>${s.intel}</span>` : null}
      <span class="spacer"></span>
      <button class="icon-btn zoom-btn" aria-label=${t('Zoom out')} onClick=${() => actions.zoom(-1)}>−</button>
      <button class="icon-btn zoom-btn" aria-label=${t('Zoom in')} onClick=${() => actions.zoom(1)}>+</button>
      <button class="icon-btn" aria-label=${t('Jump to recent alerts')} disabled=${!s.alertCount} onClick=${actions.alertJump}>!</button>
      <button class="icon-btn" aria-label=${t('Pause')} onClick=${actions.pause}>❚❚</button>
    </header>
    <${Toasts} toasts=${s.toasts} onJump=${actions.jump} />
    <${ControlGroups} sizes=${s.groups} collapsed=${s.groupsCollapsed} act=${actions.groups} />
    <${Minimap} radar=${s.radar} collapsed=${s.mapCollapsed} onCanvas=${actions.minimapCanvas} jump=${actions.minimapJump} toggle=${actions.minimapToggle} />
    <${Sidebar} model=${s.sidebar} icons=${s.icons} tab=${s.tab} collapsed=${s.collapsed || placing}
      mode=${s.targetMode} act=${actions.build} />
    ${placing ? null : html`
      <${CommandBar} sel=${s.sel} onTop=${s.barTop} addMode=${s.addMode} selectMode=${s.selectMode} targetMode=${s.targetMode} act=${actions.cmd} />
      <${StructureBar} s=${s.sel.count ? null : s.structure} onTop=${s.barTop} sellArmed=${s.sellArmed}
        rallyMode=${s.targetMode === 'rally'} act=${actions.structure} />`}
    <${PlaceControls} at=${s.placeAt} place=${actions.place} cancel=${actions.cancelTarget} />
    <${InfoCard} card=${s.card} />
    <${TargetBanner} mode=${s.targetMode} cancel=${actions.cancelTarget} />
    <${RadialMenu} menu=${s.radial} pick=${actions.radialPick} close=${actions.radialClose} />
    ${s.hash ? html`<div class="debug-hash">${s.hash} · ${s.cellsVisible.toFixed(1)} cells</div>` : null}
    ${s.hint ? html`<button class="hint panel" onClick=${actions.dismissHint}>${t(s.hint)}</button>` : null}
    ${s.watching ? html`<div class="watch-tag panel">${t('Watching')} · <button class="cmd" onClick=${actions.exit}>${t('Exit')}</button></div>` : null}
    ${s.ended ? html`<div class="ended-tag panel" role="status">${t('Match over')}</div>` : null}
    ${s.defeated && !s.watching ? html`
      <div class="sheet-backdrop">
        <div class="sheet panel" role="dialog" aria-label=${t('Defeated')}>
          <h2>${t('Defeated')}</h2>
          <p class="muted">${t('The others fight on.')}</p>
          <button class="btn primary" onClick=${actions.watch}>${t('Watch')}</button>
          <button class="btn" onClick=${actions.exit}>${t('Exit to menu')}</button>
        </div>
      </div>` : null}
    ${s.paused ? html`
      <div class="sheet-backdrop">
        <div class="sheet panel" role="dialog" aria-label=${t('Paused')}>
          <h2>${t('Paused')}</h2>
          <p class="muted">${s.online ? t('The other phone waits until you resume.') : mapLabel(s.mapName)}</p>
          <button class="btn primary" onClick=${actions.resume}>${t('Resume')}</button>
          ${s.online || !actions.speed ? null : html`<div class="speed-pick" role="group" aria-label=${t('Game speed')}>
            <span class="muted">${t('Game speed')}</span>
            <div class="speed-row">${Object.entries(GAME_SPEEDS).map(([id, g]) => html`<button key=${id}
              class=${`btn speed ${s.speed === id ? 'on' : ''}`} aria-pressed=${s.speed === id} onClick=${() => actions.speed?.(id)}>${t(g.name)}</button>`)}</div>
          </div>`}
          ${s.online ? null : html`<div class="sheet-row">
            <button class="btn" disabled=${s.watching || s.ended} onClick=${actions.save}>${t('Save')}</button>
            <button class="btn" onClick=${actions.load}>${t('Load')}</button>
          </div>`}
          <div class="sheet-row">
            <button class="btn" onClick=${actions.fullscreen}>${t('Fullscreen')}</button>
            <button class=${`btn ${s.confirmSurrender ? 'danger' : ''}`} disabled=${s.watching || s.ended} onClick=${actions.surrender}>
              ${s.confirmSurrender ? t('Confirm surrender') : t('Surrender')}</button>
          </div>
          <button class="btn" onClick=${actions.exit}>${s.online ? t('Leave the match') : t('Exit to menu')}</button>
        </div>
      </div>` : null}
    ${s.online && actions.link ? html`<${LinkCard} card=${s.link} dismissed=${!!s.linkDismissed} act=${actions.link} />` : null}
  `;
}

/**
 * @param {HTMLElement} el
 * @param {Parameters<typeof Hud>[0]['store']} store
 * @param {Parameters<typeof Hud>[0]['actions']} actions
 */
export function mountHud(el, store, actions) {
  render(html`<${Hud} store=${store} actions=${actions} />`, el);
  return { unmount: () => render(null, el) };
}
