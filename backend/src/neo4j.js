import neo4j from 'neo4j-driver';
import { config } from './config.js';

let driver;

const toAuth = () => neo4j.auth.basic(config.neo4j.user, config.neo4j.password);

export const getDriver = () => {
  if (!driver) {
    driver = neo4j.driver(config.neo4j.uri, toAuth());
  }
  return driver;
};

export const verifyConnection = async () => {
  await getDriver().verifyConnectivity();
};

const withSession = async (accessMode, query, params = {}) => {
  const session = getDriver().session({
    database: config.neo4j.database,
    defaultAccessMode: accessMode,
  });

  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
};

export const runRead = (query, params = {}) => withSession(neo4j.session.READ, query, params);
export const runWrite = (query, params = {}) => withSession(neo4j.session.WRITE, query, params);

export const closeDriver = async () => {
  if (!driver) return;
  await driver.close();
  driver = undefined;
};

export const toNativeNumber = (value) => {
  if (value == null) return value;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
};
