// @ts-check
/**
 * ?debug only: stats.js FPS meter and a Tweakpane panel. Loaded lazily so
 * neither library is fetched in normal play.
 */

/** @param {string} src */
function loadClassic(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function mountDebugTools() {
  await loadClassic('./vendor/stats.min.js');
  const Stats = /** @type {any} */ (window).Stats;
  const stats = new Stats();
  stats.dom.style.cssText = 'position:fixed;left:auto;right:calc(env(safe-area-inset-right) + 8px);top:40px;z-index:50;opacity:.8;pointer-events:none';
  document.body.appendChild(stats.dom);
  const loop = () => { stats.update(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  const { Pane } = await import('tweakpane');
  const pane = new Pane({ title: 'Tuning', expanded: false });
  const host = pane.element.parentElement;
  host?.style.setProperty('z-index', '50');
  host?.style.setProperty('top', 'auto');
  host?.style.setProperty('bottom', 'calc(env(safe-area-inset-bottom) + 8px)');
  host?.style.setProperty('width', '200px');
  const cf = /** @type {any} */ (window).__cf;
  if (cf) {
    const info = { tick: 0, cells: 0 };
    pane.addBinding(info, 'tick', { readonly: true });
    pane.addBinding(info, 'cells', { readonly: true, label: 'cells visible' });
    setInterval(() => {
      info.tick = cf.world.tick;
      info.cells = Math.round(cf.view.camera.cellsVisible * 10) / 10;
      pane.refresh();
    }, 250);
  }
  return { stats, pane };
}
