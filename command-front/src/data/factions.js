// @ts-check
/** Factions and player colours (section 7). Colour is independent of faction. */

export const FACTIONS = Object.freeze({
  coalition: {
    id: 'coalition',
    name: 'Coalition',
    motto: 'Speed, precision, intel and a surface navy.',
    mineLayer: 'coalition',
  },
  union: {
    id: 'union',
    name: 'Union',
    motto: 'Heavy armour, area damage, submarines and air strikes.',
    mineLayer: 'union',
  },
});

/** Player colours: `main` tints sprites, `dark` shades them, `dot` is the minimap colour. */
export const PLAYER_COLORS = Object.freeze({
  blue:  { id: 'blue', name: 'Blue', main: 0x3f7fd9, dark: 0x1f3f73, dot: '#5a9cff' },
  red:   { id: 'red', name: 'Red', main: 0xd04a3a, dark: 0x6e1f17, dot: '#ff6a55' },
  green: { id: 'green', name: 'Green', main: 0x4fa64a, dark: 0x22521f, dot: '#6fd468' },
  gold:  { id: 'gold', name: 'Gold', main: 0xd8a73a, dark: 0x6e5217, dot: '#ffcf5a' },
});
