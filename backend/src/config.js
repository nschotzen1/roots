import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLanguageMode } from './transliteration.js';

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolveConfiguredPath = (value, fallbackRelativePath) => {
  if (value) {
    return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  }

  return path.resolve(backendRoot, fallbackRelativePath);
};

export const config = {
  port: parseNumber(process.env.PORT, 8000),
  storageBackend: process.env.STORAGE_BACKEND || 'memory',
  rootSuggestionsBackend:
    String(process.env.ROOT_SUGGESTIONS_BACKEND || (process.env.VERCEL ? 'memory' : 'file')).toLowerCase() ===
    'memory'
      ? 'memory'
      : 'file',
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'roots-password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  },
  corsOrigin: process.env.ALLOWED_ORIGIN || '*',
  defaultLanguage: normalizeLanguageMode(process.env.DEFAULT_LANGUAGE),
  defaultRootLength: parseNumber(process.env.DEFAULT_ROOT_LENGTH, 3),
  defaultCountdownMs: parseNumber(
    process.env.DEFAULT_COUNTDOWN_MS,
    parseNumber(process.env.DEFAULT_INITIAL_TURN_MS, 45_000),
  ),
  defaultBonusBaseMs: parseNumber(
    process.env.DEFAULT_BONUS_BASE_MS,
    parseNumber(process.env.DEFAULT_BASE_TURN_MS, 4_000),
  ),
  defaultBonusWindowMs: parseNumber(process.env.DEFAULT_BONUS_WINDOW_MS, 6_000),
  defaultInitialTurnMs: parseNumber(process.env.DEFAULT_INITIAL_TURN_MS, 18_000),
  defaultBaseTurnMs: parseNumber(process.env.DEFAULT_BASE_TURN_MS, 12_000),
  defaultMaxTurnMs: parseNumber(process.env.DEFAULT_MAX_TURN_MS, 30_000),
  autoSeed: process.env.AUTO_SEED !== 'false',
  rootsSourceFile: resolveConfiguredPath(
    process.env.ROOTS_SOURCE_FILE || process.env.HEBREW_ROOTS_SOURCE_FILE,
    'data/roots_hebrew_scraped.txt',
  ),
  rootsSourceFiles: {
    hebrew: resolveConfiguredPath(
      process.env.ROOTS_SOURCE_FILE || process.env.HEBREW_ROOTS_SOURCE_FILE,
      'data/roots_hebrew_scraped.txt',
    ),
    arabic: resolveConfiguredPath(process.env.ARABIC_ROOTS_SOURCE_FILE, 'data/roots_arabic_scraped.txt'),
  },
  approvedRootsFile: resolveConfiguredPath(process.env.APPROVED_ROOTS_FILE, 'data/roots_hebrew_manual.txt'),
  approvedRootsFiles: {
    hebrew: resolveConfiguredPath(
      process.env.APPROVED_ROOTS_FILE || process.env.HEBREW_APPROVED_ROOTS_FILE,
      'data/roots_hebrew_manual.txt',
    ),
    arabic: resolveConfiguredPath(process.env.ARABIC_APPROVED_ROOTS_FILE, 'data/roots_arabic_manual.txt'),
  },
  rootSuggestionsFile: resolveConfiguredPath(process.env.ROOT_SUGGESTIONS_FILE, 'data/root_suggestions.json'),
};
