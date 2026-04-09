import hebrewRootsRaw from './data/roots_hebrew_scraped.txt?raw';
import arabicRootsRaw from './data/roots_arabic_scraped.txt?raw';
import {
  createComboState,
  resolveMoveOutcome,
  type ComboKind,
  type ComboState,
  type MoveType,
} from './playRules';

type GameMode = 'journey' | 'survival';
type LanguageMode = 'hebrew' | 'arabic';
type SessionStatus = 'active' | 'game_over' | 'completed';
type RoomStatus = 'active' | 'completed';
type RoomPhase = 'open_claim' | 'controlled';

type SessionConfig = {
  countdownMs?: number;
  bonusBaseMs?: number;
  bonusWindowMs?: number;
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
  countdownMs?: number;
  bonusBaseMs?: number;
  bonusWindowMs?: number;
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
  nextRemainingMs?: number;
  speedTier?: string;
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
  status: RoomStatus;
  phase: RoomPhase;
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

type RoomPayload = {
  room: RoomSnapshot;
  player: RoomPlayerAuth | null;
  move: RoomMoveSummary | null;
};

type RoomMoveSummary = MoveSummary & {
  byPlayerId?: string;
  byPlayerName?: string;
  controlChange?: 'claimed' | 'extended' | 'released' | 'none';
  controlRemainingMs?: number;
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

type ApiError = Error & {
  status: number;
  data?: unknown;
};

type RootRow = {
  plain: string;
  dotted: string;
  length: number;
};

type InternalSession = {
  id: string;
  mode: GameMode;
  language: LanguageMode;
  status: SessionStatus;
  reason: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  endedAtMs: number | null;
  currentRoot: string;
  targetRoot: string | null;
  score: number;
  streak: number;
  moveCount: number;
  combo: ComboState;
  visited: Set<string>;
  allowRevisit: boolean;
  types: MoveType[];
  letterBank: string[] | null;
  turnStartedAtMs: number;
  countdownRemainingMs: number;
  config: {
    countdownMs: number;
    bonusBaseMs: number;
    bonusWindowMs: number;
  };
};

type InternalRoomPlayer = {
  id: string;
  token: string;
  name: string;
  joinedAtMs: number;
  score: number;
  streak: number;
  longestStreak: number;
  takeovers: number;
  combo: ComboState;
  isHost: boolean;
};

type InternalRoom = {
  id: string;
  code: string;
  language: LanguageMode;
  version: number;
  status: RoomStatus;
  phase: RoomPhase;
  reason: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs: number;
  currentRoot: string;
  moveCount: number;
  visited: Set<string>;
  controllerPlayerId: string | null;
  controllerExpiresAtMs: number | null;
  turnStartedAtMs: number;
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
  players: InternalRoomPlayer[];
};

type StoredRoom = Omit<InternalRoom, 'visited'> & {
  visited: string[];
};

type MoveEdge = {
  from: string;
  to: string;
  fromDotted: string;
  toDotted: string;
  type: MoveType;
  positionA: number;
  positionB: number;
  fromChar: string;
  toChar: string;
};

type Store = {
  initialized: boolean;
  stats: {
    rootsCount: number;
    edgesCount: number;
    swapEdges: number;
    replaceEdges: number;
  };
  rootsByPlain: Map<string, RootRow>;
  rootsByLength: Map<number, RootRow[]>;
  adjacencyByRoot: Map<string, NeighborEdge[]>;
};

type StoreByLanguage = Record<LanguageMode, Store>;
type ApprovedRootsByLanguage = Record<LanguageMode, string[]>;

const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const USE_REMOTE_API = API_BASE.length > 0;
const DEFAULT_ROOT_LENGTH = 3;
const LOCAL_SUGGESTIONS_STORAGE_KEY = 'roots.suggestions.v1';
const LOCAL_APPROVED_ROOTS_STORAGE_KEY = 'roots.approvedRoots.v1';
const LOCAL_MULTIPLAYER_ROOMS_STORAGE_KEY = 'roots.multiplayerRooms.v1';
const MOVE_TYPES: MoveType[] = ['REPLACE', 'SWAP'];
const SESSION_MODES: GameMode[] = ['journey', 'survival'];
const DEFAULT_ROOM_CONTROL_WINDOW_MS = 8_000;
const DEFAULT_ROOM_MAX_CONTROL_MS = 12_000;
const DEFAULT_ROOM_MAX_PLAYERS = 4;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LANGUAGE_MODES: LanguageMode[] = ['hebrew', 'arabic'];
const DEFAULT_LANGUAGE_MODE: LanguageMode = 'hebrew';
const ROOTS_BY_LANGUAGE_RAW: Record<LanguageMode, string> = {
  hebrew: hebrewRootsRaw,
  arabic: arabicRootsRaw,
};
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

const LEGACY_SYMBOL_TO_GAME: Record<string, string> = {
  '*': 'e',
  '&': 'z',
  '@': 'o',
  '%': 'c',
};

const FINAL_HEBREW_TO_REGULAR: Record<string, string> = {
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
const ARABIC_CHAR_NORMALIZATION: Record<string, string> = {
  ٱ: 'ا',
  ى: 'ي',
};

const createEmptyStore = (): Store => ({
  initialized: false,
  stats: {
    rootsCount: 0,
    edgesCount: 0,
    swapEdges: 0,
    replaceEdges: 0,
  },
  rootsByPlain: new Map(),
  rootsByLength: new Map(),
  adjacencyByRoot: new Map(),
});

let localTimeOffsetMs = 0;
const storesByLanguage: StoreByLanguage = {
  hebrew: createEmptyStore(),
  arabic: createEmptyStore(),
};
const sessions = new Map<string, InternalSession>();
let localSuggestions: RootSuggestion[] | null = null;
let localApprovedRootsByLanguage: ApprovedRootsByLanguage | null = null;
let localRoomsByCode: Map<string, InternalRoom> | null = null;

const getNow = () => Date.now() + localTimeOffsetMs;

const createApiError = (status: number, data: unknown, fallbackMessage = `Request failed (${status})`) => {
  const message =
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : fallbackMessage;

  const error = new Error(message) as ApiError;
  error.status = status;
  error.data = data;
  return error;
};

const fail = (status: number, data: unknown, fallbackMessage?: string): never => {
  throw createApiError(status, data, fallbackMessage);
};

const expectValue = <T,>(
  value: T | null | undefined,
  status: number,
  data: unknown,
  fallbackMessage?: string,
): T => {
  if (value === null || value === undefined) {
    fail(status, data, fallbackMessage);
  }

  return value as NonNullable<T> as T;
};

const createOpaqueId = (prefix: string) =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeMoveTypes = (types: unknown): MoveType[] => {
  if (!Array.isArray(types)) return [...MOVE_TYPES];

  const normalized = types
    .map((value) => String(value || '').toUpperCase())
    .filter((value): value is MoveType => MOVE_TYPES.includes(value as MoveType));

  return normalized.length > 0 ? [...new Set(normalized)] : [...MOVE_TYPES];
};

const normalizeSessionMode = (mode: unknown): GameMode => {
  const normalized = String(mode || 'survival').toLowerCase();
  return SESSION_MODES.includes(normalized as GameMode) ? (normalized as GameMode) : 'survival';
};

const normalizeLanguageMode = (value: unknown): LanguageMode => {
  const normalized = String(value || DEFAULT_LANGUAGE_MODE).toLowerCase();
  return LANGUAGE_MODES.includes(normalized as LanguageMode)
    ? (normalized as LanguageMode)
    : DEFAULT_LANGUAGE_MODE;
};

const isAsciiLetter = (ch: string) => /^[a-z]$/i.test(ch);

const normalizeHebrewGameChar = (ch: unknown) => {
  const value = String(ch || '').toLowerCase();
  if (value.length !== 1) return null;
  if (Object.hasOwn(LEGACY_SYMBOL_TO_GAME, value)) return LEGACY_SYMBOL_TO_GAME[value];
  return isAsciiLetter(value) ? value : null;
};

const stripNiqqud = (value: string) => value.replace(NIQQUD_REGEX, '');

const normalizeHebrewRoot = (value: string) => {
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

const transliterateHebrewRoot = (value: string) => {
  const normalized = normalizeHebrewRoot(value);
  let output = '';

  for (const ch of normalized) {
    const mapped = HEB_TO_GAME[ch];
    if (!mapped) return null;
    output += mapped;
  }

  return output || null;
};

const hasHebrewChars = (value: unknown) => HEBREW_CHAR_REGEX.test(String(value || ''));
const hasArabicChars = (value: unknown) => ARABIC_CHAR_REGEX.test(String(value || ''));

const normalizeHebrewGameRoot = (value: unknown, expectedLength = DEFAULT_ROOT_LENGTH) => {
  if (!value) return null;

  const collapsed = String(value)
    .toLowerCase()
    .replace(/[._,\s-]+/g, '')
    .trim();

  if (!collapsed) return null;

  const normalized = Array.from(collapsed)
    .map((ch) => normalizeHebrewGameChar(ch))
    .filter((ch): ch is string => Boolean(ch))
    .join('');

  if (!normalized) return null;
  if (expectedLength && normalized.length !== expectedLength) return null;

  return normalized;
};

const normalizeArabicChar = (ch: unknown) => {
  const value = String(ch || '');
  if (value.length !== 1) return null;
  const normalized = ARABIC_CHAR_NORMALIZATION[value] ?? value;
  return ARABIC_ROOT_CHAR_SET.has(normalized) ? normalized : null;
};

const normalizeArabicRoot = (value: unknown, expectedLength = DEFAULT_ROOT_LENGTH) => {
  if (!value) return null;

  const collapsed = String(value)
    .replace(/[._,\s-]+/g, '')
    .replace(ARABIC_DIACRITICS_REGEX, '')
    .trim();

  if (!collapsed) return null;

  const normalized = Array.from(collapsed)
    .map((ch) => normalizeArabicChar(ch))
    .filter((ch): ch is string => Boolean(ch))
    .join('');

  if (!normalized) return null;
  if (expectedLength && normalized.length !== expectedLength) return null;

  return normalized;
};

const normalizeRootChar = (ch: unknown, language: LanguageMode) =>
  language === 'arabic' ? normalizeArabicChar(ch) : normalizeHebrewGameChar(ch);

const parseRootInput = (
  value: unknown,
  language: LanguageMode,
  expectedLength = DEFAULT_ROOT_LENGTH,
) => {
  if (!value) return null;

  if (language === 'arabic') {
    return normalizeArabicRoot(value, expectedLength);
  }

  if (hasHebrewChars(value)) {
    const transliterated = transliterateHebrewRoot(String(value));
    return normalizeHebrewGameRoot(transliterated, expectedLength);
  }

  return normalizeHebrewGameRoot(value, expectedLength);
};

const toDottedRoot = (plainRoot: string | null | undefined) =>
  plainRoot ? Array.from(plainRoot).join('.') : '';

const parseLineRoot = (line: string, language: LanguageMode, rootLength: number) => {
  const trimmed = (line || '').split('#')[0].trim();
  if (!trimmed) return null;

  if (language === 'arabic' || hasArabicChars(trimmed)) {
    return normalizeArabicRoot(trimmed, rootLength);
  }

  if (hasHebrewChars(trimmed)) {
    const transliterated = transliterateHebrewRoot(trimmed);
    return normalizeHebrewGameRoot(transliterated, rootLength);
  }

  return parseRootInput(trimmed, language, rootLength);
};

const loadRootsFromRaw = (
  content: string,
  language: LanguageMode,
  rootLength = DEFAULT_ROOT_LENGTH,
) => {
  const roots = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const root = parseLineRoot(line, language, rootLength);
    if (root) roots.add(root);
  }

  return [...roots].sort((left, right) =>
    language === 'arabic' ? left.localeCompare(right, 'ar') : left.localeCompare(right),
  );
};

const createEdgeId = (edge: MoveEdge) =>
  [
    edge.from,
    edge.to,
    edge.type,
    edge.positionA,
    edge.positionB,
    edge.fromChar,
    edge.toChar,
  ].join('|');

const addEdge = (edgeSet: Set<string>, edges: MoveEdge[], edge: MoveEdge) => {
  const id = createEdgeId(edge);
  if (edgeSet.has(id)) return;
  edgeSet.add(id);
  edges.push(edge);
};

const buildSwapEdges = (roots: string[]) => {
  const rootSet = new Set(roots);
  const edgeSet = new Set<string>();
  const edges: MoveEdge[] = [];

  for (const root of roots) {
    const chars = root.split('');

    for (let i = 0; i < chars.length - 1; i += 1) {
      for (let j = i + 1; j < chars.length; j += 1) {
        if (chars[i] === chars[j]) continue;

        const swapped = [...chars];
        [swapped[i], swapped[j]] = [swapped[j], swapped[i]];

        const nextRoot = swapped.join('');
        if (!rootSet.has(nextRoot)) continue;

        addEdge(edgeSet, edges, {
          from: root,
          to: nextRoot,
          fromDotted: toDottedRoot(root),
          toDotted: toDottedRoot(nextRoot),
          type: 'SWAP',
          positionA: i,
          positionB: j,
          fromChar: chars[i],
          toChar: chars[j],
        });
      }
    }
  }

  return edges;
};

const buildReplaceEdges = (roots: string[]) => {
  const patternBuckets = new Map<string, Array<{ root: string; index: number }>>();
  const edgeSet = new Set<string>();
  const edges: MoveEdge[] = [];

  for (const root of roots) {
    const chars = root.split('');

    for (let index = 0; index < chars.length; index += 1) {
      const pattern = `${root.slice(0, index)}_${root.slice(index + 1)}`;
      const current = patternBuckets.get(pattern);
      if (current) {
        current.push({ root, index });
      } else {
        patternBuckets.set(pattern, [{ root, index }]);
      }
    }
  }

  for (const values of patternBuckets.values()) {
    for (let i = 0; i < values.length - 1; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        const from = values[i];
        const to = values[j];
        if (from.index !== to.index || from.root === to.root) continue;

        const position = from.index;
        const fromChar = from.root[position];
        const toChar = to.root[position];
        if (fromChar === toChar) continue;

        addEdge(edgeSet, edges, {
          from: from.root,
          to: to.root,
          fromDotted: toDottedRoot(from.root),
          toDotted: toDottedRoot(to.root),
          type: 'REPLACE',
          positionA: position,
          positionB: position,
          fromChar,
          toChar,
        });

        addEdge(edgeSet, edges, {
          from: to.root,
          to: from.root,
          fromDotted: toDottedRoot(to.root),
          toDotted: toDottedRoot(from.root),
          type: 'REPLACE',
          positionA: position,
          positionB: position,
          fromChar: toChar,
          toChar: fromChar,
        });
      }
    }
  }

  return edges;
};

const canUseLocalStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const parseStoredArray = <T,>(value: string | null, fallback: T[]): T[] => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const parseStoredJson = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const normalizeRoomCode = (value: unknown) => {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
  return normalized.length >= 4 ? normalized : null;
};

const normalizePlayerName = (value: unknown, fallback = 'Player') => {
  const trimmed = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return (trimmed || fallback).slice(0, 24);
};

const serializeRoomPlayer = (
  player: InternalRoomPlayer,
  viewerPlayerId: string | null,
): RoomPlayerSnapshot => ({
  id: player.id,
  name: player.name,
  joinedAtMs: player.joinedAtMs,
  score: player.score,
  streak: player.streak,
  longestStreak: player.longestStreak,
  takeovers: player.takeovers,
  combo: {
    permutationChain: player.combo.permutationChain,
    samePositionChain: player.combo.samePositionChain,
    samePositionIndex: player.combo.lastReplacePosition,
  },
  isHost: player.isHost,
  isSelf: player.id === viewerPlayerId,
});

const serializeRoomPlayerAuth = (player: InternalRoomPlayer): RoomPlayerAuth => ({
  id: player.id,
  name: player.name,
  token: player.token,
  isHost: player.isHost,
  joinedAtMs: player.joinedAtMs,
});

const serializeStoredRoom = (room: InternalRoom): StoredRoom => ({
  ...room,
  visited: [...room.visited],
});

const deserializeStoredRoom = (value: StoredRoom | Partial<StoredRoom>) => {
  const language = normalizeLanguageMode(value.language);
  const code = normalizeRoomCode(value.code);
  const currentRoot = parseRootInput(value.currentRoot, language);
  if (!code || !currentRoot || !Array.isArray(value.players) || value.players.length === 0) return null;

  const players = value.players.reduce<InternalRoomPlayer[]>((acc, candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return acc;
    const { id, token } = candidate as { id?: unknown; token?: unknown };
    if (typeof id !== 'string' || !id || typeof token !== 'string' || !token) return acc;

    acc.push({
      id,
      token,
      name: normalizePlayerName((candidate as Partial<InternalRoomPlayer>).name, `Player ${index + 1}`),
      joinedAtMs: Number((candidate as Partial<InternalRoomPlayer>).joinedAtMs) || getNow(),
      score: Math.max(0, Number((candidate as Partial<InternalRoomPlayer>).score) || 0),
      streak: Math.max(0, Number((candidate as Partial<InternalRoomPlayer>).streak) || 0),
      longestStreak: Math.max(0, Number((candidate as Partial<InternalRoomPlayer>).longestStreak) || 0),
      takeovers: Math.max(0, Number((candidate as Partial<InternalRoomPlayer>).takeovers) || 0),
      combo: {
        permutationChain: Math.max(
          0,
          Math.floor(Number((candidate as Partial<InternalRoomPlayer>).combo?.permutationChain) || 0),
        ),
        samePositionChain: Math.max(
          0,
          Math.floor(Number((candidate as Partial<InternalRoomPlayer>).combo?.samePositionChain) || 0),
        ),
        lastMoveType:
          (candidate as Partial<InternalRoomPlayer>).combo?.lastMoveType === 'SWAP'
            ? 'SWAP'
            : (candidate as Partial<InternalRoomPlayer>).combo?.lastMoveType === 'REPLACE'
              ? 'REPLACE'
              : null,
        lastReplacePosition:
          Number.isInteger((candidate as Partial<InternalRoomPlayer>).combo?.lastReplacePosition)
            ? Number((candidate as Partial<InternalRoomPlayer>).combo?.lastReplacePosition)
            : null,
      },
      isHost: Boolean((candidate as Partial<InternalRoomPlayer>).isHost) || index === 0,
    });
    return acc;
  }, []);

  if (players.length === 0) return null;

  return {
    id: typeof value.id === 'string' && value.id ? value.id : createOpaqueId('room'),
    code,
    language,
    version: Math.max(1, Math.floor(Number(value.version) || 1)),
    status: value.status === 'completed' ? 'completed' : 'active',
    phase: value.phase === 'controlled' ? 'controlled' : 'open_claim',
    reason: typeof value.reason === 'string' && value.reason ? value.reason : null,
    createdAtMs: Number(value.createdAtMs) || getNow(),
    updatedAtMs: Number(value.updatedAtMs) || getNow(),
    startedAtMs: Number(value.startedAtMs) || Number(value.createdAtMs) || getNow(),
    currentRoot,
    moveCount: Math.max(0, Math.floor(Number(value.moveCount) || 0)),
    visited: new Set(
      Array.isArray(value.visited)
        ? value.visited
            .map((candidate) => parseRootInput(candidate, language))
            .filter((candidate): candidate is string => Boolean(candidate))
        : [currentRoot],
    ),
    controllerPlayerId: typeof value.controllerPlayerId === 'string' ? value.controllerPlayerId : null,
    controllerExpiresAtMs:
      Number.isFinite(Number(value.controllerExpiresAtMs)) && Number(value.controllerExpiresAtMs) > 0
        ? Number(value.controllerExpiresAtMs)
        : null,
    turnStartedAtMs: Number(value.turnStartedAtMs) || Number(value.startedAtMs) || getNow(),
    allowRevisit: Boolean(value.allowRevisit),
    types: normalizeMoveTypes(value.types),
    letterBank: normalizeLetterBank(value.letterBank, language),
    config: {
      countdownMs: normalizeNumber(value.config?.countdownMs, 45_000, 10_000, 300_000),
      bonusBaseMs: normalizeNumber(value.config?.bonusBaseMs, 4_000, 500, 60_000),
      bonusWindowMs: normalizeNumber(value.config?.bonusWindowMs, 6_000, 1_000, 60_000),
      controlWindowMs: normalizeNumber(
        value.config?.controlWindowMs,
        DEFAULT_ROOM_CONTROL_WINDOW_MS,
        2_000,
        30_000,
      ),
      maxControlMs: normalizeNumber(
        value.config?.maxControlMs,
        DEFAULT_ROOM_MAX_CONTROL_MS,
        3_000,
        60_000,
      ),
      maxPlayers: normalizeNumber(
        value.config?.maxPlayers,
        DEFAULT_ROOM_MAX_PLAYERS,
        2,
        16,
      ),
    },
    players,
  };
};

const loadLocalRoomState = () => {
  if (!canUseLocalStorage()) {
    if (!localRoomsByCode) {
      localRoomsByCode = new Map();
    }
    return;
  }

  const storedRooms = parseStoredArray<StoredRoom | Partial<StoredRoom>>(
    window.localStorage.getItem(LOCAL_MULTIPLAYER_ROOMS_STORAGE_KEY),
    [],
  );

  localRoomsByCode = new Map(
    storedRooms
      .map((room) => deserializeStoredRoom(room))
      .filter((room): room is InternalRoom => Boolean(room))
      .map((room) => [room.code, room]),
  );
};

const ensureLocalRoomState = () => {
  loadLocalRoomState();
  return localRoomsByCode as Map<string, InternalRoom>;
};

const persistLocalRoomState = () => {
  if (!canUseLocalStorage()) return;
  if (!localRoomsByCode) {
    localRoomsByCode = new Map();
  }
  const rooms = [...localRoomsByCode.values()].map((room) => serializeStoredRoom(room));
  window.localStorage.setItem(LOCAL_MULTIPLAYER_ROOMS_STORAGE_KEY, JSON.stringify(rooms));
};

const createRoomCode = () =>
  Array.from(
    { length: 6 },
    () => ROOM_CODE_ALPHABET.charAt(Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)),
  ).join('');

const generateUniqueRoomCode = (): string => {
  const rooms = ensureLocalRoomState();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = createRoomCode();
    if (!rooms.has(code)) return code;
  }

  throw createApiError(500, { error: 'room_code_generation_failed' });
};

const serializeSuggestion = (value: Partial<RootSuggestion> & { root: string; id: string }): RootSuggestion => ({
  id: value.id,
  language: normalizeLanguageMode(value.language),
  root: value.root,
  dottedRoot: value.dottedRoot || toDottedRoot(value.root),
  status:
    value.status === 'approved' || value.status === 'rejected' || value.status === 'pending'
      ? value.status
      : 'pending',
  note: typeof value.note === 'string' && value.note.trim() ? value.note.trim() : null,
  reviewNote:
    typeof value.reviewNote === 'string' && value.reviewNote.trim() ? value.reviewNote.trim() : null,
  createdAtMs: Number(value.createdAtMs) || getNow(),
  updatedAtMs: Number(value.updatedAtMs) || getNow(),
  reviewedAtMs: value.reviewedAtMs ? Number(value.reviewedAtMs) : null,
});

const createEmptyApprovedRootsByLanguage = (): ApprovedRootsByLanguage => ({
  hebrew: [],
  arabic: [],
});

const normalizeApprovedRootsByLanguage = (value: unknown): ApprovedRootsByLanguage => {
  if (Array.isArray(value)) {
    return {
      hebrew: [
        ...new Set(
          value
            .map((candidate) => parseRootInput(candidate, 'hebrew'))
            .filter((candidate): candidate is string => Boolean(candidate)),
        ),
      ],
      arabic: [],
    };
  }

  if (!value || typeof value !== 'object') {
    return createEmptyApprovedRootsByLanguage();
  }

  const next = createEmptyApprovedRootsByLanguage();

  for (const language of LANGUAGE_MODES) {
    const candidates = (value as Record<string, unknown>)[language];
    if (!Array.isArray(candidates)) continue;

    next[language] = [
      ...new Set(
        candidates
          .map((candidate) => parseRootInput(candidate, language))
          .filter((candidate): candidate is string => Boolean(candidate)),
      ),
    ];
  }

  return next;
};

const loadLocalSuggestionState = () => {
  if (localSuggestions && localApprovedRootsByLanguage) return;

  const storedSuggestions = canUseLocalStorage()
    ? parseStoredArray<RootSuggestion | Partial<RootSuggestion>>(
        window.localStorage.getItem(LOCAL_SUGGESTIONS_STORAGE_KEY),
        [],
      )
    : [];
  const storedApprovedRoots = canUseLocalStorage()
    ? parseStoredJson(window.localStorage.getItem(LOCAL_APPROVED_ROOTS_STORAGE_KEY))
    : null;

  localSuggestions = storedSuggestions
    .filter((value): value is Partial<RootSuggestion> & { id: string; root: string } =>
      Boolean(value && typeof value === 'object' && 'id' in value && 'root' in value),
    )
    .map((value) => serializeSuggestion(value))
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
  localApprovedRootsByLanguage = normalizeApprovedRootsByLanguage(storedApprovedRoots);
};

const persistLocalSuggestionState = () => {
  if (!canUseLocalStorage()) return;
  loadLocalSuggestionState();
  window.localStorage.setItem(LOCAL_SUGGESTIONS_STORAGE_KEY, JSON.stringify(localSuggestions ?? []));
  window.localStorage.setItem(
    LOCAL_APPROVED_ROOTS_STORAGE_KEY,
    JSON.stringify(localApprovedRootsByLanguage ?? createEmptyApprovedRootsByLanguage()),
  );
};

const buildStoreFromRoots = (language: LanguageMode, roots: string[]) => {
  const uniqueRoots = [...new Set(roots)].sort((left, right) =>
    language === 'arabic' ? left.localeCompare(right, 'ar') : left.localeCompare(right),
  );
  const rootRows = uniqueRoots.map((plain) => ({
    plain,
    dotted: toDottedRoot(plain),
    length: plain.length,
  }));

  const rootsByPlain = new Map<string, RootRow>();
  const rootsByLength = new Map<number, RootRow[]>();
  const adjacencyByRoot = new Map<string, NeighborEdge[]>();

  for (const root of rootRows) {
    rootsByPlain.set(root.plain, root);
    adjacencyByRoot.set(root.plain, []);

    const byLength = rootsByLength.get(root.length);
    if (byLength) {
      byLength.push(root);
    } else {
      rootsByLength.set(root.length, [root]);
    }
  }

  const swapEdges = buildSwapEdges(uniqueRoots);
  const replaceEdges = buildReplaceEdges(uniqueRoots);
  const edges = [...swapEdges, ...replaceEdges];

  for (const edge of edges) {
    const bucket = adjacencyByRoot.get(edge.from);
    if (!bucket) continue;

    bucket.push({
      neighbor: edge.to,
      neighborDotted: edge.toDotted,
      type: edge.type,
      positionA: edge.positionA,
      positionB: edge.positionB,
      fromChar: edge.fromChar,
      toChar: edge.toChar,
      fromDotted: edge.fromDotted,
      toDotted: edge.toDotted,
    });
  }

  for (const edgesForRoot of adjacencyByRoot.values()) {
    edgesForRoot.sort((left, right) =>
      language === 'arabic'
        ? left.neighbor.localeCompare(right.neighbor, 'ar')
        : left.neighbor.localeCompare(right.neighbor),
    );
  }

  storesByLanguage[language] = {
    initialized: true,
    stats: {
      rootsCount: rootRows.length,
      edgesCount: edges.length,
      swapEdges: swapEdges.length,
      replaceEdges: replaceEdges.length,
    },
    rootsByPlain,
    rootsByLength,
    adjacencyByRoot,
  };
};

const initializeStore = (language: LanguageMode) => {
  if (storesByLanguage[language].initialized) return;

  loadLocalSuggestionState();
  const roots = loadRootsFromRaw(ROOTS_BY_LANGUAGE_RAW[language], language, DEFAULT_ROOT_LENGTH);
  const approvedRoots = localApprovedRootsByLanguage?.[language] ?? [];
  buildStoreFromRoots(language, [...roots, ...approvedRoots]);
};

const ensureStore = (language: LanguageMode) => {
  initializeStore(language);
  return storesByLanguage[language];
};

const normalizeVisited = (visited: unknown) =>
  new Set(Array.isArray(visited) ? visited.map((value) => String(value || '')).filter(Boolean) : []);

const normalizeLetterBankSet = (letterBank: unknown, language: LanguageMode) =>
  new Set(
    Array.isArray(letterBank)
      ? letterBank
          .map((value) => normalizeRootChar(value, language))
          .filter((value): value is string => Boolean(value))
      : [],
  );

const edgePassesFilters = (
  edge: NeighborEdge,
  {
    typeSet,
    excludeVisited,
    visitedSet,
    hasLetterBank,
    letterBankSet,
  }: {
    typeSet: Set<MoveType>;
    excludeVisited: boolean;
    visitedSet: Set<string>;
    hasLetterBank: boolean;
    letterBankSet: Set<string>;
  },
) => {
  if (!typeSet.has(edge.type)) return false;
  if (excludeVisited && visitedSet.has(edge.neighbor)) return false;
  if (hasLetterBank && edge.type === 'REPLACE' && !letterBankSet.has(edge.toChar)) return false;
  return true;
};

const getFilteredEdges = (
  language: LanguageMode,
  root: string,
  {
    types,
    limit = 100,
    excludeVisited = false,
    visited = [],
    letterBank = null,
  }: {
    types?: unknown;
    limit?: number;
    excludeVisited?: boolean;
    visited?: unknown;
    letterBank?: unknown;
  } = {},
) => {
  const currentStore = ensureStore(language);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 5000);
  const typeSet = new Set(normalizeMoveTypes(types));
  const visitedSet = normalizeVisited(visited);
  const letterBankSet = normalizeLetterBankSet(letterBank, language);
  const hasLetterBank = letterBankSet.size > 0;
  const edges = currentStore.adjacencyByRoot.get(root) || [];

  return edges
    .filter((edge) =>
      edgePassesFilters(edge, {
        typeSet,
        excludeVisited: Boolean(excludeVisited),
        visitedSet,
        hasLetterBank,
        letterBankSet,
      }),
    )
    .slice(0, safeLimit);
};

const bfs = (
  language: LanguageMode,
  start: string,
  { types, maxDepth = 12 }: { types?: unknown; maxDepth?: number } = {},
) => {
  const currentStore = ensureStore(language);

  if (!currentStore.rootsByPlain.has(start)) {
    return {
      distances: new Map<string, number>(),
      previous: new Map<string, string>(),
    };
  }

  const safeMaxDepth = Math.max(1, Math.min(Number(maxDepth) || 12, 25));
  const typeSet = new Set(normalizeMoveTypes(types));
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const root = queue[index];
    const depth = distances.get(root) ?? 0;
    if (depth >= safeMaxDepth) continue;

    const edges = currentStore.adjacencyByRoot.get(root) || [];
    for (const edge of edges) {
      if (!typeSet.has(edge.type) || distances.has(edge.neighbor)) continue;

      distances.set(edge.neighbor, depth + 1);
      previous.set(edge.neighbor, root);
      queue.push(edge.neighbor);
    }
  }

  return { distances, previous };
};

const countRoots = async (language: LanguageMode) => ensureStore(language).stats.rootsCount;

const rootExists = async (root: string, language: LanguageMode) =>
  ensureStore(language).rootsByPlain.has(root);

const addRootToStore = (root: string, language: LanguageMode) => {
  const currentStore = ensureStore(language);
  if (currentStore.rootsByPlain.has(root)) return false;

  const nextRoots = [...currentStore.rootsByPlain.keys(), root];
  buildStoreFromRoots(language, nextRoots);
  return true;
};

const getNeighbors = async (
  language: LanguageMode,
  root: string,
  options: {
    types?: unknown;
    limit?: number;
    excludeVisited?: boolean;
    visited?: unknown;
    letterBank?: unknown;
  } = {},
) => getFilteredEdges(language, root, options);

const getDirectMove = async (
  language: LanguageMode,
  from: string,
  to: string,
  options: {
    types?: unknown;
    letterBank?: unknown;
  } = {},
) => {
  const edges = getFilteredEdges(language, from, { ...options, limit: 5000 });
  return edges.find((edge) => edge.neighbor === to) || null;
};

const randomItem = <T,>(items: T[]) => {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
};

const pickRandomRoot = async (
  language: LanguageMode,
  { length = DEFAULT_ROOT_LENGTH, minDegree = 1 } = {},
) => {
  const currentStore = ensureStore(language);
  const candidates = (currentStore.rootsByLength.get(Number(length)) || []).filter((root) => {
    const degree = (currentStore.adjacencyByRoot.get(root.plain) || []).length;
    return degree >= Number(minDegree);
  });

  const selected = randomItem(candidates);
  if (!selected) return null;

  return {
    plain: selected.plain,
    dotted: selected.dotted,
    degree: (currentStore.adjacencyByRoot.get(selected.plain) || []).length,
  };
};

const pickJourneyTarget = async (
  language: LanguageMode,
  from: string,
  {
    minDepth = 3,
    maxDepth = 10,
    types,
  }: {
    minDepth?: number;
    maxDepth?: number;
    types?: unknown;
  } = {},
) => {
  const currentStore = ensureStore(language);
  const safeMinDepth = Math.max(1, Number(minDepth) || 3);
  const safeMaxDepth = Math.max(safeMinDepth, Math.min(Number(maxDepth) || 10, 20));
  const { distances } = bfs(language, from, { types, maxDepth: safeMaxDepth });
  const candidates: Array<{ plain: string; dotted: string; distance: number }> = [];

  for (const [root, distance] of distances.entries()) {
    if (root === from || distance < safeMinDepth || distance > safeMaxDepth) continue;

    const rootRow = currentStore.rootsByPlain.get(root);
    if (!rootRow) continue;

    candidates.push({
      plain: rootRow.plain,
      dotted: rootRow.dotted,
      distance,
    });
  }

  return randomItem(candidates);
};

const findShortestPath = async (
  language: LanguageMode,
  from: string,
  to: string,
  { maxDepth = 12, types }: { maxDepth?: number; types?: unknown } = {},
) => {
  if (from === to) {
    return {
      path: [from],
      dottedPath: [toDottedRoot(from)],
      distance: 0,
    };
  }

  const { distances, previous } = bfs(language, from, { types, maxDepth });
  if (!distances.has(to)) return null;

  const path: string[] = [];
  let cursor: string | undefined = to;

  while (cursor) {
    path.push(cursor);
    cursor = previous.get(cursor);
  }

  path.reverse();

  return {
    path,
    dottedPath: path.map((root) => toDottedRoot(root)),
    distance: distances.get(to) ?? path.length - 1,
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.round(parsed), min, max);
};

const normalizeLetterBank = (letterBank: unknown, language: LanguageMode) => {
  if (!Array.isArray(letterBank)) return null;

  const normalized = letterBank
    .map((ch) => normalizeRootChar(ch, language))
    .filter((value): value is string => Boolean(value));

  return normalized.length > 0 ? [...new Set(normalized)] : null;
};

const computeRemainingMs = (session: InternalSession, now = getNow()) => {
  const elapsed = now - session.turnStartedAtMs;
  return Math.max(0, session.countdownRemainingMs - elapsed);
};

const markTimeoutIfNeeded = (session: InternalSession, now = getNow()) => {
  const remainingMs = computeRemainingMs(session, now);
  if (remainingMs > 0 || session.status !== 'active') return false;

  session.status = 'game_over';
  session.reason = 'timeout';
  session.endedAtMs = now;
  session.updatedAtMs = now;
  return true;
};

const serializeSession = (session: InternalSession, now = getNow()): SessionSnapshot => {
  const remainingMs = session.status === 'active' ? computeRemainingMs(session, now) : 0;

  return {
    id: session.id,
    mode: session.mode,
    language: session.language,
    status: session.status,
    reason: session.reason,
    currentRoot: session.currentRoot,
    targetRoot: session.targetRoot,
    score: session.score,
    streak: session.streak,
    moveCount: session.moveCount,
    combo: {
      permutationChain: session.combo.permutationChain,
      samePositionChain: session.combo.samePositionChain,
      samePositionIndex: session.combo.lastReplacePosition,
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

const createSession = ({
  mode,
  language,
  startRoot,
  targetRoot,
  types,
  allowRevisit = false,
  letterBank = null,
  countdownMs,
  bonusBaseMs,
  bonusWindowMs,
}: {
  mode: unknown;
  language: LanguageMode;
  startRoot: string;
  targetRoot: string | null;
  types: unknown;
  allowRevisit?: boolean;
  letterBank?: unknown;
  countdownMs: unknown;
  bonusBaseMs: unknown;
  bonusWindowMs: unknown;
}) => {
  const now = getNow();
  const safeCountdown = normalizeNumber(countdownMs, 45_000, 10_000, 300_000);
  const safeBonusBase = normalizeNumber(bonusBaseMs, 4_000, 500, 60_000);
  const safeBonusWindow = normalizeNumber(bonusWindowMs, 6_000, 1_000, 60_000);

  const session: InternalSession = {
    id: createOpaqueId('session'),
    mode: normalizeSessionMode(mode),
    language,
    status: 'active',
    reason: null,
    createdAtMs: now,
    updatedAtMs: now,
    endedAtMs: null,
    currentRoot: startRoot,
    targetRoot,
    score: 0,
    streak: 0,
    moveCount: 0,
    combo: createComboState(),
    visited: new Set([startRoot]),
    allowRevisit: Boolean(allowRevisit),
    types: normalizeMoveTypes(types),
    letterBank: normalizeLetterBank(letterBank, language),
    turnStartedAtMs: now,
    countdownRemainingMs: safeCountdown,
    config: {
      countdownMs: safeCountdown,
      bonusBaseMs: safeBonusBase,
      bonusWindowMs: safeBonusWindow,
    },
  };

  sessions.set(session.id, session);
  return session;
};

const endSession = (
  session: InternalSession,
  reason: string,
  status: SessionStatus = 'game_over',
  now = getNow(),
) => {
  session.status = status;
  session.reason = reason;
  session.endedAtMs = now;
  session.updatedAtMs = now;
};

const applyInvalidMove = (session: InternalSession, now = getNow()) => {
  session.streak = 0;
  session.combo = createComboState();
  session.updatedAtMs = now;
};

const applyValidMove = (session: InternalSession, nextRoot: string, moveEdge: NeighborEdge, now = getNow()) => {
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

const parseBodyRoot = (value: unknown, language: LanguageMode) =>
  parseRootInput(value, language, DEFAULT_ROOT_LENGTH);

const parseVisitedRoots = (visited: unknown, language: LanguageMode) => {
  if (!Array.isArray(visited)) return [];
  return [
    ...new Set(
      visited
        .map((value) => parseBodyRoot(value, language))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
};

const formatNeighborPayload = (root: string, neighborEdges: NeighborEdge[]) => ({
  root,
  dottedRoot: toDottedRoot(root),
  count: neighborEdges.length,
  neighbors: neighborEdges.map((edge) => edge.neighbor),
  edges: neighborEdges,
});

const serializeSessionWithBoard = (
  session: InternalSession,
  neighborEdges: NeighborEdge[] = [],
  now = getNow(),
  move: MoveSummary | null = null,
): SessionPayload => ({
  session: serializeSession(session, now),
  currentRootDotted: toDottedRoot(session.currentRoot),
  targetRootDotted: session.targetRoot ? toDottedRoot(session.targetRoot) : null,
  options: formatNeighborPayload(session.currentRoot, neighborEdges),
  move,
});

const getNeighborOptionsForSession = (session: InternalSession, limit = 500) =>
  getNeighbors(session.language, session.currentRoot, {
    types: session.types,
    limit,
    excludeVisited: !session.allowRevisit,
    visited: session.allowRevisit ? [] : [...session.visited],
    letterBank: session.letterBank,
  });

const getNeighborOptionsForRoom = (room: InternalRoom, limit = 500) =>
  getNeighbors(room.language, room.currentRoot, {
    types: room.types,
    limit,
    excludeVisited: !room.allowRevisit,
    visited: room.allowRevisit ? [] : [...room.visited],
    letterBank: room.letterBank,
  });

const getRoomControllerRemainingMs = (room: InternalRoom, now = getNow()) => {
  if (!room.controllerExpiresAtMs) return 0;
  return Math.max(0, room.controllerExpiresAtMs - now);
};

const findRoomPlayerByToken = (room: InternalRoom, token: unknown) => {
  const normalized = typeof token === 'string' && token.trim() ? token.trim() : null;
  if (!normalized) return null;
  return room.players.find((player) => player.token === normalized) ?? null;
};

const serializeRoomPayload = async (
  room: InternalRoom,
  {
    player,
    playerToken = null,
    neighborEdges,
    move = null,
    now = getNow(),
  }: {
    player?: InternalRoomPlayer | null;
    playerToken?: string | null;
    neighborEdges?: NeighborEdge[];
    move?: RoomMoveSummary | null;
    now?: number;
  } = {},
): Promise<RoomPayload> => {
  const resolvedPlayer = player ?? findRoomPlayerByToken(room, playerToken);
  const edges = neighborEdges ?? (await getNeighborOptionsForRoom(room));
  const controllerRemainingMs = getRoomControllerRemainingMs(room, now);

  return {
    room: {
      id: room.id,
      code: room.code,
      language: room.language,
      version: room.version,
      status: room.status,
      phase: room.phase,
      reason: room.reason,
      currentRoot: room.currentRoot,
      currentRootDotted: toDottedRoot(room.currentRoot),
      moveCount: room.moveCount,
      visitedRoots: [...room.visited],
      visitedCount: room.visited.size,
      controllerPlayerId: room.controllerPlayerId,
      controllerExpiresAtMs: room.controllerExpiresAtMs,
      controllerRemainingMs,
      turnStartedAtMs: room.turnStartedAtMs,
      createdAtMs: room.createdAtMs,
      updatedAtMs: room.updatedAtMs,
      startedAtMs: room.startedAtMs,
      allowRevisit: room.allowRevisit,
      types: room.types,
      letterBank: room.letterBank,
      config: room.config,
      players: room.players.map((candidate) => serializeRoomPlayer(candidate, resolvedPlayer?.id ?? null)),
      options: formatNeighborPayload(room.currentRoot, edges),
    },
    player: resolvedPlayer ? serializeRoomPlayerAuth(resolvedPlayer) : null,
    move,
  };
};

const parseMs = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pickRandomDifferentRoot = async (
  language: LanguageMode,
  root: string,
  maxAttempts = 20,
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = await pickRandomRoot(language, { length: DEFAULT_ROOT_LENGTH, minDegree: 0 });
    if (!candidate) return null;
    if (candidate.plain !== root) return candidate;
  }

  return null;
};

const selectPlayableStartRoot = async ({
  language,
  requestedRoot,
  types,
  allowRevisit,
  letterBank,
}: {
  language: LanguageMode;
  requestedRoot: string | null;
  types: unknown;
  allowRevisit: boolean;
  letterBank: string[] | null;
}) => {
  if (requestedRoot) {
    const exists = await rootExists(requestedRoot, language);
    if (!exists) return { error: 'start_root_not_found' };

    const sampleNeighbors = await getNeighbors(language, requestedRoot, {
      types,
      limit: 1,
      excludeVisited: !allowRevisit,
      visited: allowRevisit ? [] : [requestedRoot],
      letterBank,
    });

    if (sampleNeighbors.length === 0) return { error: 'start_root_has_no_valid_moves' };
    return { root: requestedRoot };
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = await pickRandomRoot(language, { length: DEFAULT_ROOT_LENGTH, minDegree: 1 });
    if (!candidate) break;

    const sampleNeighbors = await getNeighbors(language, candidate.plain, {
      types,
      limit: 1,
      excludeVisited: !allowRevisit,
      visited: allowRevisit ? [] : [candidate.plain],
      letterBank,
    });

    if (sampleNeighbors.length > 0) {
      return { root: candidate.plain };
    }
  }

  return { error: 'could_not_find_playable_start_root' };
};

const parseRequestBody = (init?: RequestInit) => {
  if (!init?.body || typeof init.body !== 'string') return {};

  try {
    const parsed = JSON.parse(init.body) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const normalizeSuggestionStatus = (value: unknown): RootSuggestionStatus | 'all' => {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'pending' || normalized === 'approved' || normalized === 'rejected'
    ? normalized
    : 'all';
};

const handleHealth = async () => ({
  ok: true,
  roots: await countRoots(DEFAULT_LANGUAGE_MODE),
  rootsByLanguage: {
    hebrew: await countRoots('hebrew'),
    arabic: await countRoots('arabic'),
  },
  pendingSuggestions: (localSuggestions ?? []).filter((suggestion) => suggestion.status === 'pending').length,
  activeRooms: ensureLocalRoomState().size,
  storageBackend: canUseLocalStorage() ? 'local-storage' : 'browser-memory',
  ts: getNow(),
});

const handleListRootSuggestions = async (statusValue: unknown, languageValue?: unknown) => {
  loadLocalSuggestionState();
  const status = normalizeSuggestionStatus(statusValue);
  const language = languageValue ? normalizeLanguageMode(languageValue) : null;
  const suggestions =
    status === 'all'
      ? [...(localSuggestions ?? [])]
      : (localSuggestions ?? []).filter((suggestion) => suggestion.status === status);
  return {
    suggestions: language ? suggestions.filter((suggestion) => suggestion.language === language) : suggestions,
  };
};

const handleCreateRootSuggestion = async (body: Record<string, unknown>) => {
  loadLocalSuggestionState();
  const language = normalizeLanguageMode(body.language);

  const root = expectValue(parseBodyRoot(body.root, language), 400, { error: 'root_is_required' });

  if (await rootExists(root, language)) {
    fail(409, { error: 'root_already_exists', root });
  }

  const duplicate = (localSuggestions ?? []).find(
    (suggestion) =>
      suggestion.language === language &&
      suggestion.root === root &&
      (suggestion.status === 'pending' || suggestion.status === 'approved'),
  );

  if (duplicate) {
    fail(409, {
      error: duplicate.status === 'approved' ? 'root_already_approved' : 'root_already_suggested',
      suggestion: duplicate,
    });
  }

  const now = getNow();
  const suggestion = serializeSuggestion({
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `suggestion-${Math.random().toString(36).slice(2, 10)}`,
    language,
    root,
    status: 'pending',
    note: typeof body.note === 'string' ? body.note : null,
    createdAtMs: now,
    updatedAtMs: now,
    reviewedAtMs: null,
  });

  localSuggestions = [suggestion, ...(localSuggestions ?? [])];
  persistLocalSuggestionState();
  return { suggestion };
};

const handleReviewRootSuggestion = async (suggestionId: string, body: Record<string, unknown>) => {
  loadLocalSuggestionState();

  const decision = String(body.decision || '').toLowerCase();
  if (decision !== 'approve' && decision !== 'reject') {
    fail(400, { error: 'decision_must_be_approve_or_reject' });
  }

  const suggestion = expectValue(
    (localSuggestions ?? []).find((candidate) => candidate.id === suggestionId),
    404,
    { error: 'suggestion_not_found' },
  );

  const now = getNow();
  if (decision === 'approve' && !(await rootExists(suggestion.root, suggestion.language))) {
    addRootToStore(suggestion.root, suggestion.language);
    localApprovedRootsByLanguage = localApprovedRootsByLanguage ?? createEmptyApprovedRootsByLanguage();
    localApprovedRootsByLanguage[suggestion.language] = [
      ...new Set([...(localApprovedRootsByLanguage[suggestion.language] ?? []), suggestion.root]),
    ].sort((left, right) =>
      suggestion.language === 'arabic'
        ? left.localeCompare(right, 'ar')
        : left.localeCompare(right),
    );
  }

  const reviewed = serializeSuggestion({
    ...suggestion,
    status: decision === 'approve' ? 'approved' : 'rejected',
    reviewNote: typeof body.reviewNote === 'string' ? body.reviewNote : null,
    updatedAtMs: now,
    reviewedAtMs: now,
  });

  localSuggestions = (localSuggestions ?? []).map((candidate) =>
    candidate.id === suggestionId ? reviewed : candidate,
  );
  persistLocalSuggestionState();
  return { suggestion: reviewed };
};

const handleGetNextOptions = async (body: Record<string, unknown>) => {
  const language = normalizeLanguageMode(body.language);
  const safeRoot = expectValue(parseBodyRoot(body.root, language), 400, { error: 'root is required' });

  const exists = await rootExists(safeRoot, language);
  if (!exists) fail(404, { error: 'root_not_found', root: safeRoot });

  const types = normalizeMoveTypes(body.types);
  const visited = parseVisitedRoots(body.visited, language);
  const excludeVisited = Boolean(body.exclude_visited ?? body.excludeVisited ?? false);
  const letterBank = normalizeLetterBank(body.letter_bank ?? body.letterBank, language);
  const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 5000);
  const edges = await getNeighbors(language, safeRoot, {
    types,
    limit,
    excludeVisited,
    visited,
    letterBank,
  });

  return formatNeighborPayload(safeRoot, edges);
};

const getRoomByCode = (roomCode: string) => {
  const normalizedCode = expectValue(normalizeRoomCode(roomCode), 404, { error: 'room_not_found' });
  return expectValue(ensureLocalRoomState().get(normalizedCode), 404, {
    error: 'room_not_found',
    code: normalizedCode,
  });
};

const createRoomPlayer = ({
  name,
  fallbackName,
  isHost,
  now,
}: {
  name: unknown;
  fallbackName: string;
  isHost: boolean;
  now: number;
}): InternalRoomPlayer => ({
  id: createOpaqueId('player'),
  token: createOpaqueId('player-token'),
  name: normalizePlayerName(name, fallbackName),
  joinedAtMs: now,
  score: 0,
  streak: 0,
  longestStreak: 0,
  takeovers: 0,
  combo: createComboState(),
  isHost,
});

const reconcileRoomControlState = (room: InternalRoom, now = getNow()) => {
  if (!room.controllerPlayerId || getRoomControllerRemainingMs(room, now) > 0) return false;

  room.controllerPlayerId = null;
  room.controllerExpiresAtMs = null;
  room.phase = 'open_claim';
  room.turnStartedAtMs = now;
  room.updatedAtMs = now;
  room.version += 1;
  return true;
};

const applyInvalidRoomMove = (room: InternalRoom, player: InternalRoomPlayer, now = getNow()) => {
  const didChange =
    player.streak > 0 ||
    player.combo.permutationChain > 0 ||
    player.combo.samePositionChain > 0 ||
    player.combo.lastMoveType !== null ||
    player.combo.lastReplacePosition !== null;

  player.streak = 0;
  player.combo = createComboState();

  if (didChange) {
    room.updatedAtMs = now;
    room.version += 1;
  }

  return didChange;
};

const buildRoomMoveSummary = (
  player: InternalRoomPlayer,
  move: Partial<RoomMoveSummary>,
): RoomMoveSummary => ({
  ok: Boolean(move.ok),
  byPlayerId: player.id,
  byPlayerName: player.name,
  controlChange: move.controlChange ?? 'none',
  ...move,
});

const failRoomMove = async ({
  status,
  room,
  player,
  reason,
  move,
  now = getNow(),
}: {
  status: number;
  room: InternalRoom;
  player: InternalRoomPlayer;
  reason: string;
  move?: Partial<RoomMoveSummary>;
  now?: number;
}): Promise<never> => {
  const neighbors = room.status === 'active' ? await getNeighborOptionsForRoom(room) : [];
  throw createApiError(
    status,
    await serializeRoomPayload(room, {
      player,
      neighborEdges: neighbors,
      now,
      move: buildRoomMoveSummary(player, {
        ok: false,
        reason,
        ...move,
      }),
    }),
  );
};

const handleRoomMove = async (roomCode: string, body: Record<string, unknown>) => {
  const room = getRoomByCode(roomCode);
  const rooms = ensureLocalRoomState();
  const now = getNow();
  const controlStateChanged = reconcileRoomControlState(room, now);
  if (controlStateChanged) {
    rooms.set(room.code, room);
    persistLocalRoomState();
  }

  const player = expectValue(
    findRoomPlayerByToken(room, body.playerToken ?? body.token),
    401,
    { error: 'player_not_in_room', code: room.code },
  );

  if (room.status !== 'active') {
    fail(
      409,
      await serializeRoomPayload(room, {
        player,
        now,
        move: buildRoomMoveSummary(player, {
          ok: false,
          reason: room.reason || 'room_not_active',
        }),
      }),
    );
  }

  const candidateRoot = expectValue(parseBodyRoot(body.root, room.language), 400, {
    error: 'root is required',
  });

  if (room.controllerPlayerId && room.controllerPlayerId !== player.id) {
    await failRoomMove({
      status: 409,
      room,
      player,
      reason: 'control_locked',
      move: {
        controlChange: 'none',
        controlRemainingMs: getRoomControllerRemainingMs(room, now),
      },
      now,
    });
  }

  if (candidateRoot === room.currentRoot) {
    if (applyInvalidRoomMove(room, player, now) || controlStateChanged) {
      rooms.set(room.code, room);
      persistLocalRoomState();
    }
    await failRoomMove({
      status: 400,
      room,
      player,
      reason: 'same_root',
      now,
    });
  }

  if (!room.allowRevisit && room.visited.has(candidateRoot)) {
    if (applyInvalidRoomMove(room, player, now) || controlStateChanged) {
      rooms.set(room.code, room);
      persistLocalRoomState();
    }
    await failRoomMove({
      status: 400,
      room,
      player,
      reason: 'already_visited',
      now,
    });
  }

  const moveEdge = await getDirectMove(room.language, room.currentRoot, candidateRoot, {
    types: room.types,
    letterBank: room.letterBank,
  });

  if (!moveEdge) {
    if (applyInvalidRoomMove(room, player, now) || controlStateChanged) {
      rooms.set(room.code, room);
      persistLocalRoomState();
    }
    await failRoomMove({
      status: 400,
      room,
      player,
      reason: 'not_a_valid_neighbor',
      now,
    });
  }

  const safeMoveEdge = expectValue(moveEdge, 500, { error: 'move_edge_resolution_failed' });
  const hadController = room.controllerPlayerId === player.id;
  const remainingBeforeMs = hadController
    ? getRoomControllerRemainingMs(room, now)
    : room.config.controlWindowMs;
  const elapsedMs = Math.max(0, now - room.turnStartedAtMs);
  const { nextComboState, nextRemainingMs, ...moveOutcome } = resolveMoveOutcome({
    comboState: player.combo,
    moveEdge: safeMoveEdge,
    streakBeforeMove: player.streak,
    elapsedMs,
    remainingBeforeMs,
    config: room.config,
  });
  const nextControlRemainingMs = Math.min(room.config.maxControlMs, nextRemainingMs);
  const controlChange = hadController ? 'extended' : 'claimed';

  player.combo = nextComboState;
  player.streak = moveOutcome.streakAfterMove;
  player.longestStreak = Math.max(player.longestStreak, player.streak);
  player.score += moveOutcome.scoreGain;
  if (!hadController) {
    player.takeovers += 1;
  }

  room.currentRoot = candidateRoot;
  room.visited.add(candidateRoot);
  room.moveCount += 1;
  room.controllerPlayerId = player.id;
  room.controllerExpiresAtMs = now + nextControlRemainingMs;
  room.turnStartedAtMs = now;
  room.phase = 'controlled';
  room.reason = null;

  const neighbors = await getNeighborOptionsForRoom(room);
  if (neighbors.length === 0) {
    room.status = 'completed';
    room.reason = 'no_moves';
    room.controllerPlayerId = null;
    room.controllerExpiresAtMs = null;
    room.phase = 'open_claim';
  }

  room.updatedAtMs = now;
  room.version += 1;
  ensureLocalRoomState().set(room.code, room);
  persistLocalRoomState();

  return serializeRoomPayload(room, {
    player,
    neighborEdges: neighbors,
    now,
    move: buildRoomMoveSummary(player, {
      ok: true,
      ...moveOutcome,
      edge: safeMoveEdge,
      remainingBeforeMs,
      elapsedMs,
      controlChange,
      controlRemainingMs: room.controllerPlayerId === player.id ? nextControlRemainingMs : 0,
    }),
  });
};

const handleCreateRoom = async (body: Record<string, unknown>) => {
  const language = normalizeLanguageMode(body.language);
  const types = normalizeMoveTypes(body.types ?? body.allowedTypes);
  const allowRevisit = Boolean(body.allow_revisit ?? body.allowRevisit ?? false);
  const letterBank = normalizeLetterBank(body.letter_bank ?? body.letterBank, language);
  const optionsLimit = Math.min(Math.max(Number(body.optionsLimit) || 500, 1), 5000);
  const requestedRoot = parseBodyRoot(body.startRoot ?? body.root, language);
  const startSelection = await selectPlayableStartRoot({
    language,
    requestedRoot,
    types,
    allowRevisit,
    letterBank,
  });

  if (startSelection.error) fail(400, { error: startSelection.error });

  const startRoot = expectValue(startSelection.root, 500, { error: 'start_root_resolution_failed' });
  const now = getNow();
  const hostPlayer = createRoomPlayer({
    name: body.playerName ?? body.name,
    fallbackName: 'Host',
    isHost: true,
    now,
  });
  const room: InternalRoom = {
    id: createOpaqueId('room'),
    code: generateUniqueRoomCode(),
    language,
    version: 1,
    status: 'active',
    phase: 'open_claim',
    reason: null,
    createdAtMs: now,
    updatedAtMs: now,
    startedAtMs: now,
    currentRoot: startRoot,
    moveCount: 0,
    visited: new Set([startRoot]),
    controllerPlayerId: null,
    controllerExpiresAtMs: null,
    turnStartedAtMs: now,
    allowRevisit,
    types,
    letterBank,
    config: {
      countdownMs: normalizeNumber(body.countdownMs ?? body.initialTurnMs, 45_000, 10_000, 300_000),
      bonusBaseMs: normalizeNumber(body.bonusBaseMs ?? body.baseTurnMs, 4_000, 500, 60_000),
      bonusWindowMs: normalizeNumber(body.bonusWindowMs, 6_000, 1_000, 60_000),
      controlWindowMs: normalizeNumber(
        body.controlWindowMs ?? body.claimWindowMs,
        DEFAULT_ROOM_CONTROL_WINDOW_MS,
        2_000,
        30_000,
      ),
      maxControlMs: normalizeNumber(
        body.maxControlMs,
        DEFAULT_ROOM_MAX_CONTROL_MS,
        3_000,
        60_000,
      ),
      maxPlayers: normalizeNumber(body.maxPlayers, DEFAULT_ROOM_MAX_PLAYERS, 2, 16),
    },
    players: [hostPlayer],
  };

  ensureLocalRoomState().set(room.code, room);
  persistLocalRoomState();
  const neighbors = await getNeighborOptionsForRoom(room, optionsLimit);
  return serializeRoomPayload(room, { player: hostPlayer, neighborEdges: neighbors, now });
};

const handleJoinRoom = async (roomCode: string, body: Record<string, unknown>) => {
  const room = getRoomByCode(roomCode);
  const now = getNow();
  const rooms = ensureLocalRoomState();
  let didChangeRoom = reconcileRoomControlState(room, now);
  const existingPlayer = findRoomPlayerByToken(room, body.playerToken ?? body.token);

  if (existingPlayer) {
    if (didChangeRoom) persistLocalRoomState();
    const neighbors = room.status === 'active' ? await getNeighborOptionsForRoom(room) : [];
    return serializeRoomPayload(room, { player: existingPlayer, neighborEdges: neighbors, now });
  }

  if (room.players.length >= room.config.maxPlayers) {
    fail(409, {
      error: 'room_full',
      code: room.code,
      maxPlayers: room.config.maxPlayers,
    });
  }

  const player = createRoomPlayer({
    name: body.playerName ?? body.name,
    fallbackName: `Player ${room.players.length + 1}`,
    isHost: false,
    now,
  });

  room.players.push(player);
  room.updatedAtMs = now;
  room.version += 1;
  rooms.set(room.code, room);
  didChangeRoom = true;

  if (didChangeRoom) persistLocalRoomState();
  const neighbors = room.status === 'active' ? await getNeighborOptionsForRoom(room) : [];
  return serializeRoomPayload(room, { player, neighborEdges: neighbors, now });
};

const handleRoomState = async (roomCode: string, playerToken: unknown) => {
  const room = getRoomByCode(roomCode);
  const now = getNow();
  const didChangeRoom = reconcileRoomControlState(room, now);
  if (didChangeRoom) persistLocalRoomState();
  const neighbors = room.status === 'active' ? await getNeighborOptionsForRoom(room) : [];
  return serializeRoomPayload(room, {
    player: findRoomPlayerByToken(room, playerToken),
    neighborEdges: neighbors,
    now,
  });
};

const handleStartSession = async (body: Record<string, unknown>) => {
  const language = normalizeLanguageMode(body.language);
  const mode = normalizeSessionMode(body.mode);
  const types = normalizeMoveTypes(body.types ?? body.allowedTypes);
  const allowRevisit = Boolean(body.allow_revisit ?? body.allowRevisit ?? false);
  const letterBank = normalizeLetterBank(body.letter_bank ?? body.letterBank, language);
  const optionsLimit = Math.min(Math.max(Number(body.optionsLimit) || 500, 1), 5000);

  const requestedRoot = parseBodyRoot(body.startRoot ?? body.root, language);
  const startSelection = await selectPlayableStartRoot({
    language,
    requestedRoot,
    types,
    allowRevisit,
    letterBank,
  });

  if (startSelection.error) fail(400, { error: startSelection.error });

  const startRoot = expectValue(
    startSelection.root,
    500,
    { error: 'start_root_resolution_failed' },
  );
  let targetRoot = parseBodyRoot(body.targetRoot, language);

  if (mode === 'journey') {
    if (targetRoot) {
      const exists = await rootExists(targetRoot, language);
      if (!exists) fail(400, { error: 'target_root_not_found' });
      if (targetRoot === startRoot) {
        fail(400, { error: 'target_root_must_differ_from_start_root' });
      }
    } else {
      const generated = await pickJourneyTarget(language, startRoot, { minDepth: 3, maxDepth: 10 });
      targetRoot = generated?.plain || (await pickRandomDifferentRoot(language, startRoot))?.plain || null;
    }
  } else {
    targetRoot = null;
  }

  const session = createSession({
    mode,
    language,
    startRoot,
    targetRoot,
    types,
    allowRevisit,
    letterBank,
    countdownMs: parseMs(body.countdownMs ?? body.initialTurnMs, 45_000),
    bonusBaseMs: parseMs(body.bonusBaseMs ?? body.baseTurnMs, 4_000),
    bonusWindowMs: parseMs(body.bonusWindowMs, 6_000),
  });

  const neighbors = await getNeighborOptionsForSession(session, optionsLimit);
  return serializeSessionWithBoard(session, neighbors);
};

const handleSessionState = async (sessionId: string) => {
  const session = expectValue(sessions.get(sessionId), 404, { error: 'session_not_found' });

  const now = getNow();
  markTimeoutIfNeeded(session, now);
  const neighbors = session.status === 'active' ? await getNeighborOptionsForSession(session) : [];

  return serializeSessionWithBoard(session, neighbors, now);
};

const handleMove = async (sessionId: string, body: Record<string, unknown>) => {
  const session = expectValue(sessions.get(sessionId), 404, { error: 'session_not_found' });

  const now = getNow();
  markTimeoutIfNeeded(session, now);

  if (session.status !== 'active') {
    fail(
      409,
      serializeSessionWithBoard(session, [], now, {
        ok: false,
        reason: session.reason || 'session_not_active',
      }),
    );
  }

  const candidateRoot = expectValue(parseBodyRoot(body.root, session.language), 400, {
    error: 'root is required',
  });

  if (candidateRoot === session.currentRoot) {
    applyInvalidMove(session, now);
    const neighbors = await getNeighborOptionsForSession(session);
    fail(
      400,
      serializeSessionWithBoard(session, neighbors, now, {
        ok: false,
        reason: 'same_root',
      }),
    );
  }

  if (!session.allowRevisit && session.visited.has(candidateRoot)) {
    applyInvalidMove(session, now);
    const neighbors = await getNeighborOptionsForSession(session);
    fail(
      400,
      serializeSessionWithBoard(session, neighbors, now, {
        ok: false,
        reason: 'already_visited',
      }),
    );
  }

  const moveEdge = await getDirectMove(session.language, session.currentRoot, candidateRoot, {
    types: session.types,
    letterBank: session.letterBank,
  });

  if (!moveEdge) {
    applyInvalidMove(session, now);
    const neighbors = await getNeighborOptionsForSession(session);
    fail(
      400,
      serializeSessionWithBoard(session, neighbors, now, {
        ok: false,
        reason: 'not_a_valid_neighbor',
      }),
    );
  }
  const safeMoveEdge = expectValue(moveEdge, 500, { error: 'move_edge_resolution_failed' });

  const moveSummary = applyValidMove(session, candidateRoot, safeMoveEdge, now);

  if (!moveSummary || session.status !== 'active') {
    fail(
      409,
      serializeSessionWithBoard(session, [], now, {
        ok: false,
        reason: session.reason || 'timeout',
      }),
    );
  }

  let neighbors = await getNeighborOptionsForSession(session);

  if (session.mode === 'journey' && session.targetRoot && session.currentRoot === session.targetRoot) {
    session.score += 100;
    endSession(session, 'target_reached', 'completed', now);
    neighbors = [];
  } else if (neighbors.length === 0) {
    endSession(session, 'no_moves', 'game_over', now);
  }

  return serializeSessionWithBoard(session, neighbors, now, {
    ok: true,
    ...moveSummary,
    edge: safeMoveEdge,
  });
};

const handlePath = async (body: Record<string, unknown>) => {
  const language = normalizeLanguageMode(body.language);
  const safeFrom = expectValue(
    parseBodyRoot(body.fromRoot ?? body.from, language),
    400,
    { error: 'fromRoot and toRoot are required' },
  );
  const safeTo = expectValue(
    parseBodyRoot(body.toRoot ?? body.to, language),
    400,
    { error: 'fromRoot and toRoot are required' },
  );

  if (safeFrom === safeTo) {
    return {
      from: safeFrom,
      to: safeTo,
      distance: 0,
      path: [safeFrom],
      dottedPath: [toDottedRoot(safeFrom)],
    };
  }

  const types = normalizeMoveTypes(body.types);
  const maxDepth = Math.min(Math.max(Number(body.maxDepth) || 12, 1), 25);
  const path = await findShortestPath(language, safeFrom, safeTo, { maxDepth, types });
  if (!path) fail(404, { error: 'path_not_found', from: safeFrom, to: safeTo, maxDepth });

  return {
    from: safeFrom,
    to: safeTo,
    ...path,
  };
};

const requestRemoteJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE.replace(/\/+$/, '')}${path}`, init);
  let data: unknown = null;
  const raw = await response.text();

  if (raw) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      data = { error: raw };
    }
  }

  if (!response.ok) throw createApiError(response.status, data);
  return data as T;
};

const requestLocalJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const url = new URL(path, 'https://root-game.local');
  const method = (init?.method || 'GET').toUpperCase();
  const body = parseRequestBody(init);

  if (url.pathname === '/api/health' && method === 'GET') {
    return (await handleHealth()) as T;
  }

  if (url.pathname === '/api/root-suggestions' && method === 'GET') {
    return (await handleListRootSuggestions(
      url.searchParams.get('status'),
      url.searchParams.get('language'),
    )) as T;
  }

  if (url.pathname === '/api/root-suggestions' && method === 'POST') {
    return (await handleCreateRootSuggestion(body)) as T;
  }

  if (url.pathname === '/getNextOptions' && method === 'POST') {
    return (await handleGetNextOptions(body)) as T;
  }

  if (url.pathname === '/api/rooms/create' && method === 'POST') {
    return (await handleCreateRoom(body)) as T;
  }

  if (url.pathname === '/api/session/start' && method === 'POST') {
    return (await handleStartSession(body)) as T;
  }

  if (url.pathname === '/api/path' && method === 'POST') {
    return (await handlePath(body)) as T;
  }

  const stateMatch = url.pathname.match(/^\/api\/session\/([^/]+)\/state$/);
  if (stateMatch && method === 'GET') {
    const stateSessionId = stateMatch[1];
    if (!stateSessionId) {
      throw createApiError(404, { error: 'session_not_found' });
    }
    return (await handleSessionState(decodeURIComponent(stateSessionId))) as T;
  }

  const roomStateMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/state$/);
  if (roomStateMatch && method === 'GET') {
    const roomCode = roomStateMatch[1];
    if (!roomCode) {
      throw createApiError(404, { error: 'room_not_found' });
    }
    return (await handleRoomState(
      decodeURIComponent(roomCode),
      url.searchParams.get('playerToken') ?? url.searchParams.get('player_token'),
    )) as T;
  }

  const moveMatch = url.pathname.match(/^\/api\/session\/([^/]+)\/move$/);
  if (moveMatch && method === 'POST') {
    const moveSessionId = moveMatch[1];
    if (!moveSessionId) {
      throw createApiError(404, { error: 'session_not_found' });
    }
    return (await handleMove(decodeURIComponent(moveSessionId), body)) as T;
  }

  const roomJoinMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
  if (roomJoinMatch && method === 'POST') {
    const roomCode = roomJoinMatch[1];
    if (!roomCode) {
      throw createApiError(404, { error: 'room_not_found' });
    }
    return (await handleJoinRoom(decodeURIComponent(roomCode), body)) as T;
  }

  const roomMoveMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/move$/);
  if (roomMoveMatch && method === 'POST') {
    const roomCode = roomMoveMatch[1];
    if (!roomCode) {
      throw createApiError(404, { error: 'room_not_found' });
    }
    return (await handleRoomMove(decodeURIComponent(roomCode), body)) as T;
  }

  const reviewSuggestionMatch = url.pathname.match(/^\/api\/root-suggestions\/([^/]+)\/review$/);
  if (reviewSuggestionMatch && method === 'POST') {
    const suggestionId = reviewSuggestionMatch[1];
    if (!suggestionId) {
      throw createApiError(404, { error: 'suggestion_not_found' });
    }
    return (await handleReviewRootSuggestion(decodeURIComponent(suggestionId), body)) as T;
  }

  throw createApiError(
    404,
    { error: 'not_found', path: url.pathname },
    `Route not found: ${url.pathname}`,
  );
};

export const requestJson = async <T,>(path: string, init?: RequestInit): Promise<T> =>
  USE_REMOTE_API ? requestRemoteJson<T>(path, init) : requestLocalJson<T>(path, init);

export const isApiError = (error: unknown): error is ApiError => {
  if (typeof error !== 'object' || error === null) return false;
  return 'status' in error && 'message' in error;
};

export const advanceApiTime = (ms: number) => {
  if (USE_REMOTE_API || !Number.isFinite(ms) || ms <= 0) return;
  localTimeOffsetMs += ms;
};

export const resetApiTime = () => {
  if (USE_REMOTE_API) return;
  localTimeOffsetMs = 0;
};
