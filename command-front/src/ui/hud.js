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
 */

/**
 * @typedef {object} HudActions
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {(at: {x: number, y: number}) => void} jump
 * @property {() => void} fullscreen
 * @property {Parameters<typeof CommandBar>[0]['act']} cmd
 * @property {Parameters<typeof ControlGroups>[0]['act']} groups
 * @property {(id: string) => void} radialPick
 * @property {() => void} radialClose
 * @property {() => void} cancelTarget
 * @property {() => void} alertJump
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
 * @property {() => void} surrender
 * @property {() => void} watch
 * @property {() => void} dismissHint
 */

/** Support-power button with a charge ring (section 14). @param {{ p: { id: string, name: string, progress: number, ready: boolean }, fire: (id: string) => void }} props */
function PowerButton({ p, fire }) {
  const deg = Math.round(p.progress * 360);
  const short = p.name.split(' ').map((w) => w[0]).join('');
  return html`<button class=${`pw-btn ${p.ready ? 'ready' : ''}`} aria-label=${`${p.name}${p.ready ? ', ready' : `, ${Math.round(p.progress * 100)}% charged`}`}
    title=${p.name} onClick=${() => fire(p.id)} style=${`--deg:${deg}deg`}><span>${short}</span></button>`;
}

/** @param {{ produced: number, drain: number, preview: number }} p */
function PowerBar({ produced, drain, preview }) {
  const nextProduced = produced + Math.max(0, preview);
  const nextDrain = drain - Math.min(0, preview);
  const ratio = nextDrain === 0 ? 1 : nextProduced / nextDrain;
  const fill = Math.max(0, Math.min(1, nextDrain === 0 ? 0 : nextDrain / Math.max(nextProduced, 1)));
  const tone = nextDrain === 0 ? 'ok' : ratio < 1 ? 'low' : ratio < 1.1 ? 'warn' : 'ok';
  const label = preview ? `PWR ${nextProduced}/${nextDrain}*` : `PWR ${produced}/${drain}`;
  return html`<div class=${`power ${tone} ${preview ? 'preview' : ''}`} role="meter" aria-label="Power" aria-valuenow=${produced} aria-valuemax=${Math.max(produced, drain)}>
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
      <span class="credits" aria-label="Credits">$ ${s.credits.toLocaleString('en-US')}</span>
      <${PowerBar} produced=${s.powerProduced} drain=${s.powerDrain} preview=${s.powerPreview} />
      ${s.powers.map((p) => html`<${PowerButton} key=${p.id} p=${p} fire=${actions.power} />`)}
      ${s.intel ? html`<span class="intel" title="Spy intelligence">${s.intel}</span>` : null}
      <span class="spacer"></span>
      <button class="icon-btn" aria-label="Jump to recent alerts" disabled=${!s.alertCount} onClick=${actions.alertJump}>!</button>
      <button class="icon-btn" aria-label="Pause" onClick=${actions.pause}>❚❚</button>
    </header>
    <${Toasts} toasts=${s.toasts} onJump=${actions.jump} />
    <${ControlGroups} sizes=${s.groups} act=${actions.groups} />
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
    ${s.hint ? html`<button class="hint panel" onClick=${actions.dismissHint}>${s.hint}</button>` : null}
    ${s.watching ? html`<div class="watch-tag panel">Watching · <button class="cmd" onClick=${actions.exit}>Exit</button></div>` : null}
    ${s.ended ? html`<div class="ended-tag panel" role="status">Match over</div>` : null}
    ${s.defeated && !s.watching ? html`
      <div class="sheet-backdrop">
        <div class="sheet panel" role="dialog" aria-label="Defeated">
          <h2>Defeated</h2>
          <p class="muted">The others fight on.</p>
          <button class="btn primary" onClick=${actions.watch}>Watch</button>
          <button class="btn" onClick=${actions.exit}>Exit to menu</button>
        </div>
      </div>` : null}
    ${s.paused ? html`
      <div class="sheet-backdrop">
        <div class="sheet panel" role="dialog" aria-label="Paused">
          <h2>Paused</h2>
          <p class="muted">${s.mapName}</p>
          <button class="btn primary" onClick=${actions.resume}>Resume</button>
          <div class="sheet-row">
            <button class="btn" disabled=${s.watching || s.ended} onClick=${actions.save}>Save</button>
            <button class="btn" onClick=${actions.load}>Load</button>
          </div>
          <div class="sheet-row">
            <button class="btn" onClick=${actions.fullscreen}>Fullscreen</button>
            <button class=${`btn ${s.confirmSurrender ? 'danger' : ''}`} disabled=${s.watching || s.ended} onClick=${actions.surrender}>
              ${s.confirmSurrender ? 'Confirm surrender' : 'Surrender'}</button>
          </div>
          <button class="btn" onClick=${actions.exit}>Exit to menu</button>
        </div>
      </div>` : null}
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
