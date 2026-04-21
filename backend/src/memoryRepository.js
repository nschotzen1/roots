import { buildMoveGraph } from './graphBuilder.js';
import { normalizeMoveTypes } from './constants.js';
import { loadRootsFromFile } from './rootSources.js';
import {
  DEFAULT_LANGUAGE_MODE,
  normalizeLanguageMode,
  toDottedRoot,
} from './transliteration.js';

const createEmptyStore = () => ({
  initialized: false,
  source: null,
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

const storesByLanguage = {
  hebrew: createEmptyStore(),
  arabic: createEmptyStore(),
};

const getStore = (language = DEFAULT_LANGUAGE_MODE) =>
  storesByLanguage[normalizeLanguageMode(language)];

const ensureInitialized = (language = DEFAULT_LANGUAGE_MODE) => {
  const store = getStore(language);
  if (!store.initialized) {
    throw new Error(`In-memory ${normalizeLanguageMode(language)} graph has not been initialized.`);
  }
  return store;
};

const randomItem = (items) => {
  if (!items || items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] || null;
};

const sortRoots = (roots, language) =>
  [...roots].sort((left, right) =>
    normalizeLanguageMode(language) === 'arabic'
      ? left.localeCompare(right, 'ar')
      : left.localeCompare(right),
  );

const normalizeVisited = (visited) => new Set(Array.isArray(visited) ? visited.filter(Boolean) : []);
const normalizeLetterBank = (letterBank) =>
  new Set(Array.isArray(letterBank) ? letterBank.filter(Boolean) : []);

const normalizeRootArgs = (languageOrRoot, rootOrOptions, maybeOptions) => {
  if (typeof rootOrOptions === 'string') {
    return {
      language: normalizeLanguageMode(languageOrRoot),
      root: rootOrOptions,
      options: maybeOptions || {},
    };
  }

  return {
    language: DEFAULT_LANGUAGE_MODE,
    root: languageOrRoot,
    options: rootOrOptions || {},
  };
};

const normalizeRootOnlyArgs = (languageOrRoot, maybeRoot) => {
  if (typeof maybeRoot === 'string') {
    return {
      language: normalizeLanguageMode(languageOrRoot),
      root: maybeRoot,
    };
  }

  return {
    language: DEFAULT_LANGUAGE_MODE,
    root: languageOrRoot,
  };
};

const normalizeTwoRootArgs = (languageOrFrom, fromOrTo, toOrOptions, maybeOptions) => {
  if (typeof toOrOptions === 'string') {
    return {
      language: normalizeLanguageMode(languageOrFrom),
      from: fromOrTo,
      to: toOrOptions,
      options: maybeOptions || {},
    };
  }

  return {
    language: DEFAULT_LANGUAGE_MODE,
    from: languageOrFrom,
    to: fromOrTo,
    options: toOrOptions || {},
  };
};

const normalizeOptionArgs = (languageOrOptions, maybeOptions) => {
  if (typeof languageOrOptions === 'string') {
    return {
      language: normalizeLanguageMode(languageOrOptions),
      options: maybeOptions || {},
    };
  }

  return {
    language: DEFAULT_LANGUAGE_MODE,
    options: languageOrOptions || {},
  };
};

const edgePassesFilters = (edge, { typeSet, excludeVisited, visitedSet, hasLetterBank, letterBankSet }) => {
  if (!typeSet.has(edge.type)) return false;
  if (excludeVisited && visitedSet.has(edge.neighbor)) return false;
  if (hasLetterBank && edge.type === 'REPLACE' && !letterBankSet.has(edge.toChar)) return false;
  return true;
};

const getFilteredEdges = (
  language,
  root,
  {
    types,
    limit = 100,
    excludeVisited = false,
    visited = [],
    letterBank = null,
  } = {},
) => {
  const store = ensureInitialized(language);

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 5000);
  const typeSet = new Set(normalizeMoveTypes(types));
  const visitedSet = normalizeVisited(visited);
  const letterBankSet = normalizeLetterBank(letterBank);
  const hasLetterBank = letterBankSet.size > 0;
  const edges = store.adjacencyByRoot.get(root) || [];

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

const buildStateFromRoots = (roots, source, language = DEFAULT_LANGUAGE_MODE) => {
  const normalizedLanguage = normalizeLanguageMode(language);
  const uniqueRoots = sortRoots(new Set(roots), normalizedLanguage);
  const rootRows = uniqueRoots.map((plain) => ({
    plain,
    dotted: toDottedRoot(plain),
    length: Array.from(plain).length,
  }));

  const rootsByPlain = new Map();
  const rootsByLength = new Map();
  const adjacencyByRoot = new Map();

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

  const { edges, swapEdges, replaceEdges } = buildMoveGraph(uniqueRoots);

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
      normalizedLanguage === 'arabic'
        ? left.neighbor.localeCompare(right.neighbor, 'ar')
        : left.neighbor.localeCompare(right.neighbor),
    );
  }

  storesByLanguage[normalizedLanguage] = {
    initialized: true,
    source,
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

  return {
    language: normalizedLanguage,
    source,
    ...storesByLanguage[normalizedLanguage].stats,
  };
};

const bfs = (language, start, { types, maxDepth = 12 } = {}) => {
  const store = ensureInitialized(language);

  if (!store.rootsByPlain.has(start)) {
    return {
      distances: new Map(),
      previous: new Map(),
    };
  }

  const safeMaxDepth = Math.max(1, Math.min(Number(maxDepth) || 12, 25));
  const typeSet = new Set(normalizeMoveTypes(types));
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const root = queue[index];
    const depth = distances.get(root) ?? 0;

    if (depth >= safeMaxDepth) {
      continue;
    }

    const edges = store.adjacencyByRoot.get(root) || [];
    for (const edge of edges) {
      if (!typeSet.has(edge.type)) continue;
      if (distances.has(edge.neighbor)) continue;

      distances.set(edge.neighbor, depth + 1);
      previous.set(edge.neighbor, root);
      queue.push(edge.neighbor);
    }
  }

  return { distances, previous };
};

export const initializeMemoryRepositoryFromRoots = async (
  roots,
  source = 'memory',
  language = DEFAULT_LANGUAGE_MODE,
) => {
  const uniqueRoots = sortRoots(new Set(roots), language);
  if (uniqueRoots.length < 2) {
    throw new Error('Need at least two roots to build the in-memory graph.');
  }

  return buildStateFromRoots(uniqueRoots, source, language);
};

export const initializeMemoryRepositoryFromFile = async (
  filePath,
  rootLength = 3,
  language = DEFAULT_LANGUAGE_MODE,
) => {
  const roots = await loadRootsFromFile(filePath, rootLength, language);
  return initializeMemoryRepositoryFromRoots(roots, filePath, language);
};

export const getMemoryRepositoryStats = async (language = DEFAULT_LANGUAGE_MODE) => {
  const normalizedLanguage = normalizeLanguageMode(language);
  const store = ensureInitialized(normalizedLanguage);
  return {
    language: normalizedLanguage,
    source: store.source,
    ...store.stats,
  };
};

export const countRoots = async (language = DEFAULT_LANGUAGE_MODE) => {
  const store = ensureInitialized(language);
  return store.stats.rootsCount;
};

export const listRoots = async (language = DEFAULT_LANGUAGE_MODE) => {
  const normalizedLanguage = normalizeLanguageMode(language);
  const store = ensureInitialized(normalizedLanguage);
  return sortRoots(store.rootsByPlain.keys(), normalizedLanguage);
};

export const rootExists = async (languageOrRoot, maybeRoot) => {
  const { language, root } = normalizeRootOnlyArgs(languageOrRoot, maybeRoot);
  const store = ensureInitialized(language);
  return store.rootsByPlain.has(root);
};

export const addRoot = async (languageOrRoot, maybeRoot) => {
  const { language, root } = normalizeRootOnlyArgs(languageOrRoot, maybeRoot);
  const store = ensureInitialized(language);

  if (store.rootsByPlain.has(root)) {
    return {
      added: false,
      language,
      ...store.stats,
    };
  }

  return {
    added: true,
    ...(await buildStateFromRoots([...store.rootsByPlain.keys(), root], store.source || 'memory', language)),
  };
};

export const getNeighbors = async (languageOrRoot, rootOrOptions, maybeOptions) => {
  const { language, root, options } = normalizeRootArgs(languageOrRoot, rootOrOptions, maybeOptions);
  return getFilteredEdges(language, root, options);
};

export const getDirectMove = async (languageOrFrom, fromOrTo, toOrOptions, maybeOptions) => {
  const { language, from, to, options } = normalizeTwoRootArgs(
    languageOrFrom,
    fromOrTo,
    toOrOptions,
    maybeOptions,
  );
  const edges = getFilteredEdges(language, from, { ...options, limit: 5000 });
  return edges.find((edge) => edge.neighbor === to) || null;
};

export const pickRandomRoot = async (languageOrOptions, maybeOptions) => {
  const {
    language,
    options: { length = 3, minDegree = 1 } = {},
  } = normalizeOptionArgs(languageOrOptions, maybeOptions);
  const store = ensureInitialized(language);

  const candidates = (store.rootsByLength.get(Number(length)) || []).filter((root) => {
    const degree = (store.adjacencyByRoot.get(root.plain) || []).length;
    return degree >= Number(minDegree);
  });

  const selected = randomItem(candidates);
  if (!selected) return null;

  return {
    plain: selected.plain,
    dotted: selected.dotted,
    degree: (store.adjacencyByRoot.get(selected.plain) || []).length,
  };
};

export const pickJourneyTarget = async (languageOrFrom, fromOrOptions, maybeOptions) => {
  const { language, root: from, options } = normalizeRootArgs(
    languageOrFrom,
    fromOrOptions,
    maybeOptions,
  );
  const { minDepth = 3, maxDepth = 10, types } = options || {};
  const safeMinDepth = Math.max(1, Number(minDepth) || 3);
  const safeMaxDepth = Math.max(safeMinDepth, Math.min(Number(maxDepth) || 10, 20));
  const store = ensureInitialized(language);
  const { distances } = bfs(language, from, { types, maxDepth: safeMaxDepth });

  const candidates = [];
  for (const [root, distance] of distances.entries()) {
    if (root === from) continue;
    if (distance < safeMinDepth || distance > safeMaxDepth) continue;

    const rootRow = store.rootsByPlain.get(root);
    if (!rootRow) continue;

    candidates.push({
      plain: rootRow.plain,
      dotted: rootRow.dotted,
      distance,
    });
  }

  return randomItem(candidates);
};

export const findShortestPath = async (languageOrFrom, fromOrTo, toOrOptions, maybeOptions) => {
  const { language, from, to, options } = normalizeTwoRootArgs(
    languageOrFrom,
    fromOrTo,
    toOrOptions,
    maybeOptions,
  );
  const { maxDepth = 12, types } = options || {};

  if (from === to) {
    return {
      path: [from],
      dottedPath: [toDottedRoot(from)],
      distance: 0,
    };
  }

  const { distances, previous } = bfs(language, from, { types, maxDepth });
  if (!distances.has(to)) {
    return null;
  }

  const path = [];
  let cursor = to;

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
