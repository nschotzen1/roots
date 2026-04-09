import { toDottedRoot } from './transliteration.js';

const createEdgeId = (edge) =>
  [
    edge.from,
    edge.to,
    edge.type,
    edge.positionA,
    edge.positionB,
    edge.fromChar,
    edge.toChar,
  ].join('|');

const addEdge = (edgeSet, edges, edge) => {
  const id = createEdgeId(edge);
  if (edgeSet.has(id)) return;
  edgeSet.add(id);
  edges.push({ ...edge, id });
};

export const buildSwapEdges = (roots) => {
  const rootSet = new Set(roots);
  const edgeSet = new Set();
  const edges = [];

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

export const buildReplaceEdges = (roots) => {
  const patternBuckets = new Map();
  const edgeSet = new Set();
  const edges = [];

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

        if (from.index !== to.index) continue;
        if (from.root === to.root) continue;

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

export const buildMoveGraph = (roots) => {
  const swapEdges = buildSwapEdges(roots);
  const replaceEdges = buildReplaceEdges(roots);

  return {
    swapEdges,
    replaceEdges,
    edges: [...swapEdges, ...replaceEdges],
  };
};
