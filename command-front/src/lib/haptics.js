// @ts-check
/** Haptics (section 15): optional, off where unsupported or turned off in Settings. */
let enabled = true;

/** Turn haptics on or off (Settings). @param {boolean} on */
export function setHaptics(on) { enabled = on; }

/** A short vibration, if allowed and supported. @param {number} ms */
export function buzz(ms) {
  if (enabled) navigator.vibrate?.(ms);
}
