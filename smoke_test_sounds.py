import os
os.environ.pop("DATABASE_URL", None)
from fastapi.testclient import TestClient
import app as appmod
client = TestClient(appmod.app)

r = client.get("/api/avatars/defaults")
print("defaults:", r.status_code, r.json()["avatars"])

r = client.get("/api/sounds")
print("sounds:", r.status_code, r.json())

r = client.post("/api/compose/hook-demo", data={
    "hook_text": "the fitness app that plans FOR you", "style": "preroll",
    "use_mock": "true", "avatar_image": "/default-avatars/default_f_2530.jpg",
    "text_style": "outline", "text_position": "center",
    "sound": "/sounds/sample_ambient_tone.mp3"})
jid = r.json()["job_id"]
jd = client.get(f"/api/status/{jid}").json()
print("compose w/ sound:", jd["status"], (jd.get("result") or {}).get("video_url"), jd["logs"][-2:])
