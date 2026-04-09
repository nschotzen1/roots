import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { toDottedRoot } from './transliteration.js';

let memorySuggestions = [];
let memoryApprovedRoots = new Set();

const usesMemoryStore = () => config.rootSuggestionsBackend === 'memory';

const ensureParentDir = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const readJsonFile = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
};

const writeJsonFile = async (filePath, value) => {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const readTextLines = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const serializeSuggestion = (suggestion) => ({
  id: suggestion.id,
  root: suggestion.root,
  dottedRoot: suggestion.dottedRoot || toDottedRoot(suggestion.root),
  status: suggestion.status,
  note: suggestion.note || null,
  reviewNote: suggestion.reviewNote || null,
  createdAtMs: Number(suggestion.createdAtMs) || Date.now(),
  updatedAtMs: Number(suggestion.updatedAtMs) || Date.now(),
  reviewedAtMs: suggestion.reviewedAtMs ? Number(suggestion.reviewedAtMs) : null,
});

const loadSuggestionRows = async (filePath) => {
  if (usesMemoryStore()) {
    return memorySuggestions
      .map(serializeSuggestion)
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
  }

  const rows = await readJsonFile(filePath, []);
  return rows
    .map(serializeSuggestion)
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
};

const saveSuggestionRows = async (filePath, rows) => {
  if (usesMemoryStore()) {
    memorySuggestions = rows.map(serializeSuggestion);
    return;
  }

  await writeJsonFile(filePath, rows.map(serializeSuggestion));
};

export const listRootSuggestions = async (filePath, { status, limit = 200 } = {}) => {
  const rows = await loadSuggestionRows(filePath);
  const filtered =
    status && status !== 'all' ? rows.filter((row) => row.status === status) : rows;
  return filtered.slice(0, Math.max(1, Math.min(Number(limit) || 200, 2000)));
};

export const createRootSuggestion = async (filePath, { root, note }) => {
  const rows = await loadSuggestionRows(filePath);
  const duplicate = rows.find(
    (row) => row.root === root && (row.status === 'pending' || row.status === 'approved'),
  );

  if (duplicate) {
    const error = new Error(
      duplicate.status === 'approved' ? 'root_already_approved' : 'root_already_suggested',
    );
    error.code = duplicate.status === 'approved' ? 'root_already_approved' : 'root_already_suggested';
    error.suggestion = duplicate;
    throw error;
  }

  const now = Date.now();
  const suggestion = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `suggestion-${Math.random().toString(36).slice(2, 10)}`,
    root,
    dottedRoot: toDottedRoot(root),
    status: 'pending',
    note: String(note || '').trim() || null,
    reviewNote: null,
    createdAtMs: now,
    updatedAtMs: now,
    reviewedAtMs: null,
  };

  rows.unshift(suggestion);
  await saveSuggestionRows(filePath, rows);
  return suggestion;
};

export const reviewRootSuggestion = async (filePath, suggestionId, { decision, reviewNote }) => {
  const rows = await loadSuggestionRows(filePath);
  const index = rows.findIndex((row) => row.id === suggestionId);

  if (index < 0) {
    const error = new Error('suggestion_not_found');
    error.code = 'suggestion_not_found';
    throw error;
  }

  const current = rows[index];
  const now = Date.now();
  const next = {
    ...current,
    status: decision === 'approve' ? 'approved' : 'rejected',
    reviewNote: String(reviewNote || '').trim() || null,
    updatedAtMs: now,
    reviewedAtMs: now,
  };

  rows[index] = next;
  await saveSuggestionRows(filePath, rows);
  return next;
};

export const appendApprovedRoot = async (filePath, root) => {
  if (usesMemoryStore()) {
    memoryApprovedRoots.add(root);
    return;
  }

  const rows = new Set(await readTextLines(filePath));
  rows.add(root);
  const nextContent = [...rows].sort().join('\n');
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, nextContent ? `${nextContent}\n` : '', 'utf8');
};
