"""One-off: generate starter photo packs into default_collections/ (run in container)."""
import os
from dotenv import load_dotenv
from characters import _generate_image

load_dotenv(".env.local", override=True)
load_dotenv(".env")

SUFFIX = (" Photorealistic, candid smartphone-photo aesthetic, natural lighting, "
          "vertical 9:16 composition, no text, no watermark, no visible faces.")

PACKS = {
    "Gym & Fitness": [
        "moody gym interior, rack of dumbbells, morning light through windows",
        "running shoes being laced up by a doorway at dawn",
        "chalk dust in the air over a barbell on a lifting platform",
        "gym bag and water bottle on a wooden bench in a locker room",
        "close-up of a loaded barbell on the floor, dramatic side light",
        "empty treadmills in a gym at golden hour, long shadows",
    ],
    "Cozy Lifestyle": [
        "steaming coffee mug on a windowsill with rain outside",
        "open journal and pen on a linen bedspread, soft morning light",
        "warm lamp glow over a reading nook with a knit blanket",
        "breakfast bowl with berries on a wooden table by a window",
        "candle burning next to a stack of books at dusk",
        "bare feet in wool socks by a radiator, cozy winter morning",
    ],
    "Minimal Aesthetic": [
        "single green plant in a white pot against a blank cream wall",
        "clean desk with a closed laptop and one notebook, top light",
        "beige linen curtain moving in a breeze, soft shadows",
        "white ceramic cup on a concrete ledge, hard noon shadow",
        "neutral-toned bedsheets with strong window light stripes",
        "empty hallway with an arch and warm afternoon light",
    ],
}

key = os.environ["GEMINI_API_KEY"]
for pack, prompts in PACKS.items():
    out_dir = os.path.join("default_collections", pack)
    os.makedirs(out_dir, exist_ok=True)
    for i, prompt in enumerate(prompts, start=1):
        out = os.path.join(out_dir, f"{i:02d}.png")
        if os.path.exists(out):
            print(f"skip {out}")
            continue
        print(f"gen {pack} {i}/6: {prompt[:50]}…")
        _generate_image(key, [prompt + SUFFIX], out)
print("done")
