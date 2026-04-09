import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import BonusToast from './components/BonusToast';
import ComboBurst from './components/ComboBurst';
import LetterCard from './components/LetterCard';
import StreakBubble from './components/StreakBubble';
import StreakPulse from './components/StreakPulse';
import { advanceApiTime, isApiError, requestJson, resetApiTime } from './game/apiClient';
import { getLetterImageSrc } from './game/letterAssets';
import {
  formatStreakTierRange,
  getNextStreakTier,
  getStreakTier,
  getStreakTierProgress,
  isStreakTierUpgrade,
} from './game/streakTiers';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

type GameMode = 'journey' | 'survival';
type LanguageMode = 'hebrew' | 'arabic';
type PlayMode = GameMode | 'multiplayer';
type SessionStatus = 'active' | 'game_over' | 'completed';
type MoveType = 'REPLACE' | 'SWAP';
type ComboKind = 'permutation' | 'same_position';

type SessionConfig = {
  countdownMs?: number;
  bonusBaseMs?: number;
  bonusWindowMs?: number;
  initialTurnMs?: number;
  baseTurnMs?: number;
  maxTurnMs?: number;
};

type NeighborEdge = {
  neighbor: string;
  neighborDotted: string;
  type: MoveType;
  positionA: number;
  positionB: number;
  fromChar: string;
  toChar: string;
  fromDotted: string;
  toDotted: string;
};

type SessionSnapshot = {
  id: string;
  mode: GameMode;
  language: LanguageMode;
  status: SessionStatus;
  reason: string | null;
  currentRoot: string;
  targetRoot: string | null;
  score: number;
  streak: number;
  moveCount: number;
  combo?: {
    permutationChain: number;
    samePositionChain: number;
    samePositionIndex: number | null;
  };
  visitedRoots?: string[];
  visitedCount: number;
  allowRevisit: boolean;
  types: MoveType[];
  letterBank: string[] | null;
  turnBudgetMs?: number;
  remainingMs: number;
  turnStartedAtMs: number;
  turnEndsAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
  endedAtMs: number | null;
  config?: SessionConfig;
};

type MoveSummary = {
  ok: boolean;
  reason?: string;
  scoreGain?: number;
  baseScore?: number;
  chainBonusScore?: number;
  streakBonusScore?: number;
  bonusMs?: number;
  streakBonusMs?: number;
  comboBonusMs?: number;
  bonusMultiplier?: number;
  elapsedMs?: number;
  nextBudgetMs?: number;
  speedRatio?: number;
  remainingBeforeMs?: number;
  activeCombo?: ComboKind | null;
  comboCount?: number;
  permutationChain?: number;
  samePositionChain?: number;
  samePositionIndex?: number | null;
  streakAfterMove?: number;
  edge?: {
    type: MoveType;
    positionA: number;
    positionB: number;
    fromChar: string;
    toChar: string;
    fromDotted: string;
    toDotted: string;
  };
};

type SessionPayload = {
  session: SessionSnapshot;
  currentRootDotted: string;
  targetRootDotted: string | null;
  options: {
    root: string;
    dottedRoot: string;
    count: number;
    neighbors: string[];
    edges: NeighborEdge[];
  };
  move: MoveSummary | null;
};

type RoomPlayerSnapshot = {
  id: string;
  name: string;
  joinedAtMs: number;
  score: number;
  streak: number;
  longestStreak: number;
  takeovers: number;
  combo: {
    permutationChain: number;
    samePositionChain: number;
    samePositionIndex: number | null;
  };
  isHost: boolean;
  isSelf: boolean;
};

type RoomPlayerAuth = {
  id: string;
  name: string;
  token: string;
  isHost: boolean;
  joinedAtMs: number;
};

type RoomSnapshot = {
  id: string;
  code: string;
  language: LanguageMode;
  version: number;
  status: 'active' | 'completed';
  phase: 'open_claim' | 'controlled';
  reason: string | null;
  currentRoot: string;
  currentRootDotted: string;
  moveCount: number;
  visitedRoots: string[];
  visitedCount: number;
  controllerPlayerId: string | null;
  controllerExpiresAtMs: number | null;
  controllerRemainingMs: number;
  turnStartedAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs: number;
  allowRevisit: boolean;
  types: MoveType[];
  letterBank: string[] | null;
  config: {
    countdownMs: number;
    bonusBaseMs: number;
    bonusWindowMs: number;
    controlWindowMs: number;
    maxControlMs: number;
    maxPlayers: number;
  };
  players: RoomPlayerSnapshot[];
  options: {
    root: string;
    dottedRoot: string;
    count: number;
    neighbors: string[];
    edges: NeighborEdge[];
  };
};

type RoomMoveSummary = MoveSummary & {
  byPlayerId?: string;
  byPlayerName?: string;
  controlChange?: 'claimed' | 'extended' | 'released' | 'none';
  controlRemainingMs?: number;
};

type RoomPayload = {
  room: RoomSnapshot;
  player: RoomPlayerAuth | null;
  move: RoomMoveSummary | null;
};

type PathPayload = {
  from: string;
  to: string;
  distance: number;
  path: string[];
  dottedPath: string[];
};

type BonusFlash = {
  bonusMs: number;
  multiplier: number;
  elapsedMs: number;
  scoreGain: number;
  moveType: MoveType | null;
  comboLabel: string | null;
  comboCount: number;
  chainBonusScore: number;
  streakBonusScore: number;
  streakBonusMs: number;
  comboBonusMs: number;
  streakAfterMove: number;
  comboSlots: number[];
};

type AttemptFlash = {
  tone: 'invalid' | 'repeat';
  message: string;
  root: string;
  streakResetFrom: number;
  streakTierLabel: string | null;
};

type RootSuggestionStatus = 'pending' | 'approved' | 'rejected';

type RootSuggestion = {
  id: string;
  language: LanguageMode;
  root: string;
  dottedRoot: string;
  status: RootSuggestionStatus;
  note: string | null;
  reviewNote: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  reviewedAtMs: number | null;
};

type SuggestionFeedback = {
  tone: 'success' | 'error';
  text: string;
};

type DragGestureState = {
  pointerId: number;
  sourceIdx: number;
  startX: number;
  startY: number;
  dragging: boolean;
};

type TransliterationPresetId =
  | 'hebrew_native'
  | 'letter_clean'
  | 'legacy_symbols'
  | 'arabic_native';

type TransliterationPreset = {
  id: TransliterationPresetId;
  language: LanguageMode;
  label: string;
  description: string;
  hebToGame: Record<string, string>;
  canonicalToDisplay: Record<string, string>;
  inputAliases: Record<string, string>;
  displayDir: 'rtl' | 'ltr';
};

type KeyboardLayoutMode = LanguageMode | 'latin' | 'unknown';
type KeyboardLayoutSource = 'layout_map' | 'recent_key' | 'unavailable';

type KeyboardLayoutState = {
  mode: KeyboardLayoutMode;
  source: KeyboardLayoutSource;
  sample: string | null;
};

type KeyboardLayoutMapLike = {
  get: (code: string) => string | undefined;
};

type NavigatorKeyboardLike = {
  getLayoutMap?: () => Promise<KeyboardLayoutMapLike>;
};

const DEFAULT_TYPES: MoveType[] = ['REPLACE', 'SWAP'];

const DEFAULT_COUNTDOWN_MS = 24_000;
const DEFAULT_BONUS_BASE_MS = 6_000;
const DEFAULT_BONUS_WINDOW_MS = 8_000;
const DEFAULT_CONTROL_WINDOW_MS = 8_000;
const DEFAULT_MAX_CONTROL_MS = 12_000;
const REEL_DRAG_THRESHOLD_PX = 12;
const LANGUAGE_STORAGE_KEY = 'roots.languageMode.v1';
const TRANSLITERATION_STORAGE_KEY = 'roots.transliterationPreset.v2';
const STAGE_BACKGROUND_IMAGE = '/backgrounds/mosaic-overlay.png';
const SLOT_LABELS = ['Right reel', 'Middle reel', 'Left reel'] as const;
const HEBREW_CHAR_PATTERN = /[\u0590-\u05FF]/;
const ARABIC_CHAR_PATTERN = /[\u0600-\u06FF]/;
const KEYBOARD_LAYOUT_SAMPLE_CODES = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'] as const;
const STAGE_SLOT_LAYOUT = [
  { left: 60.72, top: 24.52, width: 14.72, height: 42.72 },
  { left: 43.75, top: 25.0977, width: 14.8438, height: 42.4805 },
  { left: 25.3906, top: 25.0, width: 14.7786, height: 42.5781 },
] as const;

const HEB_TO_GAME: Record<string, string> = {
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

const ARABIC_ROOT_CHAR_SET = new Set(
  Array.from('ءآأؤإئابتثجحخدذرزسشصضطظعغفقكلمنهوي'),
);
const ARABIC_CHAR_NORMALIZATION: Record<string, string> = {
  ٱ: 'ا',
  ى: 'ي',
};

const isAsciiLetter = (ch: string) => /^[a-z]$/i.test(ch);
const LEGACY_SYMBOL_TO_GAME: Record<string, string> = {
  '*': 'e',
  '&': 'z',
  '@': 'o',
  '%': 'c',
};

const GAME_TO_LEGACY_DISPLAY: Record<string, string> = {
  e: '*',
  z: '&',
  o: '@',
  c: '%',
};

const GAME_TO_HEBREW: Record<string, string> = {
  a: 'א',
  b: 'ב',
  j: 'ג',
  d: 'ד',
  e: 'ה',
  w: 'ו',
  z: 'ז',
  h: 'ח',
  u: 'ט',
  i: 'י',
  k: 'כ',
  l: 'ל',
  m: 'מ',
  n: 'נ',
  s: 'ס',
  o: 'ע',
  f: 'פ',
  x: 'צ',
  q: 'ק',
  r: 'ר',
  c: 'ש',
  t: 'ת',
};

const TRANSLITERATION_PRESETS: Record<TransliterationPresetId, TransliterationPreset> = {
  hebrew_native: {
    id: 'hebrew_native',
    language: 'hebrew',
    label: 'Hebrew',
    description: 'Displays roots in Hebrew letters',
    hebToGame: HEB_TO_GAME,
    canonicalToDisplay: GAME_TO_HEBREW,
    inputAliases: {},
    displayDir: 'rtl',
  },
  letter_clean: {
    id: 'letter_clean',
    language: 'hebrew',
    label: 'Letter Clean',
    description: 'A/B/J/D/E without symbols',
    hebToGame: HEB_TO_GAME,
    canonicalToDisplay: {},
    inputAliases: {},
    displayDir: 'ltr',
  },
  legacy_symbols: {
    id: 'legacy_symbols',
    language: 'hebrew',
    label: 'Legacy Symbols',
    description: 'Old *, &, @, % display and key aliases',
    hebToGame: HEB_TO_GAME,
    canonicalToDisplay: GAME_TO_LEGACY_DISPLAY,
    inputAliases: LEGACY_SYMBOL_TO_GAME,
    displayDir: 'ltr',
  },
  arabic_native: {
    id: 'arabic_native',
    language: 'arabic',
    label: 'Arabic',
    description: 'Displays roots in Arabic letters',
    hebToGame: {},
    canonicalToDisplay: {},
    inputAliases: {},
    displayDir: 'rtl',
  },
};

const isTransliterationPresetId = (value: string): value is TransliterationPresetId =>
  value in TRANSLITERATION_PRESETS;

const isLanguageMode = (value: string): value is LanguageMode => value === 'hebrew' || value === 'arabic';

const DEFAULT_PRESET_BY_LANGUAGE: Record<LanguageMode, TransliterationPresetId> = {
  hebrew: 'hebrew_native',
  arabic: 'arabic_native',
};

const LANGUAGE_LABELS: Record<LanguageMode, string> = {
  hebrew: 'Hebrew',
  arabic: 'Arabic',
};

const LANGUAGE_NATIVE_LABELS: Record<LanguageMode, string> = {
  hebrew: 'עברית',
  arabic: 'العربية',
};

const LANGUAGE_DESCRIPTIONS: Record<LanguageMode, string> = {
  hebrew: 'Hebrew roots with Hebrew script and transliteration support.',
  arabic: 'Arabic roots with Arabic script input and keyboard hints.',
};

const LANGUAGE_SAMPLE_ROOTS: Record<LanguageMode, string> = {
  hebrew: 'ברק',
  arabic: 'كتب',
};

const LANGUAGE_SAMPLE_DOTTED: Record<LanguageMode, string> = {
  hebrew: 'ב.ר.ק',
  arabic: 'ك.ت.ب',
};

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;

const formatElapsed = (ms: number) => {
  if (!Number.isFinite(ms)) return '0s';
  if (ms < 1000) return `${ms}ms`;
  return formatSeconds(ms);
};

const getSlotLabel = (index: number | null | undefined) => {
  if (index === null || index === undefined || index < 0) return null;
  return SLOT_LABELS[index] ?? `Slot ${index + 1}`;
};

const getComboDescriptor = (
  comboKind: ComboKind | null | undefined,
  comboCount: number | null | undefined,
  positionIndex?: number | null,
) => {
  const safeCount = Number(comboCount) || 0;
  if (!comboKind || safeCount < 2) return null;

  if (comboKind === 'permutation') {
    return {
      label: 'Permutation',
      detail: `Permutation x${safeCount}`,
    };
  }

  const slotLabel = getSlotLabel(positionIndex);
  return {
    label: 'Same slot',
    detail: slotLabel ? `Same slot x${safeCount} · ${slotLabel}` : `Same slot x${safeCount}`,
  };
};

const getStreakDescriptor = (streak: number) => {
  if (streak <= 0) return null;

  const tier = getStreakTier(streak);
  return {
    label: tier.label,
    detail: `${tier.label} x${streak}`,
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getStageSlotCenter = (index: number) => {
  const slot = STAGE_SLOT_LAYOUT[index];
  if (!slot) return null;

  return {
    x: slot.left + slot.width / 2,
    y: slot.top + slot.height / 2,
    width: slot.width,
    height: slot.height,
  };
};

const STREAK_VISUALS = {
  reset: {
    badge:
      'rounded-full border border-white/80 bg-white/76 text-slate-700',
    timerShell:
      'border-white/75 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_10px_30px_rgba(15,23,42,0.08)]',
    stageWash: '',
  },
  x: {
    badge:
      'rounded-full border border-amber-200/90 bg-amber-50/88 text-amber-800 shadow-[0_14px_26px_-20px_rgba(217,119,6,0.46)]',
    timerShell:
      'border-amber-200/90 bg-amber-50/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_0_0_6px_rgba(251,191,36,0.08),0_10px_30px_rgba(217,119,6,0.14)]',
    stageWash:
      'bg-[radial-gradient(circle_at_80%_20%,rgba(251,191,36,0.18),transparent_20%),radial-gradient(circle_at_24%_74%,rgba(249,115,22,0.1),transparent_28%)]',
  },
  y: {
    badge:
      'rounded-full border border-sky-200/90 bg-sky-50/90 text-sky-800 shadow-[0_14px_26px_-20px_rgba(14,165,233,0.42)]',
    timerShell:
      'border-sky-200/90 bg-sky-50/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_0_0_6px_rgba(56,189,248,0.08),0_10px_30px_rgba(14,165,233,0.14)]',
    stageWash:
      'bg-[radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.18),transparent_20%),radial-gradient(circle_at_20%_82%,rgba(37,99,235,0.08),transparent_28%)]',
  },
  z: {
    badge:
      'rounded-full border border-fuchsia-200/90 bg-fuchsia-50/90 text-fuchsia-800 shadow-[0_14px_26px_-20px_rgba(192,38,211,0.42)]',
    timerShell:
      'border-fuchsia-200/90 bg-fuchsia-50/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_0_0_6px_rgba(232,121,249,0.08),0_10px_30px_rgba(192,38,211,0.14)]',
    stageWash:
      'bg-[radial-gradient(circle_at_80%_20%,rgba(232,121,249,0.2),transparent_20%),radial-gradient(circle_at_20%_82%,rgba(217,70,239,0.08),transparent_28%)]',
  },
  viral: {
    badge:
      'rounded-full border border-emerald-200/90 bg-emerald-50/90 text-emerald-800 shadow-[0_14px_26px_-20px_rgba(5,150,105,0.42)]',
    timerShell:
      'border-emerald-200/90 bg-emerald-50/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_0_0_6px_rgba(52,211,153,0.08),0_10px_30px_rgba(5,150,105,0.14)]',
    stageWash:
      'bg-[radial-gradient(circle_at_80%_20%,rgba(52,211,153,0.2),transparent_20%),radial-gradient(circle_at_20%_82%,rgba(16,185,129,0.08),transparent_28%)]',
  },
} as const;

const getComboBurstAnchor = (slotIndexes: number[]) => {
  const uniqueSlots = [...new Set(slotIndexes)].filter(
    (index) => index >= 0 && index < STAGE_SLOT_LAYOUT.length,
  );
  if (uniqueSlots.length === 0) return null;

  if (uniqueSlots.length === 1) {
    const [slotIndex] = uniqueSlots;
    const center = getStageSlotCenter(slotIndex);
    if (!center) return null;

    if (slotIndex === 0) {
      return {
        leftPct: clamp(center.x + center.width * 0.82, 15, 85),
        topPct: clamp(center.y - center.height * 0.14, 18, 82),
        placement: 'right' as const,
      };
    }

    if (slotIndex === 2) {
      return {
        leftPct: clamp(center.x - center.width * 0.82, 15, 85),
        topPct: clamp(center.y - center.height * 0.14, 18, 82),
        placement: 'left' as const,
      };
    }

    return {
      leftPct: center.x,
      topPct: clamp(center.y - center.height * 0.44, 18, 82),
      placement: 'top' as const,
    };
  }

  const centers = uniqueSlots
    .map((index) => getStageSlotCenter(index))
    .filter((value): value is NonNullable<ReturnType<typeof getStageSlotCenter>> => Boolean(value));

  if (centers.length === 0) return null;

  const averageX = centers.reduce((sum, center) => sum + center.x, 0) / centers.length;
  const topEdge = Math.min(...centers.map((center) => center.y - center.height / 2));
  const tallest = Math.max(...centers.map((center) => center.height));

  return {
    leftPct: clamp(averageX, 18, 82),
    topPct: clamp(topEdge + tallest * 0.12, 18, 82),
    placement: 'top' as const,
  };
};

const toDisplayChar = (ch: string, preset: TransliterationPreset) => {
  const canonical = preset.language === 'hebrew' ? (ch || '').toLowerCase() : ch || '';
  const aliased = preset.canonicalToDisplay[canonical];
  if (aliased) return isAsciiLetter(aliased) ? aliased.toUpperCase() : aliased;
  return preset.language === 'hebrew' && isAsciiLetter(canonical) ? canonical.toUpperCase() : ch;
};

const toDisplayDotted = (letters: string[], preset: TransliterationPreset) =>
  letters.map((letter) => toDisplayChar(letter, preset)).join('.');

const formatDisplayRoot = (plainRoot: string, preset: TransliterationPreset) =>
  toDisplayDotted(Array.from(plainRoot || ''), preset);

const normalizeLatinGameChar = (key: string, inputAliases: Record<string, string>): string | null => {
  if (!key || key.length !== 1) return null;
  const normalized = key.toLowerCase();
  if (inputAliases[normalized]) return inputAliases[normalized];
  if (isAsciiLetter(normalized)) return normalized;
  return null;
};

const normalizeArabicGameChar = (key: string): string | null => {
  if (!key || key.length !== 1) return null;
  const normalized = ARABIC_CHAR_NORMALIZATION[key] ?? key;
  return ARABIC_ROOT_CHAR_SET.has(normalized) ? normalized : null;
};

const inferKeyboardLayoutMode = (value: string): KeyboardLayoutMode => {
  if (!value) return 'unknown';
  if (HEBREW_CHAR_PATTERN.test(value)) return 'hebrew';
  if (ARABIC_CHAR_PATTERN.test(value)) return 'arabic';
  if (Array.from(value).some((char) => isAsciiLetter(char))) return 'latin';
  return 'unknown';
};

const getNavigatorKeyboard = (): NavigatorKeyboardLike | null => {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { keyboard?: NavigatorKeyboardLike }).keyboard ?? null;
};

const pickKeyboardLayoutSample = (layoutMap: KeyboardLayoutMapLike): string | null => {
  const samples = KEYBOARD_LAYOUT_SAMPLE_CODES.map((code) => layoutMap.get(code)).filter(
    (value): value is string => Boolean(value),
  );

  return (
    samples.find((value) => inferKeyboardLayoutMode(value) === 'hebrew') ??
    samples.find((value) => inferKeyboardLayoutMode(value) === 'arabic') ??
    samples.find((value) => inferKeyboardLayoutMode(value) === 'latin') ??
    samples[0] ??
    null
  );
};

const getKeyboardSwitchGuide = (language: LanguageMode) => {
  const targetLabel = LANGUAGE_LABELS[language];

  if (typeof navigator === 'undefined') {
    return {
      hint: `Switch your device keyboard to ${targetLabel}`,
    };
  }

  const userAgentDataPlatform =
    (
      navigator as Navigator & {
        userAgentData?: {
          platform?: string;
        };
      }
    ).userAgentData?.platform ?? '';
  const platformFingerprint = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''} ${userAgentDataPlatform}`.toLowerCase();

  if (/iphone|ipad|ipod|ios|android/.test(platformFingerprint)) {
    return {
      hint: `Tap the globe key, then choose ${targetLabel}`,
    };
  }

  if (/mac/.test(platformFingerprint)) {
    return {
      hint: `Press Control + Space for ${targetLabel}`,
    };
  }

  if (/win/.test(platformFingerprint)) {
    return {
      hint: `Press Win + Space for ${targetLabel}`,
    };
  }

  return {
    hint: `Use your system shortcut for ${targetLabel}`,
  };
};

const mapKeyToGameChar = (
  key: string,
  language: LanguageMode,
  preset: TransliterationPreset,
): string | null => {
  if (language === 'arabic') {
    return normalizeArabicGameChar(key);
  }

  return preset.hebToGame[key] ?? normalizeLatinGameChar(key, preset.inputAliases);
};

const formatReason = (reason: string | null | undefined): string => {
  if (!reason) return '';
  const map: Record<string, string> = {
    timeout: 'Time ran out',
    target_reached: 'Target reached',
    no_moves: 'No valid moves left',
    already_visited: 'Root already used',
    not_a_valid_neighbor: 'Not a valid neighbor',
    same_root: 'Root did not change',
    control_locked: 'Another player still controls the board',
    room_not_active: 'Room is not active',
  };

  return map[reason] || reason.replaceAll('_', ' ');
};

const getCountdownMs = (session: SessionSnapshot | null, fallback = DEFAULT_COUNTDOWN_MS) =>
  session?.config?.countdownMs ?? session?.turnBudgetMs ?? fallback;

const getBonusBaseMs = (session: SessionSnapshot | null, fallback = DEFAULT_BONUS_BASE_MS) =>
  session?.config?.bonusBaseMs ?? session?.config?.baseTurnMs ?? fallback;

const getBonusWindowMs = (session: SessionSnapshot | null, fallback = DEFAULT_BONUS_WINDOW_MS) =>
  session?.config?.bonusWindowMs ?? fallback;

export default function App() {
  const [mode, setMode] = useState<PlayMode>('survival');
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roomPlayer, setRoomPlayer] = useState<RoomPlayerAuth | null>(null);
  const [neighborsSet, setNeighborsSet] = useState<Set<string>>(new Set());
  const [neighborEdges, setNeighborEdges] = useState<NeighborEdge[]>([]);
  const [letters, setLetters] = useState<string[]>(['', '', '']);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [languageMode, setLanguageMode] = useState<LanguageMode>('hebrew');
  const [transliterationPresetId, setTransliterationPresetId] =
    useState<TransliterationPresetId>('hebrew_native');

  const [startRootInput, setStartRootInput] = useState('');
  const [targetRootInput, setTargetRootInput] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomPlayerNameInput, setRoomPlayerNameInput] = useState('');
  const [countdownMs, setCountdownMs] = useState(DEFAULT_COUNTDOWN_MS);
  const [bonusBaseMs, setBonusBaseMs] = useState(DEFAULT_BONUS_BASE_MS);
  const [bonusWindowMs, setBonusWindowMs] = useState(DEFAULT_BONUS_WINDOW_MS);
  const [controlWindowMs, setControlWindowMs] = useState(DEFAULT_CONTROL_WINDOW_MS);
  const [maxControlMs, setMaxControlMs] = useState(DEFAULT_MAX_CONTROL_MS);

  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [submittingMove, setSubmittingMove] = useState(false);

  const [errorText, setErrorText] = useState('');
  const [infoText, setInfoText] = useState('');
  const [lastMove, setLastMove] = useState<MoveSummary | null>(null);
  const [bonusFlash, setBonusFlash] = useState<BonusFlash | null>(null);
  const [bonusFlashVisible, setBonusFlashVisible] = useState(false);
  const [attemptFlash, setAttemptFlash] = useState<AttemptFlash | null>(null);
  const [attemptFlashVisible, setAttemptFlashVisible] = useState(false);
  const [visitedRoots, setVisitedRoots] = useState<string[]>([]);
  const [reelFx, setReelFx] = useState<'spin' | 'shake' | null>(null);
  const [timerBurstActive, setTimerBurstActive] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState<KeyboardLayoutState>({
    mode: 'unknown',
    source: 'unavailable',
    sample: null,
  });
  const [showSuggestionPanel, setShowSuggestionPanel] = useState(false);
  const [suggestedRootInput, setSuggestedRootInput] = useState('');
  const [suggestionNoteInput, setSuggestionNoteInput] = useState('');
  const [rootSuggestions, setRootSuggestions] = useState<RootSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [reviewingSuggestionId, setReviewingSuggestionId] = useState<string | null>(null);
  const [suggestionFeedback, setSuggestionFeedback] = useState<SuggestionFeedback | null>(null);
  const [journeySolution, setJourneySolution] = useState<PathPayload | null>(null);
  const [loadingJourneySolution, setLoadingJourneySolution] = useState(false);
  const [journeySolutionError, setJourneySolutionError] = useState('');

  const [clockMs, setClockMs] = useState(Date.now());
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [syncClientMs, setSyncClientMs] = useState(Date.now());

  const sessionIdRef = useRef<string | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const typingInputRef = useRef<HTMLInputElement | null>(null);
  const suggestRootInputRef = useRef<HTMLInputElement | null>(null);
  const dragGestureRef = useRef<DragGestureState | null>(null);
  const suppressCardClickRef = useRef(false);
  const flashTimersRef = useRef<number[]>([]);
  const attemptTimersRef = useRef<number[]>([]);
  const motionTimersRef = useRef<number[]>([]);

  const activeRoomPlayer = useMemo(
    () =>
      roomPlayer
        ? room?.players.find((candidate) => candidate.id === roomPlayer.id) ?? null
        : room?.players.find((candidate) => candidate.isSelf) ?? null,
    [room, roomPlayer],
  );
  const activeController = useMemo(
    () =>
      room?.controllerPlayerId
        ? room.players.find((candidate) => candidate.id === room.controllerPlayerId) ?? null
        : null,
    [room],
  );
  const activeSession = useMemo<SessionSnapshot | null>(() => {
    if (room) {
      return {
        id: room.id,
        mode: 'survival',
        language: room.language,
        status: room.status === 'active' ? 'active' : 'completed',
        reason: room.reason,
        currentRoot: room.currentRoot,
        targetRoot: null,
        score: activeRoomPlayer?.score ?? 0,
        streak: activeRoomPlayer?.streak ?? 0,
        moveCount: room.moveCount,
        combo: activeRoomPlayer?.combo ?? {
          permutationChain: 0,
          samePositionChain: 0,
          samePositionIndex: null,
        },
        visitedRoots: room.visitedRoots,
        visitedCount: room.visitedCount,
        allowRevisit: room.allowRevisit,
        types: room.types,
        letterBank: room.letterBank,
        turnBudgetMs: room.config.controlWindowMs,
        remainingMs: room.controllerPlayerId ? room.controllerRemainingMs : room.config.controlWindowMs,
        turnStartedAtMs: room.turnStartedAtMs,
        turnEndsAtMs:
          room.controllerExpiresAtMs ?? room.turnStartedAtMs + room.config.controlWindowMs,
        createdAtMs: room.createdAtMs,
        updatedAtMs: room.updatedAtMs,
        endedAtMs: room.status === 'completed' ? room.updatedAtMs : null,
        config: {
          countdownMs: room.config.controlWindowMs,
          bonusBaseMs: room.config.bonusBaseMs,
          bonusWindowMs: room.config.bonusWindowMs,
        },
      };
    }

    return session;
  }, [activeRoomPlayer, room, session]);
  const roomControllerName = activeController?.name ?? 'Nobody';
  const roomIsControlledBySelf = Boolean(room && roomPlayer && room.controllerPlayerId === roomPlayer.id);
  const roomRoster = room?.players ?? [];
  const canInteractWithBoard = Boolean(
    activeSession &&
      activeSession.status === 'active' &&
      (!room || room.phase === 'open_claim' || roomIsControlledBySelf),
  );
  const activeLanguageMode = activeSession?.language ?? languageMode;
  const activeLanguageNativeLabel = LANGUAGE_NATIVE_LABELS[activeLanguageMode];
  const committedPlain = activeSession?.currentRoot || letters.join('');
  const resolvedPresetId =
    TRANSLITERATION_PRESETS[transliterationPresetId]?.language === activeLanguageMode
      ? transliterationPresetId
      : DEFAULT_PRESET_BY_LANGUAGE[activeLanguageMode];
  const activeTransliteration = useMemo(
    () => TRANSLITERATION_PRESETS[resolvedPresetId],
    [resolvedPresetId],
  );
  const activeDisplayDir = activeTransliteration.displayDir;
  const committedLetters = useMemo(() => Array.from(committedPlain), [committedPlain]);
  const committedDotted = useMemo(
    () => toDisplayDotted(committedLetters, activeTransliteration),
    [activeTransliteration, committedLetters],
  );
  const candidatePlain = useMemo(() => letters.join(''), [letters]);
  const candidateDotted = useMemo(
    () => toDisplayDotted(letters, activeTransliteration),
    [activeTransliteration, letters],
  );
  const isCandidateValid = useMemo(() => neighborsSet.has(candidatePlain), [neighborsSet, candidatePlain]);

  const virtualNowMs = clockMs + timeOffsetMs;
  const remainingMs = useMemo(() => {
    if (!activeSession) return 0;
    const elapsed = virtualNowMs - syncClientMs;
    return Math.max(0, activeSession.remainingMs - elapsed);
  }, [activeSession, virtualNowMs, syncClientMs]);

  const timerLimitMs = useMemo(
    () => Math.max(getCountdownMs(activeSession), activeSession?.remainingMs ?? 0),
    [activeSession],
  );
  const timerPct = useMemo(() => {
    if (!activeSession) return 0;
    const ratio = remainingMs / Math.max(timerLimitMs, 1);
    return Math.max(0, Math.min(100, ratio * 100));
  }, [activeSession, remainingMs, timerLimitMs]);

  const neighborHints = useMemo(() => neighborEdges.slice(0, 12), [neighborEdges]);
  const visibleVisitedRoots = useMemo(() => {
    const roots =
      activeSession?.visitedRoots && activeSession.visitedRoots.length > 0
        ? activeSession.visitedRoots
        : visitedRoots.length > 0
          ? visitedRoots
          : committedPlain
            ? [committedPlain]
            : [];
    return roots;
  }, [activeSession?.visitedRoots, committedPlain, visitedRoots]);
  const journeyStartRoot = session?.visitedRoots?.[0] ?? session?.currentRoot ?? null;
  const journeySolutionRequest = useMemo(() => {
    if (
      !session ||
      session.mode !== 'journey' ||
      session.status !== 'game_over' ||
      !session.targetRoot ||
      !journeyStartRoot
    ) {
      return null;
    }

    return {
      sessionId: session.id,
      language: session.language,
      fromRoot: journeyStartRoot,
      toRoot: session.targetRoot,
      types: session.types,
    };
  }, [journeyStartRoot, session]);
  const displayCountdownMs = activeSession ? getCountdownMs(activeSession, countdownMs) : countdownMs;
  const selectedSlotLabel = getSlotLabel(selectedIdx);
  const selectedSlotCenter = selectedIdx !== null ? getStageSlotCenter(selectedIdx) : null;
  const activeComboKind: ComboKind | null =
    activeSession?.combo?.permutationChain && activeSession.combo.permutationChain >= 2
      ? 'permutation'
      : activeSession?.combo?.samePositionChain && activeSession.combo.samePositionChain >= 2
        ? 'same_position'
        : null;
  const activeComboDescriptor = useMemo(
    () =>
      getComboDescriptor(
        activeComboKind,
        activeSession?.combo?.permutationChain && activeSession.combo.permutationChain >= 2
          ? activeSession.combo.permutationChain
          : activeSession?.combo?.samePositionChain ?? 0,
        activeSession?.combo?.samePositionIndex,
      ),
    [activeComboKind, activeSession],
  );
  const currentSuccessStreak = activeSession?.streak ?? 0;
  const streakTier = useMemo(() => getStreakTier(currentSuccessStreak), [currentSuccessStreak]);
  const nextStreakTier = useMemo(() => getNextStreakTier(currentSuccessStreak), [currentSuccessStreak]);
  const streakTierProgress = useMemo(
    () => getStreakTierProgress(currentSuccessStreak),
    [currentSuccessStreak],
  );
  const activeStreakVisual =
    currentSuccessStreak > 0 ? STREAK_VISUALS[streakTier.id] : STREAK_VISUALS.reset;
  const activeStreakPulse = useMemo(() => {
    if (attemptFlash && attemptFlashVisible && attemptFlash.streakResetFrom > 0) {
      return {
        tone: 'bust' as const,
        title: 'Bust',
        detail: `x${attemptFlash.streakResetFrom} -> 0`,
        visible: true,
      };
    }

    if (bonusFlash && bonusFlashVisible && bonusFlash.streakAfterMove > 0) {
      const nextTier = getStreakTier(bonusFlash.streakAfterMove);
      return {
        tone: (nextTier.id === 'reset' ? 'x' : nextTier.id) as 'x' | 'y' | 'z' | 'viral',
        title: isStreakTierUpgrade(bonusFlash.streakAfterMove) ? 'Up' : nextTier.shortLabel,
        detail: `x${bonusFlash.streakAfterMove}`,
        visible: true,
      };
    }

    return null;
  }, [attemptFlash, attemptFlashVisible, bonusFlash, bonusFlashVisible]);
  const keyboardSwitchGuide = useMemo(
    () => getKeyboardSwitchGuide(activeLanguageMode),
    [activeLanguageMode],
  );
  const keyboardIndicatorLabel =
    keyboardLayout.mode === 'hebrew'
      ? 'עברית'
      : keyboardLayout.mode === 'arabic'
        ? 'العربية'
        : keyboardLayout.mode === 'latin'
          ? 'ABC'
          : 'Detect';
  const keyboardIndicatorStatusLabel =
    keyboardLayout.mode === activeLanguageMode
      ? `${LANGUAGE_LABELS[activeLanguageMode]} Ready`
      : keyboardLayout.mode === 'latin' || keyboardLayout.mode === 'hebrew' || keyboardLayout.mode === 'arabic'
        ? `Switch to ${LANGUAGE_LABELS[activeLanguageMode]}`
        : 'Check Keyboard';
  const keyboardIndicatorHint =
    keyboardLayout.mode === activeLanguageMode
      ? `${LANGUAGE_LABELS[activeLanguageMode]} keyboard ready`
      : keyboardSwitchGuide.hint;
  const keyboardIndicatorToneClass =
    keyboardLayout.mode === activeLanguageMode
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : keyboardLayout.mode === 'latin' || keyboardLayout.mode === 'hebrew' || keyboardLayout.mode === 'arabic'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-white text-slate-600';
  const keyboardIndicatorShellClass =
    keyboardLayout.mode === activeLanguageMode
      ? 'border-emerald-200/90 bg-[linear-gradient(135deg,rgba(240,253,244,0.96)_0%,rgba(220,252,231,0.94)_100%)] text-emerald-900 shadow-[0_18px_36px_-28px_rgba(22,163,74,0.5)]'
      : keyboardLayout.mode === 'latin' || keyboardLayout.mode === 'hebrew' || keyboardLayout.mode === 'arabic'
        ? 'border-rose-300/95 bg-[linear-gradient(135deg,rgba(255,241,242,0.98)_0%,rgba(255,237,213,0.96)_100%)] text-rose-900 shadow-[0_22px_46px_-26px_rgba(225,29,72,0.52)] motion-safe:animate-[pulse_2.2s_ease-in-out_infinite]'
        : 'border-amber-200/90 bg-[linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.95)_100%)] text-amber-950 shadow-[0_18px_36px_-28px_rgba(217,119,6,0.4)]';
  const keyboardIndicatorDotClass =
    keyboardLayout.mode === activeLanguageMode
      ? 'bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.18)]'
      : keyboardLayout.mode === 'latin' || keyboardLayout.mode === 'hebrew' || keyboardLayout.mode === 'arabic'
        ? 'bg-rose-500 shadow-[0_0_0_7px_rgba(244,63,94,0.2)]'
        : 'bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.18)]';
  const keyboardIndicatorDir =
    keyboardLayout.mode === 'hebrew' || keyboardLayout.mode === 'arabic' ? 'rtl' : 'ltr';
  const pendingSuggestionsCount = rootSuggestions.filter(
    (suggestion) => suggestion.status === 'pending',
  ).length;

  const updateKeyboardLayoutFromSample = useCallback(
    (sample: string, source: KeyboardLayoutSource) => {
      const nextMode = inferKeyboardLayoutMode(sample);
      if (nextMode === 'unknown') return;

      setKeyboardLayout((prev) => {
        if (prev.mode === nextMode && prev.source === source && prev.sample === sample) {
          return prev;
        }

        return {
          mode: nextMode,
          source,
          sample,
        };
      });
    },
    [],
  );

  const refreshKeyboardLayout = useCallback(async () => {
    const keyboard = getNavigatorKeyboard();

    if (!keyboard?.getLayoutMap) {
      setKeyboardLayout((prev) =>
        prev.mode === 'unknown'
          ? {
              mode: 'unknown',
              source: 'unavailable',
              sample: null,
            }
          : prev,
      );
      return;
    }

    try {
      const layoutMap = await keyboard.getLayoutMap();
      const sample = pickKeyboardLayoutSample(layoutMap);

      setKeyboardLayout((prev) => {
        const nextMode = sample ? inferKeyboardLayoutMode(sample) : 'unknown';

        if (prev.mode === nextMode && prev.source === 'layout_map' && prev.sample === sample) {
          return prev;
        }

        return {
          mode: nextMode,
          source: 'layout_map',
          sample,
        };
      });
    } catch {
      setKeyboardLayout((prev) =>
        prev.mode === 'unknown'
          ? {
              mode: 'unknown',
              source: 'unavailable',
              sample: null,
            }
          : prev,
      );
    }
  }, []);

  const clearTypingInput = useCallback(() => {
    const input = typingInputRef.current;
    if (!input) return;
    input.value = '';
  }, []);

  const focusTypingInput = useCallback(() => {
    const input = typingInputRef.current;
    if (!input) return;
    void refreshKeyboardLayout();
    input.focus({ preventScroll: true });
    input.select();
  }, [refreshKeyboardLayout]);

  const clearDragState = useCallback(() => {
    dragGestureRef.current = null;
    setDragSourceIdx(null);
    setDragOverIdx(null);
  }, []);

  const clearSelection = useCallback(() => {
    clearDragState();
    setSelectedIdx(null);
    clearTypingInput();
    typingInputRef.current?.blur();
  }, [clearDragState, clearTypingInput]);

  const clearFlashTimers = useCallback(() => {
    flashTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    flashTimersRef.current = [];
  }, []);

  const clearAttemptTimers = useCallback(() => {
    attemptTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    attemptTimersRef.current = [];
  }, []);

  const clearMotionTimers = useCallback(() => {
    motionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    motionTimersRef.current = [];
  }, []);

  const showBonusFlash = useCallback((payload: BonusFlash) => {
    clearFlashTimers();
    setBonusFlash(payload);
    setBonusFlashVisible(true);

    const collapseTimer = window.setTimeout(() => setBonusFlashVisible(false), 1600);
    const clearTimer = window.setTimeout(() => setBonusFlash(null), 2400);
    flashTimersRef.current = [collapseTimer, clearTimer];
  }, [clearFlashTimers]);

  const showAttemptFlash = useCallback((payload: AttemptFlash) => {
    clearAttemptTimers();
    setAttemptFlash(payload);
    setAttemptFlashVisible(true);

    const collapseTimer = window.setTimeout(() => setAttemptFlashVisible(false), 1400);
    const clearTimer = window.setTimeout(() => setAttemptFlash(null), 2100);
    attemptTimersRef.current = [collapseTimer, clearTimer];
  }, [clearAttemptTimers]);

  const triggerValidMotion = useCallback(() => {
    clearMotionTimers();
    setReelFx('spin');
    setTimerBurstActive(true);

    const spinTimer = window.setTimeout(() => setReelFx(null), 720);
    const timerTimer = window.setTimeout(() => setTimerBurstActive(false), 1150);
    motionTimersRef.current = [spinTimer, timerTimer];
  }, [clearMotionTimers]);

  const triggerRejectedMotion = useCallback(() => {
    clearMotionTimers();
    setReelFx('shake');
    setTimerBurstActive(false);

    const shakeTimer = window.setTimeout(() => setReelFx(null), 440);
    motionTimersRef.current = [shakeTimer];
  }, [clearMotionTimers]);

  const applyPayload = useCallback((
    payload: SessionPayload,
    options: {
      syncLetters: boolean;
      preserveSelection?: boolean;
    },
  ) => {
    setSession(payload.session);
    setLanguageMode(payload.session.language);
    sessionIdRef.current = payload.session.id;
    setNeighborEdges(payload.options.edges);
    setNeighborsSet(new Set(payload.options.neighbors));
    setSyncClientMs(Date.now());
    setLastMove(payload.move);

    const shouldPreserveSelection = Boolean(options.preserveSelection) && payload.session.status === 'active';

    if (options.syncLetters) {
      setLetters(Array.from(payload.session.currentRoot));

      if (!shouldPreserveSelection) {
        clearSelection();
      }
    }

    if (payload.session.status !== 'active') {
      clearSelection();
    }
  }, [clearSelection]);

  const applyRoomPayload = useCallback((
    payload: RoomPayload,
    options: {
      syncLetters: boolean;
      preserveSelection?: boolean;
    },
  ) => {
    setRoom(payload.room);
    setLanguageMode(payload.room.language);
    setRoomPlayer(payload.player);
    roomCodeRef.current = payload.room.code;
    setNeighborEdges(payload.room.options.edges);
    setNeighborsSet(new Set(payload.room.options.neighbors));
    setSyncClientMs(Date.now());
    setLastMove(payload.move ?? null);

    const shouldPreserveSelection = Boolean(options.preserveSelection) && payload.room.status === 'active';

    if (options.syncLetters) {
      setLetters(Array.from(payload.room.currentRoot));

      if (!shouldPreserveSelection) {
        clearSelection();
      }
    }

    if (payload.room.status !== 'active') {
      clearSelection();
    }
  }, [clearSelection]);

  const resetGameplayUi = useCallback(() => {
    resetApiTime();
    setErrorText('');
    setInfoText('');
    setLastMove(null);
    setBonusFlash(null);
    setBonusFlashVisible(false);
    setAttemptFlash(null);
    setAttemptFlashVisible(false);
    setReelFx(null);
    setTimerBurstActive(false);
    setJourneySolution(null);
    setLoadingJourneySolution(false);
    setJourneySolutionError('');
    clearFlashTimers();
    clearAttemptTimers();
    clearMotionTimers();
    setTimeOffsetMs(0);
    clearSelection();
  }, [
    clearAttemptTimers,
    clearFlashTimers,
    clearMotionTimers,
    clearSelection,
  ]);

  const changeLanguageMode = useCallback(
    (nextLanguage: LanguageMode) => {
      if (nextLanguage === activeLanguageMode && !session && !room) return;

      resetGameplayUi();
      setSession(null);
      sessionIdRef.current = null;
      setRoom(null);
      roomCodeRef.current = null;
      setRoomPlayer(null);
      setNeighborsSet(new Set());
      setNeighborEdges([]);
      setLetters(['', '', '']);
      setVisitedRoots([]);
      setRootSuggestions([]);
      setShowSuggestionPanel(false);
      setSuggestionFeedback(null);
      setSuggestedRootInput('');
      setSuggestionNoteInput('');
      setStartRootInput('');
      setTargetRootInput('');
      setLanguageMode(nextLanguage);
      setTransliterationPresetId(DEFAULT_PRESET_BY_LANGUAGE[nextLanguage]);
    },
    [activeLanguageMode, resetGameplayUi, room, session],
  );

  const checkBackendHealth = useCallback(async () => {
    try {
      await requestJson<{ ok: boolean }>('/api/health');
      setServerHealthy(true);
      setErrorText('');
    } catch (error: unknown) {
      setServerHealthy(false);
      if (isApiError(error)) {
        setErrorText(error.message);
      } else {
        setErrorText('Could not reach backend');
      }
    }
  }, []);

  const loadRootSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);

    try {
      const payload = await requestJson<{ suggestions: RootSuggestion[] }>(
        `/api/root-suggestions?language=${encodeURIComponent(activeLanguageMode)}`,
      );
      setRootSuggestions(payload.suggestions);
    } catch (error: unknown) {
      if (isApiError(error)) {
        setSuggestionFeedback({ tone: 'error', text: error.message });
      } else {
        setSuggestionFeedback({ tone: 'error', text: 'Failed to load suggestions' });
      }
    } finally {
      setLoadingSuggestions(false);
    }
  }, [activeLanguageMode]);

  const submitRootSuggestion = useCallback(async () => {
    setSubmittingSuggestion(true);

    try {
      await requestJson<{ suggestion: RootSuggestion }>('/api/root-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: activeLanguageMode,
          root: suggestedRootInput,
          note: suggestionNoteInput,
        }),
      });

      setSuggestedRootInput('');
      setSuggestionNoteInput('');
      setShowSuggestionPanel(false);
      setSuggestionFeedback({ tone: 'success', text: 'Suggestion sent for admin review' });
      await loadRootSuggestions();
    } catch (error: unknown) {
      if (isApiError(error)) {
        setSuggestionFeedback({ tone: 'error', text: error.message });
      } else {
        setSuggestionFeedback({ tone: 'error', text: 'Could not send suggestion' });
      }
    } finally {
      setSubmittingSuggestion(false);
    }
  }, [activeLanguageMode, loadRootSuggestions, suggestedRootInput, suggestionNoteInput]);

  const reviewRootSuggestionDecision = useCallback(
    async (suggestionId: string, decision: 'approve' | 'reject') => {
      setReviewingSuggestionId(suggestionId);

      try {
        await requestJson<{ suggestion: RootSuggestion }>(
          `/api/root-suggestions/${encodeURIComponent(suggestionId)}/review`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision }),
          },
        );

        setSuggestionFeedback({
          tone: 'success',
          text: decision === 'approve' ? 'Suggestion approved and added' : 'Suggestion rejected',
        });
        await loadRootSuggestions();
        await checkBackendHealth();
      } catch (error: unknown) {
        if (isApiError(error)) {
          setSuggestionFeedback({ tone: 'error', text: error.message });
        } else {
          setSuggestionFeedback({ tone: 'error', text: 'Could not review suggestion' });
        }
      } finally {
        setReviewingSuggestionId(null);
      }
    },
    [checkBackendHealth, loadRootSuggestions],
  );

  const startSession = useCallback(async () => {
    setLoadingSession(true);
    resetGameplayUi();
    setRoom(null);
    setRoomPlayer(null);
    roomCodeRef.current = null;

    const body: Record<string, unknown> = {
      language: activeLanguageMode,
      mode: mode === 'journey' ? 'journey' : 'survival',
      types: DEFAULT_TYPES,
      allowRevisit: false,
      optionsLimit: 700,
      countdownMs,
      bonusBaseMs,
      bonusWindowMs,
      initialTurnMs: countdownMs,
      baseTurnMs: bonusBaseMs,
      maxTurnMs: Math.max(countdownMs * 2, countdownMs + bonusBaseMs * 3),
    };

    const cleanedStart = startRootInput.trim();
    if (cleanedStart) body.startRoot = cleanedStart;

    const cleanedTarget = targetRootInput.trim();
    if (mode === 'journey' && cleanedTarget) body.targetRoot = cleanedTarget;

    try {
      const payload = await requestJson<SessionPayload>('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      applyPayload(payload, { syncLetters: true });
      setVisitedRoots([payload.session.currentRoot]);
      setServerHealthy(true);
      setInfoText(
        mode === 'journey'
          ? 'Journey mode: reach the target root before the timer dries up.'
          : 'Survival mode: keep chaining fresh roots and let the timer snowball.',
      );
    } catch (error: unknown) {
      if (isApiError(error)) {
        setErrorText(error.message);
      } else {
        setErrorText('Failed to start a session');
      }
    } finally {
      setLoadingSession(false);
    }
  }, [
    activeLanguageMode,
    applyPayload,
    bonusBaseMs,
    bonusWindowMs,
    countdownMs,
    mode,
    resetGameplayUi,
    startRootInput,
    targetRootInput,
  ]);

  const createRoom = useCallback(async () => {
    setLoadingRoom(true);
    resetGameplayUi();
    setSession(null);
    sessionIdRef.current = null;

    const body: Record<string, unknown> = {
      language: activeLanguageMode,
      playerName: roomPlayerNameInput.trim() || 'Host',
      types: DEFAULT_TYPES,
      allowRevisit: false,
      optionsLimit: 700,
      countdownMs,
      bonusBaseMs,
      bonusWindowMs,
      controlWindowMs,
      maxControlMs,
      maxPlayers: 4,
    };

    const cleanedStart = startRootInput.trim();
    if (cleanedStart) body.startRoot = cleanedStart;

    try {
      const payload = await requestJson<RoomPayload>('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      applyRoomPayload(payload, { syncLetters: true });
      setVisitedRoots([payload.room.currentRoot]);
      setRoomCodeInput(payload.room.code);
      setServerHealthy(true);
      setInfoText(
        `Room ${payload.room.code} live. First valid root claims control, then streaks extend the timer.`,
      );
    } catch (error: unknown) {
      if (isApiError(error)) {
        setErrorText(error.message);
      } else {
        setErrorText('Failed to create room');
      }
    } finally {
      setLoadingRoom(false);
    }
  }, [
    activeLanguageMode,
    applyRoomPayload,
    bonusBaseMs,
    bonusWindowMs,
    controlWindowMs,
    countdownMs,
    maxControlMs,
    resetGameplayUi,
    roomPlayerNameInput,
    startRootInput,
  ]);

  const joinRoom = useCallback(async () => {
    const trimmedRoomCode = roomCodeInput.trim();
    if (!trimmedRoomCode) {
      setErrorText('Enter a room code');
      return;
    }

    setLoadingRoom(true);
    resetGameplayUi();
    setSession(null);
    sessionIdRef.current = null;

    try {
      const payload = await requestJson<RoomPayload>(
        `/api/rooms/${encodeURIComponent(trimmedRoomCode)}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: roomPlayerNameInput.trim() || 'Player',
            playerToken: room?.code === trimmedRoomCode ? roomPlayer?.token : undefined,
          }),
        },
      );

      applyRoomPayload(payload, { syncLetters: true });
      setVisitedRoots([payload.room.currentRoot]);
      setRoomCodeInput(payload.room.code);
      setServerHealthy(true);
      setInfoText(
        payload.room.phase === 'open_claim'
          ? `Joined room ${payload.room.code}. The board is open.`
          : `Joined room ${payload.room.code}. ${payload.room.players.find((candidate) => candidate.id === payload.room.controllerPlayerId)?.name ?? 'Another player'} currently controls the board.`,
      );
    } catch (error: unknown) {
      if (isApiError(error)) {
        setErrorText(error.message);
      } else {
        setErrorText('Failed to join room');
      }
    } finally {
      setLoadingRoom(false);
    }
  }, [
    applyRoomPayload,
    resetGameplayUi,
    room?.code,
    roomCodeInput,
    roomPlayer?.token,
    roomPlayerNameInput,
  ]);

  const refreshSessionState = useCallback(
    async (syncLetters: boolean) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      try {
        const payload = await requestJson<SessionPayload>(`/api/session/${sessionId}/state`);
        applyPayload(payload, { syncLetters });
      } catch (error: unknown) {
        if (isApiError(error)) {
          setErrorText(error.message);
        }
      }
    },
    [applyPayload],
  );

  const refreshRoomState = useCallback(
    async (syncLetters: boolean) => {
      const roomCode = roomCodeRef.current;
      const playerToken = roomPlayer?.token;
      if (!roomCode || !playerToken) return;

      try {
        const payload = await requestJson<RoomPayload>(
          `/api/rooms/${encodeURIComponent(roomCode)}/state?playerToken=${encodeURIComponent(playerToken)}`,
        );
        applyRoomPayload(payload, {
          syncLetters:
            syncLetters ||
            payload.room.currentRoot !== room?.currentRoot ||
            !canInteractWithBoard,
        });
      } catch (error: unknown) {
        if (isApiError(error)) {
          setErrorText(error.message);
        }
      }
    },
    [applyRoomPayload, canInteractWithBoard, room?.currentRoot, roomPlayer?.token],
  );

  const submitSessionMove = useCallback(
    async (nextRoot: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const streakBeforeMove = session?.streak ?? 0;

      setSubmittingMove(true);
      setErrorText('');

      try {
        const payload = await requestJson<SessionPayload>(`/api/session/${sessionId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ root: nextRoot }),
        });

        applyPayload(payload, {
          syncLetters: true,
          preserveSelection: selectedIdx !== null,
        });

        if (payload.session.status === 'active' && selectedIdx !== null && dragSourceIdx === null) {
          focusTypingInput();
        }

        if (payload.move?.ok) {
          const bonusMs = payload.move.bonusMs ?? 0;
          const multiplier = payload.move.bonusMultiplier ?? 1;
          const elapsedMs = payload.move.elapsedMs ?? 0;
          const scoreGain = payload.move.scoreGain ?? 0;
          const chainBonusScore = payload.move.chainBonusScore ?? 0;
          const streakBonusScore = payload.move.streakBonusScore ?? 0;
          const streakBonusMs = payload.move.streakBonusMs ?? 0;
          const comboBonusMs = payload.move.comboBonusMs ?? 0;
          const streakAfterMove = payload.move.streakAfterMove ?? payload.session.streak ?? 0;
          const comboDescriptor = getComboDescriptor(
            payload.move.activeCombo,
            payload.move.comboCount,
            payload.move.samePositionIndex,
          );
          const streakDescriptorForMove = getStreakDescriptor(streakAfterMove);
          const comboSlots =
            comboDescriptor && payload.move.edge
              ? payload.move.edge.type === 'SWAP'
                ? [payload.move.edge.positionA, payload.move.edge.positionB]
                : [payload.move.edge.positionA]
              : [];
          const moveLabel = payload.move.edge?.type === 'SWAP' ? 'Swap jackpot' : 'Root change';

          clearAttemptTimers();
          setAttemptFlash(null);
          setAttemptFlashVisible(false);
          setVisitedRoots((prev) =>
            prev[prev.length - 1] === payload.session.currentRoot
              ? prev
              : [...prev, payload.session.currentRoot],
          );
          triggerValidMotion();
          setInfoText(
            `${moveLabel}. +${scoreGain} score${streakDescriptorForMove ? ` · ${streakDescriptorForMove.detail}` : ''}${comboDescriptor ? ` · ${comboDescriptor.detail}` : ''}`,
          );
          showBonusFlash({
            bonusMs,
            multiplier,
            elapsedMs,
            scoreGain,
            moveType: payload.move.edge?.type ?? null,
            comboLabel: comboDescriptor?.label ?? null,
            comboCount: payload.move.comboCount ?? 0,
            chainBonusScore,
            streakBonusScore,
            streakBonusMs,
            comboBonusMs,
            streakAfterMove,
            comboSlots,
          });
        }
      } catch (error: unknown) {
        if (isApiError(error)) {
          if (
            typeof error.data === 'object' &&
            error.data !== null &&
            'session' in error.data &&
            'options' in error.data
          ) {
            const payload = error.data as SessionPayload;
            applyPayload(payload, { syncLetters: false });

            if (payload.move?.reason === 'not_a_valid_neighbor') {
              const streakTierBeforeReset =
                streakBeforeMove > 0 ? getStreakTier(streakBeforeMove) : null;
              setLetters(Array.from(payload.session.currentRoot));
              setInfoText('');
              setErrorText('');
              clearFlashTimers();
              setBonusFlash(null);
              setBonusFlashVisible(false);
              triggerRejectedMotion();
              showAttemptFlash({
                tone: 'invalid',
                message: 'Invalid root',
                root: nextRoot,
                streakResetFrom: streakBeforeMove,
                streakTierLabel: streakTierBeforeReset?.label ?? null,
              });
              if (dragSourceIdx === null && selectedIdx !== null) {
                focusTypingInput();
              }
              return;
            }

            if (payload.move?.reason === 'already_visited') {
              const streakTierBeforeReset =
                streakBeforeMove > 0 ? getStreakTier(streakBeforeMove) : null;
              setLetters(Array.from(payload.session.currentRoot));
              setInfoText('');
              setErrorText('');
              clearFlashTimers();
              setBonusFlash(null);
              setBonusFlashVisible(false);
              triggerRejectedMotion();
              showAttemptFlash({
                tone: 'repeat',
                message: 'Already did that',
                root: nextRoot,
                streakResetFrom: streakBeforeMove,
                streakTierLabel: streakTierBeforeReset?.label ?? null,
              });
              if (dragSourceIdx === null && selectedIdx !== null) {
                focusTypingInput();
              }
              return;
            }
          }

          setErrorText(error.message);
        } else {
          setErrorText('Failed to submit move');
        }
      } finally {
        setSubmittingMove(false);
      }
    },
    [
      applyPayload,
      clearAttemptTimers,
      clearFlashTimers,
      dragSourceIdx,
      focusTypingInput,
      session,
      selectedIdx,
      showAttemptFlash,
      showBonusFlash,
      triggerRejectedMotion,
      triggerValidMotion,
    ],
  );

  const submitRoomMove = useCallback(
    async (nextRoot: string) => {
      const currentRoomCode = roomCodeRef.current;
      const playerToken = roomPlayer?.token;
      if (!currentRoomCode || !playerToken) return;
      const streakBeforeMove = activeRoomPlayer?.streak ?? 0;

      setSubmittingMove(true);
      setErrorText('');

      try {
        const payload = await requestJson<RoomPayload>(
          `/api/rooms/${encodeURIComponent(currentRoomCode)}/move`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ root: nextRoot, playerToken }),
          },
        );

        applyRoomPayload(payload, {
          syncLetters: true,
          preserveSelection: selectedIdx !== null,
        });

        if (payload.room.status === 'active' && selectedIdx !== null && dragSourceIdx === null) {
          focusTypingInput();
        }

        if (payload.move?.ok) {
          const bonusMs = payload.move.bonusMs ?? 0;
          const multiplier = payload.move.bonusMultiplier ?? 1;
          const elapsedMs = payload.move.elapsedMs ?? 0;
          const scoreGain = payload.move.scoreGain ?? 0;
          const chainBonusScore = payload.move.chainBonusScore ?? 0;
          const streakBonusScore = payload.move.streakBonusScore ?? 0;
          const streakBonusMs = payload.move.streakBonusMs ?? 0;
          const comboBonusMs = payload.move.comboBonusMs ?? 0;
          const streakAfterMove = payload.move.streakAfterMove ?? activeRoomPlayer?.streak ?? 0;
          const comboDescriptor = getComboDescriptor(
            payload.move.activeCombo,
            payload.move.comboCount,
            payload.move.samePositionIndex,
          );
          const comboSlots =
            comboDescriptor && payload.move.edge
              ? payload.move.edge.type === 'SWAP'
                ? [payload.move.edge.positionA, payload.move.edge.positionB]
                : [payload.move.edge.positionA]
              : [];
          const moveLabel =
            payload.move.controlChange === 'claimed'
              ? 'Control claimed'
              : payload.move.edge?.type === 'SWAP'
                ? 'Swap jackpot'
                : 'Control extended';

          clearAttemptTimers();
          setAttemptFlash(null);
          setAttemptFlashVisible(false);
          setVisitedRoots((prev) =>
            prev[prev.length - 1] === payload.room.currentRoot ? prev : [...prev, payload.room.currentRoot],
          );
          triggerValidMotion();
          setInfoText(
            `${moveLabel}. +${scoreGain} score${comboDescriptor ? ` · ${comboDescriptor.detail}` : ''} · ${formatSeconds(payload.move.controlRemainingMs ?? 0)} control left.`,
          );
          showBonusFlash({
            bonusMs,
            multiplier,
            elapsedMs,
            scoreGain,
            moveType: payload.move.edge?.type ?? null,
            comboLabel: comboDescriptor?.label ?? null,
            comboCount: payload.move.comboCount ?? 0,
            chainBonusScore,
            streakBonusScore,
            streakBonusMs,
            comboBonusMs,
            streakAfterMove,
            comboSlots,
          });
        }
      } catch (error: unknown) {
        if (isApiError(error)) {
          if (
            typeof error.data === 'object' &&
            error.data !== null &&
            'room' in error.data
          ) {
            const payload = error.data as RoomPayload;
            applyRoomPayload(payload, { syncLetters: false });

            if (payload.move?.reason === 'control_locked') {
              setLetters(Array.from(payload.room.currentRoot));
              clearFlashTimers();
              setBonusFlash(null);
              setBonusFlashVisible(false);
              setAttemptFlash(null);
              setAttemptFlashVisible(false);
              setInfoText(
                `${payload.room.players.find((candidate) => candidate.id === payload.room.controllerPlayerId)?.name ?? 'Another player'} controls the board for ${formatSeconds(payload.move.controlRemainingMs ?? payload.room.controllerRemainingMs)}.`,
              );
              setErrorText('');
              return;
            }

            if (
              payload.move?.reason === 'not_a_valid_neighbor' ||
              payload.move?.reason === 'already_visited' ||
              payload.move?.reason === 'same_root'
            ) {
              const streakTierBeforeReset =
                streakBeforeMove > 0 ? getStreakTier(streakBeforeMove) : null;
              setLetters(Array.from(payload.room.currentRoot));
              setInfoText('');
              setErrorText('');
              clearFlashTimers();
              setBonusFlash(null);
              setBonusFlashVisible(false);
              triggerRejectedMotion();
              showAttemptFlash({
                tone: payload.move.reason === 'already_visited' ? 'repeat' : 'invalid',
                message:
                  payload.move.reason === 'already_visited'
                    ? 'Already used in this room'
                    : payload.move.reason === 'same_root'
                      ? 'Root did not change'
                      : 'Invalid root',
                root: nextRoot,
                streakResetFrom: streakBeforeMove,
                streakTierLabel: streakTierBeforeReset?.label ?? null,
              });
              if (dragSourceIdx === null && selectedIdx !== null) {
                focusTypingInput();
              }
              return;
            }
          }

          setErrorText(error.message);
        } else {
          setErrorText('Failed to submit room move');
        }
      } finally {
        setSubmittingMove(false);
      }
    },
    [
      activeRoomPlayer?.streak,
      applyRoomPayload,
      clearAttemptTimers,
      clearFlashTimers,
      dragSourceIdx,
      focusTypingInput,
      roomPlayer?.token,
      selectedIdx,
      showAttemptFlash,
      showBonusFlash,
      triggerRejectedMotion,
      triggerValidMotion,
    ],
  );

  const submitMove = useCallback(
    async (nextRoot: string) => {
      if (room) {
        await submitRoomMove(nextRoot);
        return;
      }

      await submitSessionMove(nextRoot);
    },
    [room, submitRoomMove, submitSessionMove],
  );

  const selectSlot = useCallback(
    (index: number) => {
      clearDragState();
      setSelectedIdx(index);
      focusTypingInput();
    },
    [clearDragState, focusTypingInput],
  );

  const getSlotIndexAtPoint = useCallback((clientX: number, clientY: number) => {
    if (typeof document === 'undefined') return null;
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof Element)) return null;

    const slotButton = target.closest('[data-slot-index]');
    if (!(slotButton instanceof HTMLElement)) return null;

    const value = Number(slotButton.dataset.slotIndex);
    return Number.isInteger(value) ? value : null;
  }, []);

  const handleCardClick = useCallback(
    (index: number) => {
      if (suppressCardClickRef.current) {
        suppressCardClickRef.current = false;
        return;
      }

      if (!canInteractWithBoard) return;

      clearDragState();

      if (selectedIdx === index) {
        clearSelection();
        return;
      }

      selectSlot(index);
    },
    [canInteractWithBoard, clearDragState, clearSelection, selectSlot, selectedIdx],
  );

  const handleCardPointerDown = useCallback(
    (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canInteractWithBoard) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures; drag still works with standard bubbling.
      }

      dragGestureRef.current = {
        pointerId: event.pointerId,
        sourceIdx: index,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      setDragSourceIdx(null);
      setDragOverIdx(null);
    },
    [canInteractWithBoard],
  );

  const handleCardPointerMove = useCallback(
    (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      const gesture = dragGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.sourceIdx !== index) return;

      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (!gesture.dragging && distance < REEL_DRAG_THRESHOLD_PX) return;

      if (!gesture.dragging) {
        gesture.dragging = true;
        setSelectedIdx(index);
        clearTypingInput();
        typingInputRef.current?.blur();
        setDragSourceIdx(index);
      }

      event.preventDefault();

      const hoveredIndex = getSlotIndexAtPoint(event.clientX, event.clientY);
      setDragOverIdx(hoveredIndex !== null && hoveredIndex !== index ? hoveredIndex : null);
    },
    [clearTypingInput, getSlotIndexAtPoint],
  );

  const handleCardPointerUp = useCallback(
    (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      const gesture = dragGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.sourceIdx !== index) return;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture release failures.
      }

      const dropIndex = gesture.dragging ? getSlotIndexAtPoint(event.clientX, event.clientY) : null;
      const didDrag = gesture.dragging;
      clearDragState();

      if (!didDrag) return;

      suppressCardClickRef.current = true;

      if (dropIndex === null || dropIndex === index) {
        setSelectedIdx(index);
        clearTypingInput();
        typingInputRef.current?.blur();
        return;
      }

      setSelectedIdx(null);
      clearTypingInput();
      typingInputRef.current?.blur();
      setLetters((prev) => {
        const next = [...prev];
        [next[index], next[dropIndex]] = [next[dropIndex], next[index]];
        return next;
      });
    },
    [clearDragState, clearTypingInput, getSlotIndexAtPoint],
  );

  const handleCardPointerCancel = useCallback(
    (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      const gesture = dragGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.sourceIdx !== index) return;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture release failures.
      }

      const didDrag = gesture.dragging;
      clearDragState();

      if (!didDrag) return;

      suppressCardClickRef.current = true;
      setSelectedIdx(index);
      clearTypingInput();
      typingInputRef.current?.blur();
    },
    [clearDragState, clearTypingInput],
  );

  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!canInteractWithBoard || (selectedIdx === null && dragSourceIdx === null)) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-slot-index]')) return;

      clearSelection();
    },
    [canInteractWithBoard, clearSelection, dragSourceIdx, selectedIdx],
  );

  const applyTypedCharacter = useCallback(
    (rawValue: string) => {
      if (!canInteractWithBoard || !activeSession || selectedIdx === null) return;
      const nextKey = Array.from(rawValue).at(-1);
      if (!nextKey) return;

      const mapped = mapKeyToGameChar(nextKey, activeLanguageMode, activeTransliteration);
      if (!mapped) return;

      clearDragState();
      setLetters((prev) => {
        const next = [...prev];
        next[selectedIdx] = mapped;
        return next;
      });
    },
    [activeLanguageMode, activeSession, activeTransliteration, canInteractWithBoard, clearDragState, selectedIdx],
  );

  useEffect(() => {
    void checkBackendHealth();
  }, [checkBackendHealth]);

  useEffect(() => {
    if (!showDebug && !showSuggestionPanel) return;
    void loadRootSuggestions();
  }, [loadRootSuggestions, showDebug, showSuggestionPanel]);

  useEffect(() => {
    if (!showSuggestionPanel) return;

    const frameId = window.requestAnimationFrame(() => {
      suggestRootInputRef.current?.focus();
      suggestRootInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [showSuggestionPanel]);

  useEffect(() => () => {
    clearFlashTimers();
    clearAttemptTimers();
    clearMotionTimers();
  }, [clearAttemptTimers, clearFlashTimers, clearMotionTimers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLanguage && isLanguageMode(savedLanguage)) {
      setLanguageMode(savedLanguage);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedPresetId = window.localStorage.getItem(TRANSLITERATION_STORAGE_KEY);
    if (savedPresetId && isTransliterationPresetId(savedPresetId)) {
      setTransliterationPresetId(savedPresetId);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, activeLanguageMode);
  }, [activeLanguageMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TRANSLITERATION_STORAGE_KEY, transliterationPresetId);
  }, [transliterationPresetId]);

  useEffect(() => {
    void refreshKeyboardLayout();

    const handleFocus = () => {
      void refreshKeyboardLayout();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshKeyboardLayout]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockMs(Date.now());
    }, 100);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (room) return;
    if (!session || session.status !== 'active') return;

    const intervalId = window.setInterval(() => {
      void refreshSessionState(false);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [refreshSessionState, room, session]);

  useEffect(() => {
    if (!room || room.status !== 'active') return;

    const intervalId = window.setInterval(() => {
      void refreshRoomState(false);
    }, 900);

    return () => window.clearInterval(intervalId);
  }, [refreshRoomState, room]);

  useEffect(() => {
    if (!journeySolutionRequest) {
      setJourneySolution(null);
      setLoadingJourneySolution(false);
      setJourneySolutionError('');
      return;
    }

    let cancelled = false;
    setJourneySolution(null);
    setLoadingJourneySolution(true);
    setJourneySolutionError('');

    void requestJson<PathPayload>('/api/path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: journeySolutionRequest.language,
        fromRoot: journeySolutionRequest.fromRoot,
        toRoot: journeySolutionRequest.toRoot,
        maxDepth: 25,
        types: journeySolutionRequest.types,
      }),
    })
      .then((payload) => {
        if (cancelled) return;
        setJourneySolution(payload);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setJourneySolution(null);
        if (isApiError(error) && error.status === 404) {
          setJourneySolutionError('No route found from the start root to the target.');
          return;
        }
        setJourneySolutionError('Could not load the right path.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingJourneySolution(false);
      });

    return () => {
      cancelled = true;
    };
  }, [journeySolutionRequest]);

  useEffect(() => {
    if (!canInteractWithBoard || !activeSession) return;
    if (submittingMove) return;
    if (candidatePlain === activeSession.currentRoot) return;
    if (letters.some((letter) => letter.length !== 1)) return;

    void submitMove(candidatePlain);
  }, [activeSession, candidatePlain, canInteractWithBoard, letters, submitMove, submittingMove]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        updateKeyboardLayoutFromSample(event.key, 'recent_key');
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setShowDebug((prev) => !prev);
        return;
      }

      if (!canInteractWithBoard || !activeSession) return;

      if (event.key === '1' || event.key === '2' || event.key === '3') {
        event.preventDefault();
        selectSlot(Number(event.key) - 1);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (selectedIdx === null) return;

      const mapped = mapKeyToGameChar(event.key, activeLanguageMode, activeTransliteration);
      if (mapped) {
        event.preventDefault();
        clearDragState();
        setLetters((prev) => {
          const next = [...prev];
          next[selectedIdx] = mapped;
          return next;
        });
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        clearDragState();
        setLetters((prev) => {
          const next = [...prev];
          next[selectedIdx] = activeSession.currentRoot[selectedIdx] ?? next[selectedIdx];
          return next;
        });
        focusTypingInput();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeLanguageMode,
    activeSession,
    activeTransliteration,
    clearSelection,
    clearDragState,
    canInteractWithBoard,
    focusTypingInput,
    selectSlot,
    selectedIdx,
    updateKeyboardLayoutFromSample,
  ]);

  useEffect(() => {
    const neighborSample = [...neighborsSet].slice(0, 12);
    const activeBonus = bonusFlash
        ? {
          bonusMs: bonusFlash.bonusMs,
          multiplier: bonusFlash.multiplier,
          elapsedMs: bonusFlash.elapsedMs,
          scoreGain: bonusFlash.scoreGain,
          moveType: bonusFlash.moveType,
          comboLabel: bonusFlash.comboLabel,
          comboCount: bonusFlash.comboCount,
          chainBonusScore: bonusFlash.chainBonusScore,
          streakBonusScore: bonusFlash.streakBonusScore,
          streakBonusMs: bonusFlash.streakBonusMs,
          comboBonusMs: bonusFlash.comboBonusMs,
          streakAfterMove: bonusFlash.streakAfterMove,
          comboSlots: bonusFlash.comboSlots,
          visible: bonusFlashVisible,
        }
      : null;
    const activeAttempt = attemptFlash
      ? {
          tone: attemptFlash.tone,
          message: attemptFlash.message,
          root: attemptFlash.root,
          streakResetFrom: attemptFlash.streakResetFrom,
          streakTierLabel: attemptFlash.streakTierLabel,
          visible: attemptFlashVisible,
        }
      : null;
    const activeMotion = {
      reelFx,
      timerBurstActive,
    };

    window.render_game_to_text = () =>
      JSON.stringify({
        mode,
        room: room
          ? {
              code: room.code,
              phase: room.phase,
              controllerPlayerId: room.controllerPlayerId,
              controllerName: activeController?.name ?? null,
              controllerRemainingMs: room.controllerRemainingMs,
              selfPlayerId: roomPlayer?.id ?? null,
              selfPlayerName: activeRoomPlayer?.name ?? null,
              roster: room.players.map((player) => ({
                id: player.id,
                name: player.name,
                score: player.score,
                streak: player.streak,
                takeovers: player.takeovers,
                isSelf: player.isSelf,
              })),
            }
          : null,
        backendHealthy: serverHealthy,
        coordinateSystem: 'three letter slots indexed right-to-left 0..2, where slot 0 is the rightmost card',
        session: activeSession
          ? {
              id: activeSession.id,
              status: activeSession.status,
              currentRoot: activeSession.currentRoot,
              targetRoot: activeSession.targetRoot,
              score: activeSession.score,
              streak: activeSession.streak,
              streakTier: {
                label: streakTier.label,
                range: formatStreakTierRange(streakTier),
                bonusScore: streakTier.scoreBonus,
                bonusTimeMs: streakTier.timeBonusMs,
                nextTier: nextStreakTier
                  ? {
                      label: nextStreakTier.label,
                      minStreak: nextStreakTier.minStreak,
                      bonusScore: nextStreakTier.scoreBonus,
                      bonusTimeMs: nextStreakTier.timeBonusMs,
                    }
                  : null,
                progressPct: Math.round(streakTierProgress * 100),
              },
              moveCount: activeSession.moveCount,
              visitedCount: activeSession.visitedCount,
              visitedRoots: activeSession.visitedRoots ?? null,
              combo: activeSession.combo ?? null,
              remainingMs: Math.round(remainingMs),
              config: {
                countdownMs: getCountdownMs(activeSession),
                bonusBaseMs: getBonusBaseMs(activeSession),
                bonusWindowMs: getBonusWindowMs(activeSession),
              },
            }
          : null,
        board: {
          committedRoot: committedPlain,
          candidateRoot: candidatePlain,
          selectedIndex: selectedIdx,
          selectedSlotLabel,
          interactionMode: dragSourceIdx !== null ? 'drag' : 'edit',
          dragSourceIndex: dragSourceIdx,
          dragOverIndex: dragOverIdx,
          neighborsCount: neighborsSet.size,
          neighborsSample: neighborSample,
          visitedRootsVisible: visibleVisitedRoots,
        },
        bonusFlash: activeBonus,
        attemptFlash: activeAttempt,
        streakPulse: activeStreakPulse,
        motion: activeMotion,
        journeySolution: journeySolutionRequest
          ? {
              loading: loadingJourneySolution,
              error: journeySolutionError || null,
              fromRoot: journeySolutionRequest.fromRoot,
              toRoot: journeySolutionRequest.toRoot,
              distance: journeySolution?.distance ?? null,
              path: journeySolution?.path ?? null,
              stoppedAtRoot: activeSession?.currentRoot ?? null,
            }
          : null,
        ui: {
          language: activeLanguageMode,
          debugVisible: showDebug,
          transliterationPreset: activeTransliteration.id,
          suggestionPanelOpen: showSuggestionPanel,
          suggestionFeedback: suggestionFeedback?.text ?? null,
          suggestionsCount: rootSuggestions.length,
          pendingSuggestionsCount,
          keyboardLayout: {
            mode: keyboardLayout.mode,
            source: keyboardLayout.source,
            sample: keyboardLayout.sample,
            expected: activeLanguageMode,
          },
          keyboardSwitchHint: keyboardSwitchGuide.hint,
          loadingSession,
          submittingMove,
          infoText: infoText || null,
          errorText: errorText || null,
        },
      });

    window.advanceTime = (ms: number) => {
      if (!Number.isFinite(ms) || ms <= 0) return;
      advanceApiTime(ms);
      setTimeOffsetMs((prev) => prev + ms);
    };

    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [
    bonusFlash,
    bonusFlashVisible,
    attemptFlash,
    attemptFlashVisible,
    activeStreakPulse,
    candidatePlain,
    committedPlain,
    errorText,
    infoText,
    loadingSession,
    mode,
    neighborsSet,
    room,
    roomPlayer?.id,
    activeController?.name,
    activeRoomPlayer?.name,
    pendingSuggestionsCount,
    remainingMs,
    reelFx,
    serverHealthy,
    showDebug,
    showSuggestionPanel,
    dragOverIdx,
    dragSourceIdx,
    selectedIdx,
    selectedSlotLabel,
    activeLanguageMode,
    activeSession,
    streakTier,
    nextStreakTier,
    streakTierProgress,
    rootSuggestions.length,
    suggestionFeedback?.text,
    submittingMove,
    loadingJourneySolution,
    journeySolution,
    journeySolutionError,
    journeySolutionRequest,
    keyboardLayout.mode,
    keyboardLayout.sample,
    keyboardLayout.source,
    keyboardSwitchGuide.hint,
    timerBurstActive,
    activeTransliteration.id,
    visibleVisitedRoots,
  ]);

  const scoreValue = activeSession?.score ?? 0;
  const streakValue = activeSession?.streak ?? 0;
  const moveCountValue = activeSession?.moveCount ?? 0;
  const visitedCountValue = activeSession?.visitedCount ?? 0;
  const runStatus = activeSession?.status ?? 'idle';
  const isActive = runStatus === 'active';
  const displayRemainingMs = activeSession ? remainingMs : mode === 'multiplayer' ? controlWindowMs : countdownMs;
  const displayTimerPct = activeSession ? timerPct : 100;
  const timerToneClass =
    displayRemainingMs > displayCountdownMs * 0.55
      ? 'bg-emerald-400'
      : displayRemainingMs > displayCountdownMs * 0.25
        ? 'bg-amber-400'
        : 'bg-rose-400';
  const sessionStateLabel = !activeSession
    ? mode === 'multiplayer'
      ? 'Waiting for room'
      : 'Waiting to start'
    : activeSession.status === 'completed'
      ? 'Run complete'
      : activeSession.status === 'game_over'
        ? 'Game over'
        : 'Live';
  const helperText = !activeSession
    ? mode === 'multiplayer'
      ? 'Create a room or join one with a code.'
      : 'Set the timer and start a run.'
    : !isActive
      ? formatReason(activeSession.reason) || (mode === 'multiplayer' ? 'Room finished.' : 'Run finished.')
      : mode === 'multiplayer' && room && room.controllerPlayerId && room.controllerPlayerId !== roomPlayer?.id
        ? `${activeController?.name ?? 'Another player'} is in control. Wait for the window to expire or for a room update.`
        : mode === 'multiplayer' && room?.phase === 'open_claim'
          ? 'Board is open. First valid root claims control.'
      : selectedIdx === null
        ? `Tap any reel to focus it, type on a ${LANGUAGE_LABELS[activeLanguageMode]} keyboard, or drag one reel onto another to swap.`
        : dragSourceIdx === selectedIdx
          ? `${selectedSlotLabel} is moving. Drop it on another reel to swap, or release to keep editing this reel.`
          : `${selectedSlotLabel} selected. Type a ${LANGUAGE_LABELS[activeLanguageMode]} letter, drag any reel onto another to swap, or tap the same reel or outside the board to clear.`;
  const showSetupOverlay = !isActive;
  const showSummary = Boolean(activeSession && !isActive);
  const showJourneyFailureSolution = Boolean(showSummary && journeySolutionRequest);
  const activeComboBurst =
    bonusFlash && bonusFlashVisible && bonusFlash.comboLabel && bonusFlash.comboCount >= 2
      ? getComboBurstAnchor(bonusFlash.comboSlots)
      : null;

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-900" dir="rtl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(191,219,254,0.55),transparent_32%),radial-gradient(circle_at_86%_14%,rgba(251,191,36,0.22),transparent_28%),radial-gradient(circle_at_52%_88%,rgba(56,189,248,0.22),transparent_30%),linear-gradient(170deg,#f7f0df_0%,#f4f8fb_42%,#eef4ff_100%)]" />
      <div className="pointer-events-none absolute left-[-12%] top-8 h-72 w-72 rounded-full bg-sky-300/30 blur-3xl motion-safe:animate-[floaty_18s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute right-[-10%] top-36 h-80 w-80 rounded-full bg-amber-300/25 blur-3xl motion-safe:animate-[floaty_22s_ease-in-out_infinite_reverse]" />

      <BonusToast
        bonusMs={bonusFlash?.bonusMs ?? 0}
        multiplier={bonusFlash?.multiplier ?? 1}
        elapsedMs={bonusFlash?.elapsedMs ?? 0}
        scoreGain={bonusFlash?.scoreGain ?? 0}
        moveType={bonusFlash?.moveType ?? null}
        comboLabel={bonusFlash?.comboLabel ?? null}
        comboCount={bonusFlash?.comboCount ?? 0}
        chainBonusScore={bonusFlash?.chainBonusScore ?? 0}
        streakBonusScore={bonusFlash?.streakBonusScore ?? 0}
        streakBonusMs={bonusFlash?.streakBonusMs ?? 0}
        comboBonusMs={bonusFlash?.comboBonusMs ?? 0}
        streakAfterMove={bonusFlash?.streakAfterMove ?? 0}
        visible={Boolean(bonusFlash && bonusFlashVisible)}
      />

      <div
        className={[
          'pointer-events-none fixed left-1/2 top-44 z-40 -translate-x-1/2 transition-all duration-300 md:top-48',
          attemptFlashVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-3 opacity-0 scale-95',
        ].join(' ')}
        aria-live="polite"
      >
        {attemptFlash ? (
          <div
            className={[
              'overflow-hidden rounded-[1.2rem] border px-4 py-3 text-sm font-black shadow-[0_18px_48px_-28px_rgba(15,23,42,0.7)] backdrop-blur',
              attemptFlash.tone === 'repeat'
                ? 'border-amber-200 bg-amber-50/95 text-amber-800'
                : 'border-rose-200 bg-rose-50/96 text-rose-700',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-center justify-center gap-2 text-[0.62rem] uppercase tracking-[0.22em] opacity-70">
              <span>{attemptFlash.tone === 'repeat' ? 'Repeated root' : 'Blocked move'}</span>
              {attemptFlash.streakResetFrom > 0 ? (
                <span className="rounded-full bg-white/72 px-3 py-1 text-[0.6rem] font-black tracking-[0.2em] text-rose-700">
                  Streak busted
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-base">{attemptFlash.message}</div>
            {attemptFlash.streakResetFrom > 0 ? (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[0.62rem] font-black uppercase tracking-[0.18em]">
                <span className="rounded-full bg-white/78 px-3 py-1 text-slate-900">
                  {attemptFlash.streakTierLabel
                    ? `${attemptFlash.streakTierLabel} x${attemptFlash.streakResetFrom}`
                    : `x${attemptFlash.streakResetFrom}`}
                </span>
                <span>Back to 0</span>
              </div>
            ) : null}
            <div className="mt-2 rounded-full bg-white/72 px-3 py-1 text-center font-mono text-sm font-black text-slate-900" dir={activeDisplayDir}>
              {formatDisplayRoot(attemptFlash.root, activeTransliteration)}
            </div>
          </div>
        ) : null}
      </div>

      <button
        id="debug-toggle-btn"
        type="button"
        onClick={() => setShowDebug((prev) => !prev)}
        className={[
          'fixed left-4 top-4 z-50 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.24em] shadow-lg backdrop-blur transition',
          showDebug
            ? 'border-slate-950 bg-slate-950 text-white'
            : 'border-white/80 bg-white/72 text-slate-700 hover:bg-white',
        ].join(' ')}
      >
        {showDebug ? 'Hide Debug' : 'Debug'}
      </button>

      <input
        id="typing-input"
        ref={typingInputRef}
        type="text"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label={
          selectedSlotLabel
            ? `Type a replacement letter for the ${selectedSlotLabel.toLowerCase()}`
            : 'Type a replacement letter'
        }
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        onChange={(event) => {
          const nextKey = Array.from(event.target.value).at(-1);
          if (nextKey) {
            updateKeyboardLayoutFromSample(nextKey, 'recent_key');
          }
          applyTypedCharacter(event.target.value);
          event.target.value = '';
        }}
        onKeyDown={(event) => {
          if (!canInteractWithBoard || !activeSession || selectedIdx === null) return;

          if (event.key === 'Escape') {
            event.preventDefault();
            clearSelection();
            return;
          }

          if (event.key === 'Backspace') {
            event.preventDefault();
            clearDragState();
            setLetters((prev) => {
              const next = [...prev];
              next[selectedIdx] = activeSession.currentRoot[selectedIdx] ?? next[selectedIdx];
              return next;
            });
            event.currentTarget.value = '';
          }
        }}
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-[96rem] flex-col justify-between px-3 py-3 md:px-5 md:py-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.68rem] font-black uppercase tracking-[0.3em] text-slate-500">
              {mode === 'multiplayer' ? 'Control window' : 'Time left'}
            </div>
            <div
              className={[
                'mt-2 text-[clamp(3.8rem,11vw,6.6rem)] font-black leading-none tabular-nums text-slate-950',
                timerBurstActive ? 'timer-bonus-number' : '',
              ].join(' ')}
              dir="ltr"
            >
              {formatSeconds(displayRemainingMs)}
            </div>
          </div>

          <div className="flex max-w-[50%] flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-white/80 bg-white/76 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-slate-700">
              Score {scoreValue}
            </span>
            <span className="rounded-full border border-white/80 bg-white/76 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-slate-700">
              Roots {visitedCountValue}
            </span>
            {mode === 'multiplayer' && room ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-sky-700">
                Room {room.code}
              </span>
            ) : null}
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.72rem] font-black tracking-[0.16em] text-amber-800"
              dir="rtl"
              title={LANGUAGE_LABELS[activeLanguageMode]}
            >
              {activeLanguageNativeLabel}
            </span>
            <span
              className={[
                'px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em]',
                activeStreakVisual.badge,
              ].join(' ')}
            >
              {streakValue > 0 ? `x${streakValue}` : 'x0'}
            </span>
            {mode === 'multiplayer' && room ? (
              <span
                className={[
                  'rounded-full border px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em]',
                  room.phase === 'open_claim'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : roomIsControlledBySelf
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700',
                ].join(' ')}
              >
                {room.phase === 'open_claim' ? 'Open claim' : `${roomControllerName} controls`}
              </span>
            ) : null}
            {mode === 'journey' && session?.targetRoot ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-amber-800" dir={activeDisplayDir}>
                Target {toDisplayDotted(Array.from(session.targetRoot), activeTransliteration)}
              </span>
            ) : null}
          </div>
        </header>

        <section className="relative flex flex-1 items-center justify-center py-1 md:py-2">
          <div className="relative w-full max-w-[104rem]">
            <div
              className={[
                'relative mx-auto aspect-[3/2] w-full drop-shadow-[0_42px_90px_rgba(15,23,42,0.24)]',
                reelFx === 'shake' ? 'slot-bank-shake' : '',
                reelFx === 'spin' ? 'slot-bank-celebrate' : '',
              ].join(' ')}
            >
              <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_32%,rgba(247,236,204,0.78),rgba(210,186,140,0.92)_56%,rgba(148,117,79,0.94)_100%)]" />
              {isActive && streakValue > 0 ? (
                <div
                  className={[
                    'pointer-events-none absolute inset-[4%] z-[1] rounded-[2rem] opacity-70 streak-stage-wash',
                    activeStreakVisual.stageWash,
                  ].join(' ')}
                />
              ) : null}

              <div className="absolute inset-x-[14%] top-[7.4%] z-30">
                <div
                  className={[
                    'mx-auto w-full rounded-full border p-2 backdrop-blur-[2px]',
                    activeStreakVisual.timerShell,
                    timerBurstActive ? 'timer-bonus-flash' : '',
                  ].join(' ')}
                >
                  <div className="h-4 overflow-hidden rounded-full bg-slate-950/8">
                    <div
                      className={`h-full rounded-full transition-[width] duration-150 ${timerToneClass}`}
                      style={{ width: `${displayTimerPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {isActive ? (
                <div className="pointer-events-none absolute inset-x-[4%] top-[15.8%] z-30 flex justify-center md:inset-x-auto md:right-[4.1%] md:top-[14.1%]">
                  <StreakBubble
                    streak={streakValue}
                    tier={streakTier}
                    nextTier={nextStreakTier}
                    progressPct={streakTierProgress}
                    energized={Boolean(bonusFlash && bonusFlashVisible)}
                    busted={Boolean(
                      attemptFlash &&
                        attemptFlashVisible &&
                        attemptFlash.streakResetFrom > 0,
                    )}
                  />
                </div>
              ) : null}
              {activeStreakPulse ? (
                <div className="pointer-events-none absolute left-[7.5%] top-[14.9%] z-[31] md:left-[10.5%] md:top-[13.8%]">
                  <StreakPulse
                    tone={activeStreakPulse.tone}
                    title={activeStreakPulse.title}
                    detail={activeStreakPulse.detail}
                    visible={activeStreakPulse.visible}
                  />
                </div>
              ) : null}

              {isActive && selectedIdx !== null && selectedSlotCenter ? (
                <div
                  className="pointer-events-none absolute z-[32]"
                  style={{
                    left: `${selectedSlotCenter.x}%`,
                    top: `${Math.max(8, selectedSlotCenter.y - selectedSlotCenter.height / 2 - 7)}%`,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div
                    className={[
                      'rounded-[1.2rem] px-4 py-3 text-center shadow-[0_22px_48px_-22px_rgba(14,165,233,0.48)] backdrop-blur',
                      dragSourceIdx === selectedIdx
                        ? 'border border-emerald-300/95 bg-emerald-50/96'
                        : 'border border-sky-300/95 bg-sky-50/96',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'text-[0.58rem] font-black uppercase tracking-[0.24em]',
                        dragSourceIdx === selectedIdx ? 'text-emerald-700' : 'text-sky-700',
                      ].join(' ')}
                    >
                      {dragSourceIdx === selectedIdx ? 'Dragging Reel' : 'Selected Reel'}
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-950">{selectedSlotLabel}</div>
                    <div
                      className={[
                        'mt-1 text-[0.65rem] font-bold',
                        dragSourceIdx === selectedIdx ? 'text-emerald-800' : 'text-sky-800',
                      ].join(' ')}
                    >
                      {dragSourceIdx === selectedIdx
                        ? dragOverIdx !== null
                          ? `Release on ${SLOT_LABELS[dragOverIdx]} to swap`
                          : 'Drop on another reel to swap'
                        : 'Type now, or drag any reel onto another to swap'}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="absolute inset-0 z-10" onPointerDown={handleStagePointerDown}>
                {letters.map((ch, index) => {
                  const slot = STAGE_SLOT_LAYOUT[index];

                  return (
                    <div
                      key={`slot-shell-${index}`}
                      className="absolute"
                      style={{
                        left: `${slot.left}%`,
                        top: `${slot.top}%`,
                        width: `${slot.width}%`,
                        height: `${slot.height}%`,
                      }}
                    >
                      {isActive && selectedIdx === index ? (
                        <div className="active-slot-aura pointer-events-none absolute inset-[-7%] z-[1] rounded-[1.3rem]" />
                      ) : null}
                      <LetterCard
                        key={`slot-${index}`}
                        letter={toDisplayChar(ch, activeTransliteration)}
                        imgSrc={getLetterImageSrc(ch, activeLanguageMode)}
                        selected={selectedIdx === index}
                        swapTarget={isActive && dragOverIdx === index}
                        dragging={dragSourceIdx === index}
                        disabled={!canInteractWithBoard}
                        index={index}
                        slotLabel={SLOT_LABELS[index]}
                        footerLabel={
                          !isActive
                            ? 'locked'
                            : dragOverIdx === index
                              ? 'release to swap'
                              : dragSourceIdx === index
                                ? 'drop on another reel'
                                : selectedIdx === index
                                  ? 'tap again to clear'
                                  : selectedIdx !== null
                                    ? 'tap to refocus'
                                    : 'tap or drag'
                        }
                        variant="embedded"
                        className={[
                          'h-full w-full',
                          reelFx === 'spin' ? `reel-spin reel-delay-${index}` : '',
                          reelFx === 'shake' ? 'reel-shake' : '',
                        ].join(' ')}
                        onClick={() => handleCardClick(index)}
                        onPointerDown={(event) => handleCardPointerDown(index, event)}
                        onPointerMove={(event) => handleCardPointerMove(index, event)}
                        onPointerUp={(event) => handleCardPointerUp(index, event)}
                        onPointerCancel={(event) => handleCardPointerCancel(index, event)}
                      />
                    </div>
                  );
                })}
              </div>

              {activeComboBurst && bonusFlash ? (
                <div className="pointer-events-none absolute inset-0 z-[35]">
                  <ComboBurst
                    comboLabel={bonusFlash.comboLabel}
                    comboCount={bonusFlash.comboCount}
                    chainBonusScore={bonusFlash.chainBonusScore}
                    comboBonusMs={bonusFlash.comboBonusMs}
                    leftPct={activeComboBurst.leftPct}
                    topPct={activeComboBurst.topPct}
                    placement={activeComboBurst.placement}
                    visible={bonusFlashVisible}
                  />
                </div>
              ) : null}

              <div className="pointer-events-none absolute inset-0 z-[15]">
                {STAGE_SLOT_LAYOUT.map((slot, index) => (
                  <div
                    key={`slot-depth-${index}`}
                    className="mosaic-cutout-depth absolute"
                    style={{
                      left: `${slot.left - 0.14}%`,
                      top: `${slot.top - 0.14}%`,
                      width: `${slot.width + 0.28}%`,
                      height: `${slot.height + 0.28}%`,
                    }}
                  />
                ))}
              </div>

              <img
                src={STAGE_BACKGROUND_IMAGE}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-20 h-full w-full select-none object-contain"
              />

              <div className="pointer-events-none absolute inset-0 z-[21] shadow-[inset_0_0_20px_rgba(255,252,245,0.08),inset_0_-24px_38px_rgba(15,23,42,0.06)]" />

              {showSetupOverlay ? (
                <div
                  className={[
                    'absolute inset-x-[8%] bottom-[7%] z-30 flex justify-center',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'w-full rounded-[2.15rem] border border-white/90 bg-white/84 p-4 text-right shadow-[0_28px_80px_-36px_rgba(15,23,42,0.78)] backdrop-blur md:p-5',
                      showSummary ? 'max-w-3xl' : 'max-w-4xl',
                    ].join(' ')}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-[0.68rem] font-black uppercase tracking-[0.32em] text-slate-500">
                          {showSummary ? (mode === 'multiplayer' ? 'Room over' : 'Round over') : mode === 'multiplayer' ? 'Create or join' : 'Press start'}
                        </div>
                        <h1 className="mt-2 font-['Suez_One'] text-2xl tracking-tight text-slate-950 md:text-3xl">
                          {showSummary
                            ? mode === 'multiplayer'
                              ? 'Room closed'
                              : activeSession?.status === 'completed'
                                ? 'Target reached'
                                : 'Spin again'
                            : 'שורשים בזרימה'}
                        </h1>
                        <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                          {showSummary
                            ? formatReason(activeSession?.reason) || (mode === 'multiplayer' ? 'The room is over.' : 'The round is over.')
                            : mode === 'multiplayer'
                              ? 'Share a room code. The first valid root claims control, and streaks stretch that control window.'
                              : 'Three live roots inside one mosaic. Find fresh roots fast.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={[
                            'rounded-full px-4 py-2 text-sm font-black transition',
                            mode === 'survival'
                              ? 'bg-slate-950 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                          ].join(' ')}
                          onClick={() => setMode('survival')}
                        >
                          Survival
                        </button>
                        <button
                          type="button"
                          className={[
                            'rounded-full px-4 py-2 text-sm font-black transition',
                            mode === 'journey'
                              ? 'bg-slate-950 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                          ].join(' ')}
                          onClick={() => setMode('journey')}
                        >
                          Journey
                        </button>
                        <button
                          type="button"
                          className={[
                            'rounded-full px-4 py-2 text-sm font-black transition',
                            mode === 'multiplayer'
                              ? 'bg-slate-950 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                          ].join(' ')}
                          onClick={() => setMode('multiplayer')}
                        >
                          Multiplayer
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[1.7rem] border border-slate-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.9)_100%)] p-4 shadow-[0_20px_56px_-38px_rgba(15,23,42,0.38)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                            Root language
                          </div>
                          <div className="mt-2 text-sm font-bold text-slate-950">
                            Choose Hebrew or Arabic before the next run.
                          </div>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                            The root graph, keyboard hints, suggestions, and sample inputs switch together.
                          </p>
                        </div>
                        <span className="rounded-full border border-white/80 bg-white/88 px-3 py-1.5 text-[0.66rem] font-black uppercase tracking-[0.2em] text-slate-500">
                          {showSummary ? 'Switch for the next round' : 'Visible choice, saved locally'}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {(['hebrew', 'arabic'] as LanguageMode[]).map((candidateLanguage) => {
                          const isSelected = activeLanguageMode === candidateLanguage;
                          const isHebrew = candidateLanguage === 'hebrew';

                          return (
                            <button
                              key={candidateLanguage}
                              type="button"
                              aria-pressed={isSelected}
                              className={[
                                'rounded-[1.45rem] border px-4 py-4 text-right transition',
                                isSelected
                                  ? 'border-slate-950 bg-slate-950 text-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.9)]'
                                  : isHebrew
                                    ? 'border-sky-200 bg-[linear-gradient(135deg,rgba(240,249,255,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-slate-900 hover:-translate-y-0.5 hover:border-sky-300'
                                    : 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-slate-900 hover:-translate-y-0.5 hover:border-amber-300',
                              ].join(' ')}
                              onClick={() => changeLanguageMode(candidateLanguage)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div
                                    className={[
                                      'text-[0.64rem] font-black uppercase tracking-[0.24em]',
                                      isSelected
                                        ? 'text-white/68'
                                        : isHebrew
                                          ? 'text-sky-700'
                                          : 'text-amber-700',
                                    ].join(' ')}
                                    dir="ltr"
                                  >
                                    {LANGUAGE_LABELS[candidateLanguage]}
                                  </div>
                                  <div className="mt-2 text-[1.65rem] font-black tracking-tight" dir="rtl">
                                    {LANGUAGE_NATIVE_LABELS[candidateLanguage]}
                                  </div>
                                  <div
                                    className={[
                                      'mt-1 text-sm font-semibold leading-6',
                                      isSelected ? 'text-white/78' : 'text-slate-600',
                                    ].join(' ')}
                                  >
                                    {LANGUAGE_DESCRIPTIONS[candidateLanguage]}
                                  </div>
                                </div>

                                <span
                                  className={[
                                    'rounded-full px-3 py-1.5 text-[0.62rem] font-black uppercase tracking-[0.18em]',
                                    isSelected
                                      ? 'border border-white/18 bg-white/12 text-white'
                                      : 'border border-white/80 bg-white/84 text-slate-600',
                                  ].join(' ')}
                                >
                                  {isSelected ? 'Selected' : 'Tap to choose'}
                                </span>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2 text-[0.64rem] font-black uppercase tracking-[0.18em]">
                                <span
                                  className={[
                                    'rounded-full px-3 py-1.5',
                                    isSelected
                                      ? 'border border-white/16 bg-white/10 text-white/84'
                                      : 'border border-white/90 bg-white/88 text-slate-600',
                                  ].join(' ')}
                                >
                                  Root{' '}
                                  <span
                                    className={isSelected ? 'font-mono text-white' : 'font-mono text-slate-950'}
                                    dir="rtl"
                                  >
                                    {LANGUAGE_SAMPLE_ROOTS[candidateLanguage]}
                                  </span>
                                </span>
                                <span
                                  className={[
                                    'rounded-full px-3 py-1.5',
                                    isSelected
                                      ? 'border border-white/16 bg-white/10 text-white/84'
                                      : 'border border-white/90 bg-white/88 text-slate-600',
                                  ].join(' ')}
                                >
                                  Keys{' '}
                                  <span
                                    className={isSelected ? 'font-mono text-white' : 'font-mono text-slate-950'}
                                    dir="rtl"
                                  >
                                    {LANGUAGE_SAMPLE_DOTTED[candidateLanguage]}
                                  </span>
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {showSummary ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-white">
                          Score {scoreValue}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-slate-700">
                          Moves {moveCountValue}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-slate-700">
                          Roots {visitedCountValue}
                        </span>
                      </div>
                    ) : null}

                    {showJourneyFailureSolution ? (
                      <div
                        id="journey-solution-card"
                        className="mt-4 rounded-[1.6rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(255,243,199,0.92)_100%)] p-4 shadow-[0_22px_56px_-34px_rgba(180,83,9,0.48)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-amber-700">
                              Right path
                            </div>
                            <div className="mt-2 text-sm font-bold leading-6 text-slate-900">
                              {loadingJourneySolution
                                ? 'Finding the shortest route from the start root to the target.'
                                : journeySolution
                                  ? `Shortest route: ${journeySolution.distance} ${journeySolution.distance === 1 ? 'move' : 'moves'}.`
                                  : journeySolutionError || 'Could not load the right path.'}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-600">
                              You stopped at{' '}
                              <span className="font-mono font-black text-slate-900" dir={activeDisplayDir}>
                                {formatDisplayRoot(activeSession?.currentRoot ?? '', activeTransliteration)}
                              </span>
                              .
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 text-[0.64rem] font-black uppercase tracking-[0.18em] text-slate-600">
                            <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5">
                              Start{' '}
                              <span className="font-mono text-slate-900" dir={activeDisplayDir}>
                                {formatDisplayRoot(journeySolutionRequest?.fromRoot ?? '', activeTransliteration)}
                              </span>
                            </span>
                            <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5">
                              Target{' '}
                              <span className="font-mono text-slate-900" dir={activeDisplayDir}>
                                {formatDisplayRoot(journeySolutionRequest?.toRoot ?? '', activeTransliteration)}
                              </span>
                            </span>
                          </div>
                        </div>

                        {journeySolution?.path.length ? (
                          <div
                            id="journey-solution-path"
                            className="mt-3 flex flex-wrap items-center gap-2"
                            dir="ltr"
                          >
                            {journeySolution.path.map((root, index) => (
                              <div key={`${root}-${index}`} className="flex items-center gap-2">
                                <div className="rounded-[1.15rem] border border-white/80 bg-white/88 px-3 py-2 shadow-sm">
                                  <div className="text-[0.56rem] font-black uppercase tracking-[0.22em] text-amber-700">
                                    {index === 0
                                      ? 'Start'
                                      : index === journeySolution.path.length - 1
                                        ? 'Target'
                                        : `Step ${index + 1}`}
                                  </div>
                                  <div
                                    className="mt-1 font-mono text-sm font-black text-slate-950"
                                    dir={activeDisplayDir}
                                  >
                                    {formatDisplayRoot(root, activeTransliteration)}
                                  </div>
                                </div>
                                {index < journeySolution.path.length - 1 ? (
                                  <span className="text-lg font-black text-amber-600">→</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {mode === 'multiplayer' ? (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                              Your name
                            </div>
                            <input
                              value={roomPlayerNameInput}
                              onChange={(event) => setRoomPlayerNameInput(event.target.value)}
                              placeholder="Player name"
                              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-base font-black text-slate-950 outline-none transition focus:border-sky-400"
                              dir="ltr"
                            />
                          </label>
                          <label className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                              Room code
                            </div>
                            <input
                              value={roomCodeInput}
                              onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                              placeholder="Join with code"
                              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-base font-black uppercase text-slate-950 outline-none transition focus:border-sky-400"
                              dir="ltr"
                            />
                          </label>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-4">
                          {[
                            {
                              id: 'bonusBase',
                              label: 'Base bonus',
                              value: bonusBaseMs,
                              setValue: setBonusBaseMs,
                            },
                            {
                              id: 'bonusWindow',
                              label: 'Speed window',
                              value: bonusWindowMs,
                              setValue: setBonusWindowMs,
                            },
                            {
                              id: 'controlWindow',
                              label: 'Claim window',
                              value: controlWindowMs,
                              setValue: setControlWindowMs,
                            },
                            {
                              id: 'maxControl',
                              label: 'Control cap',
                              value: maxControlMs,
                              setValue: setMaxControlMs,
                            },
                          ].map((field) => (
                            <label
                              key={field.id}
                              htmlFor={field.id}
                              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3"
                            >
                              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                                {field.label}
                              </div>
                              <div className="mt-2 flex items-end gap-2">
                                <input
                                  id={field.id}
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={Math.round(field.value / 1000)}
                                  onChange={(event) => {
                                    const nextSeconds = Number(event.target.value);
                                    if (!Number.isFinite(nextSeconds)) return;
                                    field.setValue(Math.max(1, Math.round(nextSeconds)) * 1000);
                                  }}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left font-mono text-xl font-black text-slate-950 outline-none transition focus:border-sky-400"
                                  dir="ltr"
                                />
                                <span className="pb-3 text-sm font-black text-slate-500">sec</span>
                              </div>
                            </label>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            id="create-room-btn"
                            type="button"
                            onClick={createRoom}
                            disabled={loadingRoom}
                            className="rounded-[1.5rem] bg-slate-950 px-6 py-4 text-lg font-black text-white shadow-[0_20px_60px_-28px_rgba(15,23,42,0.88)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {loadingRoom ? 'Working...' : room ? 'New room' : 'Create room'}
                          </button>
                          <button
                            id="join-room-btn"
                            type="button"
                            onClick={joinRoom}
                            disabled={loadingRoom}
                            className="rounded-[1.5rem] border border-slate-200 bg-white px-6 py-4 text-lg font-black text-slate-800 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Join room
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
                        {[
                          {
                            id: 'countdown',
                            label: 'Countdown',
                            value: countdownMs,
                            setValue: setCountdownMs,
                          },
                          {
                            id: 'bonusBase',
                            label: 'Base bonus',
                            value: bonusBaseMs,
                            setValue: setBonusBaseMs,
                          },
                          {
                            id: 'bonusWindow',
                            label: 'Speed window',
                            value: bonusWindowMs,
                            setValue: setBonusWindowMs,
                          },
                        ].map((field) => (
                          <label
                            key={field.id}
                            htmlFor={field.id}
                            className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                              {field.label}
                            </div>
                            <div className="mt-2 flex items-end gap-2">
                              <input
                                id={field.id}
                                type="number"
                                min={1}
                                step={1}
                                value={Math.round(field.value / 1000)}
                                onChange={(event) => {
                                  const nextSeconds = Number(event.target.value);
                                  if (!Number.isFinite(nextSeconds)) return;
                                  field.setValue(Math.max(1, Math.round(nextSeconds)) * 1000);
                                }}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left font-mono text-xl font-black text-slate-950 outline-none transition focus:border-sky-400"
                                dir="ltr"
                              />
                              <span className="pb-3 text-sm font-black text-slate-500">sec</span>
                            </div>
                          </label>
                        ))}
                        <button
                          id="start-btn"
                          type="button"
                          onClick={startSession}
                          disabled={loadingSession}
                          className="rounded-[1.5rem] bg-slate-950 px-6 py-4 text-lg font-black text-white shadow-[0_20px_60px_-28px_rgba(15,23,42,0.88)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {loadingSession ? 'Starting...' : session ? 'Play again' : 'Start run'}
                        </button>
                      </div>
                    )}

                    {!showSummary ? (
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {mode === 'multiplayer'
                          ? 'Each player has their own streak and score. Invalid roots reset only your streak. While one player controls the board, everyone else waits for the window to expire.'
                          : 'Repeat roots are blocked. Quick hits pay bigger time refills. X bonus lives at 1-3, Y at 4-8, Z at 9-12, and every miss drops you back to 0.'}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full border border-white/80 bg-white/74 px-4 py-2 text-[0.72rem] font-black uppercase tracking-[0.24em] text-slate-700">
                  {sessionStateLabel}
                </span>
                {lastMove?.ok ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[0.72rem] font-black uppercase tracking-[0.22em] text-emerald-700">
                    {`+${formatSeconds(lastMove.bonusMs ?? 0)} · x${(lastMove.bonusMultiplier ?? 1).toFixed(2)}`}
                  </span>
                ) : null}
                {activeComboDescriptor && isActive ? (
                  <span
                    className={[
                      'rounded-full border px-4 py-2 text-[0.72rem] font-black uppercase tracking-[0.22em]',
                      activeComboKind === 'permutation'
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800',
                    ].join(' ')}
                  >
                    {activeComboDescriptor.detail}
                  </span>
                ) : null}
                {isCandidateValid && isActive ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[0.72rem] font-black uppercase tracking-[0.22em] text-emerald-700">
                    Valid
                  </span>
                ) : null}
              </div>

              {isActive ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/80 bg-white/72 px-3 py-2 text-[0.72rem] font-black uppercase tracking-[0.2em] text-slate-700 shadow-sm backdrop-blur"
                    dir="ltr"
                  >
                    {selectedIdx === null ? (
                      <>
                        <span>Tap a reel</span>
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-white">
                          Then type {LANGUAGE_LABELS[activeLanguageMode]}
                        </span>
                        <span className="text-slate-500">Or drag a reel onto another to swap</span>
                        <span className="text-slate-500">Keys 1 2 3 also work</span>
                      </>
                    ) : (
                      <>
                        <span
                          className={[
                            'rounded-full px-3 py-1',
                            dragSourceIdx === selectedIdx
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-sky-100 text-sky-800',
                          ].join(' ')}
                        >
                          {dragSourceIdx === selectedIdx
                            ? `${selectedSlotLabel} dragging`
                            : `${selectedSlotLabel} selected`}
                        </span>
                        <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-slate-600">
                          Type a {LANGUAGE_LABELS[activeLanguageMode]} letter
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-slate-600">
                          Or drag any reel to swap
                        </span>
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 transition hover:bg-slate-50"
                        >
                          Clear Focus
                        </button>
                      </>
                    )}
                  </div>

                  <div
                    className={[
                      'flex flex-wrap items-center justify-center gap-2 rounded-[1.35rem] border px-4 py-3 text-[0.76rem] font-black uppercase tracking-[0.18em] backdrop-blur',
                      keyboardIndicatorShellClass,
                    ].join(' ')}
                    dir="ltr"
                  >
                    <span className="rounded-full border border-white/70 bg-white/72 px-3 py-1 text-[0.64rem] text-slate-600">
                      Keyboard
                    </span>
                    <span className={['h-3 w-3 rounded-full', keyboardIndicatorDotClass].join(' ')} />
                    <span className="text-[0.8rem] tracking-[0.24em] text-current">
                      {keyboardIndicatorStatusLabel}
                    </span>
                    <span
                      className={[
                        'rounded-full border border-white/75 bg-white/80 px-3 py-1.5 text-[0.82rem] shadow-sm',
                        keyboardIndicatorToneClass,
                      ].join(' ')}
                      dir={keyboardIndicatorDir}
                    >
                      {keyboardIndicatorLabel}
                    </span>
                    <span className="text-center text-[0.66rem] tracking-[0.2em] text-current/80">
                      {keyboardIndicatorHint}
                    </span>
                  </div>
                </div>
              ) : null}

              <p className="text-center text-sm font-semibold text-slate-600">
                {lastMove?.ok
                  ? `Solved in ${formatElapsed(lastMove.elapsedMs ?? 0)}`
                  : helperText}
              </p>

              {mode === 'multiplayer' && roomRoster.length > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {roomRoster.map((player) => (
                    <span
                      key={player.id}
                      className={[
                        'rounded-full border px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.16em]',
                        player.isSelf
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : room?.controllerPlayerId === player.id
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-white/80 bg-white/76 text-slate-700',
                      ].join(' ')}
                    >
                      {player.name} · {player.score} · x{player.streak} · {player.takeovers} takeovers
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

          </div>
        </section>

        <footer className="pb-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[0.72rem] font-black uppercase tracking-[0.28em] text-slate-500">Roots made</div>
            <div className="flex items-center gap-2">
              <button
                id="suggest-root-btn"
                type="button"
                onClick={() => {
                  setSuggestionFeedback(null);
                  setShowSuggestionPanel((prev) => !prev);
                }}
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[0.72rem] font-black uppercase tracking-[0.18em] text-sky-700 transition hover:bg-sky-100"
              >
                Suggest root
              </button>
              <div className="text-sm font-bold text-slate-700">{visitedCountValue} total</div>
            </div>
          </div>
          {showSuggestionPanel ? (
            <div className="mb-3 rounded-[1.5rem] border border-sky-200/80 bg-white/84 p-4 shadow-[0_18px_42px_-28px_rgba(14,165,233,0.34)] backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-sky-600">
                    Suggest a root
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    Submit a root for admin review. Approved roots become playable.
                  </div>
                </div>
                <button
                  id="suggest-root-cancel"
                  type="button"
                  onClick={() => setShowSuggestionPanel(false)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr]">
                <label className="rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[0.66rem] font-black uppercase tracking-[0.22em] text-slate-500">
                    Root
                  </div>
                  <input
                    id="suggest-root-input"
                    ref={suggestRootInputRef}
                    value={suggestedRootInput}
                    onChange={(event) => setSuggestedRootInput(event.target.value)}
                    placeholder={activeLanguageMode === 'arabic' ? 'كتب / ك.ت.ب' : 'ברק / b.r.q'}
                    className="mt-2 w-full bg-transparent font-mono text-base font-black text-slate-950 outline-none"
                    dir={activeDisplayDir}
                  />
                </label>
                <label className="rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[0.66rem] font-black uppercase tracking-[0.22em] text-slate-500">
                    Why add it?
                  </div>
                  <textarea
                    id="suggest-root-note"
                    value={suggestionNoteInput}
                    onChange={(event) => setSuggestionNoteInput(event.target.value)}
                    rows={3}
                    placeholder="Optional note for the reviewer"
                    className="mt-2 w-full resize-none bg-transparent text-sm font-semibold text-slate-700 outline-none"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-500">
                  {activeLanguageMode === 'arabic'
                    ? 'Arabic roots work best here. Spaced or dotted Arabic input also works.'
                    : 'Hebrew, dotted transliteration, or plain transliteration all work.'}
                </div>
                <button
                  id="suggest-root-submit"
                  type="button"
                  onClick={() => void submitRootSuggestion()}
                  disabled={submittingSuggestion}
                  className="rounded-full bg-slate-950 px-4 py-2 text-[0.72rem] font-black uppercase tracking-[0.2em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingSuggestion ? 'Sending' : 'Send for review'}
                </button>
              </div>
            </div>
          ) : null}
          <div className="rounded-[1.6rem] border border-white/75 bg-white/68 px-3 py-3 shadow-sm backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                Full run history
              </div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                {visibleVisitedRoots.length} shown
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto">
              <div className="flex flex-wrap gap-2" dir="ltr">
              {visibleVisitedRoots.length === 0 ? (
                <span className="rounded-full border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-500">
                  New roots will land here
                </span>
              ) : (
                visibleVisitedRoots.map((root, index) => {
                  const isLatest = index === visibleVisitedRoots.length - 1;

                  return (
                    <span
                      key={`${root}-${index}`}
                      className={[
                        'rounded-full border px-3 py-2 text-sm font-black shadow-sm',
                        isLatest
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-white text-slate-700',
                      ].join(' ')}
                      dir={activeDisplayDir}
                    >
                      {toDisplayDotted(Array.from(root), activeTransliteration)}
                    </span>
                  );
                })
              )}
            </div>
            </div>
          </div>
          {suggestionFeedback ? (
            <p
              className={[
                'mt-3 text-sm font-semibold',
                suggestionFeedback.tone === 'success' ? 'text-emerald-700' : 'text-rose-700',
              ].join(' ')}
            >
              {suggestionFeedback.text}
            </p>
          ) : null}
          {errorText ? <p className="mt-3 text-sm font-semibold text-rose-700">{errorText}</p> : null}
        </footer>
      </main>

      {showDebug ? (
        <aside className="fixed bottom-4 left-4 z-40 w-[min(92vw,30rem)] max-h-[78vh] overflow-y-auto rounded-[1.75rem] border border-slate-950/12 bg-white/92 p-4 shadow-[0_26px_80px_-30px_rgba(15,23,42,0.82)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Debug</div>
              <div className="mt-1 text-lg font-black text-slate-950">Runtime and helper tools</div>
            </div>
            <div
              className={[
                'rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.2em]',
                serverHealthy
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : serverHealthy === false
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500',
              ].join(' ')}
            >
              {serverHealthy ? 'Backend up' : serverHealthy === false ? 'Backend down' : 'Checking'}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Session</div>
              <div className="mt-1 text-sm font-bold text-slate-900">{sessionStateLabel}</div>
              <div className="mt-1 text-xs text-slate-500">
                {room ? `Room ${room.code}` : activeSession?.id ?? 'No active session'}
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Selected slot</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {selectedSlotLabel ?? 'None'}
              </div>
              <div className="mt-1 text-xs text-slate-500">{neighborsSet.size} valid neighbors cached</div>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Committed</div>
              <div className="mt-1 font-mono text-sm font-black text-slate-900" dir={activeDisplayDir}>
                {committedDotted || '...'}
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Candidate</div>
              <div className="mt-1 font-mono text-sm font-black text-slate-900" dir={activeDisplayDir}>
                {candidateDotted || '...'}
              </div>
            </div>
            <label className="rounded-[1.25rem] border border-slate-200 bg-white p-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                    Transliteration
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{activeTransliteration.label}</div>
                </div>
                <div className="text-xs text-slate-500">{activeTransliteration.description}</div>
              </div>
              <select
                value={resolvedPresetId}
                onChange={(event) => {
                  const nextPresetId = event.target.value;
                  if (isTransliterationPresetId(nextPresetId)) {
                    setTransliterationPresetId(nextPresetId);
                  }
                }}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-950 outline-none transition focus:border-sky-400"
              >
                {Object.values(TRANSLITERATION_PRESETS)
                  .filter((preset) => preset.language === activeLanguageMode)
                  .map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex flex-wrap gap-2">
                {(activeLanguageMode === 'arabic'
                  ? [
                      ['ك', 'ك'],
                      ['ت', 'ت'],
                      ['ب', 'ب'],
                      ['ع', 'ع'],
                      ['ق', 'ق'],
                    ]
                  : [
                      ['א', 'a'],
                      ['ה', 'e'],
                      ['ז', 'z'],
                      ['ע', 'o'],
                      ['ש', 'c'],
                    ]
                ).map(([source, canonical]) => (
                  <span
                    key={`${activeTransliteration.id}-${source}-${canonical}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700"
                    dir={activeDisplayDir}
                  >
                    {source} {'->'} {toDisplayChar(canonical, activeTransliteration)}
                  </span>
                ))}
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void checkBackendHealth()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
            >
              Check backend
            </button>
            {activeSession ? (
              <button
                type="button"
                onClick={() => void (room ? refreshRoomState(false) : refreshSessionState(false))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
              >
                Refresh state
              </button>
            ) : null}
            <button
              id="debug-restart-btn"
              type="button"
              onClick={mode === 'multiplayer' ? createRoom : startSession}
              disabled={mode === 'multiplayer' ? loadingRoom : loadingSession}
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {mode === 'multiplayer' ? (loadingRoom ? 'Working' : 'Create room') : loadingSession ? 'Starting' : 'Restart'}
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="rounded-[1.25rem] border border-slate-200 bg-white p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Start root override</div>
              <input
                id="debug-start-root-input"
                value={startRootInput}
                onChange={(event) => setStartRootInput(event.target.value)}
                placeholder={activeLanguageMode === 'arabic' ? 'كتب / ك.ت.ب' : 'אבה / a.b.h'}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-base font-black text-slate-950 outline-none transition focus:border-sky-400"
                dir={activeDisplayDir}
              />
            </label>
            <label className="rounded-[1.25rem] border border-slate-200 bg-white p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Target override</div>
              <input
                value={targetRootInput}
                onChange={(event) => setTargetRootInput(event.target.value)}
                placeholder={activeLanguageMode === 'arabic' ? 'خرج / خ.ر.ج' : 'שמר / s.m.r'}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-base font-black text-slate-950 outline-none transition focus:border-sky-400"
                dir={activeDisplayDir}
              />
            </label>
          </div>

          <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                  Root suggestions
                </div>
                <div className="mt-1 text-sm font-black text-slate-900">
                  {loadingSuggestions ? 'Loading…' : `${pendingSuggestionsCount} pending`}
                </div>
              </div>
              <button
                id="admin-refresh-suggestions"
                type="button"
                onClick={() => void loadRootSuggestions()}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-100"
              >
                Refresh
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              {rootSuggestions.length === 0 ? (
                <div className="rounded-[1rem] border border-dashed border-slate-200 px-3 py-4 text-sm font-semibold text-slate-500">
                  No suggestions yet
                </div>
              ) : (
                rootSuggestions.slice(0, 12).map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div
                          className="font-mono text-sm font-black text-slate-950"
                          dir={activeDisplayDir}
                        >
                          {toDisplayDotted(Array.from(suggestion.root), activeTransliteration)}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {new Date(suggestion.createdAtMs).toLocaleString()}
                        </div>
                      </div>
                      <span
                        className={[
                          'rounded-full border px-2.5 py-1 text-[0.64rem] font-black uppercase tracking-[0.18em]',
                          suggestion.status === 'approved'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : suggestion.status === 'rejected'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700',
                        ].join(' ')}
                      >
                        {suggestion.status}
                      </span>
                    </div>

                    {suggestion.note ? (
                      <div className="mt-2 text-sm font-semibold text-slate-700">{suggestion.note}</div>
                    ) : null}
                    {suggestion.reviewNote ? (
                      <div className="mt-2 text-xs font-semibold text-slate-500">
                        Review: {suggestion.reviewNote}
                      </div>
                    ) : null}

                    {suggestion.status === 'pending' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          id={`approve-suggestion-${suggestion.id}`}
                          type="button"
                          onClick={() => void reviewRootSuggestionDecision(suggestion.id, 'approve')}
                          disabled={reviewingSuggestionId === suggestion.id}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          id={`reject-suggestion-${suggestion.id}`}
                          type="button"
                          onClick={() => void reviewRootSuggestionDecision(suggestion.id, 'reject')}
                          disabled={reviewingSuggestionId === suggestion.id}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black text-slate-900">Neighbor shortcuts</div>
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">
                Debug only
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" dir="ltr">
              {neighborHints.length === 0 ? (
                <span className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500">
                  No neighbors loaded
                </span>
              ) : (
                neighborHints.map((edge) => (
                  <button
                    key={`${edge.neighbor}-${edge.type}-${edge.positionA}-${edge.positionB}`}
                    type="button"
                    onClick={() => setLetters(Array.from(edge.neighbor))}
                    disabled={!canInteractWithBoard}
                    className={[
                      'rounded-xl border px-3 py-2 text-xs font-black transition',
                      edge.type === 'SWAP'
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      !canInteractWithBoard
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:-translate-y-0.5',
                    ].join(' ')}
                  >
                    {toDisplayDotted(Array.from(edge.neighbor), activeTransliteration)}
                  </button>
                ))
              )}
            </div>
          </div>

          {lastMove ? (
            <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Last move</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {lastMove.ok ? `+${lastMove.scoreGain ?? 0} score` : formatReason(lastMove.reason)}
              </div>
              {lastMove.ok ? (
                <div className="mt-1 text-xs text-slate-500">
                  {`+${formatSeconds(lastMove.bonusMs ?? 0)} at x${(lastMove.bonusMultiplier ?? 1).toFixed(2)} after ${formatElapsed(lastMove.elapsedMs ?? 0)}`}
                </div>
              ) : null}
            </div>
          ) : null}

          {infoText || errorText ? (
            <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-3 text-sm">
              {infoText ? <p className="font-semibold text-emerald-700">{infoText}</p> : null}
              {errorText ? <p className="font-semibold text-rose-700">{errorText}</p> : null}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
