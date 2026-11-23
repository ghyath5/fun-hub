// @ts-check
/**
 * Addresses for the game's entry screens, so a link opens the right one:
 *
 *   …/command-front/                    the main menu
 *   …/command-front/#/online            online: open games, quick match, create, join
 *   …/command-front/#/online/new        create an online game straight away
 *   …/command-front/#/online/g/K7QF2    join that online game (the link a host shares)
 *   …/command-front/#/wifi              two phones on one WiFi
 *
 * They live after the # so the static host needs no rules and the service
 * worker serves the same cached page for all of them. (A two-phone invite,
 * `#o=<code>`, is the WiFi pairing's own and is not a route.)
 */

/** @typedef {{ name: 'menu' } | { name: 'online' } | { name: 'create' } | { name: 'game', id: string } | { name: 'wifi' }} Route */

export const PATHS = Object.freeze({
  online: '/online',
  create: '/online/new',
  /** @param {string} id */
  game: (id) => `/online/g/${id}`,
  wifi: '/wifi',
});

/** @param {string} [hash] @returns {Route} */
export function parseRoute(hash = location.hash) {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  if (path === PATHS.online) return { name: 'online' };
  if (path === PATHS.create) return { name: 'create' };
  if (path === PATHS.wifi) return { name: 'wifi' };
  const game = /^\/online\/g\/([A-Za-z0-9]{4,10})$/.exec(path);
  if (game) return { name: 'game', id: game[1].toUpperCase() };
  return { name: 'menu' };
}

/** The current path ('' for the menu). */
export const currentPath = () => (location.hash.startsWith('#/') ? location.hash.slice(1).replace(/\/+$/, '') : '');

/** The path the game last showed or was told of: a change away from it is the player's doing. */
let known = typeof location === 'undefined' ? '' : currentPath();

/**
 * Show a path in the address bar without reloading. `replace` rewrites the
 * current history entry (a redirect); otherwise Back returns to where the
 * player was.
 * @param {string} path '' for the menu @param {{ replace?: boolean }} [o]
 */
export function setRoute(path, { replace = false } = {}) {
  known = path;
  if (currentPath() === path) return;
  const url = path ? `#${path}` : location.pathname + location.search;
  try {
    if (replace) history.replaceState(history.state, '', url); else history.pushState(null, '', url);
  } catch { /* history unavailable (an embedded frame): the screens still work */ }
}

/** A full link to a path, for sharing. @param {string} path */
export const linkTo = (path) => `${location.origin}${location.pathname}#${path}`;

/**
 * Call `fn` when the player moves through history (Back, Forward) or edits
 * the address. Not called for setRoute. @param {(route: Route) => void} fn
 */
export function onRouteChange(fn) {
  const check = () => {
    const now = currentPath();
    if (now === known) return;
    known = now;
    fn(parseRoute());
  };
  addEventListener('popstate', check);
  addEventListener('hashchange', check);
  return {
    stop() { removeEventListener('popstate', check); removeEventListener('hashchange', check); },
  };
}
