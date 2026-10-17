// @ts-check
/**
 * One two-phone match on top of a room: the lockstep, the shared pause and
 * the link status the HUD shows. The session talks to it through a small
 * interface (`NetPlay`) and never sees the network.
 *
 * Pause, as everywhere on the Fun Hub: a hold lasts until the player who
 * called it lets go, there is no limit on how often, it holds the whole
 * match on both phones, and only the holder can release it.
 */
import { createLockstep, delayTicksFor, LOCKSTEP } from './lockstep.js';
import { enqueue, hashWorld } from '../sim/world.js';

/**
 * What the HUD shows about the other phone.
 * @typedef {null | 'waiting' | 'reconnecting' | 'lost' | 'left' | 'theirPause' | 'resync'} LinkCard
 */

/**
 * The session's view of a networked match.
 * @typedef {object} NetPlay
 * @property {true} online
 * @property {(cmd: any) => void} submit           A local player command (instead of enqueue)
 * @property {(world: any) => boolean} ready       May the next tick be stepped?
 * @property {(world: any) => void} step           Inject this tick's commands, step, send our bundle
 * @property {(world: any) => number} rate         Speed multiplier (catch up when trailing)
 * @property {() => boolean} held                  The other phone holds a pause
 * @property {(on: boolean) => void} hold          We pause / resume
 * @property {() => void} leave                    Surrender and leave; the other phone plays on
 * @property {() => void} abandon                  The other phone is gone for good; play on alone
 * @property {() => void} wake                     The tab is visible again: check the link now
 * @property {() => LinkCard} card
 * @property {(fn: (card: LinkCard) => void) => () => void} onCard
 * @property {() => void} destroy
 */

/** Stalled this long (ms) before the HUD says it is waiting. */
const WAIT_CARD_MS = 700;

/**
 * @param {{
 *   room: import('./room.js').Room, me: number, them: number,
 *   ticksPerSecond: number, epoch: number, startTick: number,
 *   step: (world: any) => void,
 *   onDesync: (tick: number) => void,
 *   onResyncAsked: () => void,
 * }} o
 * @returns {NetPlay}
 */
export function createNetMatch({ room, me, them, ticksPerSecond, epoch, startTick, step, onDesync, onResyncAsked }) {
  const ls = createLockstep({
    me, them, epoch, startTick,
    delay: delayTicksFor(ticksPerSecond),
    send: (msg) => room.send(msg),
    onDesync: (t) => onDesync(t),
  });
  let theirHold = false;
  let myHold = false;
  let stalledSince = 0;
  /** @type {LinkCard} */
  let card = null;
  /** @type {Set<(c: LinkCard) => void>} */
  const watchers = new Set();

  const recompute = () => {
    /** @type {LinkCard} */
    let next = null;
    if (ls.theyLeft) next = 'left';
    else if (room.state === 'gone') next = 'lost';
    else if (room.state === 'down') next = 'reconnecting';
    else if (theirHold) next = 'theirPause';
    else if (stalledSince && performance.now() - stalledSince > WAIT_CARD_MS && !myHold) next = 'waiting';
    if (next !== card) { card = next; for (const w of [...watchers]) w(card); }
  };

  room.listen((msg) => {
    if (ls.receive(msg)) { recompute(); return; }
    switch (msg?.k) {
      case 'pause': theirHold = !!msg.on; recompute(); break;
      case 'desync': onResyncAsked(); break;
      case 'bye': recompute(); break;
      default: break;
    }
  });
  const offState = room.onState(() => recompute());
  const offResume = room.onResume(() => {
    ls.resend();
    room.send({ k: 'pause', on: myHold });
    recompute();
  });
  const waitTimer = setInterval(recompute, 250);

  return {
    online: true,
    submit: (cmd) => ls.submit(cmd),
    ready(world) {
      const ok = ls.ready(world.tick);
      if (ok) stalledSince = 0; else if (!stalledSince) stalledSince = performance.now();
      return ok;
    },
    step(world) {
      const t = world.tick;
      for (const c of ls.commandsFor(t)) enqueue(world, c);
      step(world);
      ls.stepped(t, () => hashWorld(world));
    },
    rate: (world) => (ls.lead(world.tick) > LOCKSTEP.catchUpLead ? 1.25 : 1),
    held: () => theirHold,
    hold(on) {
      myHold = on;
      room.send({ k: 'pause', on });
      recompute();
    },
    leave() {
      ls.finish([{ type: 'surrender' }]);
      room.send({ k: 'pause', on: false });
    },
    abandon() {
      ls.abandon([{ type: 'surrender' }]);
      recompute();
    },
    wake: () => room.probe(),
    card: () => card,
    onCard(fn) { watchers.add(fn); return () => watchers.delete(fn); },
    destroy() {
      clearInterval(waitTimer);
      offState(); offResume();
      watchers.clear();
      room.listen(null);
    },
  };
}
