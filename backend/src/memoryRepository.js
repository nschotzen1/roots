import { buildMoveGraph } from './graphBuilder.js';
import { normalizeMoveTypes } from './constants.js';
import { loadRootsFromFile } from './rootSources.js';
import { toDottedRoot } from './transliteration.js';

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

let store = createEmptyStore();

const ensureInitialized = () => {
  if (!store.initialized) {
    throw new Error('In-memory graph has not been initialized.');
  }
};

const randomItem = (items) => {
  if (!items || items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] || null;
};

const normalizeVisited = (visited) => new Set(Array.isArray(visited) ? visited.filter(Boolean) : []);
const normalizeLetterBank = (letterBank) =>
  new Set(Array.isArray(letterBank) ? letterBank.filter(Boolean) : []);

const edgePassesFilters = (edge, { typeSet, excludeVisited, visitedSet, hasLetterBank, letterBankSet }) => {
  if (!typeSet.has(edge.type)) return false;
  if (excludeVisited && visitedSet.has(edge.neighbor)) return false;
  if (hasLetterBank && edge.type === 'REPLACE' && !letterBankSet.has(edge.toChar)) return false;
  return true;
};

const getFilteredEdges = (
  root,
  {
    types,
    limit = 100,
    excludeVisited = false,
    visited = [],
    letterBank = null,
  } = {},
) => {
  ensureInitialized();

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

const buildStateFromRoots = (roots, source) => {
  const uniqueRoots = [...new Set(roots)].sort();
  const rootRows = uniqueRoots.map((plain) => ({
    plain,
    dotted: toDottedRoot(plain),
    length: plain.length,
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
    edgesForRoot.sort((left, right) => left.neighbor.localeCompare(right.neighbor));
  }

  store = {
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
    source,
    ...store.stats,
  };
};

const bfs = (start, { types, maxDepth = 12 } = {}) => {
  ensureInitialized();

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

export const initializeMemoryRepositoryFromRoots = async (roots, source = 'memory') => {
  const uniqueRoots = [...new Set(roots)].sort();
  if (uniqueRoots.length < 2) {
    throw new Error('Need at least two roots to build the in-memory graph.');
  }

  return buildStateFromRoots(uniqueRoots, source);
};

export const initializeMemoryRepositoryFromFile = async (filePath, rootLength = 3) => {
  const roots = await loadRootsFromFile(filePath, rootLength);
  return initializeMemoryRepositoryFromRoots(roots, filePath);
};

export const getMemoryRepositoryStats = async () => {
  ensureInitialized();
  return {
    source: store.source,
    ...store.stats,
  };
};

export const countRoots = async () => {
  ensureInitialized();
  return store.stats.rootsCount;
};

export const listRoots = async () => {
  ensureInitialized();
  return [...store.rootsByPlain.keys()].sort();
};

export const rootExists = async (root) => {
  ensureInitialized();
  return store.rootsByPlain.has(root);
};

export const addRoot = async (root) => {
  ensureInitialized();

  if (store.rootsByPlain.has(root)) {
    return {
      added: false,
      ...store.stats,
    };
  }

  return buildStateFromRoots([...store.rootsByPlain.keys(), root], store.source || 'memory');
};

export const getNeighbors = async (root, options = {}) => {
  return getFilteredEdges(root, options);
};

export const getDirectMove = async (from, to, options = {}) => {
  const edges = getFilteredEdges(from, { ...options, limit: 5000 });
  return edges.find((edge) => edge.neighbor === to) || null;
};

export const pickRandomRoot = async ({ length = 3, minDegree = 1 } = {}) => {
  ensureInitialized();

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

export const pickJourneyTarget = async (from, { minDepth = 3, maxDepth = 10, types } = {}) => {
  const safeMinDepth = Math.max(1, Number(minDepth) || 3);
  const safeMaxDepth = Math.max(safeMinDepth, Math.min(Number(maxDepth) || 10, 20));
  const { distances } = bfs(from, { types, maxDepth: safeMaxDepth });

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

export const findShortestPath = async (from, to, { maxDepth = 12, types } = {}) => {
  if (from === to) {
    return {
      path: [from],
      dottedPath: [toDottedRoot(from)],
      distance: 0,
    };
  }

  const { distances, previous } = bfs(from, { types, maxDepth });
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
