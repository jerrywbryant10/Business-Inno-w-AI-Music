# SongForge — AI Music Studio

A web app that lets users generate original songs with AI, powered by [SunoAPI.org](https://docs.sunoapi.org/).
Built for one-click deploys on **Netlify**: a static frontend (`public/`) plus Netlify Functions (`netlify/functions/`)
that call SunoAPI server-side, so your API key never reaches the browser.

## Features

- **Simple mode**: describe a song in plain English, and lyrics are written automatically.
- **Custom mode**: title, style tags, your own lyrics, excluded styles, vocal gender, length (10–360s),
  style adherence, weirdness and variety controls.
- **✨ Write lyrics with AI**: generates lyrics with SunoAPI's lyrics endpoint and fills them in.
- Instrumental toggle and model picker (`V6`, `V6_WILD`, `V6_MINI`).
- Live progress (Queued → Writing → Rendering → Ready). Tracks start streaming before the final MP3 is ready.
- Built-in player, MP3 download and lyrics view for each track. Song history is saved in the browser.
- Remaining-credits indicator.
- Optional access password so strangers can't spend your credits.

## Deploy on Netlify

1. In Netlify, choose **Add new site → Import an existing project** and pick this repo (branch `main`).
   Build settings are read from `netlify.toml`, so there is no build command and the publish dir is `public`.
2. Under **Site configuration → Environment variables**, add:
   - `SUNO_API_KEY`: your key from https://sunoapi.org/api-key (**required**)
   - `APP_PASSWORD`: any password (**optional, recommended**). Visitors are prompted for it before generating.
3. Deploy (or redeploy after you add the variables).

## API routes (Netlify Functions)

| Route | Purpose | SunoAPI endpoint |
|---|---|---|
| `POST /api/generate` | Start a music generation | `POST /api/v1/generate` |
| `POST /api/lyrics` | Start a lyrics generation | `POST /api/v1/lyrics` |
| `GET /api/status?taskId=…[&type=lyrics]` | Poll task status/results | `GET /api/v1/generate/record-info`, `/api/v1/lyrics/record-info` |
| `GET /api/credits` | Remaining credits | `GET /api/v1/generate/credit` |
| `POST /api/callback` | Required `callBackUrl` target (the app polls instead) | — |

## Local development

```bash
npm i -g netlify-cli
cp .env.example .env   # fill in SUNO_API_KEY
netlify dev
```

Note: SunoAPI keeps generated files for about 14 days. Download songs you want to keep.
