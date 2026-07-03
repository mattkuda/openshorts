import os, json
os.environ.pop("DATABASE_URL", None)
from fastapi.testclient import TestClient
import app as appmod
client = TestClient(appmod.app)

ok = 0; total = 0
def check(name, cond, extra=""):
    global ok, total; total += 1; ok += cond
    print(("PASS" if cond else "FAIL"), name, "" if cond else extra)

r = client.get("/api/characters/schema")
check("GET schema", r.status_code == 200 and "gender" in r.json()["schema"])

r = client.post("/api/characters", json={"name": "Mock Mia", "attributes": {"gender": "Female", "age_range": "25-30", "hair": "Curly", "style": "Athletic"}, "mock": True})
check("POST character (mock portrait)", r.status_code == 200 and r.json()["character"]["portrait_path"].startswith("/creations/avatars/"), r.text[:300])
cid = r.json()["character"]["id"]
check("portrait file exists", os.path.exists("creations/avatars/" + os.path.basename(r.json()["character"]["portrait_path"])))

r = client.post(f"/api/characters/{cid}/looks", json={"prompt": "at the gym between sets", "mock": True})
check("POST look (mock)", r.status_code == 200 and os.path.exists("creations/avatars/" + os.path.basename(r.json()["look"]["image_path"])), r.text[:300])
lid = r.json()["look"]["id"]

r = client.get("/api/characters")
chars = r.json()["characters"]
check("GET characters (with looks)", r.status_code == 200 and any(c["id"] == cid and len(c["looks"]) == 1 for c in chars))

r = client.patch(f"/api/characters/{cid}", json={"name": "Mock Mia 2"})
check("PATCH rename", r.status_code == 200 and r.json()["character"]["name"] == "Mock Mia 2")

r = client.delete(f"/api/characters/{cid}/looks/{lid}")
check("DELETE look", r.status_code == 200)
r = client.delete(f"/api/characters/{cid}")
check("DELETE character", r.status_code == 200)

print("="*30); print(f"{ok}/{total} passed")
