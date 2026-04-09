import { runRead, runWrite, toNativeNumber } from './neo4j.js';
import { normalizeMoveTypes } from './constants.js';
import { buildMoveGraph } from './graphBuilder.js';
import { toDottedRoot } from './transliteration.js';

const chunk = (items, size) => {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
};

export const ensureSchema = async () => {
  await runWrite('CREATE CONSTRAINT root_plain_unique IF NOT EXISTS FOR (r:Root) REQUIRE r.plain IS UNIQUE');
};

export const clearGraph = async () => {
  await runWrite('MATCH (r:Root) DETACH DELETE r');
};

export const countRoots = async () => {
  const result = await runRead('MATCH (r:Root) RETURN count(r) AS count');
  const value = result.records[0]?.get('count') || 0;
  return toNativeNumber(value);
};

export const listRoots = async () => {
  const result = await runRead('MATCH (r:Root) RETURN r.plain AS plain ORDER BY plain');
  return result.records.map((record) => record.get('plain'));
};

export const upsertGraph = async (roots, edges) => {
  const nodeRows = roots.map((root) => ({
    plain: root.plain,
    dotted: root.dotted,
    length: root.length,
  }));

  const edgeRows = edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    positionA: edge.positionA,
    positionB: edge.positionB,
    fromChar: edge.fromChar,
    toChar: edge.toChar,
    fromDotted: edge.fromDotted,
    toDotted: edge.toDotted,
  }));

  for (const rows of chunk(nodeRows, 5000)) {
    await runWrite(
      `
        UNWIND $rows AS row
        MERGE (r:Root {plain: row.plain})
        SET r.dotted = row.dotted,
            r.length = row.length
      `,
      { rows },
    );
  }

  for (const rows of chunk(edgeRows, 5000)) {
    await runWrite(
      `
        UNWIND $rows AS row
        MATCH (a:Root {plain: row.from})
        MATCH (b:Root {plain: row.to})
        MERGE (a)-[m:MOVE {id: row.id}]->(b)
        SET m.type = row.type,
            m.positionA = row.positionA,
            m.positionB = row.positionB,
            m.fromChar = row.fromChar,
            m.toChar = row.toChar,
            m.fromDotted = row.fromDotted,
            m.toDotted = row.toDotted
      `,
      { rows },
    );
  }
};

export const rootExists = async (root) => {
  const result = await runRead('MATCH (r:Root {plain: $root}) RETURN count(r) > 0 AS exists', { root });
  return Boolean(result.records[0]?.get('exists'));
};

export const addRoot = async (root) => {
  if (await rootExists(root)) {
    return { added: false };
  }

  const roots = await listRoots();
  const nextRoots = [...new Set([...roots, root])].sort();
  const { edges } = buildMoveGraph(nextRoots);
  const relevantEdges = edges.filter((edge) => edge.from === root || edge.to === root);

  await upsertGraph(
    [
      {
        plain: root,
        dotted: toDottedRoot(root),
        length: root.length,
      },
    ],
    relevantEdges,
  );

  return {
    added: true,
    edgesAdded: relevantEdges.length,
  };
};

export const getNeighbors = async (
  root,
  {
    types,
    limit = 100,
    excludeVisited = false,
    visited = [],
    letterBank = null,
  } = {},
) => {
  const normalizedTypes = normalizeMoveTypes(types);
  const normalizedVisited = Array.isArray(visited) ? [...new Set(visited)] : [];
  const normalizedLetterBank = Array.isArray(letterBank) ? [...new Set(letterBank)] : [];
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 5000);

  const result = await runRead(
    `
      MATCH (r:Root {plain: $root})-[m:MOVE]->(n:Root)
      WHERE ($typesCount = 0 OR m.type IN $types)
        AND ($excludeVisited = false OR NOT n.plain IN $visited)
        AND ($hasLetterBank = false OR m.type <> 'REPLACE' OR m.toChar IN $letterBank)
      RETURN n.plain AS neighbor,
             n.dotted AS neighborDotted,
             m.type AS type,
             m.positionA AS positionA,
             m.positionB AS positionB,
             m.fromChar AS fromChar,
             m.toChar AS toChar,
             m.fromDotted AS fromDotted,
             m.toDotted AS toDotted
      ORDER BY neighbor
      LIMIT $limit
    `,
    {
      root,
      types: normalizedTypes,
      typesCount: normalizedTypes.length,
      limit: safeLimit,
      excludeVisited: Boolean(excludeVisited),
      visited: normalizedVisited,
      hasLetterBank: normalizedLetterBank.length > 0,
      letterBank: normalizedLetterBank,
    },
  );

  return result.records.map((record) => ({
    neighbor: record.get('neighbor'),
    neighborDotted: record.get('neighborDotted'),
    type: record.get('type'),
    positionA: toNativeNumber(record.get('positionA')),
    positionB: toNativeNumber(record.get('positionB')),
    fromChar: record.get('fromChar'),
    toChar: record.get('toChar'),
    fromDotted: record.get('fromDotted'),
    toDotted: record.get('toDotted'),
  }));
};

export const getDirectMove = async (
  from,
  to,
  {
    types,
    letterBank = null,
  } = {},
) => {
  const normalizedTypes = normalizeMoveTypes(types);
  const normalizedLetterBank = Array.isArray(letterBank) ? [...new Set(letterBank)] : [];

  const result = await runRead(
    `
      MATCH (a:Root {plain: $from})-[m:MOVE]->(b:Root {plain: $to})
      WHERE ($typesCount = 0 OR m.type IN $types)
        AND ($hasLetterBank = false OR m.type <> 'REPLACE' OR m.toChar IN $letterBank)
      RETURN m.type AS type,
             m.positionA AS positionA,
             m.positionB AS positionB,
             m.fromChar AS fromChar,
             m.toChar AS toChar,
             m.fromDotted AS fromDotted,
             m.toDotted AS toDotted
      LIMIT 1
    `,
    {
      from,
      to,
      types: normalizedTypes,
      typesCount: normalizedTypes.length,
      hasLetterBank: normalizedLetterBank.length > 0,
      letterBank: normalizedLetterBank,
    },
  );

  const row = result.records[0];
  if (!row) return null;

  return {
    type: row.get('type'),
    positionA: toNativeNumber(row.get('positionA')),
    positionB: toNativeNumber(row.get('positionB')),
    fromChar: row.get('fromChar'),
    toChar: row.get('toChar'),
    fromDotted: row.get('fromDotted'),
    toDotted: row.get('toDotted'),
  };
};

export const pickRandomRoot = async ({ length = 3, minDegree = 1 } = {}) => {
  const result = await runRead(
    `
      MATCH (r:Root)
      WHERE r.length = $length
      WITH r, size((r)-[:MOVE]->()) AS degree
      WHERE degree >= $minDegree
      RETURN r.plain AS plain, r.dotted AS dotted, degree
      ORDER BY rand()
      LIMIT 1
    `,
    {
      length: Number(length),
      minDegree: Number(minDegree),
    },
  );

  const row = result.records[0];
  if (!row) return null;

  return {
    plain: row.get('plain'),
    dotted: row.get('dotted'),
    degree: toNativeNumber(row.get('degree')),
  };
};

export const pickJourneyTarget = async (from, { minDepth = 3, maxDepth = 10 } = {}) => {
  const safeMin = Math.max(1, Number(minDepth) || 3);
  const safeMax = Math.max(safeMin, Math.min(Number(maxDepth) || 10, 20));

  const result = await runRead(
    `
      MATCH p = shortestPath((s:Root {plain: $from})-[:MOVE*..${safeMax}]->(t:Root))
      WHERE t.plain <> $from
      WITH t, p, length(p) AS dist
      WHERE dist >= $minDepth AND dist <= $maxDepth
      RETURN t.plain AS plain, t.dotted AS dotted, dist
      ORDER BY rand()
      LIMIT 1
    `,
    {
      from,
      minDepth: safeMin,
      maxDepth: safeMax,
    },
  );

  const row = result.records[0];
  if (!row) return null;

  return {
    plain: row.get('plain'),
    dotted: row.get('dotted'),
    distance: toNativeNumber(row.get('dist')),
  };
};

export const findShortestPath = async (from, to, { maxDepth = 12, types } = {}) => {
  const safeMaxDepth = Math.max(1, Math.min(Number(maxDepth) || 12, 25));
  const normalizedTypes = normalizeMoveTypes(types);

  const result = await runRead(
    `
      MATCH p = (a:Root {plain: $from})-[:MOVE*1..${safeMaxDepth}]->(b:Root {plain: $to})
      WHERE all(rel IN relationships(p) WHERE ($typesCount = 0 OR rel.type IN $types))
      RETURN [node IN nodes(p) | node.plain] AS path,
             [node IN nodes(p) | node.dotted] AS dottedPath,
             length(p) AS distance
      ORDER BY distance ASC
      LIMIT 1
    `,
    {
      from,
      to,
      types: normalizedTypes,
      typesCount: normalizedTypes.length,
    },
  );

  const row = result.records[0];
  if (!row) return null;

  return {
    path: row.get('path'),
    dottedPath: row.get('dottedPath'),
    distance: toNativeNumber(row.get('distance')),
  };
};
