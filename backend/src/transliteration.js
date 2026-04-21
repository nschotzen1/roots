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
const ARABIC_ROOT_CHAR_SET = new Set(
  Array.from('ءآأؤإئابتثجحخدذرزسشصضطظعغفقكلمنهوي'),
);
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;
const ARABIC_DIACRITICS_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const ARABIC_CHAR_NORMALIZATION = {
  ٱ: 'ا',
  ى: 'ي',
};

export const GAME_ALPHABET = Object.values(HEB_TO_GAME);
export const LANGUAGE_MODES = ['hebrew', 'arabic'];
export const DEFAULT_LANGUAGE_MODE = 'hebrew';

export const isAsciiLetter = (ch) => /^[a-z]$/i.test(ch);
export const isGameSymbol = (ch) => Object.hasOwn(LEGACY_SYMBOL_TO_GAME, ch);

export const normalizeLanguageMode = (value) => {
  const normalized = String(value || DEFAULT_LANGUAGE_MODE).toLowerCase();
  return LANGUAGE_MODES.includes(normalized) ? normalized : DEFAULT_LANGUAGE_MODE;
};

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
export const hasArabicChars = (value) => ARABIC_CHAR_REGEX.test(value || '');

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

export const normalizeArabicChar = (ch) => {
  const value = String(ch || '');
  if (value.length !== 1) return null;
  const normalized = ARABIC_CHAR_NORMALIZATION[value] ?? value;
  return ARABIC_ROOT_CHAR_SET.has(normalized) ? normalized : null;
};

export const normalizeArabicRoot = (value, expectedLength = 3) => {
  if (!value) return null;

  const collapsed = String(value)
    .replace(/[._,\s-]+/g, '')
    .replace(ARABIC_DIACRITICS_REGEX, '')
    .trim();

  if (!collapsed) return null;

  const normalized = Array.from(collapsed)
    .map((ch) => normalizeArabicChar(ch))
    .filter(Boolean)
    .join('');

  if (!normalized) return null;
  if (expectedLength && normalized.length !== expectedLength) return null;

  return normalized;
};

export const toDottedRoot = (plainRoot) => (plainRoot ? Array.from(plainRoot).join('.') : '');

export const parseRootInput = (rootInput, languageOrExpectedLength = DEFAULT_LANGUAGE_MODE, maybeExpectedLength) => {
  if (!rootInput) return null;
  const language =
    typeof languageOrExpectedLength === 'string'
      ? normalizeLanguageMode(languageOrExpectedLength)
      : DEFAULT_LANGUAGE_MODE;
  const expectedLength =
    typeof languageOrExpectedLength === 'number'
      ? languageOrExpectedLength
      : (maybeExpectedLength ?? 3);

  if (language === 'arabic' || hasArabicChars(rootInput)) {
    return normalizeArabicRoot(rootInput, expectedLength);
  }

  if (hasHebrewChars(rootInput)) {
    const transliterated = transliterateHebrewRoot(rootInput);
    return normalizeGameRoot(transliterated, expectedLength);
  }
  return normalizeGameRoot(rootInput, expectedLength);
};

export const toDisplayChar = (ch) => (isAsciiLetter(ch) ? ch.toUpperCase() : ch);
