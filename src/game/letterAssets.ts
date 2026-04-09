type LetterAssetLanguage = 'hebrew' | 'arabic';

const LETTERS_BASE_PATH = '/letters';
const HEBREW_LETTERS_BASE_PATH = `${LETTERS_BASE_PATH}/hebrew`;
const ARABIC_LETTERS_BASE_PATH = `${LETTERS_BASE_PATH}/arabic`;

const ARABIC_ASSET_CHAR_NORMALIZATION: Record<string, string> = {
  ٱ: 'ا',
  ى: 'ي',
};

// Save Arabic PNGs under public/letters/arabic using these ASCII file stems.
export const ARABIC_LETTER_TO_FILE_STEM: Record<string, string> = {
  ء: 'hamza',
  آ: 'aa',
  أ: 'a_hamza',
  ؤ: 'w_hamza',
  إ: 'i_hamza',
  ئ: 'y_hamza',
  ا: 'a',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'hh',
  خ: 'kh',
  د: 'd',
  ذ: 'dh',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 'sad',
  ض: 'dad',
  ط: 'tah',
  ظ: 'zah',
  ع: 'ayn',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  و: 'w',
  ي: 'y',
};

export const ARABIC_FILE_STEM_TO_LETTER: Record<string, string> = Object.fromEntries(
  Object.entries(ARABIC_LETTER_TO_FILE_STEM).map(([letter, fileStem]) => [fileStem, letter]),
);

const normalizeArabicAssetChar = (ch: string) => ARABIC_ASSET_CHAR_NORMALIZATION[ch] ?? ch;

export const getLetterImageSrc = (ch: string, language: LetterAssetLanguage): string | null => {
  if (!ch) return null;

  if (language === 'arabic') {
    const fileStem = ARABIC_LETTER_TO_FILE_STEM[normalizeArabicAssetChar(ch)];
    return fileStem ? `${ARABIC_LETTERS_BASE_PATH}/${fileStem}.png` : null;
  }

  const lower = ch.toLowerCase();
  return /^[a-z]$/.test(lower) ? `${HEBREW_LETTERS_BASE_PATH}/${lower}.png` : null;
};
