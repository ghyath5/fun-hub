// @ts-check
/**
 * The Credits screen (main menu → Credits): who made the game and the open
 * software and models it is built with. Licences match vendor/VERSIONS.md.
 */

/** @typedef {{ title: string, lines: { name: string, note?: string }[] }} CreditSection */

/** @type {readonly CreditSection[]} */
export const CREDITS = Object.freeze([
  {
    title: 'Created by',
    lines: [{ name: 'Ghiath Dar', note: 'Game idea, design and direction' }],
  },
  {
    title: 'Built with',
    lines: [{ name: 'Claude by Anthropic', note: 'Programming, 3D models, sound effects and voice direction' }],
  },
  {
    title: 'Voices',
    lines: [
      { name: 'Kokoro text-to-speech', note: 'hexgrad · Apache-2.0' },
      { name: 'kokoro-onnx', note: 'thewh1teagle · MIT' },
    ],
  },
  {
    title: 'Open-source software',
    lines: [
      { name: 'PixiJS', note: 'MIT' },
      { name: 'Preact and htm', note: 'MIT · Apache-2.0' },
      { name: 'Howler.js', note: 'MIT' },
      { name: 'ZzFX', note: 'Frank Force · MIT' },
      { name: 'EasyStar.js', note: 'MIT' },
      { name: 'seedrandom', note: 'David Bau · MIT' },
      { name: 'simplex-noise', note: 'Jonas Wagner · MIT' },
      { name: 'idb-keyval', note: 'Jake Archibald · Apache-2.0' },
      { name: 'fflate', note: 'Arjun Barrett · MIT' },
      { name: 'qrcode-generator', note: 'Kazuhiko Arase · MIT' },
      { name: 'jsQR', note: 'Cosmo Wolfe · Apache-2.0' },
      { name: 'three.js', note: 'used to render the art · MIT' },
    ],
  },
  {
    title: 'Inspired by',
    lines: [{ name: 'The classic real-time strategy games of the 1990s and 2000s', note: 'Command Front is an original game, not affiliated with any of them' }],
  },
]);
