# Root Game (Hebrew Roots)

A frontend-only Vite app for the Hebrew roots game. The full game now runs in browser memory by default, so it can be deployed to Vercel without a backend.

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

## Deploy To Vercel

This repo is ready to deploy as a static Vite site.

1. Push it to GitHub, GitLab, or Bitbucket.
2. Import it into Vercel.
3. Leave `VITE_API_BASE_URL` unset unless you intentionally want to use an external API.
4. If Vercel asks for settings, use:

```bash
Build Command: npm run build
Output Directory: dist
```

`vercel.json` is already included for this setup.

## Optional External API

The app can still call an external backend if you set `VITE_API_BASE_URL` in `.env` or in Vercel environment variables. If that variable is unset, the game stays fully frontend-only.

See `.env.example` for the optional variable shape.

## Transliteration

The game supports Hebrew input plus the project’s transliteration mapping, including final-letter normalization (`ך ם ן ף ץ`).
