import os, json, time
os.environ.pop("DATABASE_URL", None)
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import app as appmod
import charshow
from characters import POSE_BANK

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
    check("pose pack fully generated", poses_status.get("generated_count") == len(POSE_BANK),
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

    # ---- slide PNGs are 1080x1920; slide count within series range +hook+plug
    dims_ok, counts_ok = True, True
    lo, hi = 1 + series["slide_min"] + 1, 1 + series["slide_max"] + 1
    for c in creations:
        n = len(c["slots"]["texts"])
        if not (lo <= n <= hi) or len(c["image_paths"]) != n:
            counts_ok = False
        for web_path in c["image_paths"]:
            fp = os.path.join("creations", os.path.basename(web_path))
            if not os.path.exists(fp):
                dims_ok = False
                continue
            with Image.open(fp) as im:
                if im.size != (1080, 1920):
                    dims_ok = False
    check("slide PNGs are 1080x1920", dims_ok)
    check("slide count within series range + hook + plug", counts_ok, f"expected {lo}-{hi}")

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
    size = charshow.draw_headline(ImageDraw.Draw(Image.new("RGB", (charshow.W, charshow.H), "#FFFFFF")),
                                  long_text, charshow.HOOK_BOX, preset, max_size=170, min_size=32)
    check("autofit returns size >= floor", size >= 32, str(size))

    # ---- captions.md written by export with both decks; export publishes --
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
    check("export flips creation.status to 'published'",
          all(lib.get(c["id"], {}).get("status") == "published" for c in creations),
          str([lib.get(c["id"], {}).get("status") for c in creations]))

    # ---- rerender with edited text changes the output file ----------------
    first = creations[0]
    old_hook_fp = os.path.join("creations", os.path.basename(first["image_paths"][0]))
    old_bytes = open(old_hook_fp, "rb").read()

    new_texts = list(first["slots"]["texts"])
    new_texts[0] = "*Totally* new hook text"
    r = client.post("/api/charshow/rerender", json={"creation_id": first["id"], "texts": new_texts})
    check("POST rerender", r.status_code == 200, r.text[:300])
    updated = r.json()["creation"]
    check("rerender updated stored text", updated["slots"]["texts"][0] == new_texts[0])

    new_hook_fp = os.path.join("creations", os.path.basename(updated["image_paths"][0]))
    new_bytes = open(new_hook_fp, "rb").read() if os.path.exists(new_hook_fp) else b""
    check("rerender changed slide file content", bool(new_bytes) and new_bytes != old_bytes)

    # ---- cleanup: remove the test series + decks (keep the mascot + pose pack)
    for c in creations:
        client.delete(f"/api/library/{c['id']}")
    client.delete(f"/api/charshow/series/{series_id}")

print("=" * 30)
print(f"{ok}/{total} passed")
