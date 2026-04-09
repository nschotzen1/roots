import { config } from './config.js';
import * as graphRepository from './graphRepository.js';
import * as memoryRepository from './memoryRepository.js';
import { closeDriver, verifyConnection } from './neo4j.js';
import { autoSeedIfEmpty } from './seedUtils.js';

const usesNeo4j = () => config.storageBackend === 'neo4j';
const getRepository = () => (usesNeo4j() ? graphRepository : memoryRepository);

const delegate = (method) => (...args) => getRepository()[method](...args);

export const countRoots = delegate('countRoots');
export const listRoots = delegate('listRoots');
export const rootExists = delegate('rootExists');
export const addRoot = delegate('addRoot');
export const getNeighbors = delegate('getNeighbors');
export const getDirectMove = delegate('getDirectMove');
export const pickRandomRoot = delegate('pickRandomRoot');
export const pickJourneyTarget = delegate('pickJourneyTarget');
export const findShortestPath = delegate('findShortestPath');

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

  const memoryStats = await memoryRepository.initializeMemoryRepositoryFromFile(
    config.rootsSourceFile,
    config.defaultRootLength,
  );

  return {
    backend: 'memory',
    ...memoryStats,
  };
};

export const closeRuntimeRepository = async () => {
  if (usesNeo4j()) {
    await closeDriver();
  }
};
