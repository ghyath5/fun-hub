// @ts-check
/**
 * Fit the DOM interface to short landscape screens. The HUD and menus are laid
 * out for at least 568 × 320 CSS px (section 14), but a phone held sideways
 * loses height to the browser's address bar and the system bars — often
 * leaving 290–315 px. Rather than refuse to run, the HUD and screens are
 * zoomed down uniformly (CSS `zoom` through `--ui-zoom`); only a viewport that
 * would need more than MIN_ZOOM shows the "Screen too small" card.
 *
 * The game canvas is never zoomed: the camera already shows a set number of
 * cells at any size. Anything that positions a HUD element from screen pixels
 * (radial menu, placement buttons) converts with `toUi`.
 */

export const DESIGN = Object.freeze({ width: 568, height: 320 });
export const MIN_ZOOM = 0.7;

let zoom = 1;

/** The current HUD zoom (1 = laid out at full size). */
export const uiZoom = () => zoom;

/** Screen (viewport) pixels → pixels inside the zoomed HUD. @param {number} px */
export const toUi = (px) => px / zoom;

/**
 * The zoom a viewport needs, and whether it is too small even at MIN_ZOOM.
 * Portrait viewports are left at 1: they show the rotate card instead.
 * @param {number} width @param {number} height
 */
export function fitFor(width, height) {
  if (height > width) return { zoom: 1, tooSmall: false };
  const need = Math.min(1, width / DESIGN.width, height / DESIGN.height);
  return { zoom: Math.max(MIN_ZOOM, Math.floor(need * 1000) / 1000), tooSmall: need < MIN_ZOOM };
}

/** Recompute and publish the zoom on <html>. */
export function applyFit(root = document.documentElement) {
  const fit = fitFor(window.innerWidth, window.innerHeight);
  zoom = fit.zoom;
  root.style.setProperty('--ui-zoom', String(zoom));
  root.classList.toggle('too-small', fit.tooSmall);
}

/** Apply now and on every resize / rotation / address-bar change. */
export function watchFit() {
  applyFit();
  const again = () => applyFit();
  window.addEventListener('resize', again);
  window.addEventListener('orientationchange', again);
  window.visualViewport?.addEventListener('resize', again);
}
