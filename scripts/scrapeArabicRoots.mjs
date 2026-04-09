#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CATEGORY_TITLE = 'Category:Arabic 3-letter roots';
const API_BASE = 'https://en.wiktionary.org/w/api.php';
const ROOT_CATEGORY_PREFIX = 'Category:Arabic terms belonging to the root ';
const OUTPUT_PATH = process.argv[2] || 'src/game/data/roots_arabic_scraped.txt';

const ARABIC_ROOT_CHAR_SET = new Set(
  Array.from('ءآأؤإئابتثجحخدذرزسشصضطظعغفقكلمنهوي'),
);

const normalizeArabicRoot = (value) => {
  const cleaned = String(value || '')
    .replace(/[._,\s-]+/g, '')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ٱ/g, 'ا')
    .replace(/ى/g, 'ي');

  let output = '';

  for (const ch of cleaned) {
    if (ARABIC_ROOT_CHAR_SET.has(ch)) {
      output += ch;
    }
  }

  return output.length === 3 ? output : null;
};

const fetchCategoryBatch = async (continueToken) => {
  const url = new URL(API_BASE);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'categorymembers');
  url.searchParams.set('cmtitle', CATEGORY_TITLE);
  url.searchParams.set('cmnamespace', '14');
  url.searchParams.set('cmlimit', 'max');
  url.searchParams.set('format', 'json');

  if (continueToken?.cmcontinue) {
    url.searchParams.set('cmcontinue', continueToken.cmcontinue);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wiktionary request failed (${response.status})`);
  }

  return response.json();
};

const collectRoots = async () => {
  const roots = new Set();
  let continueToken = null;

  do {
    const payload = await fetchCategoryBatch(continueToken);
    const members = payload?.query?.categorymembers ?? [];

    for (const member of members) {
      const title = String(member?.title || '');
      if (!title.startsWith(ROOT_CATEGORY_PREFIX)) continue;

      const rawRoot = title.slice(ROOT_CATEGORY_PREFIX.length);
      const root = normalizeArabicRoot(rawRoot);
      if (root) {
        roots.add(root);
      }
    }

    continueToken = payload?.continue ?? null;
  } while (continueToken?.cmcontinue);

  return [...roots].sort((left, right) => left.localeCompare(right, 'ar'));
};

const main = async () => {
  const roots = await collectRoots();
  if (roots.length === 0) {
    throw new Error('No Arabic roots were scraped from Wiktionary');
  }

  const outputPath = path.resolve(process.cwd(), OUTPUT_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const header = [
    '# Arabic triliteral roots scraped from Wiktionary category data.',
    '# Source category: https://en.wiktionary.org/wiki/Category:Arabic_terms_by_root',
    '# Source API: https://en.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Arabic%203-letter%20roots&cmnamespace=14&cmlimit=max&format=json',
    '# License: Creative Commons Attribution-ShareAlike (via Wiktionary)',
    `# Generated: ${new Date().toISOString()}`,
    '',
  ].join('\n');

  await writeFile(outputPath, `${header}${roots.join('\n')}\n`, 'utf8');
  process.stdout.write(`Wrote ${roots.length} Arabic roots to ${outputPath}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
