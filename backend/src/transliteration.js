export const HEB_TO_GAME = {
  א: 'a',
  ב: 'b',
  ג: 'j',
  ד: 'd',
  ה: 'e',
  ו: 'w',
  ז: 'z',
  ח: 'h',
  ט: 'u',
  י: 'i',
  כ: 'k',
  ל: 'l',
  מ: 'm',
  נ: 'n',
  ס: 's',
  ע: 'o',
  פ: 'f',
  צ: 'x',
  ק: 'q',
  ר: 'r',
  ש: 'c',
  ת: 't',
};

export const LEGACY_SYMBOL_TO_GAME = {
  '*': 'e',
  '&': 'z',
  '@': 'o',
  '%': 'c',
};

export const FINAL_HEBREW_TO_REGULAR = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

const HEBREW_BASE_LETTERS_REGEX = /[אבגדהוזחטיכלמנסעפצקרשת]/;
const HEBREW_CHAR_REGEX = /[אבגדהוזחטיכלמנסעפצקרשתךםןףץ]/;
const NIQQUD_REGEX = /[\u0591-\u05C7]/g;

export const GAME_ALPHABET = Object.values(HEB_TO_GAME);

export const isAsciiLetter = (ch) => /^[a-z]$/i.test(ch);
export const isGameSymbol = (ch) => Object.hasOwn(LEGACY_SYMBOL_TO_GAME, ch);

export const normalizeGameChar = (ch) => {
  const value = String(ch || '').toLowerCase();
  if (value.length !== 1) return null;
  if (LEGACY_SYMBOL_TO_GAME[value]) return LEGACY_SYMBOL_TO_GAME[value];
  return isAsciiLetter(value) ? value : null;
};

export const stripNiqqud = (value) => (value || '').replace(NIQQUD_REGEX, '');

export const normalizeHebrewRoot = (value) => {
  const cleaned = stripNiqqud(value).replace(/\s+/g, '');
  let output = '';
  for (const ch of cleaned) {
    const normalized = FINAL_HEBREW_TO_REGULAR[ch] || ch;
    if (HEBREW_BASE_LETTERS_REGEX.test(normalized)) {
      output += normalized;
    }
  }
  return output;
};

export const transliterateHebrewRoot = (value) => {
  const normalized = normalizeHebrewRoot(value);
  let output = '';
  for (const ch of normalized) {
    const mapped = HEB_TO_GAME[ch];
    if (!mapped) return null;
    output += mapped;
  }
  return output || null;
};

export const hasHebrewChars = (value) => HEBREW_CHAR_REGEX.test(value || '');

export const normalizeGameRoot = (value, expectedLength = 3) => {
  if (!value) return null;
  const collapsed = String(value)
    .toLowerCase()
    .replace(/[\.\-_,\s]+/g, '')
    .trim();

  if (!collapsed) return null;

  const normalized = Array.from(collapsed)
    .map((ch) => normalizeGameChar(ch))
    .filter(Boolean)
    .join('');

  if (!normalized) return null;
  if (expectedLength && normalized.length !== expectedLength) return null;

  return normalized;
};

export const toDottedRoot = (plainRoot) => (plainRoot ? plainRoot.split('').join('.') : '');

export const parseRootInput = (rootInput, expectedLength = 3) => {
  if (!rootInput) return null;
  if (hasHebrewChars(rootInput)) {
    const transliterated = transliterateHebrewRoot(rootInput);
    return normalizeGameRoot(transliterated, expectedLength);
  }
  return normalizeGameRoot(rootInput, expectedLength);
};

export const toDisplayChar = (ch) => (isAsciiLetter(ch) ? ch.toUpperCase() : ch);
