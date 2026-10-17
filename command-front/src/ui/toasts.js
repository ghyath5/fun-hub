// @ts-check
/** Toasts (section 14): at most 3, top-centre, 3 s each, tap to jump the camera. */
import { html } from 'htm/preact';
import { LAYOUT } from '../data/ui.js';

/** @typedef {{ id: number, text: string, at?: { x: number, y: number } }} Toast */

/** @param {{ toasts: Toast[], onJump: (at: {x: number, y: number}) => void }} props */
export function Toasts({ toasts, onJump }) {
  return html`<div class="toasts" role="status" aria-live="polite">
    ${toasts.slice(-LAYOUT.maxToasts).map((t) => html`
      <button key=${t.id} class="toast" onClick=${() => t.at && onJump(t.at)} tabindex=${t.at ? 0 : -1}>${t.text}</button>`)}
  </div>`;
}

/** Toast list manager with expiry. @param {(list: Toast[]) => void} publish */
export function createToaster(publish) {
  /** @type {Toast[]} */
  let list = [];
  let seq = 0;
  return {
    /** @param {string} text @param {{x: number, y: number}} [at] */
    show(text, at) {
      const t = { id: ++seq, text, at };
      list = [...list, t].slice(-LAYOUT.maxToasts);
      publish(list);
      setTimeout(() => {
        list = list.filter((x) => x.id !== t.id);
        publish(list);
      }, LAYOUT.toastSeconds * 1000);
    },
  };
}
