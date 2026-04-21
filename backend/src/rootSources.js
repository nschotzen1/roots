import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  DEFAULT_LANGUAGE_MODE,
  hasArabicChars,
  hasHebrewChars,
  normalizeArabicRoot,
  normalizeGameRoot,
  normalizeLanguageMode,
  parseRootInput,
  transliterateHebrewRoot,
} from './transliteration.js';

const parseLineRoot = (line, rootLength, language = DEFAULT_LANGUAGE_MODE) => {
  const trimmed = (line || '').split('#')[0].trim();
  if (!trimmed) return null;
  const normalizedLanguage = normalizeLanguageMode(language);

  if (normalizedLanguage === 'arabic' || hasArabicChars(trimmed)) {
    return normalizeArabicRoot(trimmed, rootLength);
  }

  if (hasHebrewChars(trimmed)) {
    const transliterated = transliterateHebrewRoot(trimmed);
    return normalizeGameRoot(transliterated, rootLength);
  }

  return parseRootInput(trimmed, normalizedLanguage, rootLength);
};

export const loadRootsFromFile = async (filePath, rootLength = 3, language = DEFAULT_LANGUAGE_MODE) => {
  const content = await readFile(filePath, 'utf-8');
  const roots = new Set();

  for (const line of content.split(/\r?\n/)) {
    const root = parseLineRoot(line, rootLength, language);
    if (root) roots.add(root);
  }

  return [...roots].sort((left, right) =>
    normalizeLanguageMode(language) === 'arabic'
      ? left.localeCompare(right, 'ar')
      : left.localeCompare(right),
  );
};

const decodeResponseBuffer = (arrayBuffer, contentType) => {
  const charsetMatch = (contentType || '').match(/charset=([^;]+)/i);
  let charset = charsetMatch?.[1]?.trim().toLowerCase() || 'utf-8';

  if (!charsetMatch) {
    const asciiPreview = new TextDecoder('latin1').decode(arrayBuffer.slice(0, 2048));
    const metaCharsetMatch = asciiPreview.match(/charset=([a-z0-9-]+)/i);
    if (metaCharsetMatch?.[1]) {
      charset = metaCharsetMatch[1].trim().toLowerCase();
    }
  }

  try {
    return new TextDecoder(charset).decode(arrayBuffer);
  } catch {
    return new TextDecoder('utf-8').decode(arrayBuffer);
  }
};

export const extractHebrewRootsFromHtml = (html, rootLength = 3) => {
  if (!html) return [];

  const roots = new Set();
  const anchorRegex = /<a\b[^>]*href=['"][^'"]*\/jorj\/[^'"]+\.html['"][^>]*>(.*?)<\/a>/gims;

  for (const match of html.matchAll(anchorRegex)) {
    const rawText = match[1]
      ?.replace(/<[^>]+>/g, ' ')
      ?.replace(/&nbsp;/gi, ' ')
      ?.trim();

    if (!rawText) continue;

    const transliterated = transliterateHebrewRoot(rawText);
    const normalized = normalizeGameRoot(transliterated, rootLength);
    if (normalized) roots.add(normalized);
  }

  if (roots.size > 0) {
    return [...roots].sort();
  }

  const fallbackRegex = new RegExp(`[אבגדהוזחטיכלמנסעפצקרשתךםןףץ]{${rootLength}}`, 'g');
  const matches = html.match(fallbackRegex) || [];

  for (const raw of matches) {
    const transliterated = transliterateHebrewRoot(raw);
    const normalized = normalizeGameRoot(transliterated, rootLength);
    if (normalized) roots.add(normalized);
  }

  return [...roots].sort();
};

export const fetchRootsFromUrl = async (url, rootLength = 3) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch roots page (${response.status} ${response.statusText})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const html = decodeResponseBuffer(arrayBuffer, response.headers.get('content-type'));
  return extractHebrewRootsFromHtml(html, rootLength);
};

export const writeRootsToFile = async (filePath, roots) => {
  const outputDir = path.dirname(filePath);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, roots.join('\n') + '\n', 'utf-8');
};
