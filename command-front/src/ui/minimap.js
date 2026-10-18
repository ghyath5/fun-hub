// @ts-check
/**
 * Radar minimap (section 12): bottom-left, 112 px (96–160). Works only while
 * the player owns a powered Radar Dome; otherwise a static "No radar" panel
 * that cannot be tapped. Shows explored terrain and ore, own and allied
 * units and structures as team-coloured dots, ore and gem mines once seen,
 * enemies the player can see,
 * the camera rectangle and 2 s alert pings. Tap centres the camera there;
 * drag scrolls continuously. Drawn into a 2D canvas a few times a second.
 */
import { html, useRef, useEffect } from 'htm/preact';
import { TERRAIN } from '../data/terrain.js';
import { PLAYER_COLORS } from '../data/factions.js';
import { structureDef, isActive } from '../sim/entities/structures.js';
import { t } from '../lib/i18n.js';

const ORE = [214, 172, 72];
const GEM = [120, 200, 220];
const PING_MS = 2000;

/** '#rrggbb' → [r, g, b]. @param {string} hex */
const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
const TERRAIN_RGB = TERRAIN.map((t) => rgb(t.color));

/** Does this player have working radar? @param {any} w @param {number} pid */
export function hasRadar(w, pid) {
  if (w.players[pid].power.low) return false;
  for (const e of w.entities.all()) {
    if (e.kind === 'structure' && e.owner === pid && isActive(e) && structureDef(e.type).role === 'radar') return true;
  }
  return false;
}

/**
 * Paint the minimap.
 * @param {HTMLCanvasElement} canvas
 * @param {any} w @param {number} viewer
 * @param {{ x0: number, y0: number, x1: number, y1: number }} cam  Camera rect in cells
 * @param {{ x: number, y: number, at: number }[]} pings
 */
export function drawMinimap(canvas, w, viewer, cam, pings) {
  const m = w.map;
  const k = Math.max(1, Math.ceil(192 / m.width));
  if (canvas.width !== m.width * k) { canvas.width = m.width * k; canvas.height = m.height * k; }
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const img = g.createImageData(m.width, m.height);
  const d = img.data;
  const teams = w.visionTeams(viewer).map((/** @type {number} */ t) => w.vision[t]);
  for (let i = 0; i < m.width * m.height; i++) {
    let explored = false;
    for (const v of teams) if (v.explored[i]) { explored = true; break; }
    const c = !explored ? [8, 8, 6] : m.bales[i] ? (m.gem[i] ? GEM : ORE) : TERRAIN_RGB[m.terrain[i]];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  // Paint terrain at one pixel per cell, then scale up without smoothing.
  const tmp = /** @type {any} */ (drawMinimap).tmp ??= document.createElement('canvas');
  tmp.width = m.width; tmp.height = m.height;
  tmp.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  const explored = (/** @type {number} */ i) => teams.some((/** @type {any} */ v) => v.explored[i]);
  for (const e of w.entities.all()) {
    if (e.dead || e.inside) continue;
    if (e.owner < 0) {
      // Mines once seen, as bright marks: where the money comes back.
      const mine = structureDef(e.type).mine;
      if (!mine || !explored(e.cy * m.width + e.cx)) continue;
      g.fillStyle = mine === 'gem' ? '#bff4ff' : '#ffe08a';
      g.fillRect((e.cx - 0.5) * k, (e.cy - 0.5) * k, 2 * k, 2 * k);
      continue;
    }
    if (!w.visibleTo(viewer, e)) continue;
    g.fillStyle = PLAYER_COLORS[/** @type {keyof typeof PLAYER_COLORS} */ (w.players[e.owner].color)].dot;
    if (e.kind === 'structure') g.fillRect(e.cx * k, e.cy * k, e.w * k, e.h * k);
    else g.fillRect(e.cx * k, e.cy * k, Math.max(2, k), Math.max(2, k));
  }
  g.strokeStyle = 'rgba(240,230,200,.9)';
  g.lineWidth = 1;
  g.strokeRect(cam.x0 * k + 0.5, cam.y0 * k + 0.5, (cam.x1 - cam.x0) * k, (cam.y1 - cam.y0) * k);
  const now = performance.now();
  for (const p of pings) {
    const f = (now - p.at) / PING_MS;
    if (f < 0 || f > 1) continue;
    g.strokeStyle = `rgba(224,164,58,${1 - f})`;
    g.beginPath();
    g.arc((p.x + 0.5) * k, (p.y + 0.5) * k, (2 + f * 8) * k, 0, Math.PI * 2);
    g.stroke();
  }
}

/**
 * @param {{ radar: boolean, collapsed: boolean, onCanvas: (c: HTMLCanvasElement | null) => void,
 *   jump: (fx: number, fy: number) => void, toggle: () => void }} p  jump: fractions 0–1 across the map
 */
export function Minimap({ radar, collapsed, onCanvas, jump, toggle }) {
  const ref = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  useEffect(() => { onCanvas(ref.current); return () => onCanvas(null); }, [radar, collapsed]);
  const at = (/** @type {PointerEvent} */ e) => {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    jump(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  if (collapsed) return html`<button class="minimap-tab panel" aria-label=${t('Show minimap')} onClick=${toggle}>▣</button>`;
  return html`<div class="minimap panel" aria-label=${t('Minimap')}>
    ${radar
      ? html`<canvas ref=${ref} class="mm-canvas"
          onPointerDown=${(/** @type {PointerEvent} */ e) => { e.stopPropagation(); /** @type {any} */ (e.currentTarget).setPointerCapture?.(e.pointerId); at(e); }}
          onPointerMove=${(/** @type {PointerEvent} */ e) => { if (e.buttons || e.pointerType === 'touch') at(e); }}></canvas>`
      : html`<div class="mm-off">${t('No radar')}</div>`}
    <button class="mm-hide" aria-label=${t('Hide minimap')} onClick=${toggle}>–</button>
  </div>`;
}

