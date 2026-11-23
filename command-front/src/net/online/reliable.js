// @ts-check
/**
 * Exactly-once, in-order messages between two players over paths that may
 * drop, repeat or reorder them.
 *
 * An online match can travel two ways — relayed by the lobby server, or
 * straight between the browsers — and switches between them as they come
 * and go, with reconnections in between. Each message is numbered; the
 * receiver hands them on in order and once only, and tells the sender how
 * far it has got; the sender keeps what is not yet acknowledged and sends it
 * again when the path changes or the acknowledgement is late.
 *
 * Frames: { s, a, m } a message numbered s, acknowledging up to a
 *         { a }       an acknowledgement on its own
 *
 * Pure: no timers, no sockets. The caller supplies `transmit` and calls
 * `tick` now and then.
 */

/** Frames this far ahead of the next expected one are not held (nothing honest gets that far ahead). */
const EARLY_LIMIT = 4096;

/**
 * @param {{
 *   transmit: (frame: { s?: number, a: number, m?: any }) => void,
 *   deliver: (msg: any) => void,
 *   resendMs?: number, ackMs?: number,
 * }} o
 */
export function createReliable({ transmit, deliver, resendMs = 2000, ackMs = 150 }) {
  /** Last number we used. */ let sent = 0;
  /** Highest of ours they have acknowledged. */ let acked = 0;
  /** Highest of theirs delivered in order. */ let received = 0;
  /** Ours not yet acknowledged, oldest first. @type {{ s: number, m: any, at: number }[]} */
  let unacked = [];
  /** Theirs that arrived early, by number. @type {Map<number, any>} */
  const early = new Map();
  /** When an acknowledgement became owed (0: none owed). */ let ackOwedAt = 0;
  let clock = 0;

  const frame = (/** @type {{ s: number, m: any }} */ x) => ({ s: x.s, a: received, m: x.m });

  return {
    /** Send a message. @param {any} msg */
    send(msg) {
      const item = { s: ++sent, m: msg, at: clock };
      unacked.push(item);
      ackOwedAt = 0; // this frame carries the acknowledgement
      transmit(frame(item));
    },

    /** A frame arrived (by any path). @param {any} f */
    receive(f) {
      if (!f || typeof f !== 'object') return;
      if (Number.isInteger(f.a) && f.a > acked && f.a <= sent) {
        acked = f.a;
        unacked = unacked.filter((x) => x.s > acked);
      }
      if (!Number.isInteger(f.s) || f.s > received + EARLY_LIMIT) return;
      if (f.s <= received || early.has(f.s)) {
        // A repeat: they have not heard how far we got.
        ackOwedAt ||= clock || 1;
        return;
      }
      early.set(f.s, f.m);
      while (early.has(received + 1)) {
        const m = early.get(received + 1);
        early.delete(received + 1);
        received++;
        deliver(m);
      }
      ackOwedAt ||= clock || 1;
    },

    /** The path changed or came back: send everything unacknowledged again, now. */
    flush() {
      for (const x of unacked) { x.at = clock; transmit(frame(x)); }
      if (!unacked.length && ackOwedAt) { ackOwedAt = 0; transmit({ a: received }); }
    },

    /** Called regularly with the time (ms): late acknowledgements and resends. @param {number} now */
    tick(now) {
      clock = now;
      if (unacked.length && now - unacked[0].at >= resendMs) {
        for (const x of unacked) { if (now - x.at >= resendMs) { x.at = now; transmit(frame(x)); } }
        ackOwedAt = 0;
      } else if (ackOwedAt && now - ackOwedAt >= ackMs) {
        ackOwedAt = 0;
        transmit({ a: received });
      }
    },

    /** Messages sent and not yet acknowledged. */
    get pending() { return unacked.length; },
    stats: () => ({ sent, acked, received, pending: unacked.length, early: early.size }),
  };
}

/** @typedef {ReturnType<typeof createReliable>} Reliable */
