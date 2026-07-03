import os, json, glob
os.environ.pop("DATABASE_URL", None)
from fastapi.testclient import TestClient
import app as appmod
client = TestClient(appmod.app)

# find an existing mock avatar look/portrait
imgs = sorted(glob.glob("creations/avatars/*.png"))
assert imgs, "no avatar images found"
avatar_web = "/creations/avatars/" + os.path.basename(imgs[0])
print("using avatar:", avatar_web)

# 1: avatar IMAGE hook (Ken Burns) + outline text + top position + mock demo
r = client.post("/api/compose/hook-demo", data={
    "hook_text": "I let AI plan my workouts for 30 days", "style": "preroll",
    "use_mock": "true", "avatar_image": avatar_web,
    "text_style": "outline", "text_position": "top", "cta_text": "Get Evex free"})
jid = r.json()["job_id"]
jd = client.get(f"/api/status/{jid}").json()
print("avatar-image compose:", jd["status"], jd["result"]["video_url"] if jd.get("result") else jd["logs"][-3:])

# 2: avatar VIDEO hook (mock reaction clip) + outline center
r = client.post("/api/compose/hook-demo", data={
    "hook_text": "This app called me out fr", "style": "preroll",
    "use_mock": "true", "use_mock_avatar_video": "true",
    "text_style": "outline", "text_position": "center"})
jid2 = r.json()["job_id"]
jd2 = client.get(f"/api/status/{jid2}").json()
print("avatar-video compose:", jd2["status"], jd2["result"]["video_url"] if jd2.get("result") else jd2["logs"][-3:])
