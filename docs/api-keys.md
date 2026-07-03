# API keys — what ClipZoo needs and how to generate each one

> Snapshot: July 2026. Client-side keys are entered in **Settings** inside the app
> (stored encrypted in your browser, sent per-request via headers — never stored
> server-side). Server-side values go in `.env` at the repo root.

## Two ways to provide the client-side keys

1. **Settings UI** (recommended): paste into the app's Settings tab. Encrypted in
   your browser's localStorage. **Always takes priority.**
2. **`.env.local`** (repo root, gitignored): paste the same keys as
   `GEMINI_API_KEY=` / `UPLOAD_POST_API_KEY=` / `ELEVENLABS_API_KEY=` / `FAL_API_KEY=`.
   The backend loads it on startup (beats `.env` for same-named vars) and serves it
   to your local frontend via `/api/config/keys` as **fallbacks** — used only where
   Settings is empty, never written to localStorage. Restart the backend after
   editing (`docker restart ai-shorts-backend`).
   ⚠️ Self-hosted convenience only — keys transit localhost HTTP; don't expose the
   app on a shared host with keys in this file.

## Required

### 1. Google Gemini — `GEMINI_API_KEY` (client-side, Settings)
Powers hook suggestions, slideshow autofill, clip detection, effects, titles.
**Free tier available.**
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with your Google account.
3. Click **Create API key** (pick any Google Cloud project or let it create one).
4. Copy the key (`AIza…`) → paste into **Settings → Gemini API Key** in ClipZoo.

### 2. Upload-Post — `UPLOAD_POST_API_KEY` (client-side, Settings)
Publishes and **schedules** to TikTok / Instagram Reels / YouTube Shorts through
their audited apps — this is what lets us skip TikTok's brutal native-API audit.
Free tier: 10 uploads/month; paid from ~$16/mo.
1. Register at https://app.upload-post.com/login
2. Go to **Manage Users** (https://app.upload-post.com/manage-users) → create a
   profile (e.g. `evex`) → click **Connect** on TikTok / Instagram / YouTube and
   complete each OAuth flow.
3. Go to **API Keys** (https://app.upload-post.com/api-keys) → **Generate key**.
4. Copy the key → **Settings → Upload-Post API Key** → Connect (the app pulls
   your profiles automatically).

## Optional (feature-gated)

### 3. ElevenLabs — `ELEVENLABS_API_KEY` (client-side, Settings)
Voice dubbing/translation + AI Actor Ads voiceovers. Free tier available.
1. Sign up at https://elevenlabs.io/sign-up
2. Go to https://elevenlabs.io/app/settings/api-keys → **Create API Key**.
3. Copy (`sk_…`) → **Settings → ElevenLabs API Key**.

### 4. fal.ai — `FAL_API_KEY` (client-side, Settings)
AI Actor Ads studio (Flux actor portraits, Kling talking-head + B-roll). Pay-per-use.
1. Sign up at https://fal.ai (GitHub login works).
2. Go to https://fal.ai/dashboard/keys → **Add key** → name it (e.g. `clipzoo`).
3. Copy (`fal_…`) → **Settings → fal.ai API Key**.
> 💡 While iterating on UI/overlays, flip on **Debug → Mock AI + mock videos**
> (`?debug=true`) instead — the server substitutes `mocks/mock-ai-generation.mp4`
> and canned AI output, so no fal.ai/Gemini credits are burned.

### 5. Supabase Postgres — `DATABASE_URL` (server-side, `.env`)
Persistent DB for Library / Calendar / Brand. **Without it, ClipZoo falls back to
SQLite (`data/clipzoo.db`) automatically — fine for solo/local use.**
1. Create a project at https://supabase.com/dashboard (free tier is plenty).
2. Project → **Connect** (top bar) → **ORMs / SQLAlchemy** tab → copy the
   **Session pooler** connection string:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
3. Put it in `.env` as `DATABASE_URL=postgresql://…` and restart the backend.
   Tables are created automatically on startup (`init_db()`).

### 6. AWS S3 (server-side, `.env`) — optional, pre-existing
Silent clip backup + galleries: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, `AWS_S3_BUCKET`.
1. AWS Console → IAM → **Users → Create user** → attach `AmazonS3FullAccess`
   (or a bucket-scoped policy).
2. User → **Security credentials → Create access key** (CLI type) → copy both values.
3. Create a bucket (S3 → Create bucket) and set all four vars in `.env`.
Skipped gracefully when unset.

## Quick matrix

| Key | Where | Needed for | Free tier |
|---|---|---|---|
| Gemini | Settings (browser) | Hooks, autofill, clip AI | ✅ |
| Upload-Post | Settings (browser) | Publish + **schedule** to TikTok/IG/YT | ✅ (10/mo) |
| ElevenLabs | Settings (browser) | Dubbing, AI-ad voiceover | ✅ |
| fal.ai | Settings (browser) | AI Actor Ads video gen | pay-per-use |
| `DATABASE_URL` (Supabase) | `.env` | Durable Library/Calendar (else SQLite) | ✅ |
| AWS S3 (4 vars) | `.env` | Clip backup, galleries | ~✅ (12 mo) |
