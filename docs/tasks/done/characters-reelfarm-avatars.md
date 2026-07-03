# Characters — ReelFarm-style reusable AI avatars

**Created:** 2026-07-02 · **Completed:** 2026-07-02
**Owner:** Matt (executed by Claude)

## Goal
Heavily reference ReelFarm's `/dashboard/ugc` and `/dashboard/characters` (inspected
live via Chrome + founder screenshots) to add reusable AI characters usable across
hook demos, video creations, and slideshows.

## What shipped
- **Characters system** (`characters.py`, `CharactersTab.jsx`, DB `characters` +
  `character_looks`): attribute chips (gender/age/ethnicity/hair/style + extra) →
  **Gemini** (`gemini-3.1-flash-image-preview`, 9:16) portrait → per-character
  **looks** via scene prompts with the portrait as reference image (identity stays
  consistent — same approach as ReelFarm's "Nano Banana Pro"). Mock mode renders PIL
  placeholders for zero-cost UI work. Runs on the Gemini key — fal budget untouched.
- **Hook+Demo avatar step**: None / My characters / Upload video tabs; avatar image →
  Ken Burns push-in hook segment; avatar video (or mock-reaction clip) → trimmed hook
  segment; **outline text style** (white + black stroke, TikTok-native) alongside the
  card style; text position top/center/bottom.
- **Slideshows**: optional circular character image on title + CTA slides.
- **AI Actor Ads**: "My characters" strip in the actor picker (sets `selected_actor_url`).

## Verification
- 8/8 characters API smoke tests (container); avatar-image + avatar-video compose
  paths rendered and frames visually checked; every UI step Chrome-verified
  (create character → look → avatar hook+demo → slideshow with character).
- **Real-API test:** "Runner Rachel" — real Gemini portrait (gym selfie) + one look
  ("sitting in her parked car after a run") → same face/hair/outfit across both.
  Cost: 2 Gemini image generations; $0 fal.
