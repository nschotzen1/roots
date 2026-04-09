import path from 'node:path';
import { config } from './config.js';
import { parseCliArgs } from './cliArgs.js';
import { closeDriver, verifyConnection } from './neo4j.js';
import { fetchRootsFromUrl, loadRootsFromFile } from './rootSources.js';
import { seedGraphFromRoots } from './seedUtils.js';

const main = async () => {
  const args = parseCliArgs(process.argv.slice(2));

  const rootLength = Math.max(Number(args.length) || config.defaultRootLength, 2);
  const clearExisting = Boolean(args.clear || args['clear-existing']);

  const sourceFile = args.file
    ? path.resolve(process.cwd(), String(args.file))
    : config.rootsSourceFile;

  const sourceUrl = args.url ? String(args.url) : null;

  await verifyConnection();

  let roots = [];

  if (sourceUrl) {
    console.log(`Fetching roots from URL: ${sourceUrl}`);
    roots = await fetchRootsFromUrl(sourceUrl, rootLength);
  } else {
    console.log(`Loading roots from file: ${sourceFile}`);
    roots = await loadRootsFromFile(sourceFile, rootLength);
  }

  if (roots.length < 2) {
    throw new Error('Insufficient roots to seed graph.');
  }

  const stats = await seedGraphFromRoots(roots, { clearExisting });
  console.log(
    `Seed complete: roots=${stats.rootsCount}, edges=${stats.edgesCount}, swaps=${stats.swapEdges}, replacements=${stats.replaceEdges}`,
  );
};

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await closeDriver();
  })
  .finally(async () => {
    await closeDriver();
  });
