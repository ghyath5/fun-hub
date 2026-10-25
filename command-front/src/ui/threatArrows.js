// @ts-check
/**
 * Arrows at the edge of the play area pointing to fights off screen
 * (src/ui/threats.js): one per spot under attack, on the line from the
 * middle of the view to it, red for the base and amber for a harvester,
 * pulsing. Tap one to fly there. Plain DOM, moved every frame without
 * re-rendering the HUD.
 */
import { THREATS } from '../data/ui.js';
import { t } from '../lib/i18n.js';

/**
 * Where an arrow sits for a point, or null when the point is in view.
 * @param {{ x: number, y: number }} p  screen px
 * @param {{ x0: number, y0: number, x1: number, y1: number }} a  the play area
 * @param {{ x: number, y: number }} inset  px inside the area's sides and its top and bottom
 * @returns {{ x: number, y: number, angle: number } | null}
 */
export function arrowPlace(p, a, inset) {
  if (p.x >= a.x0 + inset.x && p.x <= a.x1 - inset.x && p.y >= a.y0 + inset.y && p.y <= a.y1 - inset.y) return null;
  const cx = (a.x0 + a.x1) / 2;
  const cy = (a.y0 + a.y1) / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const hw = Math.max(1, (a.x1 - a.x0) / 2 - inset.x);
  const hh = Math.max(1, (a.y1 - a.y0) / 2 - inset.y);
  const k = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

/**
 * @param {HTMLElement} host  covers the play area exactly (the world element)
 * @param {(cell: { x: number, y: number }) => void} jump
 */
export function createThreatArrows(host, jump) {
  const root = document.createElement('div');
  root.className = 'threat-arrows';
  host.append(root);
  /** @type {{ el: HTMLButtonElement, head: HTMLElement, cell: { x: number, y: number } }[]} */
  const pool = [];
  const make = () => {
    const el = document.createElement('button');
    el.className = 'threat-arrow';
    const head = document.createElement('i');
    head.className = 'ta-head';
    const mark = document.createElement('b');
    mark.textContent = '!';
    el.append(head, mark);
    const item = { el, head, cell: { x: 0, y: 0 } };
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); jump(item.cell); });
    root.append(el);
    pool.push(item);
    return item;
  };
  return {
    /**
     * @param {readonly import('./threats.js').Threat[]} list  newest first
     * @param {{ x0: number, y0: number, x1: number, y1: number }} area  the play area, px
     * @param {(cell: { x: number, y: number }) => { x: number, y: number }} toScreen  a cell's middle on screen
     */
    update(list, area, toScreen) {
      let n = 0;
      for (const s of list) {
        if (n >= THREATS.maxArrows) break;
        const at = arrowPlace(toScreen(s), area, THREATS.arrowInsetPx);
        if (!at) continue;
        const item = pool[n] ?? make();
        n++;
        item.cell = { x: s.x, y: s.y };
        item.el.hidden = false;
        item.el.classList.toggle('harvester', s.kind === 'harvester');
        item.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -50%)`;
        item.head.style.transform = `rotate(${at.angle.toFixed(3)}rad)`;
        item.el.setAttribute('aria-label', `${t(s.kind === 'base' ? 'Base under attack' : 'Harvester under attack')}: ${t('show')}`);
      }
      for (let k = n; k < pool.length; k++) pool[k].el.hidden = true;
    },
    destroy() { root.remove(); },
  };
}
