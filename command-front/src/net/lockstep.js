// @ts-check
/**
 * Deterministic lockstep between two phones.
 *
 * Both phones run the same simulation from the same seed; only player
 * commands cross the wire (AI players live inside the sim, so they need no
 * traffic at all). A command issued while the sim is about to step tick t is
 * scheduled for tick t + delay and sent straight away as part of that tick's
 * bundle. A phone may step tick t only once it holds the other phone's bundle
 * for t — so the two can never disagree about who did what when, and a slow
 * or silent link simply holds the match where it is.
 *
 * Every tick produces exactly one bundle per phone, empty or not, so "I have
 * your bundle for t" is a plain contiguity check. Bundles carry an ack of the
 * highest contiguous tick received, and anything unacknowledged is resent
 * after a reconnect (duplicates are ignored). Every `hashEvery` ticks each
 * side sends its world hash; a mismatch is reported as a desync.
 *
 * Pure: no timers, no DOM, no network. The caller supplies `send`.
 */

export const LOCKSTEP = Object.freeze({
  /** Input delay in seconds; converted to ticks at the match speed. Covers LAN round trips with room to spare. */
  delaySeconds: 0.2,
  /** Hash exchange interval (ticks). */
  hashEvery: 60,
  /** How long executed bundles are kept for resends and late hashes (ticks). */
  keepTicks: 240,
  /** Lead (ticks) beyond which the trailing phone runs faster to catch up. */
  catchUpLead: 2,
});

/** Input delay in ticks for a game speed. @param {number} ticksPerSecond */
export const delayTicksFor = (ticksPerSecond) => Math.max(2, Math.ceil(LOCKSTEP.delaySeconds * ticksPerSecond));

/**
 * @typedef {{ type: string, entityIds?: number[], target?: any }} WireCommand
 * @typedef {{ k: 'b', e: number, t: number, c?: WireCommand[], a: number, f?: 1 }} BundleMsg
 * @typedef {{ k: 'h', e: number, t: number, h: string | number }} HashMsg
 */

/**
 * @param {{
 *   me: number, them: number, delay: number, startTick?: number, epoch?: number,
 *   send: (msg: BundleMsg | HashMsg) => void,
 *   onDesync?: (tick: number, mine: string | number, theirs: string | number) => void,
 *   hashEvery?: number,
 * }} o
 */
export function createLockstep({ me, them, delay, startTick = 0, epoch = 0, send, onDesync = () => {}, hashEvery = LOCKSTEP.hashEvery }) {
  /** Commands issued since the last bundle went out. @type {WireCommand[]} */
  let pending = [];
  /** @type {Map<number, WireCommand[]>} */ const mine = new Map();
  /** @type {Map<number, WireCommand[]>} */ const theirs = new Map();
  /** Highest tick for which every one of their bundles up to it is held (the first `delay` are implicitly empty). */
  let theirMax = startTick + delay - 1;
  /** Highest tick of ours they have acknowledged. */
  let ackedByThem = startTick + delay - 1;
  /** Last tick we sent a bundle for. */
  let lastSent = startTick + delay - 1;
  /** Their input stream ends before this tick (they left or were abandoned). @type {number | null} */
  let theirEnd = null;
  let finished = false;
  /** @type {Map<number, string | number>} */ const myHashes = new Map();
  /** @type {Map<number, string | number>} */ const theirHashes = new Map();
  let desynced = false;

  const compare = (/** @type {number} */ t) => {
    if (desynced || !myHashes.has(t) || !theirHashes.has(t)) return;
    const a = /** @type {string | number} */ (myHashes.get(t));
    const b = /** @type {string | number} */ (theirHashes.get(t));
    if (a !== b) { desynced = true; onDesync(t, a, b); }
  };

  const bundle = (/** @type {number} */ t, /** @type {WireCommand[]} */ c, final = false) => {
    /** @type {BundleMsg} */
    const msg = { k: 'b', e: epoch, t, a: theirMax };
    if (c.length) msg.c = c;
    if (final) msg.f = 1;
    return msg;
  };

  const prune = (/** @type {number} */ below) => {
    for (const m of [mine, theirs, myHashes, theirHashes]) for (const k of m.keys()) if (k < below) m.delete(k);
  };

  return {
    get epoch() { return epoch; },
    get delay() { return delay; },
    get desynced() { return desynced; },
    /** Their input stream has ended (left or abandoned). */
    get theyLeft() { return theirEnd !== null; },

    /** Queue a local command; it rides in the next bundle. @param {WireCommand} cmd */
    submit(cmd) {
      if (finished) return;
      pending.push({ type: cmd.type, entityIds: cmd.entityIds ?? [], target: cmd.target ?? null });
    },

    /** May tick t be stepped? @param {number} t */
    ready(t) {
      return t <= theirMax || (theirEnd !== null && t >= theirEnd);
    },

    /**
     * How many ticks the other phone is ahead of us (positive: we trail and
     * should run faster). @param {number} nextTick the tick we step next
     */
    lead(nextTick) {
      if (theirEnd !== null) return 0;
      return theirMax - delay + 1 - nextTick;
    },

    /**
     * The commands to apply at tick t, as sim commands, in player order so
     * both phones enqueue them identically. @param {number} t
     */
    commandsFor(t) {
      const out = [];
      const add = (/** @type {number} */ playerId, /** @type {WireCommand[] | undefined} */ list) => {
        for (const c of list ?? []) out.push({ ...structuredClone(c), tick: t, playerId });
      };
      const theirsAt = theirEnd !== null && t >= theirEnd ? undefined : theirs.get(t);
      if (me < them) { add(me, mine.get(t)); add(them, theirsAt); } else { add(them, theirsAt); add(me, mine.get(t)); }
      return out;
    },

    /**
     * Tick t has just been stepped: send our bundle for t + delay and, on a
     * hash tick, our world hash. @param {number} t @param {() => string | number} hash
     */
    stepped(t, hash) {
      if (!finished) {
        const due = t + delay;
        const c = pending;
        pending = [];
        mine.set(due, c);
        lastSent = due;
        send(bundle(due, c));
      }
      const after = t + 1;
      if (after % hashEvery === 0) {
        const h = hash();
        myHashes.set(after, h);
        send({ k: 'h', e: epoch, t: after, h });
        compare(after);
      }
      prune(t - LOCKSTEP.keepTicks);
    },

    /** Absorb a message from the other phone. Returns false if it was not ours to handle. @param {any} msg */
    receive(msg) {
      if (!msg || (msg.k !== 'b' && msg.k !== 'h')) return false;
      if (msg.e !== epoch) return true; // from before a resync: drop
      if (msg.k === 'h') {
        theirHashes.set(msg.t, msg.h);
        compare(msg.t);
        return true;
      }
      if (typeof msg.a === 'number' && msg.a > ackedByThem) {
        ackedByThem = msg.a;
        for (const k of mine.keys()) if (k <= ackedByThem - LOCKSTEP.keepTicks) mine.delete(k);
      }
      if (msg.t > theirMax && !theirs.has(msg.t)) theirs.set(msg.t, msg.c ?? []);
      while (theirs.has(theirMax + 1)) theirMax++;
      if (msg.f && theirEnd === null) theirEnd = msg.t + 1;
      return true;
    },

    /** After a reconnect: send again everything they have not acknowledged. */
    resend() {
      for (const [t, c] of [...mine.entries()].sort((a, b) => a[0] - b[0])) {
        if (t > ackedByThem) send(bundle(t, c, finished && t === lastSent));
      }
    },

    /**
     * We are leaving: one last bundle carrying `cmds` (a surrender) closes
     * our stream, and the other phone plays on without us. @param {WireCommand[]} cmds
     */
    finish(cmds) {
      if (finished) return;
      const t = lastSent + 1;
      const c = [...pending, ...cmds.map((x) => ({ type: x.type, entityIds: x.entityIds ?? [], target: x.target ?? null }))];
      pending = [];
      mine.set(t, c);
      lastSent = t;
      finished = true;
      send(bundle(t, c, true));
    },

    /**
     * They are gone for good (the link never came back): close their stream
     * after the last bundle we hold, with `cmds` (their surrender) as its last
     * word. Only this phone plays on, so determinism no longer matters.
     * @param {WireCommand[]} cmds
     */
    abandon(cmds) {
      if (theirEnd !== null) return;
      const t = theirMax + 1;
      theirs.set(t, cmds.map((x) => ({ type: x.type, entityIds: x.entityIds ?? [], target: x.target ?? null })));
      theirMax = t;
      theirEnd = t + 1;
    },

    /** Debugging and tests. */
    stats: () => ({ theirMax, ackedByThem, lastSent, pending: pending.length, held: theirs.size, theirEnd }),
  };
}
