import rootsRaw from './data/roots_hebrew_scraped.txt?raw';
import { getStreakTier } from './streakTiers';

type GameMode = 'journey' | 'survival';
type SessionStatus = 'active' | 'game_over' | 'completed';
type MoveType = 'REPLACE' | 'SWAP';
type ComboKind = 'permutation' | 'same_position';

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

type RootSuggestionStatus = 'pending' | 'approved' | 'rejected';

type RootSuggestion = {
  id: string;
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
  combo: {
    permutationChain: number;
    samePositionChain: number;
    lastMoveType: MoveType | null;
    lastReplacePosition: number | null;
  };
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

const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const USE_REMOTE_API = API_BASE.length > 0;
const DEFAULT_ROOT_LENGTH = 3;
const LOCAL_SUGGESTIONS_STORAGE_KEY = 'roots.suggestions.v1';
const LOCAL_APPROVED_ROOTS_STORAGE_KEY = 'roots.approvedRoots.v1';
const MOVE_TYPES: MoveType[] = ['REPLACE', 'SWAP'];
const SESSION_MODES: GameMode[] = ['journey', 'survival'];
const MOVE_SCORE_RULES = {
  REPLACE: {
    baseScore: 100,
    chainStepScore: 35,
    chainStepTimeMs: 250,
    moveBonusMs: 0,
  },
  SWAP: {
    baseScore: 170,
    chainStepScore: 80,
    chainStepTimeMs: 950,
    moveBonusMs: 900,
  },
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

let localTimeOffsetMs = 0;
let store: Store = {
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
};
const sessions = new Map<string, InternalSession>();
let localSuggestions: RootSuggestion[] | null = null;
let localApprovedRoots: string[] | null = null;

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

const createComboState = () => ({
  permutationChain: 0,
  samePositionChain: 0,
  lastMoveType: null as MoveType | null,
  lastReplacePosition: null as number | null,
});

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

const isAsciiLetter = (ch: string) => /^[a-z]$/i.test(ch);

const normalizeGameChar = (ch: unknown) => {
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

const normalizeGameRoot = (value: unknown, expectedLength = DEFAULT_ROOT_LENGTH) => {
  if (!value) return null;

  const collapsed = String(value)
    .toLowerCase()
    .replace(/[._,\s-]+/g, '')
    .trim();

  if (!collapsed) return null;

  const normalized = Array.from(collapsed)
    .map((ch) => normalizeGameChar(ch))
    .filter((ch): ch is string => Boolean(ch))
    .join('');

  if (!normalized) return null;
  if (expectedLength && normalized.length !== expectedLength) return null;

  return normalized;
};

const parseRootInput = (value: unknown, expectedLength = DEFAULT_ROOT_LENGTH) => {
  if (!value) return null;
  if (hasHebrewChars(value)) {
    const transliterated = transliterateHebrewRoot(String(value));
    return normalizeGameRoot(transliterated, expectedLength);
  }

  return normalizeGameRoot(value, expectedLength);
};

const toDottedRoot = (plainRoot: string | null | undefined) =>
  plainRoot ? plainRoot.split('').join('.') : '';

const parseLineRoot = (line: string, rootLength: number) => {
  const trimmed = (line || '').split('#')[0].trim();
  if (!trimmed) return null;

  if (hasHebrewChars(trimmed)) {
    const transliterated = transliterateHebrewRoot(trimmed);
    return normalizeGameRoot(transliterated, rootLength);
  }

  return parseRootInput(trimmed, rootLength);
};

const loadRootsFromRaw = (content: string, rootLength = DEFAULT_ROOT_LENGTH) => {
  const roots = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const root = parseLineRoot(line, rootLength);
    if (root) roots.add(root);
  }

  return [...roots].sort();
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

const serializeSuggestion = (value: Partial<RootSuggestion> & { root: string; id: string }): RootSuggestion => ({
  id: value.id,
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

const loadLocalSuggestionState = () => {
  if (localSuggestions && localApprovedRoots) return;

  const storedSuggestions = canUseLocalStorage()
    ? parseStoredArray<RootSuggestion | Partial<RootSuggestion>>(
        window.localStorage.getItem(LOCAL_SUGGESTIONS_STORAGE_KEY),
        [],
      )
    : [];
  const storedApprovedRoots = canUseLocalStorage()
    ? parseStoredArray<string>(window.localStorage.getItem(LOCAL_APPROVED_ROOTS_STORAGE_KEY), [])
    : [];

  localSuggestions = storedSuggestions
    .filter((value): value is Partial<RootSuggestion> & { id: string; root: string } =>
      Boolean(value && typeof value === 'object' && 'id' in value && 'root' in value),
    )
    .map((value) => serializeSuggestion(value))
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
  localApprovedRoots = [
    ...new Set(
      storedApprovedRoots
        .map((value) => parseRootInput(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
};

const persistLocalSuggestionState = () => {
  if (!canUseLocalStorage()) return;
  loadLocalSuggestionState();
  window.localStorage.setItem(LOCAL_SUGGESTIONS_STORAGE_KEY, JSON.stringify(localSuggestions ?? []));
  window.localStorage.setItem(
    LOCAL_APPROVED_ROOTS_STORAGE_KEY,
    JSON.stringify(localApprovedRoots ?? []),
  );
};

const buildStoreFromRoots = (roots: string[]) => {
  const uniqueRoots = [...new Set(roots)].sort();
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
    edgesForRoot.sort((left, right) => left.neighbor.localeCompare(right.neighbor));
  }

  store = {
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

const initializeStore = () => {
  if (store.initialized) return;

  loadLocalSuggestionState();
  const roots = loadRootsFromRaw(rootsRaw, DEFAULT_ROOT_LENGTH);
  const approvedRoots = localApprovedRoots ?? [];
  buildStoreFromRoots([...roots, ...approvedRoots]);
};

const ensureStore = () => {
  initializeStore();
  return store;
};

const normalizeVisited = (visited: unknown) =>
  new Set(Array.isArray(visited) ? visited.map((value) => String(value || '')).filter(Boolean) : []);

const normalizeLetterBankSet = (letterBank: unknown) =>
  new Set(
    Array.isArray(letterBank)
      ? letterBank
          .map((value) => normalizeGameChar(value))
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
  const currentStore = ensureStore();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 5000);
  const typeSet = new Set(normalizeMoveTypes(types));
  const visitedSet = normalizeVisited(visited);
  const letterBankSet = normalizeLetterBankSet(letterBank);
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

const bfs = (start: string, { types, maxDepth = 12 }: { types?: unknown; maxDepth?: number } = {}) => {
  const currentStore = ensureStore();

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

const countRoots = async () => ensureStore().stats.rootsCount;

const rootExists = async (root: string) => ensureStore().rootsByPlain.has(root);

const addRootToStore = (root: string) => {
  const currentStore = ensureStore();
  if (currentStore.rootsByPlain.has(root)) return false;

  const nextRoots = [...currentStore.rootsByPlain.keys(), root];
  buildStoreFromRoots(nextRoots);
  return true;
};

const getNeighbors = async (
  root: string,
  options: {
    types?: unknown;
    limit?: number;
    excludeVisited?: boolean;
    visited?: unknown;
    letterBank?: unknown;
  } = {},
) => getFilteredEdges(root, options);

const getDirectMove = async (
  from: string,
  to: string,
  options: {
    types?: unknown;
    letterBank?: unknown;
  } = {},
) => {
  const edges = getFilteredEdges(from, { ...options, limit: 5000 });
  return edges.find((edge) => edge.neighbor === to) || null;
};

const randomItem = <T,>(items: T[]) => {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
};

const pickRandomRoot = async ({ length = DEFAULT_ROOT_LENGTH, minDegree = 1 } = {}) => {
  const currentStore = ensureStore();
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
  const currentStore = ensureStore();
  const safeMinDepth = Math.max(1, Number(minDepth) || 3);
  const safeMaxDepth = Math.max(safeMinDepth, Math.min(Number(maxDepth) || 10, 20));
  const { distances } = bfs(from, { types, maxDepth: safeMaxDepth });
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

  const { distances, previous } = bfs(from, { types, maxDepth });
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

const normalizeLetterBank = (letterBank: unknown) => {
  if (!Array.isArray(letterBank)) return null;

  const normalized = letterBank
    .map((ch) => normalizeGameChar(ch))
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
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `session-${Math.random().toString(36).slice(2, 10)}`,
    mode: normalizeSessionMode(mode),
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
    letterBank: normalizeLetterBank(letterBank),
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

const getBonusOutcome = (elapsedMs: number, bonusWindowMs: number) => {
  if (elapsedMs <= bonusWindowMs / 3) return { bonusMultiplier: 2, speedTier: 'lightning' };
  if (elapsedMs <= bonusWindowMs / 2) return { bonusMultiplier: 1.5, speedTier: 'rapid' };
  if (elapsedMs <= bonusWindowMs) return { bonusMultiplier: 1, speedTier: 'clean' };
  if (elapsedMs <= bonusWindowMs * 2) return { bonusMultiplier: 2 / 3, speedTier: 'late' };
  return { bonusMultiplier: 1 / 2, speedTier: 'clutch' };
};

const applyInvalidMove = (session: InternalSession, now = getNow()) => {
  session.streak = 0;
  session.combo = createComboState();
  session.updatedAtMs = now;
};

const getNextComboState = (session: InternalSession, moveEdge: NeighborEdge) => {
  if (moveEdge.type === 'SWAP') {
    return {
      permutationChain: session.combo.lastMoveType === 'SWAP' ? session.combo.permutationChain + 1 : 1,
      samePositionChain: 0,
      lastMoveType: 'SWAP' as MoveType,
      lastReplacePosition: null,
    };
  }

  return {
    permutationChain: 0,
    samePositionChain:
      session.combo.lastMoveType === 'REPLACE' && session.combo.lastReplacePosition === moveEdge.positionA
        ? session.combo.samePositionChain + 1
        : 1,
    lastMoveType: 'REPLACE' as MoveType,
    lastReplacePosition: moveEdge.positionA,
  };
};

const getComboSummary = (comboState: InternalSession['combo'], moveEdge: NeighborEdge) => {
  const scoreRule = MOVE_SCORE_RULES[moveEdge.type] || MOVE_SCORE_RULES.REPLACE;
  const comboCount = moveEdge.type === 'SWAP' ? comboState.permutationChain : comboState.samePositionChain;
  const chainBonusScore = Math.max(0, comboCount - 1) * scoreRule.chainStepScore;
  const comboBonusMs = Math.max(0, comboCount - 1) * scoreRule.chainStepTimeMs;

  return {
    activeCombo: moveEdge.type === 'SWAP' ? ('permutation' as ComboKind) : ('same_position' as ComboKind),
    comboCount,
    chainBonusScore,
    comboBonusMs,
    baseScore: scoreRule.baseScore,
    moveBonusMs: scoreRule.moveBonusMs,
  };
};

const applyValidMove = (session: InternalSession, nextRoot: string, moveEdge: NeighborEdge, now = getNow()) => {
  const remainingBeforeMs = computeRemainingMs(session, now);
  if (remainingBeforeMs <= 0) {
    endSession(session, 'timeout', 'game_over', now);
    return null;
  }

  const elapsedMs = Math.max(0, now - session.turnStartedAtMs);
  const { bonusMultiplier, speedTier } = getBonusOutcome(elapsedMs, session.config.bonusWindowMs);
  const comboState = getNextComboState(session, moveEdge);
  const { activeCombo, comboCount, chainBonusScore, comboBonusMs, baseScore, moveBonusMs } =
    getComboSummary(comboState, moveEdge);
  const streakAfterMove = session.streak + 1;
  const streakTier = getStreakTier(streakAfterMove);
  const streakBonusScore = streakTier.scoreBonus;
  const streakBonusMs = streakTier.timeBonusMs;
  const bonusMs =
    Math.round(session.config.bonusBaseMs * bonusMultiplier) +
    moveBonusMs +
    streakBonusMs +
    comboBonusMs;

  session.currentRoot = nextRoot;
  session.visited.add(nextRoot);
  session.moveCount += 1;
  session.streak = streakAfterMove;
  session.combo = comboState;

  const scoreGain = Math.max(
    10,
    Math.round((baseScore + chainBonusScore) * bonusMultiplier) + streakBonusScore,
  );
  session.score += scoreGain;

  session.countdownRemainingMs = remainingBeforeMs + bonusMs;
  session.turnStartedAtMs = now;
  session.updatedAtMs = now;

  return {
    remainingBeforeMs,
    elapsedMs,
    bonusMultiplier,
    speedTier,
    scoreGain,
    bonusMs,
    nextRemainingMs: session.countdownRemainingMs,
    baseScore,
    chainBonusScore,
    streakBonusScore,
    streakBonusMs,
    comboBonusMs,
    activeCombo,
    comboCount,
    permutationChain: comboState.permutationChain,
    samePositionChain: comboState.samePositionChain,
    samePositionIndex: comboState.lastReplacePosition,
    streakAfterMove,
  };
};

const parseBodyRoot = (value: unknown) => parseRootInput(value, DEFAULT_ROOT_LENGTH);

const parseVisitedRoots = (visited: unknown) => {
  if (!Array.isArray(visited)) return [];
  return [...new Set(visited.map((value) => parseBodyRoot(value)).filter((value): value is string => Boolean(value)))];
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
  getNeighbors(session.currentRoot, {
    types: session.types,
    limit,
    excludeVisited: !session.allowRevisit,
    visited: session.allowRevisit ? [] : [...session.visited],
    letterBank: session.letterBank,
  });

const parseMs = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pickRandomDifferentRoot = async (root: string, maxAttempts = 20) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = await pickRandomRoot({ length: DEFAULT_ROOT_LENGTH, minDegree: 0 });
    if (!candidate) return null;
    if (candidate.plain !== root) return candidate;
  }

  return null;
};

const selectPlayableStartRoot = async ({
  requestedRoot,
  types,
  allowRevisit,
  letterBank,
}: {
  requestedRoot: string | null;
  types: unknown;
  allowRevisit: boolean;
  letterBank: string[] | null;
}) => {
  if (requestedRoot) {
    const exists = await rootExists(requestedRoot);
    if (!exists) return { error: 'start_root_not_found' };

    const sampleNeighbors = await getNeighbors(requestedRoot, {
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
    const candidate = await pickRandomRoot({ length: DEFAULT_ROOT_LENGTH, minDegree: 1 });
    if (!candidate) break;

    const sampleNeighbors = await getNeighbors(candidate.plain, {
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
  roots: await countRoots(),
  pendingSuggestions: (localSuggestions ?? []).filter((suggestion) => suggestion.status === 'pending').length,
  storageBackend: 'browser-memory',
  ts: getNow(),
});

const handleListRootSuggestions = async (statusValue: unknown) => {
  loadLocalSuggestionState();
  const status = normalizeSuggestionStatus(statusValue);
  const suggestions =
    status === 'all'
      ? [...(localSuggestions ?? [])]
      : (localSuggestions ?? []).filter((suggestion) => suggestion.status === status);
  return { suggestions };
};

const handleCreateRootSuggestion = async (body: Record<string, unknown>) => {
  loadLocalSuggestionState();

  const root = expectValue(parseBodyRoot(body.root), 400, { error: 'root_is_required' });

  if (await rootExists(root)) {
    fail(409, { error: 'root_already_exists', root });
  }

  const duplicate = (localSuggestions ?? []).find(
    (suggestion) =>
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
  if (decision === 'approve' && !(await rootExists(suggestion.root))) {
    addRootToStore(suggestion.root);
    localApprovedRoots = [...new Set([...(localApprovedRoots ?? []), suggestion.root])].sort();
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
  const safeRoot = expectValue(parseBodyRoot(body.root), 400, { error: 'root is required' });

  const exists = await rootExists(safeRoot);
  if (!exists) fail(404, { error: 'root_not_found', root: safeRoot });

  const types = normalizeMoveTypes(body.types);
  const visited = parseVisitedRoots(body.visited);
  const excludeVisited = Boolean(body.exclude_visited ?? body.excludeVisited ?? false);
  const letterBank = normalizeLetterBank(body.letter_bank ?? body.letterBank);
  const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 5000);
  const edges = await getNeighbors(safeRoot, {
    types,
    limit,
    excludeVisited,
    visited,
    letterBank,
  });

  return formatNeighborPayload(safeRoot, edges);
};

const handleStartSession = async (body: Record<string, unknown>) => {
  const mode = normalizeSessionMode(body.mode);
  const types = normalizeMoveTypes(body.types ?? body.allowedTypes);
  const allowRevisit = Boolean(body.allow_revisit ?? body.allowRevisit ?? false);
  const letterBank = normalizeLetterBank(body.letter_bank ?? body.letterBank);
  const optionsLimit = Math.min(Math.max(Number(body.optionsLimit) || 500, 1), 5000);

  const requestedRoot = parseBodyRoot(body.startRoot ?? body.root);
  const startSelection = await selectPlayableStartRoot({
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
  let targetRoot = parseBodyRoot(body.targetRoot);

  if (mode === 'journey') {
    if (targetRoot) {
      const exists = await rootExists(targetRoot);
      if (!exists) fail(400, { error: 'target_root_not_found' });
      if (targetRoot === startRoot) {
        fail(400, { error: 'target_root_must_differ_from_start_root' });
      }
    } else {
      const generated = await pickJourneyTarget(startRoot, { minDepth: 3, maxDepth: 10 });
      targetRoot = generated?.plain || (await pickRandomDifferentRoot(startRoot))?.plain || null;
    }
  } else {
    targetRoot = null;
  }

  const session = createSession({
    mode,
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

  const candidateRoot = expectValue(parseBodyRoot(body.root), 400, { error: 'root is required' });

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

  const moveEdge = await getDirectMove(session.currentRoot, candidateRoot, {
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
  const safeFrom = expectValue(
    parseBodyRoot(body.fromRoot ?? body.from),
    400,
    { error: 'fromRoot and toRoot are required' },
  );
  const safeTo = expectValue(
    parseBodyRoot(body.toRoot ?? body.to),
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
  const path = await findShortestPath(safeFrom, safeTo, { maxDepth, types });
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
  initializeStore();
  const url = new URL(path, 'https://root-game.local');
  const method = (init?.method || 'GET').toUpperCase();
  const body = parseRequestBody(init);

  if (url.pathname === '/health' && method === 'GET') {
    return (await handleHealth()) as T;
  }

  if (url.pathname === '/api/root-suggestions' && method === 'GET') {
    return (await handleListRootSuggestions(url.searchParams.get('status'))) as T;
  }

  if (url.pathname === '/api/root-suggestions' && method === 'POST') {
    return (await handleCreateRootSuggestion(body)) as T;
  }

  if (url.pathname === '/getNextOptions' && method === 'POST') {
    return (await handleGetNextOptions(body)) as T;
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

  const moveMatch = url.pathname.match(/^\/api\/session\/([^/]+)\/move$/);
  if (moveMatch && method === 'POST') {
    const moveSessionId = moveMatch[1];
    if (!moveSessionId) {
      throw createApiError(404, { error: 'session_not_found' });
    }
    return (await handleMove(decodeURIComponent(moveSessionId), body)) as T;
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
