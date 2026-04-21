import { config } from './config.js';
import * as graphRepository from './graphRepository.js';
import * as memoryRepository from './memoryRepository.js';
import { closeDriver, verifyConnection } from './neo4j.js';
import { autoSeedIfEmpty } from './seedUtils.js';
import { DEFAULT_LANGUAGE_MODE, normalizeLanguageMode } from './transliteration.js';

const usesNeo4j = () => config.storageBackend === 'neo4j';

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

export const countRoots = async (language = DEFAULT_LANGUAGE_MODE) =>
  usesNeo4j() && normalizeLanguageMode(language) !== DEFAULT_LANGUAGE_MODE
    ? 0
    : usesNeo4j()
      ? graphRepository.countRoots()
      : memoryRepository.countRoots(language);

export const listRoots = async (language = DEFAULT_LANGUAGE_MODE) =>
  usesNeo4j() && normalizeLanguageMode(language) !== DEFAULT_LANGUAGE_MODE
    ? []
    : usesNeo4j()
      ? graphRepository.listRoots()
      : memoryRepository.listRoots(language);

export const rootExists = async (languageOrRoot, maybeRoot) => {
  if (!usesNeo4j()) return memoryRepository.rootExists(languageOrRoot, maybeRoot);
  const { language, root } = normalizeRootOnlyArgs(languageOrRoot, maybeRoot);
  if (language !== DEFAULT_LANGUAGE_MODE) return false;
  return graphRepository.rootExists(root);
};

export const addRoot = async (languageOrRoot, maybeRoot) => {
  if (!usesNeo4j()) return memoryRepository.addRoot(languageOrRoot, maybeRoot);
  const { language, root } = normalizeRootOnlyArgs(languageOrRoot, maybeRoot);
  if (language !== DEFAULT_LANGUAGE_MODE) {
    throw new Error('neo4j_arabic_graph_not_configured');
  }
  return graphRepository.addRoot(root);
};

export const getNeighbors = async (languageOrRoot, rootOrOptions, maybeOptions) => {
  if (!usesNeo4j()) return memoryRepository.getNeighbors(languageOrRoot, rootOrOptions, maybeOptions);
  const { language, root, options } = normalizeRootArgs(languageOrRoot, rootOrOptions, maybeOptions);
  if (language !== DEFAULT_LANGUAGE_MODE) return [];
  return graphRepository.getNeighbors(root, options);
};

export const getDirectMove = async (languageOrFrom, fromOrTo, toOrOptions, maybeOptions) => {
  if (!usesNeo4j()) {
    return memoryRepository.getDirectMove(languageOrFrom, fromOrTo, toOrOptions, maybeOptions);
  }

  const { language, from, to, options } = normalizeTwoRootArgs(
    languageOrFrom,
    fromOrTo,
    toOrOptions,
    maybeOptions,
  );
  if (language !== DEFAULT_LANGUAGE_MODE) return null;
  return graphRepository.getDirectMove(from, to, options);
};

export const pickRandomRoot = async (languageOrOptions, maybeOptions) => {
  if (!usesNeo4j()) return memoryRepository.pickRandomRoot(languageOrOptions, maybeOptions);
  const { language, options } = normalizeOptionArgs(languageOrOptions, maybeOptions);
  if (language !== DEFAULT_LANGUAGE_MODE) return null;
  return graphRepository.pickRandomRoot(options);
};

export const pickJourneyTarget = async (languageOrFrom, fromOrOptions, maybeOptions) => {
  if (!usesNeo4j()) {
    return memoryRepository.pickJourneyTarget(languageOrFrom, fromOrOptions, maybeOptions);
  }

  const { language, root, options } = normalizeRootArgs(languageOrFrom, fromOrOptions, maybeOptions);
  if (language !== DEFAULT_LANGUAGE_MODE) return null;
  return graphRepository.pickJourneyTarget(root, options);
};

export const findShortestPath = async (languageOrFrom, fromOrTo, toOrOptions, maybeOptions) => {
  if (!usesNeo4j()) {
    return memoryRepository.findShortestPath(languageOrFrom, fromOrTo, toOrOptions, maybeOptions);
  }

  const { language, from, to, options } = normalizeTwoRootArgs(
    languageOrFrom,
    fromOrTo,
    toOrOptions,
    maybeOptions,
  );
  if (language !== DEFAULT_LANGUAGE_MODE) return null;
  return graphRepository.findShortestPath(from, to, options);
};

export const initializeRuntimeRepository = async () => {
  if (usesNeo4j()) {
    await verifyConnection();
    await graphRepository.ensureSchema();

    if (config.autoSeed) {
      const seedResult = await autoSeedIfEmpty(config.rootsSourceFile, config.defaultRootLength);
      return {
        backend: 'neo4j',
        ...seedResult,
      };
    }

    return {
      backend: 'neo4j',
      rootsCount: await graphRepository.countRoots(),
    };
  }

  const rootsByLanguage = {};

  for (const [language, filePath] of Object.entries(config.rootsSourceFiles)) {
    rootsByLanguage[language] = await memoryRepository.initializeMemoryRepositoryFromFile(
      filePath,
      config.defaultRootLength,
      language,
    );
  }

  return {
    backend: 'memory',
    rootsCount: Object.values(rootsByLanguage).reduce(
      (total, stats) => total + (Number(stats.rootsCount) || 0),
      0,
    ),
    rootsByLanguage,
  };
};

export const closeRuntimeRepository = async () => {
  if (usesNeo4j()) {
    await closeDriver();
  }
};
