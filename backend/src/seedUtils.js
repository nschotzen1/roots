import { buildMoveGraph } from './graphBuilder.js';
import {
  clearGraph,
  countRoots,
  ensureSchema,
  upsertGraph,
} from './graphRepository.js';
import { fetchRootsFromUrl, loadRootsFromFile } from './rootSources.js';
import { toDottedRoot } from './transliteration.js';

export const prepareRootRows = (roots) =>
  roots.map((plain) => ({
    plain,
    dotted: toDottedRoot(plain),
    length: plain.length,
  }));

export const seedGraphFromRoots = async (roots, { clearExisting = false } = {}) => {
  const uniqueRoots = [...new Set(roots)].sort();
  if (uniqueRoots.length < 2) {
    throw new Error('Need at least two roots to build a graph.');
  }

  await ensureSchema();

  if (clearExisting) {
    await clearGraph();
  }

  const rootRows = prepareRootRows(uniqueRoots);
  const { edges, swapEdges, replaceEdges } = buildMoveGraph(uniqueRoots);

  await upsertGraph(rootRows, edges);

  return {
    rootsCount: rootRows.length,
    edgesCount: edges.length,
    swapEdges: swapEdges.length,
    replaceEdges: replaceEdges.length,
  };
};

export const seedGraphFromFile = async (
  filePath,
  {
    rootLength = 3,
    clearExisting = false,
  } = {},
) => {
  const roots = await loadRootsFromFile(filePath, rootLength);
  return seedGraphFromRoots(roots, { clearExisting });
};

export const seedGraphFromUrl = async (
  url,
  {
    rootLength = 3,
    clearExisting = false,
  } = {},
) => {
  const roots = await fetchRootsFromUrl(url, rootLength);
  return seedGraphFromRoots(roots, { clearExisting });
};

export const autoSeedIfEmpty = async (filePath, rootLength = 3) => {
  const existing = await countRoots();
  if (existing > 0) {
    return {
      seeded: false,
      existing,
    };
  }

  const stats = await seedGraphFromFile(filePath, {
    rootLength,
    clearExisting: false,
  });

  return {
    seeded: true,
    existing,
    ...stats,
  };
};
