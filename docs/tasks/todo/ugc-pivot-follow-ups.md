# UGC pivot — follow-ups

**Created:** 2026-07-02
**Owner:** Matt

## Goal
Close the small gaps left by the 2026-07-02 build (see done/ugc-pivot-p1-p4-build.md).

## Scope
- [ ] Fix `npm run lint` — repo has an ESLint 9 flat config (`eslint.config.js`) but
      eslint@8.57.1 installed; `npm run lint` crashes before linting (pre-existing).
      Upgrade eslint + plugins to v9 or downgrade the config.
- [ ] Reopen-and-re-edit from Library (slots are persisted; add "Edit" → SlideshowEditor
      prefilled from `creation.slots` + re-render into the same creation).
- [ ] Post NOW from Library (immediate publish, not just scheduled).
- [ ] Calendar: drag-to-reschedule; sync `posted` status back from Upload-Post.
- [ ] Supabase: create project, set `DATABASE_URL` in `.env`, verify Postgres path.
- [ ] Landing page (`Landing.jsx`) still says OpenShorts / Clip Generator — rewrite
      around "Generate your UGC marketing" (see /landing-page-copy skill).
- [ ] Dockerfile: `pip install -r requirements.txt` layer will pick up sqlalchemy on
      next `docker compose up --build` (installed ad-hoc in the running container today).
- [ ] Slideshow music bed + optional image slots (screenshots on item slides).

## Out of scope
- Native TikTok/IG APIs, paste-a-link cloner, analytics (per roadmap).
