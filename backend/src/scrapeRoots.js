import path from 'node:path';
import { parseCliArgs } from './cliArgs.js';
import { fetchRootsFromUrl, writeRootsToFile } from './rootSources.js';
import { config } from './config.js';

const DEFAULT_URL = 'https://tora.quest/tnk1/ljon/jorj/index.html';

const main = async () => {
  const args = parseCliArgs(process.argv.slice(2));
  const url = String(args.url || DEFAULT_URL);
  const rootLength = Math.max(Number(args.length) || config.defaultRootLength, 2);
  const outFile = args.out
    ? path.resolve(process.cwd(), String(args.out))
    : path.resolve(process.cwd(), 'data/roots_game_scraped.txt');

  console.log(`Fetching roots from ${url}`);
  const roots = await fetchRootsFromUrl(url, rootLength);

  if (roots.length === 0) {
    throw new Error('No roots were extracted from the page.');
  }

  await writeRootsToFile(outFile, roots);
  console.log(`Saved ${roots.length} roots to ${outFile}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
