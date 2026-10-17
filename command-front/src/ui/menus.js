// @ts-check
/** Full-screen notices: a map that failed validation, or a boot error. */
import { html, render } from 'htm/preact';

/** @param {HTMLElement} el @param {string} title @param {string} body */
export function showBlocking(el, title, body) {
  render(html`<div class="notice">
    <div class="notice-card panel">
      <h1>${title}</h1>
      <pre class="notice-body">${body}</pre>
    </div>
  </div>`, el);
}
