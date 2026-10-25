// @ts-check
/**
 * A vehicle with a Terror Drone inside rattles (Red Alert 2): a quick,
 * uneven jitter of its whole body, shared by the 2D and 3D views.
 */

/** Jitter amplitude, as a fraction of a cell. */
const AMPLITUDE = 0.07;
/** A slight twist about the vertical, radians. */
const TWIST = 0.1;

/**
 * Offset (fractions of a cell, x and y on the ground) and twist for an entity
 * now; all zero unless it is infested.
 * @param {any} e @param {number} now  ms
 */
export function shakeOf(e, now) {
  if (!e.infested) return { x: 0, y: 0, twist: 0 };
  const t = now * 0.001 * Math.PI * 2;
  const k = e.id * 1.37;
  return {
    x: AMPLITUDE * (Math.sin(t * 23 + k) * 0.7 + Math.sin(t * 37 + k * 2) * 0.3),
    y: AMPLITUDE * (Math.cos(t * 29 + k) * 0.7 + Math.sin(t * 41 + k * 3) * 0.3),
    twist: TWIST * Math.sin(t * 19 + k),
  };
}
