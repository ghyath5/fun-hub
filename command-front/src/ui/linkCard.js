// @ts-check
/**
 * What the HUD says about the other phone during a two-phone match.
 * `waiting` is a slim banner (the match is just a beat behind); everything
 * else holds the screen with a card, because the match is held too.
 */
import { html } from 'htm/preact';

/**
 * @typedef {object} LinkActions
 * @property {() => void} retry     Try the connection again (after recovery gave up)
 * @property {() => void} alone     Give up on the other phone and play on
 * @property {() => void} dismiss   Close an informational card
 * @property {() => void} exit      Leave the match
 */

const COPY = {
  reconnecting: { title: 'Reconnecting…', note: 'The match is held exactly where it was. Waiting for the other phone.', spin: true },
  lost: { title: 'Lost the other phone', note: 'The link did not come back on its own. Both phones need the same WiFi.', spin: false },
  theirPause: { title: 'Paused by the other player', note: 'The match continues when they tap Resume.', spin: false },
  left: { title: 'The other player left', note: 'They surrendered. The match plays on without them.', spin: false },
  resync: { title: 'Re-syncing…', note: 'The two phones disagreed about the battle. Copying the host’s match across.', spin: true },
};

/** @param {{ card: import('../net/netMatch.js').LinkCard, dismissed: boolean, act: LinkActions }} p */
export function LinkCard({ card, dismissed, act }) {
  if (!card) return null;
  if (card === 'waiting') return html`<div class="link-wait panel" role="status"><span class="spin"></span>Waiting for the other phone…</div>`;
  if (card === 'left' && dismissed) return null;
  const c = COPY[card];
  return html`<div class="sheet-backdrop link-backdrop">
    <div class="sheet panel link-card" role="alertdialog" aria-label=${c.title}>
      ${c.spin ? html`<span class="spin big"></span>` : null}
      <h2>${c.title}</h2>
      <p class="muted">${c.note}</p>
      ${card === 'lost' ? html`
        <button class="btn primary" onClick=${act.retry}>Try again</button>
        <button class="btn" onClick=${act.alone}>Play on alone</button>` : null}
      ${card === 'left' ? html`<button class="btn primary" onClick=${act.dismiss}>Play on</button>` : null}
      ${card === 'left' ? null : html`<button class="btn" onClick=${act.exit}>Leave the match</button>`}
    </div>
  </div>`;
}
