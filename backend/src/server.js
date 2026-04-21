import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import {
  addRoot,
  countRoots,
  findShortestPath,
  getDirectMove,
  getNeighbors,
  initializeRuntimeRepository,
  pickJourneyTarget,
  pickRandomRoot,
  rootExists,
  closeRuntimeRepository,
} from './runtimeRepository.js';
import {
  appendApprovedRoot,
  createRootSuggestion,
  listRootSuggestions,
  reviewRootSuggestion,
} from './rootSuggestionsStore.js';
import {
  applyInvalidMove,
  applyValidMove,
  createSession,
  endSession,
  getSession,
  markTimeoutIfNeeded,
  normalizeLetterBank,
  serializeSession,
} from './gameSessions.js';
import {
  applyInvalidRoomMove,
  applyRaceMove,
  advanceRoomLifecycle,
  buildRoomMoveSummary,
  countRooms,
  createRoom,
  findRoomPlayerByToken,
  getNeighborOptionsForRoom,
  getRaceRemainingMs,
  getRoomsBackend,
  getRoomControllerRemainingMs,
  joinRoom,
  listWaitingRooms,
  normalizeRoomCode,
  reconcileRoomControlState,
  serializeRoomPayload,
  startRace,
  togglePlayerReady,
  withRoomLock,
} from './multiplayerRooms.js';
import { resolveMoveOutcome } from './playRules.js';
import { normalizeMoveTypes, normalizeSessionMode } from './constants.js';
import { normalizeLanguageMode, parseRootInput, toDottedRoot } from './transliteration.js';

const app = express();
let initPromise = null;
let localServer = null;
let shutdownHooksRegistered = false;

app.use(
  cors({
    origin: config.corsOrigin,
  }),
);
app.use(express.json({ limit: '1mb' }));

const ensureInitialized = async () => {
  if (!initPromise) {
    initPromise = initializeRuntimeRepository().then((initResult) => {
      console.log(`Runtime storage backend: ${initResult.backend}`);
      return initResult;
    });
  }

  return initPromise;
};

app.use((req, res, next) => {
  ensureInitialized().then(() => next()).catch(next);
});

const parseBodyRoot = (value, language = config.defaultLanguage) =>
  parseRootInput(value, language, config.defaultRootLength);

const parseVisitedRoots = (visited, language = config.defaultLanguage) => {
  if (!Array.isArray(visited)) return [];
  return [...new Set(visited.map((value) => parseBodyRoot(value, language)).filter(Boolean))];
};

const formatNeighborPayload = (root, neighborEdges) => ({
  root,
  dottedRoot: toDottedRoot(root),
  count: neighborEdges.length,
  neighbors: neighborEdges.map((edge) => edge.neighbor),
  edges: neighborEdges,
});

const getNeighborOptionsForSession = (session, limit = 500) =>
  getNeighbors(session.language || config.defaultLanguage, session.currentRoot, {
    types: session.types,
    limit,
    excludeVisited: !session.allowRevisit,
    visited: session.allowRevisit ? [] : [...session.visited],
    letterBank: session.letterBank,
  });

const serializeSessionWithBoard = (session, neighborEdges = [], now = Date.now(), move = null) => ({
  session: serializeSession(session, now),
  currentRootDotted: toDottedRoot(session.currentRoot),
  targetRootDotted: session.targetRoot ? toDottedRoot(session.targetRoot) : null,
  options: formatNeighborPayload(session.currentRoot, neighborEdges),
  move,
});

const parseMs = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSuggestionStatus = (value) => {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'pending' || normalized === 'approved' || normalized === 'rejected'
    ? normalized
    : 'all';
};

const pickRandomDifferentRoot = async (language, root, maxAttempts = 20) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = await pickRandomRoot(language, { length: config.defaultRootLength, minDegree: 0 });
    if (!candidate) return null;
    if (candidate.plain !== root) return candidate;
  }

  return null;
};

const selectPlayableStartRoot = async ({
  language = config.defaultLanguage,
  requestedRoot,
  types,
  allowRevisit,
  letterBank,
}) => {
  const normalizedLanguage = normalizeLanguageMode(language);
  if (requestedRoot) {
    const exists = await rootExists(normalizedLanguage, requestedRoot);
    if (!exists) {
      return { error: 'start_root_not_found' };
    }

    const sampleNeighbors = await getNeighbors(normalizedLanguage, requestedRoot, {
      types,
      limit: 1,
      excludeVisited: !allowRevisit,
      visited: allowRevisit ? [] : [requestedRoot],
      letterBank,
    });

    if (sampleNeighbors.length === 0) {
      return { error: 'start_root_has_no_valid_moves' };
    }

    return { root: requestedRoot };
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = await pickRandomRoot(normalizedLanguage, {
      length: config.defaultRootLength,
      minDegree: 1,
    });
    if (!candidate) break;

    const sampleNeighbors = await getNeighbors(normalizedLanguage, candidate.plain, {
      types,
      limit: 1,
      excludeVisited: !allowRevisit,
      visited: allowRevisit ? [] : [candidate.plain],
      letterBank,
    });

    if (sampleNeighbors.length > 0) {
      return { root: candidate.plain };
    }
  }

  return { error: 'could_not_find_playable_start_root' };
};

app.get('/health', async (_req, res) => {
  try {
    const rootsByLanguage = {
      hebrew: await countRoots('hebrew'),
      arabic: await countRoots('arabic'),
    };
    const pendingSuggestions = await listRootSuggestions(config.rootSuggestionsFile, {
      status: 'pending',
      limit: 5000,
    });
    res.json({
      ok: true,
      roots: rootsByLanguage[config.defaultLanguage] ?? rootsByLanguage.hebrew,
      rootsByLanguage,
      pendingSuggestions: pendingSuggestions.length,
      activeRooms: await countRooms(),
      storageBackend: config.storageBackend,
      roomsBackend: getRoomsBackend(),
      ts: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const rootsByLanguage = {
      hebrew: await countRoots('hebrew'),
      arabic: await countRoots('arabic'),
    };
    const pendingSuggestions = await listRootSuggestions(config.rootSuggestionsFile, {
      status: 'pending',
      limit: 5000,
    });
    res.json({
      ok: true,
      roots: rootsByLanguage[config.defaultLanguage] ?? rootsByLanguage.hebrew,
      rootsByLanguage,
      pendingSuggestions: pendingSuggestions.length,
      activeRooms: await countRooms(),
      storageBackend: config.storageBackend,
      roomsBackend: getRoomsBackend(),
      ts: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/root-suggestions', async (req, res) => {
  try {
    const status = normalizeSuggestionStatus(req.query?.status);
    const language = req.query?.language ? normalizeLanguageMode(req.query.language) : null;
    const suggestions = await listRootSuggestions(config.rootSuggestionsFile, {
      status,
      limit: 500,
    });
    res.json({
      suggestions: language
        ? suggestions.filter((suggestion) => suggestion.language === language)
        : suggestions,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/root-suggestions', async (req, res) => {
  try {
    const language = normalizeLanguageMode(req.body?.language);
    const root = parseBodyRoot(req.body?.root, language);
    if (!root) {
      res.status(400).json({ error: 'root_is_required' });
      return;
    }

    if (await rootExists(language, root)) {
      res.status(409).json({ error: 'root_already_exists', root });
      return;
    }

    const suggestion = await createRootSuggestion(config.rootSuggestionsFile, {
      language,
      root,
      note: req.body?.note,
    });

    res.status(201).json({ suggestion });
  } catch (error) {
    if (error?.code === 'root_already_approved' || error?.code === 'root_already_suggested') {
      res.status(409).json({
        error: error.code,
        suggestion: error.suggestion || null,
      });
      return;
    }

    res.status(500).json({ error: error.message });
  }
});

app.post('/api/root-suggestions/:suggestionId/review', async (req, res) => {
  try {
    const decision = String(req.body?.decision || '').toLowerCase();
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ error: 'decision_must_be_approve_or_reject' });
      return;
    }

    const pending = await listRootSuggestions(config.rootSuggestionsFile, { status: 'all', limit: 5000 });
    const current = pending.find((suggestion) => suggestion.id === req.params.suggestionId);

    if (!current) {
      res.status(404).json({ error: 'suggestion_not_found' });
      return;
    }

    const language = normalizeLanguageMode(current.language);
    if (decision === 'approve' && !(await rootExists(language, current.root))) {
      await addRoot(language, current.root);
      await appendApprovedRoot(
        config.approvedRootsFiles[language] || config.approvedRootsFile,
        current.root,
      );
    }

    const suggestion = await reviewRootSuggestion(config.rootSuggestionsFile, req.params.suggestionId, {
      decision,
      reviewNote: req.body?.reviewNote,
    });

    res.json({ suggestion });
  } catch (error) {
    if (error?.code === 'suggestion_not_found') {
      res.status(404).json({ error: error.code });
      return;
    }

    res.status(500).json({ error: error.message });
  }
});

app.post('/getNextOptions', async (req, res) => {
  try {
    const language = normalizeLanguageMode(req.body?.language);
    const root = parseBodyRoot(req.body?.root, language);
    if (!root) {
      res.status(400).json({ error: 'root is required' });
      return;
    }

    const exists = await rootExists(language, root);
    if (!exists) {
      res.status(404).json({ error: 'root_not_found', root });
      return;
    }

    const types = normalizeMoveTypes(req.body?.types);
    const visited = parseVisitedRoots(req.body?.visited, language);
    const excludeVisited = Boolean(req.body?.exclude_visited ?? req.body?.excludeVisited ?? false);
    const letterBank = normalizeLetterBank(req.body?.letter_bank ?? req.body?.letterBank, language);
    const limit = Math.min(Math.max(Number(req.body?.limit) || 500, 1), 5000);

    const edges = await getNeighbors(language, root, {
      types,
      limit,
      excludeVisited,
      visited,
      letterBank,
    });

    res.json(formatNeighborPayload(root, edges));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rooms/list', async (_req, res) => {
  try {
    const rooms = await listWaitingRooms();
    res.json({ rooms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rooms/create', async (req, res) => {
  try {
    const language = normalizeLanguageMode(req.body?.language);
    const types = normalizeMoveTypes(req.body?.types ?? req.body?.allowedTypes);
    const allowRevisit = Boolean(req.body?.allow_revisit ?? req.body?.allowRevisit ?? false);
    const letterBank = normalizeLetterBank(req.body?.letter_bank ?? req.body?.letterBank, language);
    const optionsLimit = Math.min(Math.max(Number(req.body?.optionsLimit) || 500, 1), 5000);
    const requestedRoot = parseBodyRoot(req.body?.startRoot ?? req.body?.root, language);
    const startSelection = await selectPlayableStartRoot({
      language,
      requestedRoot,
      types,
      allowRevisit,
      letterBank,
    });

    if (startSelection.error) {
      res.status(400).json({ error: startSelection.error });
      return;
    }

    const now = Date.now();
    const { room, player } = await createRoom({
      language,
      startRoot: startSelection.root,
      playerName: req.body?.playerName ?? req.body?.name,
      allowRevisit,
      types,
      letterBank,
      countdownMs: parseMs(
        req.body?.countdownMs ?? req.body?.initialTurnMs,
        config.defaultCountdownMs,
      ),
      bonusBaseMs: parseMs(
        req.body?.bonusBaseMs ?? req.body?.baseTurnMs,
        config.defaultBonusBaseMs,
      ),
      bonusWindowMs: parseMs(req.body?.bonusWindowMs, config.defaultBonusWindowMs),
      controlWindowMs: parseMs(req.body?.controlWindowMs ?? req.body?.claimWindowMs, 8_000),
      maxControlMs: parseMs(req.body?.maxControlMs, 12_000),
      maxPlayers: parseMs(req.body?.maxPlayers, 4),
      gameDurationMs: parseMs(req.body?.gameDurationMs, 90_000),
      countdownDurationMs: parseMs(req.body?.countdownDurationMs, 4_000),
      now,
    });

    const neighbors = await getNeighborOptionsForRoom(room, optionsLimit);
    res.status(201).json(await serializeRoomPayload(room, { player, neighborEdges: neighbors, now }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rooms/:roomCode/join', async (req, res) => {
  try {
    const payload = await withRoomLock(req.params.roomCode, async (room) => {
      if (!room) {
        return {
          status: 404,
          body: { error: 'room_not_found', code: normalizeRoomCode(req.params.roomCode) },
        };
      }

      const now = Date.now();
      advanceRoomLifecycle(room, now);
      reconcileRoomControlState(room, now);
      const existingPlayer = findRoomPlayerByToken(room, req.body?.playerToken ?? req.body?.token);

      if (existingPlayer) {
        const neighbors = room.status === 'active' ? await getNeighborOptionsForRoom(room) : [];
        return {
          status: 200,
          body: await serializeRoomPayload(room, {
            player: existingPlayer,
            neighborEdges: neighbors,
            now,
          }),
        };
      }

      if (room.phase !== 'waiting') {
        return {
          status: 409,
          body: {
            error: 'room_not_accepting_players',
            code: room.code,
            phase: room.phase,
          },
        };
      }

      if (room.players.length >= room.config.maxPlayers) {
        return {
          status: 409,
          body: {
            error: 'room_full',
            code: room.code,
            maxPlayers: room.config.maxPlayers,
          },
        };
      }

      const player = joinRoom(room, {
        playerName: req.body?.playerName ?? req.body?.name,
        now,
      });

      const neighbors = room.status === 'active' ? await getNeighborOptionsForRoom(room) : [];
      return {
        status: 200,
        body: await serializeRoomPayload(room, { player, neighborEdges: neighbors, now }),
      };
    });

    res.status(payload.status).json(payload.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rooms/:roomCode/ready', async (req, res) => {
  try {
    const payload = await withRoomLock(req.params.roomCode, async (room) => {
      if (!room) {
        return {
          status: 404,
          body: { error: 'room_not_found', code: normalizeRoomCode(req.params.roomCode) },
        };
      }

      const now = Date.now();
      advanceRoomLifecycle(room, now);
      const player = findRoomPlayerByToken(room, req.body?.playerToken ?? req.body?.token);

      if (!player) {
        return {
          status: 401,
          body: { error: 'player_not_in_room', code: room.code },
        };
      }

      if (room.phase !== 'waiting') {
        return {
          status: 409,
          body: { error: 'room_not_in_waiting_phase', code: room.code, phase: room.phase },
        };
      }

      const result = togglePlayerReady(room, player, now);
      const neighbors = await getNeighborOptionsForRoom(room);

      return {
        status: 200,
        body: await serializeRoomPayload(room, {
          player,
          neighborEdges: neighbors,
          now,
          move: { ok: true, ready: result.ready, allReady: result.allReady },
        }),
      };
    });

    res.status(payload.status).json(payload.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rooms/:roomCode/start', async (req, res) => {
  try {
    const payload = await withRoomLock(req.params.roomCode, async (room) => {
      if (!room) {
        return {
          status: 404,
          body: { error: 'room_not_found', code: normalizeRoomCode(req.params.roomCode) },
        };
      }

      const now = Date.now();
      advanceRoomLifecycle(room, now);
      const player = findRoomPlayerByToken(room, req.body?.playerToken ?? req.body?.token);

      if (!player) {
        return {
          status: 401,
          body: { error: 'player_not_in_room', code: room.code },
        };
      }

      if (room.phase !== 'countdown') {
        return {
          status: 409,
          body: { error: 'room_not_in_countdown_phase', code: room.code, phase: room.phase },
        };
      }

      startRace(room, now);
      const neighbors = await getNeighborOptionsForRoom(room);

      return {
        status: 200,
        body: await serializeRoomPayload(room, {
          player,
          neighborEdges: neighbors,
          now,
        }),
      };
    });

    res.status(payload.status).json(payload.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rooms/:roomCode/state', async (req, res) => {
  try {
    const payload = await withRoomLock(req.params.roomCode, async (room) => {
      if (!room) {
        return {
          status: 404,
          body: { error: 'room_not_found', code: normalizeRoomCode(req.params.roomCode) },
        };
      }

      const now = Date.now();
      advanceRoomLifecycle(room, now);
      reconcileRoomControlState(room, now);
      const neighbors = room.status === 'active' ? await getNeighborOptionsForRoom(room) : [];

      return {
        status: 200,
        body: await serializeRoomPayload(room, {
          player: findRoomPlayerByToken(
            room,
            req.query?.playerToken ?? req.query?.player_token,
          ),
          neighborEdges: neighbors,
          now,
        }),
      };
    });

    res.status(payload.status).json(payload.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rooms/:roomCode/move', async (req, res) => {
  try {
    const payload = await withRoomLock(req.params.roomCode, async (room) => {
      if (!room) {
        return {
          status: 404,
          body: { error: 'room_not_found', code: normalizeRoomCode(req.params.roomCode) },
        };
      }

      const now = Date.now();
      advanceRoomLifecycle(room, now);
      reconcileRoomControlState(room, now);
      const player = findRoomPlayerByToken(room, req.body?.playerToken ?? req.body?.token);

      if (!player) {
        return {
          status: 401,
          body: {
            error: 'player_not_in_room',
            code: room.code,
          },
        };
      }

      if (room.status !== 'active' || (room.phase !== 'racing' && room.phase !== 'open_claim' && room.phase !== 'controlled')) {
        return {
          status: 409,
          body: await serializeRoomPayload(room, {
            player,
            neighborEdges: [],
            now,
            move: buildRoomMoveSummary(player, {
              ok: false,
              reason: room.reason || 'room_not_active',
            }),
          }),
        };
      }

      const candidateRoot = parseBodyRoot(req.body?.root, room.language || config.defaultLanguage);
      if (!candidateRoot) {
        return {
          status: 400,
          body: { error: 'root is required' },
        };
      }

      // In racing mode, no control gating — anyone can move
      const isRacing = room.phase === 'racing';

      if (!isRacing && room.controllerPlayerId && room.controllerPlayerId !== player.id) {
        return {
          status: 409,
          body: await serializeRoomPayload(room, {
            player,
            neighborEdges: await getNeighborOptionsForRoom(room),
            now,
            move: buildRoomMoveSummary(player, {
              ok: false,
              reason: 'control_locked',
              controlChange: 'none',
              controlRemainingMs: getRoomControllerRemainingMs(room, now),
            }),
          }),
        };
      }

      if (candidateRoot === room.currentRoot) {
        applyInvalidRoomMove(room, player, now);
        return {
          status: 400,
          body: await serializeRoomPayload(room, {
            player,
            neighborEdges: await getNeighborOptionsForRoom(room),
            now,
            move: buildRoomMoveSummary(player, {
              ok: false,
              reason: 'same_root',
            }),
          }),
        };
      }

      if (!room.allowRevisit && room.visited.has(candidateRoot)) {
        applyInvalidRoomMove(room, player, now);
        return {
          status: 400,
          body: await serializeRoomPayload(room, {
            player,
            neighborEdges: await getNeighborOptionsForRoom(room),
            now,
            move: buildRoomMoveSummary(player, {
              ok: false,
              reason: 'already_visited',
            }),
          }),
        };
      }

      const moveEdge = await getDirectMove(
        room.language || config.defaultLanguage,
        room.currentRoot,
        candidateRoot,
        {
          types: room.types,
          letterBank: room.letterBank,
        },
      );

      if (!moveEdge) {
        applyInvalidRoomMove(room, player, now);
        return {
          status: 400,
          body: await serializeRoomPayload(room, {
            player,
            neighborEdges: await getNeighborOptionsForRoom(room),
            now,
            move: buildRoomMoveSummary(player, {
              ok: false,
              reason: 'not_a_valid_neighbor',
            }),
          }),
        };
      }

      // Racing mode: simple +1 scoring, no control
      if (isRacing) {
        const raceMoveResult = applyRaceMove(room, player, candidateRoot, moveEdge, now);

        let neighbors = await getNeighborOptionsForRoom(room);
        if (neighbors.length === 0) {
          room.status = 'completed';
          room.reason = 'no_moves';
          room.phase = 'completed';
          neighbors = [];
        }

        return {
          status: 200,
          body: await serializeRoomPayload(room, {
            player,
            neighborEdges: neighbors,
            now,
            move: buildRoomMoveSummary(player, {
              ...raceMoveResult,
              edge: moveEdge,
            }),
          }),
        };
      }

      // Legacy control-takeover mode (kept for backwards compatibility)
      const hadController = room.controllerPlayerId === player.id;
      const remainingBeforeMs = hadController
        ? getRoomControllerRemainingMs(room, now)
        : room.config.controlWindowMs;
      const elapsedMs = Math.max(0, now - room.turnStartedAtMs);
      const { nextComboState, nextRemainingMs, ...moveOutcome } = resolveMoveOutcome({
        comboState: player.combo,
        moveEdge,
        streakBeforeMove: player.streak,
        elapsedMs,
        remainingBeforeMs,
        config: room.config,
      });
      const nextControlRemainingMs = Math.min(room.config.maxControlMs, nextRemainingMs);
      const controlChange = hadController ? 'extended' : 'claimed';

      player.combo = nextComboState;
      player.streak = moveOutcome.streakAfterMove;
      player.longestStreak = Math.max(player.longestStreak, player.streak);
      player.score += moveOutcome.scoreGain;
      if (!hadController) {
        player.takeovers += 1;
      }

      room.currentRoot = candidateRoot;
      room.visited.add(candidateRoot);
      room.moveCount += 1;
      room.controllerPlayerId = player.id;
      room.controllerExpiresAtMs = now + nextControlRemainingMs;
      room.turnStartedAtMs = now;
      room.phase = 'controlled';
      room.reason = null;

      let neighbors = await getNeighborOptionsForRoom(room);
      if (neighbors.length === 0) {
        room.status = 'completed';
        room.reason = 'no_moves';
        room.controllerPlayerId = null;
        room.controllerExpiresAtMs = null;
        room.phase = 'completed';
        neighbors = [];
      }

      room.updatedAtMs = now;
      room.version += 1;

      return {
        status: 200,
        body: await serializeRoomPayload(room, {
          player,
          neighborEdges: neighbors,
          now,
          move: buildRoomMoveSummary(player, {
            ok: true,
            ...moveOutcome,
            edge: moveEdge,
            remainingBeforeMs,
            elapsedMs,
            controlChange,
            controlRemainingMs: room.controllerPlayerId === player.id ? nextControlRemainingMs : 0,
          }),
        }),
      };
    });

    res.status(payload.status).json(payload.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/session/start', async (req, res) => {
  try {
    const language = normalizeLanguageMode(req.body?.language);
    const mode = normalizeSessionMode(req.body?.mode);
    const types = normalizeMoveTypes(req.body?.types ?? req.body?.allowedTypes);
    const allowRevisit = Boolean(req.body?.allow_revisit ?? req.body?.allowRevisit ?? false);
    const letterBank = normalizeLetterBank(req.body?.letter_bank ?? req.body?.letterBank, language);
    const optionsLimit = Math.min(Math.max(Number(req.body?.optionsLimit) || 500, 1), 5000);

    const requestedRoot = parseBodyRoot(req.body?.startRoot ?? req.body?.root, language);
    const startSelection = await selectPlayableStartRoot({
      language,
      requestedRoot,
      types,
      allowRevisit,
      letterBank,
    });

    if (startSelection.error) {
      res.status(400).json({ error: startSelection.error });
      return;
    }

    const startRoot = startSelection.root;
    let targetRoot = parseBodyRoot(req.body?.targetRoot, language);

    if (mode === 'journey') {
      if (targetRoot) {
        const exists = await rootExists(language, targetRoot);
        if (!exists) {
          res.status(400).json({ error: 'target_root_not_found' });
          return;
        }
        if (targetRoot === startRoot) {
          res.status(400).json({ error: 'target_root_must_differ_from_start_root' });
          return;
        }
      } else {
        const generated = await pickJourneyTarget(language, startRoot, { minDepth: 3, maxDepth: 10 });
        targetRoot = generated?.plain || (await pickRandomDifferentRoot(language, startRoot))?.plain || null;
      }
    } else {
      targetRoot = null;
    }

    const session = createSession({
      mode,
      language,
      startRoot,
      targetRoot,
      types,
      allowRevisit,
      letterBank,
      countdownMs: parseMs(
        req.body?.countdownMs ?? req.body?.initialTurnMs,
        config.defaultCountdownMs,
      ),
      bonusBaseMs: parseMs(
        req.body?.bonusBaseMs ?? req.body?.baseTurnMs,
        config.defaultBonusBaseMs,
      ),
      bonusWindowMs: parseMs(req.body?.bonusWindowMs, config.defaultBonusWindowMs),
    });

    const neighbors = await getNeighborOptionsForSession(session, optionsLimit);

    res.status(201).json(serializeSessionWithBoard(session, neighbors));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/session/:sessionId/state', async (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const now = Date.now();
    markTimeoutIfNeeded(session, now);

    const neighbors = session.status === 'active' ? await getNeighborOptionsForSession(session) : [];

    res.json(serializeSessionWithBoard(session, neighbors, now));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/session/:sessionId/move', async (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const now = Date.now();
    markTimeoutIfNeeded(session, now);

    if (session.status !== 'active') {
      res.status(409).json(serializeSessionWithBoard(session, [], now, {
        ok: false,
        reason: session.reason || 'session_not_active',
      }));
      return;
    }

    const candidateRoot = parseBodyRoot(req.body?.root, session.language || config.defaultLanguage);
    if (!candidateRoot) {
      res.status(400).json({ error: 'root is required' });
      return;
    }

    if (candidateRoot === session.currentRoot) {
      applyInvalidMove(session, now);
      const neighbors = await getNeighborOptionsForSession(session);
      res.status(400).json(serializeSessionWithBoard(session, neighbors, now, {
        ok: false,
        reason: 'same_root',
      }));
      return;
    }

    if (!session.allowRevisit && session.visited.has(candidateRoot)) {
      applyInvalidMove(session, now);
      const neighbors = await getNeighborOptionsForSession(session);
      res.status(400).json(serializeSessionWithBoard(session, neighbors, now, {
        ok: false,
        reason: 'already_visited',
      }));
      return;
    }

    const moveEdge = await getDirectMove(
      session.language || config.defaultLanguage,
      session.currentRoot,
      candidateRoot,
      {
        types: session.types,
        letterBank: session.letterBank,
      },
    );

    if (!moveEdge) {
      applyInvalidMove(session, now);
      const neighbors = await getNeighborOptionsForSession(session);
      res.status(400).json(serializeSessionWithBoard(session, neighbors, now, {
        ok: false,
        reason: 'not_a_valid_neighbor',
      }));
      return;
    }

    const moveSummary = applyValidMove(session, candidateRoot, moveEdge, now);

    if (!moveSummary || session.status !== 'active') {
      const neighbors = [];
      res.status(409).json(serializeSessionWithBoard(session, neighbors, now, {
        ok: false,
        reason: session.reason || 'timeout',
      }));
      return;
    }

    let neighbors = await getNeighborOptionsForSession(session);

    if (session.mode === 'journey' && session.targetRoot && session.currentRoot === session.targetRoot) {
      session.score += 100;
      endSession(session, 'target_reached', 'completed', now);
      neighbors = [];
    } else if (neighbors.length === 0) {
      endSession(session, 'no_moves', 'game_over', now);
    }

    res.json(
      serializeSessionWithBoard(session, neighbors, now, {
        ok: true,
        ...moveSummary,
        edge: moveEdge,
      }),
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/path', async (req, res) => {
  try {
    const language = normalizeLanguageMode(req.body?.language);
    const from = parseBodyRoot(req.body?.fromRoot ?? req.body?.from, language);
    const to = parseBodyRoot(req.body?.toRoot ?? req.body?.to, language);

    if (!from || !to) {
      res.status(400).json({ error: 'fromRoot and toRoot are required' });
      return;
    }

    if (from === to) {
      res.json({
        from,
        to,
        distance: 0,
        path: [from],
        dottedPath: [toDottedRoot(from)],
      });
      return;
    }

    const types = normalizeMoveTypes(req.body?.types);
    const maxDepth = Math.min(Math.max(Number(req.body?.maxDepth) || 12, 1), 25);

    const path = await findShortestPath(language, from, to, { maxDepth, types });
    if (!path) {
      res.status(404).json({ error: 'path_not_found', from, to, maxDepth });
      return;
    }

    res.json({
      from,
      to,
      ...path,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(error);
  res.status(500).json({ error: error?.message || 'internal_server_error' });
});

export const start = async () => {
  await ensureInitialized();

  if (localServer) {
    return localServer;
  }

  localServer = app.listen(config.port, () => {
    console.log(`Root game backend listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    if (!localServer) return;

    localServer.close(async () => {
      await closeRuntimeRepository();
      process.exit(0);
    });
  };

  if (!shutdownHooksRegistered) {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    shutdownHooksRegistered = true;
  }

  return localServer;
};

const isExecutedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  start().catch(async (error) => {
    console.error(error);
    await closeRuntimeRepository();
    process.exit(1);
  });
}

export { app, ensureInitialized };
export default app;
