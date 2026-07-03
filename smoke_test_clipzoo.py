import os, json
os.environ.pop("DATABASE_URL", None)  # force SQLite fallback for the smoke test

from fastapi.testclient import TestClient
import app as appmod
client = TestClient(appmod.app)

results = []
def check(name, cond, extra=""):
    results.append((name, cond))
    print(("PASS" if cond else "FAIL"), name, "" if cond else extra)

r = client.get("/api/templates")
check("GET /api/templates", r.status_code == 200 and len(r.json()["templates"]) == 4)

r = client.post("/api/hooks/suggest", json={"product_desc": "Evex - AI fitness app", "mock": True})
check("POST /api/hooks/suggest (mock)", r.status_code == 200 and len(r.json()["hooks"]) == 8, r.text[:200])

r = client.post("/api/brand", json={"name": "Evex", "tagline": "The AI fitness app that plans it FOR you", "cta_text": "Get Evex free", "niche": "fitness apps"})
check("POST /api/brand", r.status_code == 200 and r.json()["brand"]["name"] == "Evex", r.text[:200])
r = client.get("/api/brand")
check("GET /api/brand", r.status_code == 200 and r.json()["brand"]["name"] == "Evex")

r = client.post("/api/slideshow/autofill", json={"template_key": "listicle", "niche": "fitness apps", "mock": True})
slots = r.json().get("slots", {})
check("POST /api/slideshow/autofill (mock)", r.status_code == 200 and slots.get("items", [])[-1]["name"] == "Evex", r.text[:200])

r = client.post("/api/slideshow/render", json={"template_key": "listicle", "slots": slots, "title": slots.get("title")})
d = r.json() if r.status_code == 200 else {}
check("POST /api/slideshow/render (listicle)", r.status_code == 200 and len(d.get("images", [])) >= 4 and os.path.exists("creations/" + os.path.basename(d["video_url"])), r.text[:300])
creation_id = d.get("creation", {}).get("id")

r = client.post("/api/slideshow/render", json={"template_key": "before_after", "slots": {"title": "30 days of Evex", "before_text": "Guessing my workouts", "after_text": "A plan that adapts daily", "cta_text": "Get Evex free"}})
check("POST /api/slideshow/render (before_after)", r.status_code == 200 and len(r.json().get("images", [])) == 4, r.text[:300])

r = client.post("/api/compose/hook-demo", data={"hook_text": "POV: your fitness app finally plans FOR you", "style": "preroll", "cta_text": "Get Evex free", "use_mock": "true"})
check("POST /api/compose/hook-demo (mock, preroll)", r.status_code == 200, r.text[:200])
job_id = r.json().get("job_id")
jd = client.get(f"/api/status/{job_id}").json()
video_ok = jd.get("status") == "completed" and os.path.exists("creations/" + os.path.basename(jd["result"]["video_url"]))
check("compose preroll job completed + file exists", video_ok, json.dumps(jd)[:400])

r = client.post("/api/compose/hook-demo", data={"hook_text": "This one hook doubled my installs", "style": "overlay", "use_mock": "true"})
jid2 = r.json().get("job_id")
jd2 = client.get(f"/api/status/{jid2}").json()
check("compose overlay job completed", jd2.get("status") == "completed", json.dumps(jd2)[:400])

r = client.get("/api/library")
check("GET /api/library", r.status_code == 200 and len(r.json().get("creations", [])) >= 4, r.text[:200])

r = client.post("/api/schedule", json={"creation_id": creation_id, "platforms": ["tiktok", "youtube"], "scheduled_at": "2026-07-06T09:00:00Z", "timezone": "America/New_York", "mock": True})
check("POST /api/schedule (mock)", r.status_code == 200 and r.json()["scheduled"]["status"] == "scheduled", r.text[:300])
sched_id = r.json().get("scheduled", {}).get("id")
r = client.get("/api/schedule")
check("GET /api/schedule", r.status_code == 200 and len(r.json()["scheduled"]) >= 1)
r = client.delete(f"/api/schedule/{sched_id}")
check("DELETE /api/schedule/{id}", r.status_code == 200)

r = client.delete(f"/api/library/{creation_id}")
check("DELETE /api/library/{id}", r.status_code == 200)

r = client.get("/mocks/mock-ai-generation.mp4")
check("GET /mocks/mock-ai-generation.mp4", r.status_code == 200 and len(r.content) > 1000000)

failed = [n for n, c in results if not c]
print("=" * 40)
print(f"{len(results)-len(failed)}/{len(results)} passed" + (f" -- FAILED: {failed}" if failed else " -- ALL GREEN"))
