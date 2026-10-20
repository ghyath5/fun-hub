// @ts-check
/**
 * The 3D view's fixed geometry: how the tilted camera maps the world to the
 * screen, shared by the scene, the 2D overlays and hit testing.
 *
 * World axes: x east, z south (both in world px, exactly the 2D game's
 * x and y), y up. The camera looks north and down at PITCH, orthographic, so
 * a point on the ground lands where the 2D camera would put it with its
 * vertical axis squashed by sin(PITCH), and something `h` px tall rises
 * h·cos(PITCH) px up the screen. Overlays drawn in the squashed 2D world
 * lift a point by h·cot(PITCH).
 */
import { RENDER } from '../data/rules.js';

/** Camera pitch below the horizon, degrees: Red Alert 2's classic look. */
export const PITCH_DEG = 52;
const P = (PITCH_DEG * Math.PI) / 180;
/** Ground squash on screen. */
export const SQUASH = Math.sin(P);
/** Screen rise per unit of height. */
export const RISE = Math.cos(P);
/** In the squashed 2D world: how far north a point at height h appears, per px of height. */
export const LIFT = RISE / SQUASH;

/** World px per map cell (models are built in cells). */
export const CELL = RENDER.cellPx;

/** How high aircraft fly, world px. */
export const ALTITUDE = CELL * 1.1;
