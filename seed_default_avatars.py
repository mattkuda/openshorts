"""One-time seeder: 4 diverse default avatars for the Create UGC ads picker."""
import os
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)
from characters import generate_portrait

PRESETS = [
    ("default_f_2530.png", {"gender": "Female", "age_range": "25-30", "hair": "Curly", "style": "Casual",
                            "extra": "sitting in a parked car, seatbelt on, natural daylight"}),
    ("default_m_2530.png", {"gender": "Male", "age_range": "25-30", "hair": "Short", "style": "Athletic",
                            "extra": "at home by a bright window, holding phone selfie-style"}),
    ("default_f_3140.png", {"gender": "Female", "age_range": "31-40", "hair": "Straight", "style": "Cozy",
                            "extra": "on a couch at home, warm lamp light"}),
    ("default_m_4150.png", {"gender": "Male", "age_range": "41-50", "hair": "Buzzcut", "style": "Business casual",
                            "extra": "in a car after work, talking to camera"}),
]

os.makedirs("default_avatars", exist_ok=True)
key = os.getenv("GEMINI_API_KEY")
assert key, "GEMINI_API_KEY missing"
import characters
characters.AVATARS_DIR = "default_avatars"  # write here instead of creations/
for name, attrs in PRESETS:
    if os.path.exists(os.path.join("default_avatars", name)):
        print("skip (exists):", name)
        continue
    print("generating:", name)
    generate_portrait(key, attrs, name, mock=False)
print("done")
