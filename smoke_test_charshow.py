import os, json, time
os.environ.pop("DATABASE_URL", None)
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import app as appmod
import charshow
from characters import POSE_BANK
from db import get_session, Creation as CreationRow

ok = 0; total = 0
def check(name, cond, extra=""):
    global ok, total; total += 1; ok += cond
    print(("PASS" if cond else "FAIL"), name, "" if cond else extra)

# NOTE: TestClient must be used as a context manager here — that's what keeps ONE
# persistent event loop (portal) alive across requests, matching a real running
# server, so the fire-and-forget asyncio.create_task() background jobs (poses/
# generate) actually get to run between our polling calls.
with TestClient(appmod.app) as client:

    def poll_job(job_id, timeout=60):
        """GET /api/charshow/status/{job_id} until status is completed/failed."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = client.get(f"/api/charshow/status/{job_id}")
            if r.status_code != 200:
                return r, None
            job = r.json()
            if job["status"] in ("completed", "failed"):
                return r, job
            time.sleep(0.2)
        return None, None

    # ---- seeded EVEX Mascot character (cartoon style) ---------------------
    r = client.get("/api/characters")
    chars = r.json()["characters"]
    mascot = next((c for c in chars if c["name"] == "EVEX Mascot"), None)
    check("EVEX Mascot seeded", mascot is not None, str([c["name"] for c in chars]))
    char_id = mascot["id"] if mascot else None
    if char_id is None:
        r = client.post("/api/characters", json={"name": "Mock Cartoon",
                        "attributes": {"character_style": "cartoon"}, "mock": True})
        check("fallback mock character created", r.status_code == 200, r.text[:300])
        char_id = r.json()["character"]["id"]

    # ---- pose pack (mock, resumable) — job + poll --------------------------
    r = client.post("/api/charshow/poses", json={"character_id": char_id, "mock": True})
    check("POST poses (mock) returns job_id", r.status_code == 200 and "job_id" in r.json(), r.text[:300])
    _, job = poll_job(r.json()["job_id"])
    check("poses job completed", job is not None and job["status"] == "completed", str(job))

    r = client.get(f"/api/charshow/poses/{char_id}")
    check("GET poses status", r.status_code == 200, r.text[:300])
    poses_status = r.json()
    check("pose pack fully generated", poses_status.get("generated_count", 0) >= len(POSE_BANK),
          str(poses_status.get("generated_count")))

    # ---- series ----------------------------------------------------------
    r = client.post("/api/charshow/series", json={
        "name": "Gym Tips Test", "character_id": char_id, "style_key": "impact",
        "accent_hex": "#00C080", "niche": "gym tips", "tone": "conversational",
        "slide_min": 3, "slide_max": 4,
        "plug": {"app_name": "EVEX", "pitch": "the AI app that programs your workouts", "screenshots": [], "position": "last"},
    })
    check("POST series", r.status_code == 200, r.text[:300])
    series = r.json()["series"]
    series_id = series["id"]

    # ---- upsert: PATCH-style update via the same endpoint with id --------
    r = client.post("/api/charshow/series", json={
        "id": series_id, "name": "Gym Tips Test (renamed)", "character_id": char_id,
        "style_key": "impact", "accent_hex": "#00C080", "niche": "gym tips",
        "tone": "conversational", "slide_min": 3, "slide_max": 4,
    })
    check("POST series with id upserts (no duplicate row)",
          r.status_code == 200 and r.json()["series"]["id"] == series_id
          and r.json()["series"]["name"] == "Gym Tips Test (renamed)", r.text[:300])
    series = r.json()["series"]

    # ---- generate 2 decks (mock) — job + poll -----------------------------
    r = client.post("/api/charshow/generate", json={"series_id": series_id, "count": 2, "mock": True})
    check("POST generate (mock) returns job_id", r.status_code == 200 and "job_id" in r.json(), r.text[:500])
    _, job = poll_job(r.json()["job_id"])
    check("generate job completed", job is not None and job["status"] == "completed", str(job))
    result = (job or {}).get("result") or {}
    creations = result.get("creations", [])
    check("2 decks generated", len(creations) == 2, str(len(creations)))
    check("result.creation is the first deck", result.get("creation") == (creations[0] if creations else None))

    # ---- slide PNGs are 1080x1440 (3:4); slide count within series range +hook+plug
    dims_ok, counts_ok = True, True
    lo, hi = 1 + series["slide_min"] + 1, 1 + series["slide_max"] + 1
    for c in creations:
        n = len(c["slots"]["slides"])
        if not (lo <= n <= hi) or len(c["image_paths"]) != n:
            counts_ok = False
        for web_path in c["image_paths"]:
            fp = os.path.join("creations", os.path.basename(web_path))
            if not os.path.exists(fp):
                dims_ok = False
                continue
            with Image.open(fp) as im:
                if im.size != (1080, 1440):
                    dims_ok = False
    check("slide PNGs are 1080x1440 (3:4)", dims_ok)
    check("slide count within series range + hook + plug", counts_ok, f"expected {lo}-{hi}")

    # ---- deck payloads carry lifecycle fields -------------------------------
    check("deck payload includes created_at/updated_at/status/scheduled_for",
          all(c.get("created_at") and c.get("updated_at") and "status" in c and "scheduled_for" in c for c in creations),
          str(creations[0] if creations else None))

    # ---- mock deck text: at least one list slide, with a tip and a bullet_poses slide
    all_slides = [sl for c in creations for sl in c["slots"]["slides"]]
    list_slides = [sl for sl in all_slides if sl.get("layout") == "list"]
    check("mock deck produced at least one list slide", len(list_slides) > 0, str(len(all_slides)))
    check("a list slide has a tip", any(sl.get("tip") for sl in list_slides), str(list_slides))
    check("a list slide has bullet_poses", any(sl.get("bullet_poses") for sl in list_slides), str(list_slides))
    check("a bullet_poses list slide's bullets carry resolved poses",
          any(b.get("pose", {}).get("path") for sl in list_slides if sl.get("bullet_poses") for b in sl.get("bullets", [])),
          str([sl.get("bullets") for sl in list_slides if sl.get("bullet_poses")]))

    # ---- accent parsing produced accent-colored pixels --------------------
    preset = charshow.STYLE_PRESETS["impact"]
    img = Image.new("RGB", (charshow.W, charshow.H), preset["bg"])
    charshow.draw_headline(ImageDraw.Draw(img), "This is *accented* text", charshow.HOOK_BOX, preset,
                           max_size=170, min_size=32)
    accent_rgb = tuple(int(preset["accent"].lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    px = img.load()
    found_accent = any(px[x, y] == accent_rgb for x in range(0, charshow.W, 2) for y in range(0, charshow.H, 2))
    check("accent parsing produced accent-colored pixels", found_accent)

    # ---- no headline overflow: autofit never returns below its floor ------
    long_text = "This is a much longer headline that still has to fit inside its layout box " * 3
    size, _bottom_y = charshow.draw_headline(
        ImageDraw.Draw(Image.new("RGB", (charshow.W, charshow.H), "#FFFFFF")),
        long_text, charshow.HOOK_BOX, preset, max_size=170, min_size=32)
    check("autofit returns size >= floor", size >= 32, str(size))

    # ---- list-slide render produces accent-circle pixels ------------------
    # (headline has no asterisks, so any accent-colored pixel must come from a bullet circle)
    list_slide = {
        "role": "content", "layout": "list", "text": "Two ways to fix this",
        "bullets": [
            {"label": "Fix one", "text": "Do the first thing."},
            {"label": "Fix two", "text": "Do the second thing."},
        ],
        "tip": "Try both for a week.", "bullet_poses": False,
        "pose_hint": "", "pose": {"key": None, "path": None},
    }
    list_out = os.path.join("creations", "smoketest_list_slide.png")
    charshow.compose_list_slide(list_slide, list_out, preset, log=lambda *a: None)
    with Image.open(list_out) as im:
        px2 = im.load()
        found_circle_accent = any(px2[x, y] == accent_rgb for x in range(0, charshow.W, 2) for y in range(0, charshow.H, 2))
    check("list-slide render produces accent-circle pixels", found_circle_accent)
    if os.path.exists(list_out):
        os.remove(list_out)

    # ---- export writes captions.md and no longer flips status -------------
    r = client.post("/api/charshow/export", json={"creation_ids": [c["id"] for c in creations]})
    check("POST export", r.status_code == 200, r.text[:300])
    batch_path = r.json().get("path", "")
    captions_path = os.path.join(batch_path, "captions.md") if batch_path else ""
    captions_ok = bool(batch_path) and os.path.exists(captions_path)
    check("captions.md exists", captions_ok, batch_path)
    if captions_ok:
        captions_text = open(captions_path).read()
        check("captions.md covers both decks", captions_text.count("## Deck") == 2, captions_text[:200])

    r = client.get("/api/library")
    lib = {c["id"]: c for c in r.json()["creations"]}
    check("export no longer flips creation.status (stays draft)",
          all(lib.get(c["id"], {}).get("status") == "draft" for c in creations),
          str([lib.get(c["id"], {}).get("status") for c in creations]))

    # ---- rerender with edited structured slides changes the output file ---
    first = creations[0]
    old_hook_fp = os.path.join("creations", os.path.basename(first["image_paths"][0]))
    old_bytes = open(old_hook_fp, "rb").read()

    edited_slides = json.loads(json.dumps(first["slots"]["slides"]))  # deep copy
    edited_slides[0]["text"] = "*Totally* new hook text"
    r = client.post("/api/charshow/rerender", json={"creation_id": first["id"], "slides": edited_slides})
    check("POST rerender (structured slides)", r.status_code == 200, r.text[:300])
    updated = r.json()["creation"]
    check("rerender updated stored text", updated["slots"]["slides"][0]["text"] == edited_slides[0]["text"])

    new_hook_fp = os.path.join("creations", os.path.basename(updated["image_paths"][0]))
    new_bytes = open(new_hook_fp, "rb").read() if os.path.exists(new_hook_fp) else b""
    check("rerender changed slide file content", bool(new_bytes) and new_bytes != old_bytes)

    # ---- legacy 'texts' rerender still works (pre-v2 decks lack slots.slides) ----
    pose_paths = [p["look"]["image_path"] for p in poses_status["poses"] if p.get("look")][:3]
    legacy_slots = {
        "roles": ["hook", "content", "plug"],
        "poses_used": [
            {"key": "k1", "path": pose_paths[0] if len(pose_paths) > 0 else None},
            {"key": "k2", "path": pose_paths[1] if len(pose_paths) > 1 else None},
            {"key": "k3", "path": pose_paths[2] if len(pose_paths) > 2 else None},
        ],
        "plug_screenshot": None, "style_key": "impact", "accent_hex": "#00C080",
        "caption": "legacy caption", "first_comment": "legacy comment",
    }
    with get_session() as s:
        legacy_row = CreationRow(kind="char_slideshow", title="Legacy deck", template_key="char_slideshow",
                                  slots_json=json.dumps(legacy_slots), image_paths_json=json.dumps([]))
        s.add(legacy_row)
        s.commit()
        legacy_id = legacy_row.id

    r = client.post("/api/charshow/rerender", json={
        "creation_id": legacy_id,
        "texts": ["*Legacy* hook text", "Legacy content slide", "*Legacy* plug headline"],
    })
    check("POST rerender with legacy texts", r.status_code == 200, r.text[:300])
    legacy_updated = r.json()["creation"]
    legacy_slides_out = legacy_updated["slots"].get("slides")
    check("legacy rerender produced structured slides going forward",
          isinstance(legacy_slides_out, list) and len(legacy_slides_out) == 3, str(legacy_slides_out))
    check("legacy rerender wrote slide files",
          len(legacy_updated["image_paths"]) == 3
          and all(os.path.exists(os.path.join("creations", os.path.basename(p))) for p in legacy_updated["image_paths"]))

    r = client.delete(f"/api/charshow/deck/{legacy_id}")
    check("DELETE legacy test deck", r.status_code == 200, r.text[:200])

    # ---- PATCH deck status/scheduled_for round-trip ------------------------
    target = creations[1]
    r = client.patch(f"/api/charshow/deck/{target['id']}", json={"status": "scheduled", "scheduled_for": "2026-09-15"})
    check("PATCH deck to scheduled", r.status_code == 200, r.text[:300])
    patched = r.json().get("creation", {})
    check("PATCH set status=scheduled", patched.get("status") == "scheduled", str(patched.get("status")))
    check("PATCH set scheduled_for", patched.get("scheduled_for") == "2026-09-15", str(patched.get("scheduled_for")))

    r = client.patch(f"/api/charshow/deck/{target['id']}", json={"status": "scheduled"})
    check("PATCH status=scheduled without scheduled_for is rejected", r.status_code == 400, r.text[:200])

    r = client.patch(f"/api/charshow/deck/{target['id']}", json={"status": "draft"})
    check("PATCH back to draft clears scheduled_for",
          r.status_code == 200 and r.json()["creation"]["status"] == "draft"
          and r.json()["creation"]["scheduled_for"] is None, r.text[:300])

    # ---- DELETE removes the row + its slide files from disk ---------------
    del_paths = [os.path.join("creations", os.path.basename(p)) for p in target["image_paths"]]
    r = client.delete(f"/api/charshow/deck/{target['id']}")
    check("DELETE deck", r.status_code == 200 and r.json().get("ok") is True, r.text[:200])

    r = client.get("/api/library")
    still_there = any(c["id"] == target["id"] for c in r.json()["creations"])
    check("DELETE removed creation row", not still_there)
    check("DELETE removed slide files from disk", all(not os.path.exists(p) for p in del_paths), str(del_paths))

    # ---- plug screenshot path migration -------------------------------------
    legacy_path = "data/plug_screenshots/evex/01-active-workout.png"
    rewritten = appmod._rewrite_plug_screenshot_path(legacy_path)
    check("legacy plug screenshot path rewritten to /creations",
          rewritten == "/creations/plug_screenshots/evex/01-active-workout.png", rewritten)
    already_web = "/creations/plug_screenshots/evex/01-active-workout.png"
    check("already-migrated plug screenshot path passes through unchanged",
          appmod._rewrite_plug_screenshot_path(already_web) == already_web)

    r = client.get("/api/charshow/series")
    evex_series = next((s for s in r.json()["series"] if s["name"] == "EVEX Gym Tips"), None)
    if evex_series:
        shots = (evex_series.get("plug") or {}).get("screenshots") or []
        check("EVEX Gym Tips plug screenshots migrated off data/ path",
              bool(shots) and all(not str(p).startswith("data/plug_screenshots/") for p in shots), str(shots))
        check("migrated plug screenshot files exist on disk",
              all(os.path.exists(os.path.join("creations", p[len("/creations/"):]))
                  for p in shots if str(p).startswith("/creations/")), str(shots))
    else:
        check("EVEX Gym Tips series present for screenshot-migration check", False, "series not found")

    # ---- render_mode="ai_full" (mock: no API calls, placeholder slide images) ----------
    import charshow as cs
    ai_series = {"id": "smoketest", "character_id": char_id, "render_mode": "ai_full",
                 "accent_hex": "#00C080", "niche": "gym tips", "tone": "confident",
                 "slide_min": 2, "slide_max": 2, "topic_bank": {"training": ["ai full test topic"]},
                 "used_topics": [], "plug": {"app_name": "EVEX", "pitch": "AI trainer", "screenshots": []}}
    ai_pngs, ai_meta = cs.generate_deck(ai_series, api_key=None, mock=True)
    check("ai_full mock deck renders hook+content+plug", len(ai_pngs) == 4, str(len(ai_pngs)))
    check("ai_full meta carries render_mode + character_id",
          ai_meta.get("render_mode") == "ai_full" and ai_meta.get("character_id") == char_id)
    edited = json.loads(json.dumps(ai_meta["slides"]))
    edited[0]["text"] = "edited hook text"
    rr_meta = {"slides": ai_meta["slides"], "old_images": [f"/creations/{os.path.basename(p)}" for p in ai_pngs],
               "character_id": char_id, "plug_screenshot": None, "accent_hex": "#00C080"}
    rr_pngs, _ = cs.rerender_deck_ai_full(rr_meta, edited, api_key=None, mock=True)
    check("ai_full rerender regenerates only the edited slide",
          rr_pngs[0] != ai_pngs[0] and rr_pngs[1:] == ai_pngs[1:], str(list(zip(ai_pngs, rr_pngs))))
    try:
        cs.rerender_deck_ai_full(rr_meta, edited, api_key=None, mock=False)
        check("ai_full rerender without key raises", False, "no error raised")
    except ValueError:
        check("ai_full rerender without key raises", True)
    for p in set(ai_pngs + rr_pngs):
        if os.path.exists(p):
            os.remove(p)
    check("ai_full series upsert accepts render_mode",
          client.post("/api/charshow/series", json={"name": "AI Mode Test", "character_id": char_id,
                                                    "render_mode": "ai_full"}).json()["series"]["render_mode"] == "ai_full")
    r = client.get("/api/charshow/series")
    aimode_id = next(s["id"] for s in r.json()["series"] if s["name"] == "AI Mode Test")
    client.delete(f"/api/charshow/series/{aimode_id}")

    # ---- cleanup: remove the test series + remaining deck (keep the mascot + pose pack)
    for c in creations:
        client.delete(f"/api/library/{c['id']}")
    client.delete(f"/api/charshow/series/{series_id}")

print("=" * 30)
print(f"{ok}/{total} passed")
