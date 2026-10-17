// @ts-check
/**
 * Sim events → what the player sees and hears: combat effects, weapon and
 * impact sounds (batched per frame, nearest first), and alerts.
 */
import { UNITS } from '../data/units.js';
import { WEAPONS } from '../data/weapons.js';
import { shotSound } from '../data/sounds.js';
import { structureDef } from '../sim/entities/structures.js';
import { RENDER, SIM } from '../data/rules.js';
import { AUDIO } from '../data/ui.js';
import { lookOf } from '../render/combatFx.js';
import { createBattleSounds } from './alerts.js';

const PX = RENDER.cellPx / SIM.leptonsPerCell;

/**
 * @param {{
 *   world: any, human: number,
 *   fx: ReturnType<typeof import('../render/combatFx.js').createCombatFx>,
 *   audio: ReturnType<typeof import('../lib/audio.js').createAudio>,
 *   alerts: ReturnType<typeof import('./alerts.js').createAlerts>,
 *   toScreen: (wx: number, wy: number) => { x: number, y: number },
 *   screen: () => { w: number, h: number },
 * }} ctx
 */
export function wireBattleEvents(ctx) {
  const sounds = createBattleSounds(ctx.audio, AUDIO);
  const entity = (/** @type {number} */ id) => ctx.world.entities.get(id);
  /** @param {string} name @param {number} lx @param {number} ly @param {boolean} [weapon] */
  const at = (name, lx, ly, weapon = true) => {
    const p = ctx.toScreen(lx * PX, ly * PX);
    sounds.queue(name, p.x, p.y, weapon);
  };
  const ev = ctx.world.events;
  const offs = [
    ev.on('shot', (e) => { ctx.fx.onEvent(e, entity); at(shotSound(e.data.weapon, lookOf(e.data.weapon)), e.data.x, e.data.y); }),
    ev.on('impact', (e) => {
      ctx.fx.onEvent(e, entity);
      const w = WEAPONS[e.data.weapon];
      if (w.splash >= 1) at('boom', e.data.x, e.data.y);
      else if (lookOf(e.data.weapon) === 'shell' || lookOf(e.data.weapon) === 'missile') at('small', e.data.x, e.data.y);
    }),
    ev.on('charge', (e) => ctx.fx.onEvent(e, entity)),
    ev.on('unitDied', (e) => {
      ctx.fx.onEvent(e, entity);
      at(UNITS[e.data.type].loco === 'foot' ? 'die' : 'boom', e.data.x, e.data.y, UNITS[e.data.type].loco === 'foot');
      if (e.data.owner === ctx.human) {
        const L = SIM.leptonsPerCell;
        ctx.alerts.raise('unitLost', { x: Math.floor(e.data.x / L), y: Math.floor(e.data.y / L) });
      }
    }),
    ev.on('structureDestroyed', (e) => at(structureDef(e.data.type)?.wall ? 'small' : 'bigBoom', e.data.x, e.data.y, false)),
  ];
  return {
    /** Play this frame's sounds. */
    flush() {
      const { w, h } = ctx.screen();
      sounds.flush(w, h);
    },
    detach() { offs.forEach((off) => off()); },
  };
}
