# Root Game (Hebrew Roots)

A Vite frontend for the Hebrew roots game with an optional bundled backend. By default the deployed app still runs fully in browser memory; the Vercel API can be enabled separately once the backend persistence work is finished.

## What It Includes

- `SWAP` moves: swap two letter positions in a 3-letter root
- `REPLACE` moves: replace one letter with another valid one
- Journey mode
- Survival mode
- Countdown timer with bonus-time rewards for faster moves
- Bundled root dataset with `1804` normalized 3-letter roots

## Project Layout

- `src/` - React app
- `src/game/apiClient.ts` - local game/runtime adapter
- `src/game/data/roots_hebrew_scraped.txt` - bundled roots dataset used at build time
- `public/` - static art and image assets

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Verify Source Coverage

The bundled dataset already matches the normalized 3-letter roots listed on [tora.quest/tnk1/ljon/jorj/index.html](https://tora.quest/tnk1/ljon/jorj/index.html).

Run this check any time you want to re-verify the source sync:

```bash
npm run roots:verify
```

The verifier compares Hebrew anchor text from the source page, not the page slugs, because the site uses a different Latin transliteration scheme. It intentionally filters to 3-letter roots because the current game only supports 3-letter play.

## Deploy To Vercel

This repo now ships as a Vite site plus bundled Vercel functions under `/api/*`.

1. Push it to GitHub, GitLab, or Bitbucket.
2. Import it into Vercel.
3. Leave `VITE_API_BASE_URL` unset for the current safe default.
4. If you want the frontend to call the bundled API later, set `VITE_API_BASE_URL=/`.
5. If Vercel asks for settings, use:

```bash
Build Command: npm run build
Output Directory: dist
```

`vercel.json` is already included for this setup.

## Current Backend Limits On Vercel

- The bundled API is deployable on Vercel now.
- Multiplayer rooms can be made durable by setting `ROOMS_BACKEND=redis` plus Upstash Redis credentials.
- Root suggestion writes default to an in-memory fallback on Vercel because serverless filesystems are read-only.
- Single-player session state is still memory-backed in the backend, so keep `VITE_API_BASE_URL` unset until the Redis/session persistence work is complete.

## Optional External API

The app can still call an external backend if you set `VITE_API_BASE_URL` in `.env` or in Vercel environment variables. If that variable is unset, the game stays fully frontend-only.

See `.env.example` for the optional variable shape.

## Transliteration

The game supports Hebrew input plus the project’s transliteration mapping, including final-letter normalization (`ך ם ן ף ץ`).

## Arabic Mosaic Letter Batch Generation

The repo now includes a repeatable prompt pipeline for the Arabic letter art under `public/letters/arabic/`.

Preview prompts without calling the API:

```bash
npm run letters:arabic:mosaic -- --dry-run
```

Generate only one or two missing letters:

```bash
npm run letters:arabic:mosaic -- --only hh,ayn
```

Regenerate everything and overwrite existing PNGs:

```bash
npm run letters:arabic:mosaic -- --force
```

Notes:

- The generator reads the authoritative Arabic filename stems from `src/game/letterAssets.ts`.
- Prompt previews are written to `output/imagegen/arabic-mosaic-prompts/`.
- Intermediate batch JSONL goes under `tmp/imagegen/`.
- A live run requires `OPENAI_API_KEY`. If the variable is missing, the script automatically falls back to a dry run.
