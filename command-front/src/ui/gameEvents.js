// @ts-check
/**
 * Base and economy events → alerts, sounds, haptics and terrain redraws
 * (section 18). Combat effects live in battleEvents.js; this covers the rest
 * of what the sim reports to the human player.
 */
import { buzz } from '../lib/haptics.js';
import { SIM, SUPPORT_POWERS } from '../data/rules.js';
import { ALERTS, AUDIO } from '../data/ui.js';
import { t, nameOf } from '../lib/i18n.js';

const L = SIM.leptonsPerCell;

/**
 * @param {{
 *   world: any, human: number,
 *   alerts: ReturnType<typeof import('./alerts.js').createAlerts>,
 *   audio: { play: (name: string, opts?: any) => void },
 *   voices: { announce: (key: string) => void },
 *   terrain: { invalidate: (x: number, y: number) => void },
 *   flash: (cells: { x: number, y: number }[]) => void,
 *   onStructureGone: (id: number) => void,
 *   toast: (text: string, at?: { x: number, y: number }) => void,
 *   threats?: ReturnType<typeof import('./threats.js').createThreats>,
 * }} ctx
 */
export function wireGameEvents(ctx) {
  const { world: w, human, alerts } = ctx;
  const mine = (/** @type {any} */ d) => d.owner === human;
  const cellOf = (/** @type {any} */ e) => (e.kind === 'structure' ? { x: e.cx + (e.w >> 1), y: e.cy + (e.h >> 1) } : { x: Math.floor(e.x / L), y: Math.floor(e.y / L) });
  const area = (/** @type {{x: number, y: number}} */ c) => `${Math.floor(c.x / ALERTS.baseUnderAttack.areaCells)},${Math.floor(c.y / ALERTS.baseUnderAttack.areaCells)}`;
  const redraw = (/** @type {number[][] | {x: number, y: number}[]} */ cells) => {
    for (const c of cells) Array.isArray(c) ? ctx.terrain.invalidate(c[0], c[1]) : ctx.terrain.invalidate(c.x, c.y);
  };
  const ev = w.events;
  const offs = [
    ev.on('readyToPlace', (e) => {
      if (!mine(e.data)) return;
      alerts.raise('structureReady');
      buzz(AUDIO.hapticReadyMs);
    }),
    ev.on('unitReady', (e) => {
      if (!mine(e.data)) return;
      const u = w.entities.get(e.data.id);
      alerts.raise('unitReady', u ? cellOf(u) : undefined, e.data.line);
    }),
    ev.on('insufficientFunds', (e) => { if (mine(e.data)) alerts.raise('insufficientFunds'); }),
    ev.on('lowPower', (e) => { if (mine(e.data)) alerts.raise('lowPower'); }),
    ev.on('silosNeeded', (e) => { if (mine(e.data)) alerts.raise('silosNeeded'); }),
    ev.on('oreDepleted', (e) => { if (mine(e.data)) alerts.raise('oreDepleted'); }),
    ev.on('noRefinery', (e) => { if (mine(e.data)) alerts.raise('noRefinery'); }),
    ev.on('placementFailed', (e) => { if (mine(e.data)) alerts.raise('placementFailed', undefined, '', e.data.reason ? t(e.data.reason) : ''); }),
    ev.on('deployFailed', (e) => {
      if (!mine(e.data)) return;
      alerts.raise('cannotDeploy');
      ctx.flash((e.data.cells ?? []).filter((/** @type {any} */ c) => c.state === 'red'));
      ctx.audio.play('reject', { bus: 'ui', volume: 0.5 });
    }),
    ev.on('damaged', (e) => {
      if (!mine(e.data)) return;
      const v = w.entities.get(e.data.id);
      // Only an enemy's doing counts (not a friend's stray shot, nor neglect with no one behind it).
      if (!v || !(e.data.from >= 0) || w.allied(e.data.from, human)) return;
      if (v.kind === 'structure') {
        const c = cellOf(v);
        ctx.threats?.hit(c, 'base');
        if (alerts.raise('baseUnderAttack', c, area(c))) buzz(AUDIO.hapticBaseAttackMs);
      } else if (v.harv) {
        ctx.threats?.hit(cellOf(v), 'harvester');
        alerts.raise('harvesterUnderAttack', cellOf(v));
      }
    }),
    ev.on('structureDestroyed', (e) => {
      ctx.onStructureGone(e.data.id);
      if (mine(e.data)) alerts.raise('structureLost', { x: e.data.cx, y: e.data.cy });
    }),
    ev.on('structureRemoved', (e) => ctx.onStructureGone(e.data.id)),
    ev.on('structureCaptured', (e) => {
      if (e.data.from === human) alerts.raise('structureCaptured', { x: e.data.cx, y: e.data.cy });
      else if (e.data.to === human) ctx.voices.announce('buildingCaptured');
      ctx.onStructureGone(e.data.id);
    }),
    ev.on('structurePlaced', (e) => { if (mine(e.data) && w.tick > 0) ctx.audio.play('place', { volume: 0.7 }); }),
    ev.on('deployed', (e) => { if (mine(e.data)) ctx.audio.play('deploy', { volume: 0.8 }); }),
    ev.on('sold', (e) => {
      if (!mine(e.data)) return;
      alerts.raise('structureSold');
      ctx.audio.play('sell', { bus: 'ui', volume: 0.7 });
    }),
    ev.on('powerReady', (e) => {
      if (!mine(e.data)) return;
      alerts.raise('powerReady', undefined, e.data.power, t('{name} ready', { name: nameOf(e.data.power, SUPPORT_POWERS[/** @type {keyof typeof SUPPORT_POWERS} */ (e.data.power)].name) }));
    }),
    ev.on('missileLaunch', (e) => { if (!mine(e.data)) alerts.raise('missileLaunch'); }),
    ev.on('stormStarted', (e) => { if (!mine(e.data)) alerts.raise('stormDetected', { x: e.data.x, y: e.data.y }); }),
    ev.on('mineExploded', (e) => { if (mine(e.data)) alerts.raise('mineExploded', { x: e.data.x, y: e.data.y }); }),
    ev.on('crateCollected', (e) => {
      if (!mine(e.data)) return;
      const text = { cash: t('Crate: ${n}', { n: e.data.detail }), unit: t('Crate: reinforcements'), heal: t('Crate: units healed'), reveal: t('Crate: map revealed'),
        armor: t('Crate: armour upgrade'), speed: t('Crate: speed upgrade'), explode: t('Crate: booby trap!') }[/** @type {string} */ (e.data.effect)] ?? t('Crate');
      ctx.toast(text, { x: e.data.x, y: e.data.y });
      if (e.data.effect === 'unit') ctx.voices.announce('reinforcements');
    }),
    ev.on('oreChanged', (e) => ctx.terrain.invalidate(e.data.i % w.map.width, Math.floor(e.data.i / w.map.width))),
    ev.on('terrainChanged', (e) => redraw(e.data.cells ?? [])),
    ev.on('oreGrew', () => {
      // Growth touches cells all over the map; redraw every chunk with ore (once per growth cycle).
      const m = w.map;
      for (let i = 0; i < m.bales.length; i++) if (m.bales[i]) ctx.terrain.invalidate(i % m.width, Math.floor(i / m.width));
    }),
  ];
  return { detach() { offs.forEach((off) => off()); } };
}
