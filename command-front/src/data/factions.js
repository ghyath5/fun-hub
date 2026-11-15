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
  orange: { id: 'orange', name: 'Orange', main: 0xe0782a, dark: 0x733a10, dot: '#ff9a4a' },
  teal:  { id: 'teal', name: 'Teal', main: 0x2aa89a, dark: 0x12524b, dot: '#45d6c4' },
  purple: { id: 'purple', name: 'Purple', main: 0x8a58d0, dark: 0x40256b, dot: '#b184ff' },
  pink:  { id: 'pink', name: 'Pink', main: 0xd8589c, dark: 0x6b2348, dot: '#ff7ec0' },
  white: { id: 'white', name: 'White', main: 0xd8dade, dark: 0x6f737a, dot: '#f4f6fa' },
});
