// @ts-check
/**
 * Countries a player can fly (setup screen and two-phone lobby): the Arab
 * League and the other states of the Middle East. Purely cosmetic: the
 * flag flies over the player's Construction Yard and shows in menus.
 *
 * Each flag is a list of drawing steps in a 3 : 2 box with coordinates from
 * 0 to 1 (x across, y down), painted by lib/flags.js. Shapes are simplified
 * where a flag carries fine detail (emblems), so they stay readable small.
 */

/** A drawing step: the operation's name, then its arguments. @typedef {any[]} FlagStep */
/** @typedef {{ id: string, name: string, ar: string, flag: FlagStep[] }} Country */

const RED = '#ce1126';
const GREEN = '#007a3d';
const WHITE = '#ffffff';
const BLACK = '#000000';
/** The pan-Arab red, white and black. */
const PAN_ARAB = ['h', [RED, WHITE, BLACK]];

/** @type {readonly Country[]} */
export const COUNTRIES = Object.freeze([
  { id: 'dz', name: 'Algeria', ar: 'الجزائر', flag: [['v', ['#006233', WHITE]], ['crescent', 0.5, 0.5, 0.25, 0.2, 0.06, RED, 0], ['star', 0.555, 0.5, 0.1, RED, 5, -Math.PI / 2 + 0.3]] },
  { id: 'bh', name: 'Bahrain', ar: 'البحرين', flag: [['fill', RED], ['serrated', 0.27, 5, WHITE]] },
  { id: 'km', name: 'Comoros', ar: 'جزر القمر', flag: [['h', ['#ffd100', WHITE, RED, '#003da5']], ['hoist', 0.42, '#3a7728'],
    ['crescent', 0.12, 0.5, 0.17, 0.14, 0.05, WHITE, 0], ...[0.36, 0.45, 0.55, 0.64].map((y) => ['star', 0.2, y, 0.035, WHITE, 5, -Math.PI / 2])] },
  { id: 'dj', name: 'Djibouti', ar: 'جيبوتي', flag: [['h', ['#6ab2e7', '#12ad2b']], ['hoist', 0.45, WHITE], ['star', 0.15, 0.5, 0.11, RED, 5, -Math.PI / 2]] },
  { id: 'eg', name: 'Egypt', ar: 'مصر', flag: [PAN_ARAB, ['eagle', 0.5, 0.5, 0.3, '#c09300']] },
  { id: 'iq', name: 'Iraq', ar: 'العراق', flag: [PAN_ARAB, ['text', 'الله أكبر', 0.5, 0.52, 0.2, GREEN]] },
  { id: 'jo', name: 'Jordan', ar: 'الأردن', flag: [['h', [BLACK, WHITE, GREEN]], ['hoist', 0.5, RED], ['star', 0.17, 0.5, 0.1, WHITE, 7, -Math.PI / 2]] },
  { id: 'kw', name: 'Kuwait', ar: 'الكويت', flag: [['h', [GREEN, WHITE, RED]], ['poly', [[0, 0], [0.25, 1 / 3], [0.25, 2 / 3], [0, 1]], BLACK]] },
  { id: 'lb', name: 'Lebanon', ar: 'لبنان', flag: [['h', [RED, WHITE, WHITE, RED]], ['cedar', 0.5, 0.5, 0.42, '#00a651']] },
  { id: 'ly', name: 'Libya', ar: 'ليبيا', flag: [['h', ['#e70013', BLACK, BLACK, '#239e46']], ['crescent', 0.47, 0.5, 0.17, 0.14, 0.05, WHITE, 0], ['star', 0.555, 0.5, 0.07, WHITE, 5, -Math.PI / 2 + 0.3]] },
  { id: 'mr', name: 'Mauritania', ar: 'موريتانيا', flag: [['fill', '#00a95c'], ['rect', 0, 0, 1, 0.2, '#d01c1f'], ['rect', 0, 0.8, 1, 0.2, '#d01c1f'],
    ['crescent', 0.5, 0.52, 0.24, 0.2, 0.06, '#ffd700', -Math.PI / 2], ['star', 0.5, 0.36, 0.08, '#ffd700', 5, -Math.PI / 2]] },
  { id: 'ma', name: 'Morocco', ar: 'المغرب', flag: [['fill', '#c1272d'], ['pentagram', 0.5, 0.5, 0.26, '#006233']] },
  { id: 'om', name: 'Oman', ar: 'عمان', flag: [['h', [WHITE, '#db161b', '#008000']], ['rect', 0, 0, 0.25, 1, '#db161b'], ['khanjar', 0.125, 0.17, 0.14, WHITE]] },
  { id: 'ps', name: 'Palestine', ar: 'فلسطين', flag: [['h', [BLACK, WHITE, '#009736']], ['hoist', 0.33, '#ee2a35']] },
  { id: 'qa', name: 'Qatar', ar: 'قطر', flag: [['fill', '#8a1538'], ['serrated', 0.33, 9, WHITE]] },
  { id: 'sa', name: 'Saudi Arabia', ar: 'السعودية', flag: [['fill', '#006c35'], ['text', 'لا إله إلا الله محمد رسول الله', 0.5, 0.42, 0.13, WHITE], ['sword', 0.5, 0.68, 0.62, WHITE]] },
  { id: 'so', name: 'Somalia', ar: 'الصومال', flag: [['fill', '#4189dd'], ['star', 0.5, 0.5, 0.21, WHITE, 5, -Math.PI / 2]] },
  { id: 'sd', name: 'Sudan', ar: 'السودان', flag: [['h', ['#d21034', WHITE, BLACK]], ['hoist', 0.36, '#007229']] },
  { id: 'sy', name: 'Syria', ar: 'سوريا', flag: [['h', [GREEN, WHITE, BLACK]], ...[0.3, 0.5, 0.7].map((x) => ['star', x, 0.5, 0.085, RED, 5, -Math.PI / 2])] },
  { id: 'tn', name: 'Tunisia', ar: 'تونس', flag: [['fill', '#e70013'], ['circle', 0.5, 0.5, 0.25, WHITE], ['crescent', 0.5, 0.5, 0.19, 0.155, 0.045, '#e70013', 0], ['star', 0.54, 0.5, 0.08, '#e70013', 5, -Math.PI / 2 + 0.3]] },
  { id: 'ae', name: 'United Arab Emirates', ar: 'الإمارات', flag: [['h', ['#00732f', WHITE, BLACK]], ['rect', 0, 0, 0.25, 1, RED]] },
  { id: 'ye', name: 'Yemen', ar: 'اليمن', flag: [PAN_ARAB] },
  // The other states of the Middle East.
  { id: 'cy', name: 'Cyprus', ar: 'قبرص', flag: [['fill', WHITE], ['island', 0.5, 0.42, 0.34, '#d57800'], ['olive', 0.5, 0.7, 0.3, '#4e5b31']] },
  { id: 'ir', name: 'Iran', ar: 'إيران', flag: [['h', ['#239f40', WHITE, '#da0000']], ['emblemIR', 0.5, 0.5, 0.2, '#da0000']] },
  { id: 'il', name: 'Israel', ar: 'إسرائيل', flag: [['fill', WHITE], ['rect', 0, 0.1, 1, 0.15, '#0038b8'], ['rect', 0, 0.75, 1, 0.15, '#0038b8'], ['hexagram', 0.5, 0.5, 0.2, '#0038b8']] },
  { id: 'tr', name: 'Türkiye', ar: 'تركيا', flag: [['fill', '#e30a17'], ['crescent', 0.35, 0.5, 0.25, 0.2, 0.065, WHITE, 0], ['star', 0.55, 0.5, 0.09, WHITE, 5, Math.PI]] },
]);

/** Country by id, or null for none. @param {string | undefined | null} id */
export const countryOf = (id) => COUNTRIES.find((c) => c.id === id) ?? null;
