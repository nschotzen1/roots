# Root Game Backend

Node.js + Express backend for the Hebrew and Arabic root game. Runtime storage now defaults to per-language in-memory adjacency hashes; the older Neo4j graph backend is still kept as a Hebrew-only optional implementation.

## Environment

Copy `.env.example` to `.env` and adjust values if needed.

Important vars:

- `PORT` (default: `8000`)
- `STORAGE_BACKEND` (default: `memory`)
- `ROOMS_BACKEND` (default: `memory`, set to `redis` for shared multiplayer rooms)
- `NEO4J_URI` (default: `bolt://localhost:7687`)
- `NEO4J_USER` (default: `neo4j`)
- `NEO4J_PASSWORD` (default: `roots-password`)
- `ROOTS_SOURCE_FILE` / `HEBREW_ROOTS_SOURCE_FILE` (default: `data/roots_hebrew_scraped.txt`)
- `ARABIC_ROOTS_SOURCE_FILE` (default: `data/roots_arabic_scraped.txt`)
- `DEFAULT_LANGUAGE` (default: `hebrew`; requests can pass `language: "arabic"`)
- `DEFAULT_COUNTDOWN_MS` (default: `45000`)
- `DEFAULT_BONUS_BASE_MS` (default: `4000`)
- `DEFAULT_BONUS_WINDOW_MS` (default: `6000`)
- `AUTO_SEED` (default: `true`)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (required when `ROOMS_BACKEND=redis`)
- `ROOMS_REDIS_PREFIX` (default: `root-game:rooms`)
- `ROOMS_LOCK_TTL_MS` / `ROOMS_LOCK_WAIT_MS` tune the per-room Redis lock used during join/move updates

## Run locally

```bash
cd backend
npm install
npm start
```

To run against Neo4j instead of the in-memory hash:

```bash
STORAGE_BACKEND=neo4j npm start
```

To run multiplayer rooms in Redis instead of process memory:

```bash
ROOMS_BACKEND=redis \
UPSTASH_REDIS_REST_URL=... \
UPSTASH_REDIS_REST_TOKEN=... \
npm start
```

## Seed data manually

From file:

```bash
node src/seed.js --file data/roots_hebrew_sample.txt --clear
```

From URL:

```bash
node src/seed.js --url https://tora.quest/tnk1/ljon/jorj/index.html --clear
```

## Scrape roots to file

```bash
node src/scrapeRoots.js --url https://tora.quest/tnk1/ljon/jorj/index.html --out data/roots_game_scraped.txt
```

## Key endpoints

- `POST /getNextOptions`
- `POST /api/session/start`
- `GET /api/session/:sessionId/state`
- `POST /api/session/:sessionId/move`
- `POST /api/rooms/create`
- `POST /api/rooms/:roomCode/join`
- `GET /api/rooms/:roomCode/state`
- `POST /api/rooms/:roomCode/move`
- `POST /api/path`

## Notes

- In memory mode, the backend builds a hash keyed by root, with all valid outgoing moves precomputed at startup.
- The default memory backend loads both Hebrew and Arabic scraped datasets.
- Neo4j mode is still available by setting `STORAGE_BACKEND=neo4j`, but it remains the legacy Hebrew graph path.
- In Neo4j mode, graph nodes are stored as `(:Root {plain, dotted, length})`.
- In Neo4j mode, moves are stored as `[:MOVE]` with `type` = `REPLACE` or `SWAP` plus metadata.
- Session state is currently in-memory (good for development and single-instance play).
- Multiplayer rooms can now live either in process memory or in Upstash Redis. Redis mode is the right target for Vercel because serverless functions do not share in-memory state across invocations or instances.
- Survival mode uses a global countdown plus tiered bonus-time payouts based on how quickly the player finds the next valid root.
- Room mutations use a short per-room lock in Redis so simultaneous join/move requests do not both win the same control window.
