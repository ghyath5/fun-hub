// @ts-check
/**
 * Desktop mouse cursors in the Red Alert 2 manner: what a left click would do
 * shows under the pointer before you click (move, attack, select, enter, no
 * entry). Small inline SVGs with a dark outline, so they read on any ground.
 * Touch devices never see them.
 */

const OUTLINE = '#0b0c08';
/** @type {Record<string, string>} kind → SVG body (32 × 32, hotspot in the middle) */
const SHAPES = {
  // Four green chevrons closing in on the spot.
  move: chevrons('#7cf05a'),
  attackMove: chevrons('#ff9a3a'),
  waypoint: chevrons('#7cf05a') + '<circle cx="16" cy="16" r="2.4" fill="#7cf05a" stroke="#0b0c08" stroke-width="1"/>',
  // Red crosshair.
  attack: crosshair('#ff4a3a'),
  forceFire: crosshair('#ffb02e') + '<circle cx="16" cy="16" r="2" fill="#ffb02e"/>',
  // Corner brackets: pick this one.
  select: brackets('#f4f4e4'),
  // Down arrows into the target: board, repair, capture, dock.
  enter: '<path d="M16 25 L9 16 H13 V7 H19 V16 H23 Z" fill="#5ad8ff" stroke="#0b0c08" stroke-width="1.6" stroke-linejoin="round"/>',
  // Sell (a coin) and Repair (a wrench), for those modes.
  sell: '<circle cx="16" cy="16" r="9" fill="#f0c83a" stroke="#0b0c08" stroke-width="2"/><path d="M19.5 11.5 H14.5 a2.2 2.2 0 0 0 0 4.4 h3 a2.2 2.2 0 0 1 0 4.4 H12.5 M16 9 V23" fill="none" stroke="#0b0c08" stroke-width="1.8" stroke-linecap="round"/>',
  repair: '<g transform="rotate(45 16 16)"><path d="M14 9 V5.5 a5 5 0 1 0 4 0 V9 Z M14 12 H18 V28 a2 2 0 0 1 -4 0 Z" fill="#7cf05a" stroke="#0b0c08" stroke-width="1.6" stroke-linejoin="round"/></g>',
  // Deploy: a golden ring with four arrows pointing out (Red Alert 2's MCV cursor).
  deploy: '<circle cx="16" cy="16" r="6.5" fill="none" stroke="#0b0c08" stroke-width="4.4"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#ffcc33" stroke-width="2.4"/>'
    + '<g fill="#ffcc33" stroke="#0b0c08" stroke-width="1.2" stroke-linejoin="round">'
    + [0, 90, 180, 270].map((a) => `<path d="M16 1.5 L20 6.5 H12 Z" transform="rotate(${a} 16 16)"/>`).join('') + '</g>',
  noDeploy: no('#ff4a3a'),
  // A "no" sign: cannot go or cannot hurt that.
  noMove: no('#ff4a3a'),
  noAttack: no('#ffb02e'),
};

/** @param {string} c */
function chevrons(c) {
  const one = 'M16 10.5 L11 5 H14.5 L16 6.6 L17.5 5 H21 Z';
  const turns = [0, 90, 180, 270].map((a) => `<path d="${one}" transform="rotate(${a} 16 16)"/>`).join('');
  return `<g fill="${c}" stroke="${OUTLINE}" stroke-width="1.3" stroke-linejoin="round">${turns}</g>`;
}
/** @param {string} c */
function crosshair(c) {
  const ring = '<circle cx="16" cy="16" r="8.5" fill="none"/>';
  const ticks = '<path d="M16 2 V10 M16 22 V30 M2 16 H10 M22 16 H30"/>';
  return `<g stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round">${ring}${ticks}</g>`
    + `<g stroke="${c}" stroke-width="2" stroke-linecap="round">${ring}${ticks}</g>`;
}
/** @param {string} c */
function brackets(c) {
  const d = 'M5 11 V5 H11 M21 5 H27 V11 M27 21 V27 H21 M11 27 H5 V21';
  return `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="4.2" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`;
}
/** @param {string} c */
function no(c) {
  const shape = '<circle cx="16" cy="16" r="9" fill="none"/><path d="M9.6 9.6 L22.4 22.4"/>';
  return `<g stroke="${OUTLINE}" stroke-width="5">${shape}</g><g stroke="${c}" stroke-width="2.8">${shape}</g>`;
}

/** @type {Record<string, string>} kind → CSS cursor value */
const CSS = { default: '' };
for (const [kind, body] of Object.entries(SHAPES)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
  const fallback = kind === 'select' ? 'pointer' : kind.startsWith('no') ? 'not-allowed' : 'crosshair';
  CSS[kind] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, ${fallback}`;
}

/** The kinds of cursor there are. */
export const CURSOR_KINDS = Object.freeze(Object.keys(CSS));

/**
 * A cursor switcher for one element: only touches the style when the kind changes.
 * @param {HTMLElement} el
 */
export function createCursor(el) {
  let current = 'default';
  return {
    get kind() { return current; },
    /** @param {string} kind  one of CURSOR_KINDS (unknown kinds fall back to the default arrow) */
    set(kind) {
      if (kind === current) return;
      current = kind;
      el.style.cursor = CSS[kind] ?? '';
    },
  };
}
