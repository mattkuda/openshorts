# UGC pivot build — Create flow, slideshows, library, calendar, retheme

**Created:** 2026-07-02 · **Completed:** 2026-07-02
**Owner:** Matt (executed by Claude)

## Goal
Ship the roadmap decided in `plans/clipzoo-roadmap.html`: reposition ClipZoo as
"Generate your UGC marketing" for app founders (customer #0: Evex), with P1+P2
formats, persistence, and scheduling in one pass.

## What shipped
- **Theme:** ChatGPT-light neutrals + brand leaf green `#6DB364` (from the Evex logo).
  Tokens in `dashboard/src/index.css`; STYLE_GUIDE.md updated in the same change.
- **Formats (Create tab):**
  - Hook + Demo composer (`composer.py`, `/api/compose/hook-demo`) — pre-roll hook
    card (blurred first frame + text box) or overlay style, optional CTA end-card.
  - Listicle + Before/After slideshows (`slideshow.py`, `/api/slideshow/*`) —
    exports PNG set (TikTok carousel) + MP4; brand is always the payoff slide.
  - AI talking-head ad = existing `saasshorts.py`, surfaced as a template card.
  - Gemini hook suggestions + slot autofill (`templates.py`, `/api/hooks/suggest`,
    `/api/slideshow/autofill`), grounded in the brand profile.
- **Persistence (`db.py`):** SQLAlchemy — Supabase Postgres via `DATABASE_URL`,
  SQLite fallback (`data/clipzoo.db`). Tables: brand_profiles, creations, scheduled_posts.
- **Library tab:** all creations, status pills, schedule modal, delete.
- **Calendar tab:** Buffer-style week view of `/api/schedule`; posting goes through
  Upload-Post's `scheduled_date` (no native TikTok API — see roadmap §3).
- **Brand profile:** Settings section + `/api/brand`; pre-fills every template.
- **Mock mode:** `mocks/mock-ai-generation.mp4` (AI-gen stand-in) and
  `mocks/mock-reaction.mp4` (placeholder reaction) — debug toggle "Mock AI + mock
  videos" verifies text overlays without burning credits.
- **Nav:** Create/Library/Calendar/AI Actor Ads/UGC Gallery/Settings enabled;
  Clip Generator, AI Agent, YouTube Studio disabled with SOON badges (deferred).

## Verification
- Frontend `npm run build` ✓; 16/16 endpoint smoke tests in the backend container ✓
  (`smoke_test_clipzoo.py`); rendered frames + slides visually checked ✓; app
  screenshotted with new theme/nav; brand profile survived a container restart ✓.
