// @ts-check
/**
 * Art and roster check (open the game with `?showcase`, or `?showcase=battle`):
 * every unit of both factions lined up on open ground next to each side's
 * base, with an Airfield whose four parking spots are full. `battle` lets
 * the two sides fight; otherwise everyone holds fire. Nothing here is part
 * of normal play.
 */
import { createMatch } from '../sim/setup.js';
import { spawnUnit } from '../sim/entities/units.js';
import { placeStructure } from '../sim/entities/structures.js';
import { slotPoint } from '../sim/pads.js';
import { UNITS } from '../data/units.js';
import { STRUCTURES } from '../data/structures.js';
import { SIM } from '../data/rules.js';
import { createSession } from './session.js';

const W = 64;
const H = 52;

/** A flat, open map. */
function openMap() {
  const n = W * H;
  return {
    id: 'showcase', name: 'Showcase', width: W, height: H, maxPlayers: 2, theme: 'temperate',
    terrain: new Uint8Array(n), bales: new Uint8Array(n), gem: new Uint8Array(n),
    starts: [{ x: 8, y: 8 }, { x: W - 8, y: H - 8 }], bridges: [], neutral: [],
  };
}

/** @param {{ hudEl: HTMLElement, worldEl: HTMLElement, screensEl: HTMLElement, audio: any, mode?: string }} el */
export async function runShowcase({ hudEl, worldEl, screensEl, audio, mode }) {
  const map = /** @type {any} */ (openMap());
  const battle = mode === 'battle';
  const world = createMatch(map, {
    seed: 7,
    players: [
      { faction: 'coalition', color: 'blue', human: true, start: 0 },
      { faction: 'union', color: 'red', human: !battle, start: 1, ...(battle ? { difficulty: 'normal' } : {}) },
    ],
    settings: { revealMap: true, victory: false, oreGrowthSeconds: 0 },
  });
  for (const e of world.entities.all()) if (e.kind === 'unit') e.hp = 0; // starting MCVs out of the way
  world.entities.all().filter((e) => e.hp === 0).forEach((e) => world.entities.remove(e));

  // Each side: a row of its buildings (the union row shows its own looks), then its units in rows.
  const sides = [{ pid: 0, faction: 'coalition', y0: 2 }, { pid: 1, faction: 'union', y0: 27 }];
  for (const { pid, faction, y0 } of sides) {
    let x = 1;
    for (const def of Object.values(STRUCTURES)) {
      if (def.wall || (def.faction !== 'both' && def.faction !== faction) || def.line === 'defenses' || def.water || def.id === 'airfield') continue;
      if (x + def.w > W - 1) break;
      placeStructure(world, def.id, pid, x, y0, { buildUp: false });
      x += def.w + 1;
    }
    x = 1;
    for (const def of Object.values(STRUCTURES)) {
      if (def.line !== 'defenses' || def.wall || (def.faction !== 'both' && def.faction !== faction)) continue;
      placeStructure(world, def.id, pid, x, y0 + 5, { buildUp: false });
      x += def.w + 1;
    }
    // A full Airfield: one aircraft on each spot.
    const field = placeStructure(world, 'airfield', pid, W - 6, y0 + 5, { buildUp: false });
    const air = Object.values(UNITS).filter((d) => d.line === 'aircraft' && d.faction === faction && !d.tags.includes('support'));
    air.slice(0, 4).forEach((d, slot) => {
      const u = spawnUnit(world, d.id, pid, field.cx + 1, field.cy + 1, { air: true });
      if (!u) return;
      const p = slotPoint(field, slot);
      Object.assign(u, { x: p.x, y: p.y, px: p.x, py: p.y, cx: Math.floor(p.x / SIM.leptonsPerCell), cy: Math.floor(p.y / SIM.leptonsPerCell), landed: true, pad: field.id, padSlot: slot });
    });
    // Every unit of the side, infantry first.
    const roster = Object.values(UNITS).filter((d) => (d.faction === faction || d.faction === 'both') && d.loco !== 'float');
    roster.forEach((d, k) => {
      const u = spawnUnit(world, d.id, pid, 2 + (k % 14) * 2, y0 + 9 + Math.floor(k / 14) * 3, { facing: 64 });
      if (u && !battle) u.stance = 'holdFire';
      if (u && d.loco === 'air' && !d.tags.includes('jumpjet')) u.landed = true;
    });
  }
  screensEl.classList.remove('on');
  const session = await createSession({ world, human: 0, hudEl, worldEl, audio, speed: 'normal' });
  document.body.classList.add('ready');
  const q = new URLSearchParams(location.search);
  const [ax, ay] = (q.get('at') ?? '16,12').split(',').map(Number);
  session.view.camera.home(ax, ay);
  const zoom = Number(q.get('zoom'));
  if (zoom) session.view.camera.zoomAt(zoom, innerWidth / 2, innerHeight / 2);
  /** @type {any} */ (window).__cf = session;
  return session;
}
