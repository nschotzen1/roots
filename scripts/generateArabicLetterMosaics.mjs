#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARABIC_MOSAIC_LETTER_BY_CHAR } from './arabicLetterMosaicMetadata.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const LETTER_ASSETS_SOURCE = path.join(REPO_ROOT, 'src/game/letterAssets.ts');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'public/letters/arabic');
const TMP_DIR = path.join(REPO_ROOT, 'tmp/imagegen');
const PROMPTS_DIR = path.join(REPO_ROOT, 'output/imagegen/arabic-mosaic-prompts');
const MANIFEST_PATH = path.join(PROMPTS_DIR, 'manifest.json');
const JSONL_PATH = path.join(TMP_DIR, 'arabic-mosaic-letters.jsonl');
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
const IMAGE_GEN =
  process.env.IMAGE_GEN ?? path.join(CODEX_HOME, 'skills/imagegen/scripts/image_gen.py');

const DEFAULT_MODEL = 'gpt-image-1.5';
const DEFAULT_QUALITY = 'high';
const DEFAULT_CONCURRENCY = 3;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    only: [],
    force: false,
    dryRun: false,
    promptOnly: false,
    list: false,
    quality: DEFAULT_QUALITY,
    model: DEFAULT_MODEL,
    concurrency: DEFAULT_CONCURRENCY,
    outDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--force') {
      options.force = true;
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (token === '--prompt-only') {
      options.promptOnly = true;
      continue;
    }

    if (token === '--list') {
      options.list = true;
      continue;
    }

    if (token === '--only') {
      const value = argv[index + 1];
      if (!value) fail('missing value after --only');
      options.only.push(value);
      index += 1;
      continue;
    }

    if (token === '--quality') {
      const value = argv[index + 1];
      if (!value) fail('missing value after --quality');
      options.quality = value;
      index += 1;
      continue;
    }

    if (token === '--model') {
      const value = argv[index + 1];
      if (!value) fail('missing value after --model');
      options.model = value;
      index += 1;
      continue;
    }

    if (token === '--concurrency') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) fail('invalid value after --concurrency');
      options.concurrency = value;
      index += 1;
      continue;
    }

    if (token === '--out-dir') {
      const value = argv[index + 1];
      if (!value) fail('missing value after --out-dir');
      options.outDir = path.resolve(REPO_ROOT, value);
      index += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }

    fail(`unknown argument: ${token}`);
  }

  return options;
}

function printHelp() {
  console.log(`Generate Arabic mosaic letter PNGs with the OpenAI image batch CLI.

Usage:
  node scripts/generateArabicLetterMosaics.mjs [options]

Options:
  --only <list>         Comma-separated file stems or Arabic letters, e.g. hh,ayn or ح,ع
  --force               Overwrite existing PNGs in public/letters/arabic
  --dry-run             Build prompts and preview the image batch payload without calling the API
  --prompt-only         Write prompt previews + JSONL, but do not invoke the image CLI
  --list                Print the available file stems and letters
  --quality <value>     low | medium | high | auto (default: ${DEFAULT_QUALITY})
  --model <value>       Image model to use (default: ${DEFAULT_MODEL})
  --concurrency <n>     Batch concurrency for live runs (default: ${DEFAULT_CONCURRENCY})
  --out-dir <path>      Output directory (default: public/letters/arabic)
`);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function readArabicAssetMap() {
  const source = await fs.readFile(LETTER_ASSETS_SOURCE, 'utf8');
  const match = source.match(/export const ARABIC_LETTER_TO_FILE_STEM:[^=]+=\s*{([\s\S]*?)\n};/);

  if (!match) {
    fail(`could not parse ARABIC_LETTER_TO_FILE_STEM from ${LETTER_ASSETS_SOURCE}`);
  }

  const entries = [];
  for (const line of match[1].split('\n')) {
    const parsed = line.trim().match(/^(.+?):\s*'(.+?)',?$/);
    if (!parsed) continue;
    entries.push({ letter: parsed[1], fileStem: parsed[2] });
  }

  if (entries.length === 0) {
    fail(`no Arabic asset mappings found in ${LETTER_ASSETS_SOURCE}`);
  }

  return entries;
}

function buildJob(entry) {
  const primaryRequest = [
    `Create a portrait floor mosaic panel for the Arabic letter ${entry.letter} (${entry.label}).`,
    `The central glyph must be one large, unmistakably legible ${entry.letter} rendered in deep cobalt and lapis tesserae with a warm ochre outline, centered on an aged limestone field.`,
    `Let the border, corners, and framing bands express ${entry.theme}.`,
    entry.motif,
    'Keep the symbolic storytelling mostly in the frame and corners so the center remains calm, readable, and suitable for gameplay.',
  ].join(' ');

  return {
    prompt: primaryRequest,
    out: `${entry.fileStem}.png`,
    use_case: 'historical-scene',
    scene:
      'A vertically framed Roman provincial floor mosaic from the Near East around the 2nd century CE, with a complete ornamental border surrounding a central letter panel',
    subject: `A single centered Arabic glyph ${entry.letter}, with symbolic ornament derived from ${entry.theme}`,
    style:
      'hand-laid limestone and glass tesserae, master-craftsman floor mosaic, archaeological and historically grounded, symmetrical and richly bordered',
    composition:
      'portrait 2:3 panel, fully framed on all four sides, one large central glyph, broad ornamental border, quiet open center field',
    lighting: 'even natural light, subtle age and wear, dignified and handmade rather than glossy',
    palette: 'ivory limestone, lapis blue, ochre gold, terracotta, muted teal, warm brown grout',
    materials: 'stone and glass tesserae, visible grout lines, slightly worn floor surface, hand-cut mosaic pieces',
    text: entry.letter,
    constraints: [
      `show exactly one centered Arabic glyph: ${entry.letter}`,
      'keep the center field uncluttered',
      'put most symbolic detail into the border, corner spandrels, and framing panels',
      'make the layout symmetrical and complete on all four sides',
      'make the craftsmanship feel handmade by ancient mosaicists',
      'preserve the correct dots or hamza marks for the intended letter',
    ].join('; '),
    negative:
      'Latin text, labels, extra words, extra Arabic letters, modern graphic design, glossy digital gradients, poster layout, empty white background, asymmetry, cluttered center',
    size: '1024x1536',
    quality: entry.quality ?? DEFAULT_QUALITY,
  };
}

function renderPromptPreview(job) {
  return [
    `Use case: ${job.use_case}`,
    `Primary request: ${job.prompt}`,
    `Scene/background: ${job.scene}`,
    `Subject: ${job.subject}`,
    `Style/medium: ${job.style}`,
    `Composition/framing: ${job.composition}`,
    `Lighting/mood: ${job.lighting}`,
    `Color palette: ${job.palette}`,
    `Materials/textures: ${job.materials}`,
    `Text (verbatim): "${job.text}"`,
    `Constraints: ${job.constraints}`,
    `Avoid: ${job.negative}`,
  ].join('\n');
}

function normalizeSelectors(values) {
  return new Set(
    values
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const effectiveDryRun = options.dryRun || !process.env.OPENAI_API_KEY;
  const selectedTokens = normalizeSelectors(options.only);
  const assetEntries = await readArabicAssetMap();

  const mergedEntries = assetEntries.map(({ letter, fileStem }) => {
    const metadata = ARABIC_MOSAIC_LETTER_BY_CHAR.get(letter);
    if (!metadata) fail(`missing mosaic metadata for Arabic letter ${letter}`);

    return {
      ...metadata,
      fileStem,
      outPath: path.join(options.outDir, `${fileStem}.png`),
      quality: options.quality,
    };
  });

  if (options.list) {
    for (const entry of mergedEntries) {
      console.log(`${entry.fileStem}\t${entry.letter}\t${entry.label}`);
    }
    return;
  }

  const selectedEntries = selectedTokens.size
    ? mergedEntries.filter(
        (entry) => selectedTokens.has(entry.fileStem) || selectedTokens.has(entry.letter),
      )
    : mergedEntries;

  if (selectedEntries.length === 0) {
    fail('no letters matched --only');
  }

  const skippedExisting = [];
  const jobEntries = [];

  for (const entry of selectedEntries) {
    if (!options.force && (await fileExists(entry.outPath))) {
      skippedExisting.push(entry.fileStem);
      continue;
    }

    jobEntries.push(entry);
  }

  await fs.mkdir(options.outDir, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(PROMPTS_DIR, { recursive: true });

  const manifest = [];
  const jsonlLines = [];

  for (const entry of jobEntries) {
    const job = buildJob(entry);
    const previewPath = path.join(PROMPTS_DIR, `${entry.fileStem}.txt`);
    const preview = renderPromptPreview(job);

    await fs.writeFile(previewPath, `${preview}\n`, 'utf8');
    manifest.push({
      letter: entry.letter,
      label: entry.label,
      fileStem: entry.fileStem,
      previewPath,
      outputPath: entry.outPath,
    });
    jsonlLines.push(JSON.stringify(job));
  }

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(JSONL_PATH, jsonlLines.join('\n') + (jsonlLines.length ? '\n' : ''), 'utf8');

  console.log(`Prepared ${jobEntries.length} Arabic mosaic prompt job(s).`);
  if (skippedExisting.length > 0) {
    console.log(`Skipped existing PNGs: ${skippedExisting.join(', ')}`);
  }
  console.log(`Prompt previews: ${PROMPTS_DIR}`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Batch JSONL: ${JSONL_PATH}`);

  if (jobEntries.length === 0) {
    console.log('Nothing left to generate. Use --force to regenerate existing letters.');
    return;
  }

  if (options.promptOnly) {
    console.log('Prompt-only mode enabled. No image generation command was started.');
    return;
  }

  if (!(await fileExists(IMAGE_GEN))) {
    fail(`image generation CLI not found at ${IMAGE_GEN}`);
  }

  if (effectiveDryRun && !options.dryRun && !process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY is not set, so the run is being downgraded to --dry-run.');
  }

  const runner =
    effectiveDryRun || !(await commandExists('uv'))
      ? { command: 'python3', args: [IMAGE_GEN] }
      : { command: 'uv', args: ['run', '--with', 'openai', '--with', 'pillow', 'python', IMAGE_GEN] };

  const imageGenArgs = [
    ...runner.args,
    'generate-batch',
    '--input',
    JSONL_PATH,
    '--out-dir',
    options.outDir,
    '--model',
    options.model,
    '--quality',
    options.quality,
    '--concurrency',
    String(options.concurrency),
  ];

  if (options.force) imageGenArgs.push('--force');
  if (effectiveDryRun) imageGenArgs.push('--dry-run');

  console.log(`Running: ${runner.command} ${imageGenArgs.join(' ')}`);
  await runCommand(runner.command, imageGenArgs);

  if (!effectiveDryRun) {
    await fs.rm(JSONL_PATH, { force: true });
    console.log(`Removed temporary batch file ${JSONL_PATH}`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
