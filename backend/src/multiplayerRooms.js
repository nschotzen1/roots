import { Redis } from '@upstash/redis';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { normalizeMoveTypes } from './constants.js';
import { createComboState } from './playRules.js';
import { toDottedRoot } from './transliteration.js';
import { getNeighbors } from './runtimeRepository.js';

const memoryRooms = new Map();

const DEFAULT_ROOM_CONTROL_WINDOW_MS = 8_000;
const DEFAULT_ROOM_MAX_CONTROL_MS = 12_000;
const DEFAULT_ROOM_MAX_PLAYERS = 4;
const DEFAULT_ROOM_LOCK_TTL_MS = 4_000;
const DEFAULT_ROOM_LOCK_WAIT_MS = 2_000;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const roomsBackendMode = String(process.env.ROOMS_BACKEND || 'memory').toLowerCase();
const roomsBackend = roomsBackendMode === 'redis' ? 'redis' : 'memory';
const roomsRedisPrefix = String(process.env.ROOMS_REDIS_PREFIX || 'root-game:rooms').trim();

let redisClient = null;
let releaseLockScript = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.round(parsed), min, max);
};

const roomLockTtlMs = normalizeNumber(
  process.env.ROOMS_LOCK_TTL_MS,
  DEFAULT_ROOM_LOCK_TTL_MS,
  500,
  30_000,
);
const roomLockWaitMs = normalizeNumber(
  process.env.ROOMS_LOCK_WAIT_MS,
  DEFAULT_ROOM_LOCK_WAIT_MS,
  250,
  30_000,
);

const roomKey = (roomCode) => `${roomsRedisPrefix}:room:${roomCode}`;
const roomLockKey = (roomCode) => `${roomsRedisPrefix}:lock:${roomCode}`;
const roomIndexKey = `${roomsRedisPrefix}:index`;

const createOpaqueId = (prefix) => `${prefix}-${uuidv4()}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRedisClient = () => {
  if (roomsBackend !== 'redis') return null;

  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error('redis_room_store_not_configured');
    }

    redisClient = new Redis({ url, token });
  }

  return redisClient;
};

const getReleaseLockScript = () => {
  const redis = getRedisClient();
  if (!redis) return null;

  if (!releaseLockScript) {
    releaseLockScript = redis.createScript(`
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
      return 0
    `);
  }

  return releaseLockScript;
};

export const normalizeRoomCode = (value) => {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
  return normalized.length >= 4 ? normalized : null;
};

const normalizePlayerName = (value, fallback = 'Player') => {
  const trimmed = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return (trimmed || fallback).slice(0, 24);
};

const createRoomCode = () =>
  Array.from(
    { length: 6 },
    () => ROOM_CODE_ALPHABET.charAt(Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)),
  ).join('');

const serializeStoredRoom = (room) => ({
  ...room,
  visited: [...room.visited],
});

const deserializeStoredRoom = (value) => {
  const now = Date.now();
  const code = normalizeRoomCode(value?.code);
  const currentRoot = typeof value?.currentRoot === 'string' && value.currentRoot ? value.currentRoot : null;
  if (!code || !currentRoot || !Array.isArray(value?.players) || value.players.length === 0) {
    return null;
  }

  const players = value.players.reduce((acc, candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return acc;
    if (typeof candidate.id !== 'string' || !candidate.id) return acc;
    if (typeof candidate.token !== 'string' || !candidate.token) return acc;

    acc.push({
      id: candidate.id,
      token: candidate.token,
      name: normalizePlayerName(candidate.name, `Player ${index + 1}`),
      joinedAtMs: Number(candidate.joinedAtMs) || now,
      score: Math.max(0, Number(candidate.score) || 0),
      streak: Math.max(0, Number(candidate.streak) || 0),
      longestStreak: Math.max(0, Number(candidate.longestStreak) || 0),
      takeovers: Math.max(0, Number(candidate.takeovers) || 0),
      combo: {
        permutationChain: Math.max(0, Math.floor(Number(candidate.combo?.permutationChain) || 0)),
        samePositionChain: Math.max(0, Math.floor(Number(candidate.combo?.samePositionChain) || 0)),
        lastMoveType:
          candidate.combo?.lastMoveType === 'SWAP'
            ? 'SWAP'
            : candidate.combo?.lastMoveType === 'REPLACE'
              ? 'REPLACE'
              : null,
        lastReplacePosition: Number.isInteger(candidate.combo?.lastReplacePosition)
          ? Number(candidate.combo.lastReplacePosition)
          : null,
      },
      isHost: Boolean(candidate.isHost) || index === 0,
    });

    return acc;
  }, []);

  if (players.length === 0) return null;

  const visitedValues = Array.isArray(value.visited)
    ? value.visited.filter((candidate) => typeof candidate === 'string' && candidate)
    : [currentRoot];
  const visited = new Set(visitedValues.length > 0 ? visitedValues : [currentRoot]);
  visited.add(currentRoot);

  return {
    id: typeof value.id === 'string' && value.id ? value.id : createOpaqueId('room'),
    code,
    version: Math.max(1, Math.floor(Number(value.version) || 1)),
    status: value.status === 'completed' ? 'completed' : 'active',
    phase: value.phase === 'controlled' ? 'controlled' : 'open_claim',
    reason: typeof value.reason === 'string' && value.reason ? value.reason : null,
    createdAtMs: Number(value.createdAtMs) || now,
    updatedAtMs: Number(value.updatedAtMs) || now,
    startedAtMs: Number(value.startedAtMs) || Number(value.createdAtMs) || now,
    currentRoot,
    moveCount: Math.max(0, Math.floor(Number(value.moveCount) || 0)),
    visited,
    controllerPlayerId:
      typeof value.controllerPlayerId === 'string' && value.controllerPlayerId
        ? value.controllerPlayerId
        : null,
    controllerExpiresAtMs:
      Number.isFinite(Number(value.controllerExpiresAtMs)) && Number(value.controllerExpiresAtMs) > 0
        ? Number(value.controllerExpiresAtMs)
        : null,
    turnStartedAtMs: Number(value.turnStartedAtMs) || Number(value.startedAtMs) || now,
    allowRevisit: Boolean(value.allowRevisit),
    types: normalizeMoveTypes(value.types),
    letterBank: Array.isArray(value.letterBank) ? [...new Set(value.letterBank.filter(Boolean))] : null,
    config: {
      countdownMs: normalizeNumber(value.config?.countdownMs, config.defaultCountdownMs, 10_000, 300_000),
      bonusBaseMs: normalizeNumber(value.config?.bonusBaseMs, config.defaultBonusBaseMs, 500, 60_000),
      bonusWindowMs: normalizeNumber(value.config?.bonusWindowMs, config.defaultBonusWindowMs, 1_000, 60_000),
      controlWindowMs: normalizeNumber(
        value.config?.controlWindowMs,
        DEFAULT_ROOM_CONTROL_WINDOW_MS,
        2_000,
        30_000,
      ),
      maxControlMs: normalizeNumber(value.config?.maxControlMs, DEFAULT_ROOM_MAX_CONTROL_MS, 3_000, 60_000),
      maxPlayers: normalizeNumber(value.config?.maxPlayers, DEFAULT_ROOM_MAX_PLAYERS, 2, 16),
    },
    players,
  };
};

const formatNeighborPayload = (root, neighborEdges) => ({
  root,
  dottedRoot: toDottedRoot(root),
  count: neighborEdges.length,
  neighbors: neighborEdges.map((edge) => edge.neighbor),
  edges: neighborEdges,
});

const createRoomPlayer = ({ name, fallbackName, isHost, now }) => ({
  id: createOpaqueId('player'),
  token: createOpaqueId('player-token'),
  name: normalizePlayerName(name, fallbackName),
  joinedAtMs: now,
  score: 0,
  streak: 0,
  longestStreak: 0,
  takeovers: 0,
  combo: createComboState(),
  isHost,
});

const serializeRoomPlayer = (player, viewerPlayerId) => ({
  id: player.id,
  name: player.name,
  joinedAtMs: player.joinedAtMs,
  score: player.score,
  streak: player.streak,
  longestStreak: player.longestStreak,
  takeovers: player.takeovers,
  combo: {
    permutationChain: player.combo.permutationChain,
    samePositionChain: player.combo.samePositionChain,
    samePositionIndex: player.combo.lastReplacePosition,
  },
  isHost: player.isHost,
  isSelf: player.id === viewerPlayerId,
});

const serializeRoomPlayerAuth = (player) => ({
  id: player.id,
  name: player.name,
  token: player.token,
  isHost: player.isHost,
  joinedAtMs: player.joinedAtMs,
});

const saveRoomInternal = async (room) => {
  if (!room) return;

  if (roomsBackend === 'memory') {
    memoryRooms.set(room.code, room);
    return;
  }

  const redis = getRedisClient();
  await redis.multi().set(roomKey(room.code), serializeStoredRoom(room)).sadd(roomIndexKey, room.code).exec();
};

const acquireRoomLock = async (roomCode) => {
  if (roomsBackend === 'memory') {
    return { token: null, release: async () => {} };
  }

  const redis = getRedisClient();
  const token = createOpaqueId('room-lock');
  const deadline = Date.now() + roomLockWaitMs;

  while (Date.now() <= deadline) {
    const acquired = await redis.set(roomLockKey(roomCode), token, { nx: true, px: roomLockTtlMs });
    if (acquired === 'OK') {
      return {
        token,
        release: async () => {
          const releaseScript = getReleaseLockScript();
          if (!releaseScript) return;
          await releaseScript.exec([roomLockKey(roomCode)], [token]);
        },
      };
    }

    await sleep(60);
  }

  throw new Error('room_lock_timeout');
};

export const countRooms = async () => {
  if (roomsBackend === 'memory') return memoryRooms.size;
  return await getRedisClient().scard(roomIndexKey);
};

export const getRoom = async (roomCode) => {
  const normalizedCode = normalizeRoomCode(roomCode);
  if (!normalizedCode) return null;

  if (roomsBackend === 'memory') {
    return memoryRooms.get(normalizedCode) || null;
  }

  const stored = await getRedisClient().get(roomKey(normalizedCode));
  return stored ? deserializeStoredRoom(stored) : null;
};

const generateUniqueRoomCode = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = createRoomCode();
    if (!(await getRoom(code))) return code;
  }

  throw new Error('room_code_generation_failed');
};

export const createRoom = async ({
  startRoot,
  playerName,
  allowRevisit = false,
  types,
  letterBank = null,
  countdownMs = config.defaultCountdownMs,
  bonusBaseMs = config.defaultBonusBaseMs,
  bonusWindowMs = config.defaultBonusWindowMs,
  controlWindowMs = DEFAULT_ROOM_CONTROL_WINDOW_MS,
  maxControlMs = DEFAULT_ROOM_MAX_CONTROL_MS,
  maxPlayers = DEFAULT_ROOM_MAX_PLAYERS,
  now = Date.now(),
}) => {
  const hostPlayer = createRoomPlayer({
    name: playerName,
    fallbackName: 'Host',
    isHost: true,
    now,
  });

  const room = {
    id: createOpaqueId('room'),
    code: await generateUniqueRoomCode(),
    version: 1,
    status: 'active',
    phase: 'open_claim',
    reason: null,
    createdAtMs: now,
    updatedAtMs: now,
    startedAtMs: now,
    currentRoot: startRoot,
    moveCount: 0,
    visited: new Set([startRoot]),
    controllerPlayerId: null,
    controllerExpiresAtMs: null,
    turnStartedAtMs: now,
    allowRevisit: Boolean(allowRevisit),
    types: normalizeMoveTypes(types),
    letterBank,
    config: {
      countdownMs: normalizeNumber(countdownMs, config.defaultCountdownMs, 10_000, 300_000),
      bonusBaseMs: normalizeNumber(bonusBaseMs, config.defaultBonusBaseMs, 500, 60_000),
      bonusWindowMs: normalizeNumber(bonusWindowMs, config.defaultBonusWindowMs, 1_000, 60_000),
      controlWindowMs: normalizeNumber(
        controlWindowMs,
        DEFAULT_ROOM_CONTROL_WINDOW_MS,
        2_000,
        30_000,
      ),
      maxControlMs: normalizeNumber(maxControlMs, DEFAULT_ROOM_MAX_CONTROL_MS, 3_000, 60_000),
      maxPlayers: normalizeNumber(maxPlayers, DEFAULT_ROOM_MAX_PLAYERS, 2, 16),
    },
    players: [hostPlayer],
  };

  await saveRoomInternal(room);
  return { room, player: hostPlayer };
};

export const saveRoom = saveRoomInternal;

export const withRoomLock = async (roomCode, handler) => {
  const normalizedCode = normalizeRoomCode(roomCode);
  if (!normalizedCode) return null;

  const lock = await acquireRoomLock(normalizedCode);

  try {
    const room = await getRoom(normalizedCode);
    const result = await handler(room);
    if (room) {
      await saveRoomInternal(room);
    }
    return result;
  } finally {
    await lock.release();
  }
};

export const joinRoom = (room, { playerName, now = Date.now() } = {}) => {
  const player = createRoomPlayer({
    name: playerName,
    fallbackName: `Player ${room.players.length + 1}`,
    isHost: false,
    now,
  });

  room.players.push(player);
  room.updatedAtMs = now;
  room.version += 1;
  return player;
};

export const getNeighborOptionsForRoom = (room, limit = 500) =>
  getNeighbors(room.currentRoot, {
    types: room.types,
    limit,
    excludeVisited: !room.allowRevisit,
    visited: room.allowRevisit ? [] : [...room.visited],
    letterBank: room.letterBank,
  });

export const getRoomControllerRemainingMs = (room, now = Date.now()) => {
  if (!room.controllerExpiresAtMs) return 0;
  return Math.max(0, room.controllerExpiresAtMs - now);
};

export const findRoomPlayerByToken = (room, token) => {
  const normalized = typeof token === 'string' && token.trim() ? token.trim() : null;
  if (!normalized) return null;
  return room.players.find((player) => player.token === normalized) || null;
};

export const reconcileRoomControlState = (room, now = Date.now()) => {
  if (!room.controllerPlayerId || getRoomControllerRemainingMs(room, now) > 0) return false;

  room.controllerPlayerId = null;
  room.controllerExpiresAtMs = null;
  room.phase = 'open_claim';
  room.turnStartedAtMs = now;
  room.updatedAtMs = now;
  room.version += 1;
  return true;
};

export const applyInvalidRoomMove = (room, player, now = Date.now()) => {
  const didChange =
    player.streak > 0 ||
    player.combo.permutationChain > 0 ||
    player.combo.samePositionChain > 0 ||
    player.combo.lastMoveType !== null ||
    player.combo.lastReplacePosition !== null;

  player.streak = 0;
  player.combo = createComboState();

  if (didChange) {
    room.updatedAtMs = now;
    room.version += 1;
  }

  return didChange;
};

export const buildRoomMoveSummary = (player, move) => ({
  ok: Boolean(move.ok),
  byPlayerId: player.id,
  byPlayerName: player.name,
  controlChange: move.controlChange ?? 'none',
  ...move,
});

export const serializeRoomPayload = async (
  room,
  {
    player,
    playerToken = null,
    neighborEdges,
    move = null,
    now = Date.now(),
  } = {},
) => {
  const resolvedPlayer = player ?? findRoomPlayerByToken(room, playerToken);
  const edges = neighborEdges ?? (await getNeighborOptionsForRoom(room));
  const controllerRemainingMs = getRoomControllerRemainingMs(room, now);

  return {
    room: {
      id: room.id,
      code: room.code,
      version: room.version,
      status: room.status,
      phase: room.phase,
      reason: room.reason,
      currentRoot: room.currentRoot,
      currentRootDotted: toDottedRoot(room.currentRoot),
      moveCount: room.moveCount,
      visitedRoots: [...room.visited],
      visitedCount: room.visited.size,
      controllerPlayerId: room.controllerPlayerId,
      controllerExpiresAtMs: room.controllerExpiresAtMs,
      controllerRemainingMs,
      turnStartedAtMs: room.turnStartedAtMs,
      createdAtMs: room.createdAtMs,
      updatedAtMs: room.updatedAtMs,
      startedAtMs: room.startedAtMs,
      allowRevisit: room.allowRevisit,
      types: room.types,
      letterBank: room.letterBank,
      config: room.config,
      players: room.players.map((candidate) =>
        serializeRoomPlayer(candidate, resolvedPlayer?.id || null),
      ),
      options: formatNeighborPayload(room.currentRoot, edges),
    },
    player: resolvedPlayer ? serializeRoomPlayerAuth(resolvedPlayer) : null,
    move,
  };
};
