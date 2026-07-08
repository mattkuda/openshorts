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
    "Food & Recipes": [
        "overhead shot of a colorful grain bowl on a rustic wooden table",
        "sourdough loaf being sliced, flour dust in warm kitchen light",
        "iced matcha latte with condensation on a marble counter",
        "sizzling cast-iron pan of vegetables, steam rising, dark backdrop",
        "stack of fluffy pancakes with syrup drip, morning window light",
        "farmers market crate overflowing with ripe tomatoes and herbs",
        "hands kneading pasta dough on a floured counter, warm tones",
        "espresso pouring into a glass cup, rich crema, cafe counter",
    ],
    "Travel Aesthetic": [
        "narrow cobblestone alley in a european old town at golden hour",
        "airplane wing over a sea of clouds at sunrise",
        "turquoise cove with a small boat, viewed from a cliff above",
        "train window view of green hills with rain droplets on glass",
        "packed leather duffel and passport on a hotel bed, soft light",
        "lantern-lit street market at dusk, shallow depth of field",
        "winding coastal road from above, cliffs and blue water",
        "tent glowing at night under a starry mountain sky",
    ],
    "Study & Productivity": [
        "open notebook with handwritten notes and a fountain pen, desk lamp glow",
        "laptop and coffee at a library table, tall bookshelves behind",
        "wall calendar and sticky notes in soft morning light",
        "highlighted textbook pages with index tabs, close-up",
        "tidy desk setup with a lamp on late at night, cozy focus mood",
        "stack of books with reading glasses on a windowsill, rainy day",
        "hand writing a to-do list in a planner, warm side light",
        "minimalist home office corner with a pinboard of notes",
    ],
    "Nature & Outdoors": [
        "forest trail with fog and light rays between tall pines",
        "alpine lake reflecting snow-capped peaks at dawn",
        "waves crashing on dark rocks, long exposure, moody sky",
        "wildflower meadow in late afternoon backlight",
        "hiking boots on a summit ledge overlooking a valley",
        "river winding through a canyon, aerial view",
        "campfire embers glowing at blue hour by a lake",
        "dew on grass blades in macro, sunrise bokeh",
    ],
    "Beauty & Self-care": [
        "skincare bottles and a folded towel on a marble bathroom shelf, soft light",
        "bathtub with eucalyptus sprig and lit candles, steam in the air",
        "jade roller and serum dropper on a linen cloth, flat lay",
        "sunlit vanity with a round mirror and fresh flowers",
        "hands applying moisturizer, close-up, airy natural light",
        "silk pillowcase and sleep mask on neatly made bedding",
        "steaming herbal tea beside an open journal and a candle",
        "shower shelf with amber glass bottles and a leafy plant",
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
