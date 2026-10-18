// @ts-check
/**
 * Flag painter: draws a country's flag (data/countries.js) onto a 2D canvas.
 * Used for the menus (as image URLs) and in the match (as the texture of the
 * flag over each Construction Yard). Results are cached per size.
 */
import { countryOf } from '../data/countries.js';

const ARABIC_FONT = '"Noto Naskh Arabic", "Amiri", "Geeza Pro", "Segoe UI", Tahoma, "Arial", sans-serif';

/**
 * Star with `n` points around (cx, cy), outer radius r; the first point at angle `rot`.
 * @param {CanvasRenderingContext2D} g @param {number} cx @param {number} cy @param {number} r @param {number} n @param {number} rot
 */
function starPath(g, cx, cy, r, n, rot, inner = 0.4) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

/**
 * Paint one flag into a W × H box.
 * @param {CanvasRenderingContext2D} g @param {string} id @param {number} W @param {number} H
 */
export function drawFlag(g, id, W, H) {
  const c = countryOf(id);
  if (!c) return;
  const X = (/** @type {number} */ x) => x * W;
  const Y = (/** @type {number} */ y) => y * H;
  const fill = (/** @type {string} */ col) => { g.fillStyle = col; g.fill(); };
  g.save();
  g.lineJoin = 'round';
  for (const [op, ...a] of c.flag) {
    switch (op) {
      case 'fill': g.fillStyle = a[0]; g.fillRect(0, 0, W, H); break;
      case 'h': a[0].forEach((/** @type {string} */ col, /** @type {number} */ i, /** @type {string[]} */ all) => { g.fillStyle = col; g.fillRect(0, Math.floor((i * H) / all.length), W, Math.ceil(H / all.length) + 1); }); break;
      case 'v': a[0].forEach((/** @type {string} */ col, /** @type {number} */ i, /** @type {string[]} */ all) => { g.fillStyle = col; g.fillRect(Math.floor((i * W) / all.length), 0, Math.ceil(W / all.length) + 1, H); }); break;
      case 'rect': g.fillStyle = a[4]; g.fillRect(X(a[0]), Y(a[1]), X(a[2]), Y(a[3])); break;
      case 'poly': g.beginPath(); for (const [x, y] of a[0]) g.lineTo(X(x), Y(y)); g.closePath(); fill(a[1]); break;
      case 'hoist': g.beginPath(); g.moveTo(0, 0); g.lineTo(X(a[0]), Y(0.5)); g.lineTo(0, H); g.closePath(); fill(a[1]); break;
      case 'serrated': {
        const [w, n, col] = a;
        g.beginPath();
        g.moveTo(0, 0);
        for (let i = 0; i < n; i++) { g.lineTo(X(w), Y(i / n)); g.lineTo(X(w + 0.09), Y((i + 0.5) / n)); }
        g.lineTo(X(w), H);
        g.lineTo(0, H);
        g.closePath();
        fill(col);
        break;
      }
      case 'circle': g.beginPath(); g.arc(X(a[0]), Y(a[1]), Y(a[2]), 0, Math.PI * 2); fill(a[3]); break;
      case 'star': starPath(g, X(a[0]), Y(a[1]), Y(a[2]), a[4], a[5]); fill(a[3]); break;
      case 'crescent': {
        // The outer disc minus an inner disc shifted toward `angle` (the way the crescent opens).
        const [cx, cy, R, r, off, col, ang] = a;
        g.save();
        g.beginPath();
        g.arc(X(cx), Y(cy), Y(R), 0, Math.PI * 2);
        g.clip();
        g.beginPath();
        g.arc(X(cx), Y(cy), Y(R), 0, Math.PI * 2);
        g.arc(X(cx) + Math.cos(ang) * Y(off) * 1.5, Y(cy) + Math.sin(ang) * Y(off) * 1.5, Y(r), 0, Math.PI * 2, true);
        fill(col);
        g.restore();
        break;
      }
      case 'pentagram': {
        const [cx, cy, r, col] = a;
        g.beginPath();
        for (let k = 0; k <= 5; k++) {
          const a2 = -Math.PI / 2 + ((k * 2) % 5) * ((Math.PI * 2) / 5);
          g.lineTo(X(cx) + Math.cos(a2) * Y(r), Y(cy) + Math.sin(a2) * Y(r));
        }
        g.strokeStyle = col; g.lineWidth = Y(r) * 0.16; g.stroke();
        break;
      }
      case 'hexagram': {
        const [cx, cy, r, col] = a;
        g.strokeStyle = col; g.lineWidth = Y(r) * 0.16;
        for (const rot of [-Math.PI / 2, Math.PI / 2]) {
          g.beginPath();
          for (let k = 0; k < 3; k++) g.lineTo(X(cx) + Math.cos(rot + (k * Math.PI * 2) / 3) * Y(r), Y(cy) + Math.sin(rot + (k * Math.PI * 2) / 3) * Y(r));
          g.closePath(); g.stroke();
        }
        break;
      }
      case 'text': {
        const [txt, cx, cy, size, col] = a;
        let px = Y(size);
        g.font = `bold ${px}px ${ARABIC_FONT}`;
        const wid = g.measureText(txt).width;
        if (wid > W * 0.86) { px *= (W * 0.86) / wid; g.font = `bold ${px}px ${ARABIC_FONT}`; }
        g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
        g.fillText(txt, X(cx), Y(cy));
        break;
      }
      case 'sword': {
        const [cx, cy, len, col] = a;
        g.fillStyle = col;
        g.fillRect(X(cx - len / 2), Y(cy) - Y(0.018), X(len * 0.85), Y(0.036));
        g.fillRect(X(cx - len / 2 + len * 0.83), Y(cy) - Y(0.05), X(0.012), Y(0.1));
        g.fillRect(X(cx - len / 2 + len * 0.84), Y(cy) - Y(0.016), X(len * 0.14), Y(0.032));
        g.beginPath(); g.moveTo(X(cx - len / 2), Y(cy) - Y(0.018)); g.lineTo(X(cx - len / 2 - 0.03), Y(cy) - Y(0.05)); g.lineTo(X(cx - len / 2), Y(cy) + Y(0.018)); g.closePath(); g.fill();
        break;
      }
      case 'eagle': {
        // Simplified golden eagle: spread wings, body, head and a shield on the breast.
        const [cx, cy, s, col] = a;
        /** @returns {[number, number]} */
        const P = (/** @type {number} */ dx, /** @type {number} */ dy) => [X(cx) + dx * Y(s), Y(cy) + dy * Y(s)];
        g.fillStyle = col;
        g.beginPath();
        for (const [dx, dy] of [[0, -0.75], [0.14, -0.6], [0.2, -0.35], [0.85, -0.55], [0.75, -0.1], [0.42, 0.2], [0.3, 0.75], [0, 0.6], [-0.3, 0.75], [-0.42, 0.2], [-0.75, -0.1], [-0.85, -0.55], [-0.2, -0.35], [-0.14, -0.6]]) g.lineTo(...P(dx, dy));
        g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(...P(-0.16, -0.18), Y(s) * 0.32, Y(s) * 0.42);
        g.fillStyle = col;
        g.fillRect(...P(-0.03, -0.18), Y(s) * 0.06, Y(s) * 0.42);
        break;
      }
      case 'cedar': {
        const [cx, cy, s, col] = a;
        g.fillStyle = col;
        for (let t = 0; t < 4; t++) {
          const top = cy - s * 0.48 + t * s * 0.2;
          const half = (0.18 + t * 0.07) * s;
          g.beginPath(); g.moveTo(X(cx), Y(top)); g.lineTo(X(cx) + Y(half) * 1.6, Y(top + s * 0.26)); g.lineTo(X(cx) - Y(half) * 1.6, Y(top + s * 0.26)); g.closePath(); g.fill();
        }
        g.fillRect(X(cx) - Y(s) * 0.05, Y(cy + s * 0.32), Y(s) * 0.1, Y(s * 0.18));
        break;
      }
      case 'khanjar': {
        // Crossed swords behind a curved dagger, simplified.
        const [cx, cy, s, col] = a;
        g.strokeStyle = col; g.lineWidth = Y(s) * 0.12; g.lineCap = 'round';
        for (const d of [-1, 1]) { g.beginPath(); g.moveTo(X(cx) - d * Y(s) * 0.6, Y(cy) - Y(s) * 0.6); g.lineTo(X(cx) + d * Y(s) * 0.6, Y(cy) + Y(s) * 0.6); g.stroke(); }
        g.beginPath(); g.moveTo(X(cx), Y(cy) - Y(s) * 0.7); g.quadraticCurveTo(X(cx) + Y(s) * 0.25, Y(cy) + Y(s) * 0.3, X(cx) - Y(s) * 0.2, Y(cy) + Y(s) * 0.75); g.lineWidth = Y(s) * 0.2; g.stroke();
        break;
      }
      case 'island': {
        const [cx, cy, s, col] = a;
        g.beginPath();
        for (const [dx, dy] of [[-1, 0.15], [-0.75, -0.05], [-0.35, 0], [0, -0.15], [0.35, -0.25], [0.7, -0.45], [1, -0.6], [0.75, -0.3], [0.45, 0.05], [0.35, 0.3], [0, 0.35], [-0.45, 0.4], [-0.8, 0.35]]) g.lineTo(X(cx) + dx * Y(s), Y(cy) + dy * Y(s) * 0.7);
        g.closePath(); fill(col);
        break;
      }
      case 'olive': {
        const [cx, cy, w, col] = a;
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Y(0.02);
        for (const d of [-1, 1]) {
          g.beginPath(); g.moveTo(X(cx) + d * X(0.02), Y(cy) + Y(0.05)); g.quadraticCurveTo(X(cx) + d * X(w * 0.5), Y(cy) + Y(0.05), X(cx) + d * X(w * 0.55), Y(cy) - Y(0.06)); g.stroke();
          for (let k = 1; k <= 4; k++) {
            const t = k / 5;
            g.beginPath(); g.ellipse(X(cx) + d * X(w * 0.5 * t + 0.02), Y(cy) + Y(0.05) - Y(0.11 * t * t), Y(0.035), Y(0.015), d * -0.6, 0, Math.PI * 2); g.fill();
          }
        }
        break;
      }
      case 'emblemIR': {
        // Simplified emblem: four crescent strokes around an upright blade.
        const [cx, cy, s, col] = a;
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Y(s) * 0.11;
        for (const r of [0.85, 0.58]) {
          g.beginPath(); g.arc(X(cx), Y(cy), Y(s) * r, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
          g.beginPath(); g.arc(X(cx), Y(cy), Y(s) * r, -Math.PI * 0.4, Math.PI * 0.4); g.stroke();
        }
        g.fillRect(X(cx) - Y(s) * 0.06, Y(cy) - Y(s) * 0.85, Y(s) * 0.12, Y(s) * 1.7);
        break;
      }
      default: break;
    }
  }
  g.restore();
}

/** @type {Map<string, HTMLCanvasElement>} */
const cache = new Map();

/** A canvas holding a country's flag at W × H (cached). @param {string} id @param {number} [W] @param {number} [H] */
export function flagCanvas(id, W = 96, H = 64) {
  const key = `${id}@${W}x${H}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    drawFlag(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), id, W, H);
    cache.set(key, c);
  }
  return c;
}

/** The flag as an image URL for <img> in menus (cached). @param {string} id */
export const flagUrl = (id) => flagCanvas(id, 72, 48).toDataURL();
