import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BonusToast from './components/BonusToast';
import LetterCard from './components/LetterCard';
import { advanceApiTime, isApiError, requestJson, resetApiTime } from './game/apiClient';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

type GameMode = 'journey' | 'survival';
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
  bonusMs?: number;
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

type BonusFlash = {
  bonusMs: number;
  multiplier: number;
  elapsedMs: number;
  scoreGain: number;
  comboLabel: string | null;
  comboCount: number;
  chainBonusScore: number;
};

type AttemptFlash = {
  tone: 'invalid' | 'repeat';
  message: string;
  root: string;
};

type TransliterationPresetId = 'hebrew_native' | 'letter_clean' | 'legacy_symbols';

type TransliterationPreset = {
  id: TransliterationPresetId;
  label: string;
  description: string;
  hebToGame: Record<string, string>;
  canonicalToDisplay: Record<string, string>;
  inputAliases: Record<string, string>;
  displayDir: 'rtl' | 'ltr';
};

type KeyboardLayoutMode = 'hebrew' | 'latin' | 'unknown';
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
const TRANSLITERATION_STORAGE_KEY = 'roots.transliterationPreset.v2';
const STAGE_BACKGROUND_IMAGE = '/backgrounds/mosaic-overlay.png';
const SLOT_LABELS = ['Right reel', 'Middle reel', 'Left reel'] as const;
const HEBREW_CHAR_PATTERN = /[\u0590-\u05FF]/;
const KEYBOARD_LAYOUT_SAMPLE_CODES = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'] as const;
const STAGE_SLOT_LAYOUT = [
  { left: 61.5885, top: 24.6094, width: 15.0391, height: 42.9688 },
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
    label: 'Hebrew',
    description: 'Displays roots in Hebrew letters',
    hebToGame: HEB_TO_GAME,
    canonicalToDisplay: GAME_TO_HEBREW,
    inputAliases: {},
    displayDir: 'rtl',
  },
  letter_clean: {
    id: 'letter_clean',
    label: 'Letter Clean',
    description: 'A/B/J/D/E without symbols',
    hebToGame: HEB_TO_GAME,
    canonicalToDisplay: {},
    inputAliases: {},
    displayDir: 'ltr',
  },
  legacy_symbols: {
    id: 'legacy_symbols',
    label: 'Legacy Symbols',
    description: 'Old *, &, @, % display and key aliases',
    hebToGame: HEB_TO_GAME,
    canonicalToDisplay: GAME_TO_LEGACY_DISPLAY,
    inputAliases: LEGACY_SYMBOL_TO_GAME,
    displayDir: 'ltr',
  },
};

const isTransliterationPresetId = (value: string): value is TransliterationPresetId =>
  value in TRANSLITERATION_PRESETS;

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

const toDisplayChar = (ch: string, preset: TransliterationPreset) => {
  const lower = (ch || '').toLowerCase();
  const aliased = preset.canonicalToDisplay[lower];
  if (aliased) return isAsciiLetter(aliased) ? aliased.toUpperCase() : aliased;
  return isAsciiLetter(lower) ? lower.toUpperCase() : ch;
};

const toDisplayDotted = (letters: string[], preset: TransliterationPreset) =>
  letters.map((letter) => toDisplayChar(letter, preset)).join('.');

const formatDisplayRoot = (plainRoot: string, preset: TransliterationPreset) =>
  toDisplayDotted((plainRoot || '').split(''), preset);

const imgForChar = (ch: string): string => {
  const lower = (ch || '').toLowerCase();
  return /^[a-z]$/.test(lower) ? `/letters/${lower}.png` : '/letter-placeholder.png';
};

const normalizeGameChar = (key: string, inputAliases: Record<string, string>): string | null => {
  if (!key || key.length !== 1) return null;
  const normalized = key.toLowerCase();
  if (inputAliases[normalized]) return inputAliases[normalized];
  if (isAsciiLetter(normalized)) return normalized;
  return null;
};

const inferKeyboardLayoutMode = (value: string): KeyboardLayoutMode => {
  if (!value) return 'unknown';
  if (HEBREW_CHAR_PATTERN.test(value)) return 'hebrew';
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
    samples.find((value) => inferKeyboardLayoutMode(value) === 'latin') ??
    samples[0] ??
    null
  );
};

const mapKeyToGameChar = (key: string, preset: TransliterationPreset): string | null =>
  preset.hebToGame[key] ?? normalizeGameChar(key, preset.inputAliases);

const formatReason = (reason: string | null | undefined): string => {
  if (!reason) return '';
  const map: Record<string, string> = {
    timeout: 'Time ran out',
    target_reached: 'Target reached',
    no_moves: 'No valid moves left',
    already_visited: 'Root already used',
    not_a_valid_neighbor: 'Not a valid neighbor',
    same_root: 'Root did not change',
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
  const [mode, setMode] = useState<GameMode>('survival');
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [neighborsSet, setNeighborsSet] = useState<Set<string>>(new Set());
  const [neighborEdges, setNeighborEdges] = useState<NeighborEdge[]>([]);
  const [letters, setLetters] = useState<string[]>(['', '', '']);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [transliterationPresetId, setTransliterationPresetId] =
    useState<TransliterationPresetId>('hebrew_native');

  const [startRootInput, setStartRootInput] = useState('');
  const [targetRootInput, setTargetRootInput] = useState('');
  const [countdownMs, setCountdownMs] = useState(DEFAULT_COUNTDOWN_MS);
  const [bonusBaseMs, setBonusBaseMs] = useState(DEFAULT_BONUS_BASE_MS);
  const [bonusWindowMs, setBonusWindowMs] = useState(DEFAULT_BONUS_WINDOW_MS);

  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
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

  const [clockMs, setClockMs] = useState(Date.now());
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [syncClientMs, setSyncClientMs] = useState(Date.now());

  const sessionIdRef = useRef<string | null>(null);
  const typingInputRef = useRef<HTMLInputElement | null>(null);
  const flashTimersRef = useRef<number[]>([]);
  const attemptTimersRef = useRef<number[]>([]);
  const motionTimersRef = useRef<number[]>([]);

  const committedPlain = session?.currentRoot || letters.join('');
  const activeTransliteration = useMemo(
    () => TRANSLITERATION_PRESETS[transliterationPresetId],
    [transliterationPresetId],
  );
  const activeDisplayDir = activeTransliteration.displayDir;
  const committedLetters = useMemo(() => committedPlain.split(''), [committedPlain]);
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
    if (!session) return 0;
    const elapsed = virtualNowMs - syncClientMs;
    return Math.max(0, session.remainingMs - elapsed);
  }, [session, virtualNowMs, syncClientMs]);

  const timerLimitMs = useMemo(() => Math.max(getCountdownMs(session), session?.remainingMs ?? 0), [session]);
  const timerPct = useMemo(() => {
    if (!session) return 0;
    const ratio = remainingMs / Math.max(timerLimitMs, 1);
    return Math.max(0, Math.min(100, ratio * 100));
  }, [remainingMs, session, timerLimitMs]);

  const neighborHints = useMemo(() => neighborEdges.slice(0, 12), [neighborEdges]);
  const visibleVisitedRoots = useMemo(() => {
    const roots = visitedRoots.length > 0 ? visitedRoots : committedPlain ? [committedPlain] : [];
    return roots.slice(-18);
  }, [committedPlain, visitedRoots]);
  const displayCountdownMs = session ? getCountdownMs(session, countdownMs) : countdownMs;
  const selectedSlotLabel = getSlotLabel(selectedIdx);
  const activeComboKind: ComboKind | null =
    session?.combo?.permutationChain && session.combo.permutationChain >= 2
      ? 'permutation'
      : session?.combo?.samePositionChain && session.combo.samePositionChain >= 2
        ? 'same_position'
        : null;
  const activeComboDescriptor = useMemo(
    () =>
      getComboDescriptor(
        activeComboKind,
        session?.combo?.permutationChain && session.combo.permutationChain >= 2
          ? session.combo.permutationChain
          : session?.combo?.samePositionChain ?? 0,
        session?.combo?.samePositionIndex,
      ),
    [activeComboKind, session],
  );
  const keyboardIndicatorLabel =
    keyboardLayout.mode === 'hebrew' ? 'עברית' : keyboardLayout.mode === 'latin' ? 'ABC' : 'Detect';
  const keyboardIndicatorHint =
    keyboardLayout.mode === 'hebrew'
      ? 'Hebrew keyboard ready'
      : keyboardLayout.mode === 'latin'
        ? 'Switch keyboard to Hebrew'
        : 'Tap a key to confirm';
  const keyboardIndicatorToneClass =
    keyboardLayout.mode === 'hebrew'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : keyboardLayout.mode === 'latin'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-white text-slate-600';
  const keyboardIndicatorDir = keyboardLayout.mode === 'hebrew' ? 'rtl' : 'ltr';

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

  const clearSelection = useCallback(() => {
    setSelectedIdx(null);
    clearTypingInput();
    typingInputRef.current?.blur();
  }, [clearTypingInput]);

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

  const applyPayload = useCallback((payload: SessionPayload, syncLetters: boolean) => {
    setSession(payload.session);
    sessionIdRef.current = payload.session.id;
    setNeighborEdges(payload.options.edges);
    setNeighborsSet(new Set(payload.options.neighbors));
    setSyncClientMs(Date.now());
    setLastMove(payload.move);

    if (syncLetters) {
      setLetters(payload.session.currentRoot.split(''));
      clearSelection();
    }

    if (payload.session.status !== 'active') {
      clearSelection();
    }
  }, [clearSelection]);

  const checkBackendHealth = useCallback(async () => {
    try {
      await requestJson<{ ok: boolean }>('/health');
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

  const startSession = useCallback(async () => {
    resetApiTime();
    setLoadingSession(true);
    setErrorText('');
    setInfoText('');
    setLastMove(null);
    setBonusFlash(null);
    setBonusFlashVisible(false);
    setAttemptFlash(null);
    setAttemptFlashVisible(false);
    setReelFx(null);
    setTimerBurstActive(false);
    clearFlashTimers();
    clearAttemptTimers();
    clearMotionTimers();
    setTimeOffsetMs(0);
    clearSelection();

    const body: Record<string, unknown> = {
      mode,
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

      applyPayload(payload, true);
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
    applyPayload,
    bonusBaseMs,
    bonusWindowMs,
    countdownMs,
    clearSelection,
    clearAttemptTimers,
    clearFlashTimers,
    clearMotionTimers,
    mode,
    startRootInput,
    targetRootInput,
  ]);

  const refreshSessionState = useCallback(
    async (syncLetters: boolean) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      try {
        const payload = await requestJson<SessionPayload>(`/api/session/${sessionId}/state`);
        applyPayload(payload, syncLetters);
      } catch (error: unknown) {
        if (isApiError(error)) {
          setErrorText(error.message);
        }
      }
    },
    [applyPayload],
  );

  const submitMove = useCallback(
    async (nextRoot: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      setSubmittingMove(true);
      setErrorText('');

      try {
        const payload = await requestJson<SessionPayload>(`/api/session/${sessionId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ root: nextRoot }),
        });

        applyPayload(payload, true);

        if (payload.move?.ok) {
          const bonusMs = payload.move.bonusMs ?? 0;
          const multiplier = payload.move.bonusMultiplier ?? 1;
          const elapsedMs = payload.move.elapsedMs ?? 0;
          const scoreGain = payload.move.scoreGain ?? 0;
          const chainBonusScore = payload.move.chainBonusScore ?? 0;
          const comboDescriptor = getComboDescriptor(
            payload.move.activeCombo,
            payload.move.comboCount,
            payload.move.samePositionIndex,
          );
          const moveLabel = payload.move.edge?.type === 'SWAP' ? 'Permutation' : 'Root change';

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
            `${moveLabel}. +${scoreGain} score${comboDescriptor ? ` · ${comboDescriptor.detail}` : ''}`,
          );
          showBonusFlash({
            bonusMs,
            multiplier,
            elapsedMs,
            scoreGain,
            comboLabel: comboDescriptor?.label ?? null,
            comboCount: payload.move.comboCount ?? 0,
            chainBonusScore,
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
            applyPayload(payload, false);

            if (payload.move?.reason === 'not_a_valid_neighbor') {
              setLetters(payload.session.currentRoot.split(''));
              setInfoText('');
              setErrorText('');
              triggerRejectedMotion();
              showAttemptFlash({ tone: 'invalid', message: 'Invalid root', root: nextRoot });
              focusTypingInput();
              return;
            }

            if (payload.move?.reason === 'already_visited') {
              setLetters(payload.session.currentRoot.split(''));
              setInfoText('');
              setErrorText('');
              triggerRejectedMotion();
              showAttemptFlash({ tone: 'repeat', message: 'Already did that', root: nextRoot });
              focusTypingInput();
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
      focusTypingInput,
      showAttemptFlash,
      showBonusFlash,
      triggerRejectedMotion,
      triggerValidMotion,
    ],
  );

  const selectSlot = useCallback(
    (index: number) => {
      setSelectedIdx(index);
      focusTypingInput();
    },
    [focusTypingInput],
  );

  const handleCardClick = useCallback(
    (index: number) => {
      if (!session || session.status !== 'active') return;

      if (selectedIdx === null) {
        selectSlot(index);
        return;
      }

      if (selectedIdx === index) {
        focusTypingInput();
        return;
      }

      setLetters((prev) => {
        const next = [...prev];
        [next[selectedIdx], next[index]] = [next[index], next[selectedIdx]];
        return next;
      });

      clearSelection();
    },
    [clearSelection, focusTypingInput, selectSlot, selectedIdx, session],
  );

  const applyTypedCharacter = useCallback(
    (rawValue: string) => {
      if (!session || session.status !== 'active' || selectedIdx === null) return;
      const nextKey = Array.from(rawValue).at(-1);
      if (!nextKey) return;

      const mapped = mapKeyToGameChar(nextKey, activeTransliteration);
      if (!mapped) return;

      setLetters((prev) => {
        const next = [...prev];
        next[selectedIdx] = mapped;
        return next;
      });
    },
    [activeTransliteration, selectedIdx, session],
  );

  useEffect(() => {
    void checkBackendHealth();
  }, [checkBackendHealth]);

  useEffect(() => () => {
    clearFlashTimers();
    clearAttemptTimers();
    clearMotionTimers();
  }, [clearAttemptTimers, clearFlashTimers, clearMotionTimers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedPresetId = window.localStorage.getItem(TRANSLITERATION_STORAGE_KEY);
    if (savedPresetId && isTransliterationPresetId(savedPresetId)) {
      setTransliterationPresetId(savedPresetId);
    }
  }, []);

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
    if (!session || session.status !== 'active') return;

    const intervalId = window.setInterval(() => {
      void refreshSessionState(false);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [refreshSessionState, session]);

  useEffect(() => {
    if (!session || session.status !== 'active') return;
    if (submittingMove) return;
    if (candidatePlain === session.currentRoot) return;
    if (letters.some((letter) => letter.length !== 1)) return;

    void submitMove(candidatePlain);
  }, [candidatePlain, letters, session, submitMove, submittingMove]);

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

      if (!session || session.status !== 'active') return;

      if (event.key === '1' || event.key === '2' || event.key === '3') {
        event.preventDefault();
        selectSlot(Number(event.key) - 1);
        return;
      }

      if (event.key === 'Escape') {
        clearSelection();
        return;
      }

      if (selectedIdx === null) return;

      const mapped = mapKeyToGameChar(event.key, activeTransliteration);
      if (mapped) {
        event.preventDefault();
        setLetters((prev) => {
          const next = [...prev];
          next[selectedIdx] = mapped;
          return next;
        });
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setLetters((prev) => {
          const next = [...prev];
          next[selectedIdx] = session.currentRoot[selectedIdx] ?? next[selectedIdx];
          return next;
        });
        focusTypingInput();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTransliteration,
    clearSelection,
    focusTypingInput,
    selectSlot,
    selectedIdx,
    session,
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
          comboLabel: bonusFlash.comboLabel,
          comboCount: bonusFlash.comboCount,
          chainBonusScore: bonusFlash.chainBonusScore,
          visible: bonusFlashVisible,
        }
      : null;
    const activeAttempt = attemptFlash
      ? {
          tone: attemptFlash.tone,
          message: attemptFlash.message,
          root: attemptFlash.root,
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
        backendHealthy: serverHealthy,
        coordinateSystem: 'three letter slots indexed right-to-left 0..2, where slot 0 is the rightmost card',
        session: session
          ? {
              id: session.id,
              status: session.status,
              currentRoot: session.currentRoot,
              targetRoot: session.targetRoot,
              score: session.score,
              streak: session.streak,
              moveCount: session.moveCount,
              combo: session.combo ?? null,
              remainingMs: Math.round(remainingMs),
              config: {
                countdownMs: getCountdownMs(session),
                bonusBaseMs: getBonusBaseMs(session),
                bonusWindowMs: getBonusWindowMs(session),
              },
            }
          : null,
        board: {
          committedRoot: committedPlain,
          candidateRoot: candidatePlain,
          selectedIndex: selectedIdx,
          selectedSlotLabel,
          neighborsCount: neighborsSet.size,
          neighborsSample: neighborSample,
          visitedRootsVisible: visibleVisitedRoots,
        },
        bonusFlash: activeBonus,
        attemptFlash: activeAttempt,
        motion: activeMotion,
        ui: {
          debugVisible: showDebug,
          transliterationPreset: activeTransliteration.id,
          keyboardLayout: {
            mode: keyboardLayout.mode,
            source: keyboardLayout.source,
            sample: keyboardLayout.sample,
            expected: 'hebrew',
          },
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
    candidatePlain,
    committedPlain,
    errorText,
    infoText,
    loadingSession,
    mode,
    neighborsSet,
    remainingMs,
    reelFx,
    serverHealthy,
    showDebug,
    selectedIdx,
    selectedSlotLabel,
    session,
    submittingMove,
    keyboardLayout.mode,
    keyboardLayout.sample,
    keyboardLayout.source,
    timerBurstActive,
    activeTransliteration.id,
    visibleVisitedRoots,
  ]);

  const scoreValue = session?.score ?? 0;
  const streakValue = session?.streak ?? 0;
  const moveCountValue = session?.moveCount ?? 0;
  const visitedCountValue = session?.visitedCount ?? 0;
  const runStatus = session?.status ?? 'idle';
  const isActive = runStatus === 'active';
  const displayRemainingMs = session ? remainingMs : countdownMs;
  const displayTimerPct = session ? timerPct : 100;
  const timerToneClass =
    displayRemainingMs > displayCountdownMs * 0.55
      ? 'bg-emerald-400'
      : displayRemainingMs > displayCountdownMs * 0.25
        ? 'bg-amber-400'
        : 'bg-rose-400';
  const sessionStateLabel = !session
    ? 'Waiting to start'
    : session.status === 'completed'
      ? 'Run complete'
      : session.status === 'game_over'
        ? 'Game over'
        : 'Live';
  const helperText = !session
    ? 'Set the timer and start a run.'
    : !isActive
      ? formatReason(session.reason) || 'Run finished.'
      : selectedIdx === null
        ? 'Tap any reel to focus it, then type on a Hebrew keyboard.'
        : `${selectedSlotLabel} active. Type a Hebrew letter or tap another reel to swap.`;
  const showSetupOverlay = !isActive;
  const showSummary = Boolean(session && !isActive);

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
        comboLabel={bonusFlash?.comboLabel ?? null}
        comboCount={bonusFlash?.comboCount ?? 0}
        chainBonusScore={bonusFlash?.chainBonusScore ?? 0}
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
              'overflow-hidden rounded-[1.5rem] border px-5 py-4 text-sm font-black shadow-[0_20px_60px_-28px_rgba(15,23,42,0.82)] backdrop-blur',
              attemptFlash.tone === 'repeat'
                ? 'border-amber-200 bg-amber-50/95 text-amber-800'
                : 'border-rose-200 bg-rose-50/96 text-rose-700',
            ].join(' ')}
          >
            <div className="text-[0.68rem] uppercase tracking-[0.26em] opacity-60">
              {attemptFlash.tone === 'repeat' ? 'Repeated root' : 'Blocked move'}
            </div>
            <div className="mt-1 text-lg">{attemptFlash.message}</div>
            <div className="mt-2 rounded-full bg-white/72 px-3 py-1 text-center font-mono text-sm font-black text-slate-900" dir={activeDisplayDir}>
              {formatDisplayRoot(attemptFlash.root, activeTransliteration)}
            </div>
          </div>
        ) : null}
      </div>

      <button
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
          if (!session || session.status !== 'active' || selectedIdx === null) return;

          if (event.key === 'Escape') {
            event.preventDefault();
            clearSelection();
            return;
          }

          if (event.key === 'Backspace') {
            event.preventDefault();
            setLetters((prev) => {
              const next = [...prev];
              next[selectedIdx] = session.currentRoot[selectedIdx] ?? next[selectedIdx];
              return next;
            });
            event.currentTarget.value = '';
          }
        }}
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-[96rem] flex-col justify-between px-3 py-3 md:px-5 md:py-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.68rem] font-black uppercase tracking-[0.3em] text-slate-500">Time left</div>
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
            <span className="rounded-full border border-white/80 bg-white/76 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-slate-700">
              Streak {streakValue}
            </span>
            {mode === 'journey' && session?.targetRoot ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.2em] text-amber-800" dir={activeDisplayDir}>
                Target {toDisplayDotted(session.targetRoot.split(''), activeTransliteration)}
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

              <div className="absolute inset-x-[14%] top-[7.4%] z-30">
                <div
                  className={[
                    'mx-auto w-full rounded-full border border-white/75 bg-white/72 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-[2px]',
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

              <div className="absolute inset-0 z-10">
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
                      <LetterCard
                        key={`slot-${index}`}
                        letter={toDisplayChar(ch, activeTransliteration)}
                        imgSrc={imgForChar(ch)}
                        selected={selectedIdx === index}
                        swapTarget={isActive && selectedIdx !== null && selectedIdx !== index}
                        disabled={!session || session.status !== 'active'}
                        index={index}
                        slotLabel={SLOT_LABELS[index]}
                        footerLabel={
                          !isActive
                            ? 'locked'
                            : selectedIdx === index
                              ? 'type Hebrew'
                              : selectedIdx !== null
                                ? 'tap to swap'
                                : 'tap to edit'
                        }
                        variant="embedded"
                        className={[
                          'h-full w-full',
                          reelFx === 'spin' ? `reel-spin reel-delay-${index}` : '',
                          reelFx === 'shake' ? 'reel-shake' : '',
                        ].join(' ')}
                        onClick={() => handleCardClick(index)}
                      />
                    </div>
                  );
                })}
              </div>

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
                          {showSummary ? 'Round over' : 'Press start'}
                        </div>
                        <h1 className="mt-2 font-['Suez_One'] text-2xl tracking-tight text-slate-950 md:text-3xl">
                          {showSummary
                            ? session?.status === 'completed'
                              ? 'Target reached'
                              : 'Spin again'
                            : 'שורשים בזרימה'}
                        </h1>
                        <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                          {showSummary
                            ? formatReason(session?.reason) || 'The round is over.'
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
                          label: 'Bonus X',
                          value: bonusBaseMs,
                          setValue: setBonusBaseMs,
                        },
                        {
                          id: 'bonusWindow',
                          label: 'Window Y',
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

                    {!showSummary ? (
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        Repeat roots are blocked. Quick hits pay bigger time refills. Type using a Hebrew keyboard.
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
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-white">Then type Hebrew</span>
                        <span className="text-slate-500">Keys 1 2 3 also work</span>
                      </>
                    ) : (
                      <>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                          {selectedSlotLabel} active
                        </span>
                        <button
                          type="button"
                          onClick={focusTypingInput}
                          className="rounded-full border border-amber-200 bg-white px-3 py-1 text-amber-700 transition hover:bg-amber-50"
                        >
                          Type Hebrew
                        </button>
                        <span className="text-slate-500">or tap another reel to swap</span>
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 transition hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/75 bg-white/68 px-3 py-2 text-[0.72rem] font-black uppercase tracking-[0.2em] text-slate-700 shadow-sm backdrop-blur"
                    dir="ltr"
                  >
                    <span className="text-slate-500">Keyboard</span>
                    <span className={['rounded-full border px-3 py-1', keyboardIndicatorToneClass].join(' ')} dir={keyboardIndicatorDir}>
                      {keyboardIndicatorLabel}
                    </span>
                    <span className="text-slate-500">{keyboardIndicatorHint}</span>
                  </div>
                </div>
              ) : null}

              <p className="text-center text-sm font-semibold text-slate-600">
                {lastMove?.ok
                  ? `Solved in ${formatElapsed(lastMove.elapsedMs ?? 0)}`
                  : helperText}
              </p>
            </div>

          </div>
        </section>

        <footer className="pb-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[0.72rem] font-black uppercase tracking-[0.28em] text-slate-500">Roots made</div>
            <div className="text-sm font-bold text-slate-700">{visitedCountValue} total</div>
          </div>
          <div className="overflow-x-auto rounded-full border border-white/75 bg-white/68 px-3 py-3 shadow-sm backdrop-blur">
            <div className="flex min-w-max items-center gap-2" dir="ltr">
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
                      {toDisplayDotted(root.split(''), activeTransliteration)}
                    </span>
                  );
                })
              )}
            </div>
          </div>
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
              <div className="mt-1 text-xs text-slate-500">{session?.id ?? 'No active session'}</div>
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
                value={transliterationPresetId}
                onChange={(event) => {
                  const nextPresetId = event.target.value;
                  if (isTransliterationPresetId(nextPresetId)) {
                    setTransliterationPresetId(nextPresetId);
                  }
                }}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-950 outline-none transition focus:border-sky-400"
              >
                {Object.values(TRANSLITERATION_PRESETS).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ['א', 'a'],
                  ['ה', 'e'],
                  ['ז', 'z'],
                  ['ע', 'o'],
                  ['ש', 'c'],
                ].map(([hebrew, canonical]) => (
                  <span
                    key={`${activeTransliteration.id}-${hebrew}-${canonical}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700"
                    dir={activeDisplayDir}
                  >
                    {hebrew} {'->'} {toDisplayChar(canonical, activeTransliteration)}
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
            {session ? (
              <button
                type="button"
                onClick={() => void refreshSessionState(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
              >
                Refresh state
              </button>
            ) : null}
            <button
              type="button"
              onClick={startSession}
              disabled={loadingSession}
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loadingSession ? 'Starting' : 'Restart'}
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="rounded-[1.25rem] border border-slate-200 bg-white p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Start root override</div>
              <input
                value={startRootInput}
                onChange={(event) => setStartRootInput(event.target.value)}
                placeholder="אבה / a.b.h"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-base font-black text-slate-950 outline-none transition focus:border-sky-400"
                dir="ltr"
              />
            </label>
            <label className="rounded-[1.25rem] border border-slate-200 bg-white p-3">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-slate-500">Target override</div>
              <input
                value={targetRootInput}
                onChange={(event) => setTargetRootInput(event.target.value)}
                placeholder="שמר / s.m.r"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-base font-black text-slate-950 outline-none transition focus:border-sky-400"
                dir="ltr"
              />
            </label>
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
                    onClick={() => setLetters(edge.neighbor.split(''))}
                    disabled={!session || session.status !== 'active'}
                    className={[
                      'rounded-xl border px-3 py-2 text-xs font-black transition',
                      edge.type === 'SWAP'
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      !session || session.status !== 'active'
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:-translate-y-0.5',
                    ].join(' ')}
                  >
                    {toDisplayDotted(edge.neighbor.split(''), activeTransliteration)}
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
