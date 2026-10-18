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
    title: '3D models',
    lines: [
      { name: 'Ska-Ara', note: 'Apocalypse Tank, V3 Launcher, Prism Tower, Sentry Gun, Tesla Coil, Tesla Reactor · CC BY 4.0' },
      { name: 'Yosef Anan', note: 'IFV · CC BY 4.0' },
      { name: 'Marrowgrave', note: 'Iron Curtain · CC BY 4.0' },
      { name: '建军 Roland', note: 'Gatling Tank · CC BY 4.0' },
      { name: 'Nord_Licht', note: 'Lunar Command Base · CC BY 4.0' },
      { name: 'nikolalightsaber', note: 'Psi Beacon · CC BY 4.0' },
      { name: 'TraianDumbrava', note: 'Ore Refinery · CC BY 4.0' },
    ],
  },
  {
    title: 'Voices',
    lines: [
      { name: 'Kokoro text-to-speech', note: 'hexgrad · Apache-2.0' },
      { name: 'kokoro-onnx', note: 'thewh1teagle · MIT' },
      { name: 'OpenVoiceOS phoonnx (miro, dii) and Piper (kareem)', note: 'Arabic voices' },
      { name: 'sherpa-onnx', note: 'k2-fsa · Apache-2.0' },
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
