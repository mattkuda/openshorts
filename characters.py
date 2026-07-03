"""
AI characters (ReelFarm-style) — reusable UGC personas.

A character = identity attributes → a Gemini-generated 9:16 portrait. "Looks" are
scene/pose/outfit variations generated with the portrait passed as a REFERENCE
image, so identity stays consistent (the "one character, many looks" model —
ReelFarm runs this on Nano Banana Pro, i.e. the same Gemini image family).

Uses the Gemini key (not fal.ai) — image gen is cheap there and conserves the
fal budget for video. Mock mode renders a PIL placeholder for zero-cost UI work.
"""
import os
import random

from PIL import Image, ImageDraw, ImageFont
from google import genai
from google.genai import types

from hooks import download_font_if_needed, FONT_PATH

AVATARS_DIR = os.path.join("creations", "avatars")
IMAGE_MODEL = "gemini-3.1-flash-image-preview"

ATTRIBUTE_SCHEMA = {
    "gender": ["Female", "Male"],
    "age_range": ["18-24", "25-30", "31-40", "41-50", "51-60", "60+"],
    "ethnicity": ["Ambiguous", "White", "Black", "Hispanic", "East Asian", "South Asian", "Middle Eastern", "Mixed"],
    "hair": ["Short", "Medium", "Long", "Curly", "Wavy", "Straight", "Bald", "Buzzcut"],
    "style": ["Casual", "Athletic", "Streetwear", "Business casual", "Cozy", "Trendy"],
}

RANDOM_SCENES = [
    "sitting in a parked car, golden hour light through the window",
    "walking on a city sidewalk, casual over-the-shoulder look",
    "in a bright modern kitchen, mid-laugh",
    "at the gym between sets, towel over shoulder",
    "on a couch at home, warm lamp light, relaxed",
    "outdoors on a running trail, slightly out of breath, smiling",
    "in a cafe holding a phone up like filming a selfie video",
    "getting ready in a bathroom mirror, phone visible in reflection",
]


def _selfie_style_suffix():
    return (
        "Shot like a genuine smartphone selfie/UGC video still: slightly imperfect framing, "
        "natural skin texture, realistic lighting, no studio look, no text, no watermark. "
        "Vertical 9:16 composition, subject fills the frame from the chest up."
    )


def build_portrait_prompt(attributes):
    """Compose a portrait prompt from ReelFarm-style identity attributes."""
    a = attributes or {}
    bits = []
    if a.get("age_range"):
        bits.append(f"{a['age_range']} years old")
    if a.get("gender"):
        bits.append(a["gender"].lower())
    if a.get("ethnicity") and a["ethnicity"] != "Ambiguous":
        bits.append(a["ethnicity"].lower())
    person = " ".join(bits) or "person"
    hair = f", {a['hair'].lower()} hair" if a.get("hair") else ""
    style = f", wearing {a['style'].lower()} clothing" if a.get("style") else ""
    extra = f". {a['extra']}" if a.get("extra") else ""
    return (
        f"Photorealistic portrait of a {person}{hair}{style}{extra}. "
        f"Looking at the camera, friendly and natural. {_selfie_style_suffix()}"
    )


def _mock_image(label, out_path, seed=None):
    """Zero-cost placeholder (debug mock mode) — still 1080x1920 so overlays are testable."""
    rng = random.Random(seed or label)
    bg = (rng.randint(60, 200), rng.randint(60, 200), rng.randint(60, 200))
    img = Image.new("RGB", (1080, 1920), bg)
    d = ImageDraw.Draw(img)
    download_font_if_needed()
    try:
        big = ImageFont.truetype(FONT_PATH, 220)
        small = ImageFont.truetype(FONT_PATH, 54)
    except Exception:
        big = small = ImageFont.load_default()
    initials = "".join(w[0] for w in label.split()[:2]).upper() or "?"
    d.ellipse([340, 560, 740, 960], fill=(255, 255, 255, 255))
    bbox = d.textbbox((0, 0), initials, font=big)
    d.text(((1080 - bbox[2]) / 2, 640), initials, font=big, fill=bg)
    d.text((60, 1740), f"MOCK · {label[:30]}", font=small, fill=(255, 255, 255))
    img.save(out_path)
    return out_path


def _generate_image(api_key, prompt_parts, out_path):
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=IMAGE_MODEL,
        contents=prompt_parts,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(aspect_ratio="9:16"),
        ),
    )
    for part in response.parts:
        if image := part.as_image():
            image.save(out_path)
            return out_path
    raise RuntimeError("Gemini returned no image")


def generate_portrait(api_key, attributes, out_name, mock=False):
    """Attributes → 9:16 portrait PNG in AVATARS_DIR. Returns web path."""
    os.makedirs(AVATARS_DIR, exist_ok=True)
    out_path = os.path.join(AVATARS_DIR, out_name)
    if mock:
        label = f"{attributes.get('gender', 'P')} {attributes.get('age_range', '')}"
        _mock_image(label, out_path)
    else:
        _generate_image(api_key, [build_portrait_prompt(attributes)], out_path)
    return f"/creations/avatars/{out_name}"


def generate_look(api_key, portrait_web_path, scene_prompt, out_name, mock=False):
    """Portrait (reference image) + scene prompt → consistent-identity look image."""
    os.makedirs(AVATARS_DIR, exist_ok=True)
    out_path = os.path.join(AVATARS_DIR, out_name)
    if mock:
        _mock_image(f"look {scene_prompt[:20]}", out_path, seed=scene_prompt)
        return f"/creations/avatars/{out_name}"

    portrait_file = os.path.join(AVATARS_DIR, os.path.basename(portrait_web_path))
    parts = []
    if os.path.exists(portrait_file):
        parts.append(Image.open(portrait_file))
    parts.append(
        "Generate a new image of THE SAME PERSON shown in the reference image — identical face, "
        f"hair and identity — now: {scene_prompt}. {_selfie_style_suffix()}"
    )
    _generate_image(api_key, parts, out_path)
    return f"/creations/avatars/{out_name}"


def random_scene():
    return random.choice(RANDOM_SCENES)
