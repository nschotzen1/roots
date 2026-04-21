import { v4 as uuidv4 } from 'uuid';
import { normalizeMoveTypes, normalizeSessionMode } from './constants.js';
import { createComboState, resolveMoveOutcome } from './playRules.js';
import {
  DEFAULT_LANGUAGE_MODE,
  normalizeArabicChar,
  normalizeGameChar as normalizeTransliteratedChar,
  normalizeLanguageMode,
} from './transliteration.js';

const sessions = new Map();
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.round(parsed), min, max);
};

const normalizeGameChar = (ch, language = DEFAULT_LANGUAGE_MODE) =>
  normalizeLanguageMode(language) === 'arabic'
    ? normalizeArabicChar(ch)
    : normalizeTransliteratedChar(ch);

export const normalizeLetterBank = (letterBank, language = DEFAULT_LANGUAGE_MODE) => {
  if (!Array.isArray(letterBank)) return null;

  const normalized = letterBank
    .map((ch) => normalizeGameChar(ch, language))
    .filter(Boolean);

  return normalized.length > 0 ? [...new Set(normalized)] : null;
};

export const computeRemainingMs = (session, now = Date.now()) => {
  if (!session) return 0;
  const elapsed = now - session.turnStartedAtMs;
  return Math.max(0, session.countdownRemainingMs - elapsed);
};

export const isSessionActive = (session) => session?.status === 'active';

export const markTimeoutIfNeeded = (session, now = Date.now()) => {
  if (!session || session.status !== 'active') return false;
  const remainingMs = computeRemainingMs(session, now);
  if (remainingMs > 0) return false;

  session.status = 'game_over';
  session.reason = 'timeout';
  session.endedAtMs = now;
  session.updatedAtMs = now;
  return true;
};

export const createSession = ({
  mode,
  language = DEFAULT_LANGUAGE_MODE,
  startRoot,
  targetRoot,
  types,
  allowRevisit = false,
  letterBank = null,
  countdownMs,
  bonusBaseMs,
  bonusWindowMs,
}) => {
  const now = Date.now();
  const safeCountdown = normalizeNumber(countdownMs, 45_000, 10_000, 300_000);
  const safeBonusBase = normalizeNumber(bonusBaseMs, 4_000, 500, 60_000);
  const safeBonusWindow = normalizeNumber(bonusWindowMs, 6_000, 1_000, 60_000);

  const session = {
    id: uuidv4(),
    mode: normalizeSessionMode(mode),
    language: normalizeLanguageMode(language),
    status: 'active',
    reason: null,
    createdAtMs: now,
    updatedAtMs: now,
    endedAtMs: null,
    currentRoot: startRoot,
    targetRoot: targetRoot || null,
    score: 0,
    streak: 0,
    moveCount: 0,
    visited: new Set([startRoot]),
    allowRevisit: Boolean(allowRevisit),
    types: normalizeMoveTypes(types),
    letterBank: normalizeLetterBank(letterBank, language),
    turnStartedAtMs: now,
    countdownRemainingMs: safeCountdown,
    combo: createComboState(),
    config: {
      countdownMs: safeCountdown,
      bonusBaseMs: safeBonusBase,
      bonusWindowMs: safeBonusWindow,
    },
  };

  sessions.set(session.id, session);
  return session;
};

export const getSession = (sessionId) => sessions.get(sessionId) || null;

export const endSession = (session, reason, status = 'game_over', now = Date.now()) => {
  if (!session) return;
  session.status = status;
  session.reason = reason;
  session.endedAtMs = now;
  session.updatedAtMs = now;
};

export const applyValidMove = (session, nextRoot, moveEdge, now = Date.now()) => {
  const remainingBeforeMs = computeRemainingMs(session, now);
  if (remainingBeforeMs <= 0) {
    endSession(session, 'timeout', 'game_over', now);
    return null;
  }

  const elapsedMs = Math.max(0, now - session.turnStartedAtMs);
  const { nextComboState, ...moveOutcome } = resolveMoveOutcome({
    comboState: session.combo,
    moveEdge,
    streakBeforeMove: session.streak,
    elapsedMs,
    remainingBeforeMs,
    config: session.config,
  });

  session.currentRoot = nextRoot;
  session.visited.add(nextRoot);
  session.moveCount += 1;
  session.streak = moveOutcome.streakAfterMove;
  session.combo = nextComboState;
  session.score += moveOutcome.scoreGain;
  session.countdownRemainingMs = moveOutcome.nextRemainingMs;
  session.turnStartedAtMs = now;
  session.updatedAtMs = now;

  return {
    remainingBeforeMs,
    elapsedMs,
    ...moveOutcome,
  };
};

export const applyInvalidMove = (session, now = Date.now()) => {
  if (!session) return;
  session.streak = 0;
  session.combo = createComboState();
  session.updatedAtMs = now;
};

export const serializeSession = (session, now = Date.now()) => {
  const remainingMs = session.status === 'active' ? computeRemainingMs(session, now) : 0;

  return {
    id: session.id,
    mode: session.mode,
    language: session.language || DEFAULT_LANGUAGE_MODE,
    status: session.status,
    reason: session.reason,
    currentRoot: session.currentRoot,
    targetRoot: session.targetRoot,
    score: session.score,
    streak: session.streak,
    moveCount: session.moveCount,
    combo: {
      permutationChain: session.combo?.permutationChain ?? 0,
      samePositionChain: session.combo?.samePositionChain ?? 0,
      samePositionIndex: session.combo?.lastReplacePosition ?? null,
    },
    visitedRoots: [...session.visited],
    visitedCount: session.visited.size,
    allowRevisit: session.allowRevisit,
    types: session.types,
    letterBank: session.letterBank,
    turnBudgetMs: session.config.countdownMs,
    remainingMs,
    turnStartedAtMs: session.turnStartedAtMs,
    turnEndsAtMs: session.turnStartedAtMs + session.countdownRemainingMs,
    createdAtMs: session.createdAtMs,
    updatedAtMs: session.updatedAtMs,
    endedAtMs: session.endedAtMs,
    countdownMs: session.config.countdownMs,
    bonusBaseMs: session.config.bonusBaseMs,
    bonusWindowMs: session.config.bonusWindowMs,
    config: session.config,
  };
};
