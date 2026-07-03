# Slideshow Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ReelFarm-style "Slideshow Automations" tab: define a recurring TikTok photo-carousel recipe (topic + tone + hook bank + per-slide content directions + AI-or-collection images + posting schedule + TikTok settings), generate slideshows on demand or on schedule, and auto-post via Upload-Post — with a simpler, single-page editor UX than ReelFarm's nested modals.

**Architecture:** New SQLAlchemy models (`SlideshowAutomation`, `ImageCollection`, `CollectionImage`) following `db.py` conventions; a new `automations.py` module (Gemini text via `gemini-2.5-flash` JSON mode like `templates.py`, Gemini images via the `characters.py:_generate_image` pattern, PIL photo-slide composition reusing `slideshow.py` helpers, MP4 export via a factored-out `export_mp4`); FastAPI CRUD + generate endpoints modeled on the `/api/characters` block; an asyncio scheduler loop that fires due (time × day-of-week) slots using `.env.local` server keys. Frontend: one new nav tab (`AutomationsTab` list) + a full-page `AutomationEditor` (no modal-in-modal) + a `CollectionPickerModal`; generated slideshows land in the existing Library as `Creation` rows.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite/Postgres), google-genai (`gemini-2.5-flash`, `gemini-3.1-flash-image-preview`), PIL, FFmpeg concat; React 18 + Vite + Tailwind semantic tokens.

## Global Constraints

- `npm run lint` must pass with `--max-warnings 0` (unused lowercase vars are errors).
- Styling: semantic tokens only (`text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `bg-surface`, `border-border`, `bg-primary`, `text-primary-strong`). Never `text-white`/`text-zinc-*`/hex. Green fill → dark ink (`text-primary-foreground`); green text → `text-primary-strong`. Status text uses `-700`/`-800` ink.
- One primary button per view; cards = `bg-card border border-border rounded-xl`; modals = `fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm` + `bg-card border border-border rounded-2xl shadow-xl`.
- Every AI call must support `mock=true` (client `debug.mockAI`) with zero-cost PIL/static output — build mock-first.
- API keys: client sends `X-Gemini-Key` header per request; nothing stored server-side. Scheduled (headless) runs use `.env.local` fallbacks `GEMINI_API_KEY` / `UPLOAD_POST_API_KEY` only.
- Media bytes on disk under `creations/` (durable), DB holds web paths as strings. JSON columns are `Text` named `*_json` with `to_dict()` doing `json.loads`.
- No test infra exists in this repo; verification = `npm run lint`, `npm run build`, `python -c` import checks, and curl against a locally-run uvicorn with `mock=true`.

---

## Data shapes (single source of truth for all tasks)

```jsonc
// SlideshowAutomation.to_dict()
{
  "id": "…", "name": "Workout plan series", "status": "paused",   // active | paused
  "topic": "How I actually stick to my workout plan (promotes the Evex app)",
  "tone_preset": "conversational",   // conversational | motivational | educational | bold | calm | witty | custom
  "tone_prompt": "",                 // freeform style rules; used when preset == custom
  "hooks": ["how i went from skipping the gym to 5 days a week:", …],
  "hook_image": { "source": "collection", "image_prompt": "", "collection_id": "abc" },  // source: ai | collection
  "slides": [                        // content slides, in order
    { "id": "s1", "direction": "showing up consistently without overdoing it — supportive, ~10 words, all lowercase",
      "image": { "source": "ai", "image_prompt": "someone tying shoes by the door, morning light", "collection_id": "" } }
  ],
  "cta": { "enabled": true, "direction": "soft CTA to track your lifts with the Evex app" },
  "schedule": { "timezone": "America/New_York",
                "times": [ { "time": "09:00", "days": [0,1,2,3,4,5,6] } ] },   // days: 0=Sun … 6=Sat
  "tiktok": { "auto_post": false, "user_id": "", "platforms": ["tiktok"],
              "title_mode": "prompt", "title": "Title-case the hook",          // mode: static | prompt
              "caption_mode": "prompt", "caption": "3-5 broad lowercase hashtags" },
  "last_run_at": "…iso…", "last_run_note": "ok | error: …", "created_at": "…"
}

// ImageCollection.to_dict(images=[…])
{ "id": "…", "name": "Gym B-roll", "images": [ { "id": "…", "image_path": "/creations/collections/<cid>/<file>.jpg" } ], "created_at": "…" }

// POST /api/automations/{id}/generate response
{ "creation": <Creation.to_dict()>, "images": ["/creations/auto_…_slide01.png", …], "video_url": "/creations/auto_….mp4",
  "meta": { "hook": "…", "texts": ["…"], "title": "…", "caption": "…" } }
```

`generate_slideshow(automation_dict, api_key, mock, log)` in `automations.py` returns `(png_paths, mp4_path, meta)` where `meta = {"hook", "texts", "title", "caption"}`. Creations are saved with `kind="auto_slideshow"`, `template_key="auto_slideshow"`, `slots={"automation_id": …, "hook": …, "texts": […]}`.

---

### Task 1: DB models + image-collection endpoints

**Files:**
- Modify: `db.py` (append models before `init_db`)
- Modify: `app.py` (new section after the Characters block, ~line 2836)

**Interfaces:**
- Produces: `SlideshowAutomation`, `ImageCollection`, `CollectionImage` models; `GET/POST /api/collections`, `POST /api/collections/{cid}/images` (multipart, field `files`, multiple), `DELETE /api/collections/{cid}`, `DELETE /api/collections/{cid}/images/{image_id}`.

- [ ] **Step 1: Add models to `db.py`**

```python
class ImageCollection(Base):
    """A named pack of preset photos used by slideshow automations."""
    __tablename__ = "image_collections"
    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(120), nullable=False, default="New collection")
    created_at = Column(DateTime(timezone=True), default=_now)

    def to_dict(self, images=None):
        return {"id": self.id, "name": self.name,
                "images": images if images is not None else [],
                "created_at": self.created_at.isoformat() if self.created_at else None}


class CollectionImage(Base):
    __tablename__ = "collection_images"
    id = Column(String(32), primary_key=True, default=_uuid)
    collection_id = Column(String(32), nullable=False)
    image_path = Column(String(500), nullable=False)   # web path under /creations/collections/
    created_at = Column(DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {"id": self.id, "collection_id": self.collection_id,
                "image_path": self.image_path}


class SlideshowAutomation(Base):
    """A recurring TikTok photo-carousel recipe (ReelFarm-style automation)."""
    __tablename__ = "slideshow_automations"
    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(120), nullable=False, default="New automation")
    status = Column(String(20), default="paused")      # active | paused
    topic = Column(Text, default="")
    tone_preset = Column(String(40), default="conversational")
    tone_prompt = Column(Text, default="")
    hooks_json = Column(Text, default="[]")
    hook_image_json = Column(Text, default="{}")
    slides_json = Column(Text, default="[]")
    cta_json = Column(Text, default="{}")
    schedule_json = Column(Text, default="{}")
    tiktok_json = Column(Text, default="{}")
    last_fired_slot = Column(String(60), default="")   # "YYYY-MM-DD|HH:MM" dedupe marker
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_note = Column(String(300), default="")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "status": self.status,
            "topic": self.topic, "tone_preset": self.tone_preset, "tone_prompt": self.tone_prompt,
            "hooks": json.loads(self.hooks_json or "[]"),
            "hook_image": json.loads(self.hook_image_json or "{}"),
            "slides": json.loads(self.slides_json or "[]"),
            "cta": json.loads(self.cta_json or "{}"),
            "schedule": json.loads(self.schedule_json or "{}"),
            "tiktok": json.loads(self.tiktok_json or "{}"),
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_run_note": self.last_run_note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
```

- [ ] **Step 2: Collections endpoints in `app.py`** — new section header comment `# ClipZoo Slideshow Automations`, import `ImageCollection, CollectionImage, SlideshowAutomation` from db. `COLLECTIONS_DIR = os.path.join(CREATIONS_DIR, "collections")`. Upload endpoint saves each file as `os.path.join(COLLECTIONS_DIR, cid, f"{uuid.uuid4().hex[:10]}_{safe_name}")`, jpg/png/webp only. Delete removes files from disk (same pattern as `api_library_delete`).
- [ ] **Step 3: Verify** — `python3 -c "import db; db.init_db()"` then start uvicorn and curl: create collection, list, delete. Expected: JSON round-trips.

### Task 2: `automations.py` generation engine + `export_mp4` refactor

**Files:**
- Create: `automations.py`
- Modify: `slideshow.py` (factor the ffmpeg concat block of `render_slideshow` into `export_mp4(pngs, out_dir, base_name, log=print)` and call it from `render_slideshow`)

**Interfaces:**
- Consumes: `characters._mock_image`, `characters._generate_image`, `slideshow._wrap`, `slideshow._font`, `slideshow.export_mp4`, `db` models.
- Produces:
  - `TONE_PRESETS: dict[str, str]` (keys: conversational, motivational, educational, bold, calm, witty)
  - `generate_hooks(api_key, topic, existing_hooks, n=10, mock=False) -> list[str]`
  - `generate_slideshow(automation: dict, api_key, mock=False, log=print) -> (png_paths, mp4_path, meta)`

- [ ] **Step 1: Tone presets** — short style-rule strings, e.g. conversational: `"Write like you're texting a friend — first person, lowercase-friendly, casual, no motivational-poster words, 7th-grade reading level."` (one per ReelFarm preset).
- [ ] **Step 2: `generate_hooks`** — mirrors `templates.suggest_hooks`: gemini-2.5-flash JSON mode, prompt includes topic + existing hooks ("don't repeat these") + "each hook is a scroll-stopping first-slide line, max 90 chars, lowercase TikTok-native". Mock: return `[f"{i+1} things nobody tells you about {topic[:40] or 'this'}:" ...]` variations.
- [ ] **Step 3: `_slide_texts(automation, hook, api_key, mock)`** — single gemini-2.5-flash JSON call producing `{"slides": [..one string per content slide..], "cta_text": "..." (only if cta.enabled), "title": "...", "caption": "..."}`. Prompt assembles: topic, tone (preset text or custom `tone_prompt`), the chosen hook, then a numbered list of each slide's `direction`, then title/caption instructions (from `tiktok.title/caption` when the mode is `prompt`; when mode is `static`, skip and use the static string verbatim). Mock returns `{"slides": [f"slide {i+1}: {d['direction'][:60]}" ...], "title": hook.title(), "caption": "#fyp #gymtok", "cta_text": "try it free"}`.
- [ ] **Step 4: images** — `_resolve_image(spec, used_paths, api_key, mock, out_dir, tag)`: `source=="collection"` → random un-used `CollectionImage` for that collection (query via `get_session()`; disk path from web path); `source=="ai"` → `characters._generate_image(api_key, [prompt + " Photorealistic, candid smartphone photo aesthetic, vertical 9:16, no text, no watermark."], out_path)` or `characters._mock_image(tag, out_path, seed=prompt)` in mock. Empty/missing spec → mock-style neutral placeholder.
- [ ] **Step 5: `_compose_slide(image_path, text, out_path)`** — PIL: open, cover-crop/resize to 1080×1920, 25% black overlay (`Image.new("RGB"…)` blend or alpha rectangle), then TikTok-style caption: `slideshow._wrap` at `int(W*0.8)`, font `_font(64)`, white fill with black `stroke_width=4, stroke_fill=(0,0,0)`, block vertically centered at `int(H*0.30)`.
- [ ] **Step 6: `generate_slideshow`** — hook = `random.choice(hooks)` (error if empty); texts via Step 3; slide order = hook slide (text=hook) + content slides + optional CTA; images per Step 4 (hook uses `hook_image`, CTA reuses hook image spec); compose all → `export_mp4` → return `(pngs, mp4, meta)`.
- [ ] **Step 7: Verify** — `python3 - <<'EOF'` script that calls `generate_slideshow` with a 2-slide mock automation dict and asserts PNG count == 3 (hook+2) and mp4 exists. Expected: passes with mock=True, no API key.

### Task 3: Automation CRUD + generate + hook-gen endpoints; Library label

**Files:**
- Modify: `app.py` (after collections endpoints)
- Modify: `dashboard/src/components/LibraryTab.jsx:5` (add `auto_slideshow: 'Slideshow'` to `KIND_LABELS`)

**Interfaces:**
- Produces: `GET/POST /api/automations`, `GET/PATCH/DELETE /api/automations/{aid}`, `POST /api/automations/{aid}/hooks/generate` (body `{mock}`, header `X-Gemini-Key`) → `{hooks}`, `POST /api/automations/{aid}/generate` (body `{mock}`, header `X-Gemini-Key`) → generate-response shape above.

- [ ] **Step 1: Pydantic models** — `AutomationUpdateRequest` with all-optional fields (`name, status, topic, tone_preset, tone_prompt, hooks, hook_image, slides, cta, schedule, tiktok`); PATCH writes only provided fields (`json.dumps` for dict/list fields). POST `/api/automations` accepts `{name?}` and seeds defaults: one content slide, schedule `{timezone: req.timezone or "UTC", times: [{"time":"09:00","days":[0,1,2,3,4,5,6]}]}`, tiktok `{auto_post: False, platforms:["tiktok"], title_mode:"prompt", title:"Title-case the hook", caption_mode:"prompt", caption:"3-5 broad lowercase hashtags about the topic"}`.
- [ ] **Step 2: generate endpoint** — mirrors `api_slideshow_render`: `asyncio.to_thread(generate_slideshow, …)`, saves creation via `_save_creation(kind="auto_slideshow", …)`, updates `last_run_at/last_run_note`, returns shape above. Key guard identical to characters (`if not req.mock and not x_gemini_key: 400`).
- [ ] **Step 3: Verify** — curl: POST create → PATCH slides/schedule → POST generate `{"mock":true}` → expect images+video paths; GET /api/library shows the `auto_slideshow` creation.

### Task 4: Scheduler loop (server-side recurring generation + auto-post)

**Files:**
- Modify: `app.py` (startup event + loop function, near the automations section)
- Modify: `automations.py` (add `post_to_upload_post(mp4_disk_path, title, platforms, user_id, api_key) -> str` — sync httpx multipart POST to `https://api.upload-post.com/api/upload`, no `scheduled_date` (posts immediately), returns response text; copied from `api_schedule_create`'s payload logic)

**Interfaces:**
- Consumes: `generate_slideshow`, env `GEMINI_API_KEY`, `UPLOAD_POST_API_KEY`.

- [ ] **Step 1: due-slot math** — `zoneinfo.ZoneInfo(schedule["timezone"])`; now in that tz; for each `t` in `times`: due if `now.strftime("%H:%M") == t["time"]` and `((now.weekday()+1) % 7) in t["days"]` (converts Monday=0 to Sunday=0). Slot key `f"{now:%Y-%m-%d}|{t['time']}"` compared to `last_fired_slot` for dedupe.
- [ ] **Step 2: loop** — `async def _automation_scheduler(): while True: await asyncio.sleep(30)` + scan active automations; on due: set `last_fired_slot`, then `asyncio.to_thread(generate_slideshow…)` with `mock = not env GEMINI_API_KEY`; on `tiktok.auto_post and env UPLOAD_POST_API_KEY and tiktok.user_id`: post mp4, write a `ScheduledPost` row (`status="posted"`, `scheduled_at=now iso`) so the Calendar shows it; always update `last_run_at/last_run_note` (errors recorded, never raised). Register via `@app.on_event("startup")` → `asyncio.create_task(_automation_scheduler())`.
- [ ] **Step 3: Verify** — unit-style: set an automation's time to now+1min in an active status with mock env, run server, watch log line fire once (and not twice).

### Task 5: Nav wiring + AutomationsTab list view

**Files:**
- Modify: `dashboard/src/App.jsx` (import + navItems + workspace branch)
- Create: `dashboard/src/components/AutomationsTab.jsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/automations`, `POST /api/automations/{id}/generate`, `GET /api/library` (for recent thumbnails), props `{ geminiApiKey, uploadPostKey, uploadUserId, userProfiles, debug }`.
- Produces: `<AutomationsTab …/>`; internal view state `view: 'list' | automationId` — the editor (Task 6) is rendered by this component.

- [ ] **Step 1: App.jsx** — add `Repeat` to the lucide import; navItems after `create`: `{ id: 'automations', label: 'Automations', icon: Repeat }`; workspace: `{activeTab === 'automations' && (<AutomationsTab geminiApiKey={apiKey} uploadPostKey={uploadPostKey} uploadUserId={uploadUserId} userProfiles={userProfiles} debug={debug} />)}`.
- [ ] **Step 2: list view** — own scroll root `h-full overflow-y-auto custom-scrollbar p-6 md:p-10`; header (title + "New automation" `.btn-primary`); card grid `grid sm:grid-cols-2 xl:grid-cols-3 gap-4`. Card: status pill (`active` = `bg-green-500/10 text-green-700`, `paused` = neutral), name, 3-thumb strip of that automation's most recent `auto_slideshow` creations (filter library by `slots.automation_id`, `aspect-[9/16]` thumbs, `bg-black`), schedule summary line ("1×/day · 7/wk · 9:00 AM"), TikTok account line (from `tiktok.user_id` or "No account linked"), footer buttons: Generate now (secondary), Pause/Resume (ghost), Edit (secondary), Delete (ghost trash w/ `window.confirm`). Empty state mirrors LibraryTab's.
- [ ] **Step 3: New automation** — POST `/api/automations` with `{name: "New automation", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone}` then open editor on the returned id.
- [ ] **Step 4: Verify** — `npm run lint && npm run build` pass; tab renders with backend running.

### Task 6: AutomationEditor + CollectionPickerModal

**Files:**
- Create: `dashboard/src/components/AutomationEditor.jsx`
- Create: `dashboard/src/components/CollectionPickerModal.jsx`

**Interfaces:**
- Consumes: `GET /api/automations/{id}`, `PATCH /api/automations/{id}`, `POST /api/automations/{id}/hooks/generate`, `POST /api/automations/{id}/generate`, `GET/POST /api/collections`, `POST /api/collections/{cid}/images`; props `{ automationId, geminiApiKey, userProfiles, debug, onBack, onSaved }`.
- Produces: full-page editor; `CollectionPickerModal({ open, onClose, onPick })` returns `{collection_id, name, cover}`.

- [ ] **Step 1: Editor skeleton** — SlideshowEditor pattern: back button, name (inline `input-field`), status toggle (Resume/Pause pill button), **Save** primary button (PATCH whole draft; disabled until dirty). Layout `grid lg:grid-cols-[1fr_300px]`: left = stacked section cards; right = sticky 9:16 preview.
- [ ] **Step 2: Content card** — topic textarea (label "What's this series about?"), tone `<select>` (presets + Custom; Custom reveals textarea), Hooks: textarea `rows=6` helper "One hook per line — each post picks one" + "Generate 10 more" button (`X-Gemini-Key`, `mock: !!debug?.mockAI || !geminiApiKey`).
- [ ] **Step 3: Slides card** — Hook slide row (fixed, badge "Hook", image-source control only) then draggable-free ordered content-slide rows: each an inset `bg-muted border border-border rounded-lg p-3` well with "Slide N" label + delete; direction textarea (placeholder "What should this slide say? e.g. reaffirm the problem — ~10 words, all lowercase"); image-source segmented control (AI image | Collection): AI → prompt input; Collection → button showing picked collection name (opens CollectionPickerModal). "+ Add slide" ghost button. CTA well at the bottom: toggle + direction input.
- [ ] **Step 4: Schedule card (ReelFarm layout)** — header row: "Posting times" + timezone `<select>` (reuse the tz list approach; default from automation); summary line `"${times.length}× per day · ${totalPerWeek}/week"`. Each time row: `<input type="time">` + 7 day chips (`Su Mo Tu We Th Fr Sa`, toggle buttons, selected = `border-primary bg-primary/10 text-primary-strong`) + remove ghost X. "+ Add posting time" full-width secondary button (new row defaults: "12:00", all 7 days).
- [ ] **Step 5: TikTok card** — auto-post toggle + note "Scheduled runs use the server-side keys from .env.local"; account `<select>` from `userProfiles` (fallback message linking to Settings when empty); Title + Caption fields each with a small Static|AI-prompt segmented toggle.
- [ ] **Step 6: Preview + Generate now** — right column: 9:16 `bg-black rounded-xl` phone frame; before generation shows slide list stub (hook + directions); "Generate now" primary→ POST generate → show returned PNGs as swipeable strip (prev/next buttons + dots) + link "Saved to Library". Error text `text-red-700`.
- [ ] **Step 7: CollectionPickerModal** — standard modal shell; grid of collections (cover = first image, name, count) + "New collection" (name prompt → POST) + per-collection upload button (`<input type="file" multiple accept="image/*">` → multipart POST). Clicking a collection calls `onPick`.
- [ ] **Step 8: Verify** — `npm run lint && npm run build`.

### Task 7: End-to-end verification + polish

- [ ] **Step 1:** Backend up (`uvicorn app:app --port 8000`), frontend `npm run dev`; walk the flow in the browser with `debug.mockAI` on: create automation → edit all sections → save → generate now → check Library + Calendar.
- [ ] **Step 2:** `npm run lint`, `npm run build`, `python3 -c "import app"` all clean.
- [ ] **Step 3:** Commit(s) per task with conventional messages.

## Self-review notes

- Spec coverage: overarching prompt (topic) ✓, hook slide + content slides ✓, per-slide content direction ✓, AI-prompt-or-collection images ✓ (both hook + content), typed/edited text — directions are typed per slide; generated text is editable post-hoc in Library re-render loop (kept out of scope: inline text editing of a generated carousel — noted as follow-up), ReelFarm schedule layout ✓ (time rows + day chips all-on by default + add posting time), TikTok account linking ✓ (Upload-Post profiles), simpler-than-ReelFarm ✓ (one page, no nested modals except image picker).
- Types consistent: `generate_slideshow` returns `(pngs, mp4, meta)` everywhere; `days` are ints 0=Sun..6=Sat in both scheduler math and day-chip UI.
