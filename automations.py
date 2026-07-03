"""
Slideshow automations — recurring TikTok photo carousels (ReelFarm-style).

An automation is a recipe: an overarching topic, a tone, a bank of hooks
(one picked per post), and per-slide content directions. Each run picks a
hook, has Gemini write every slide's on-image text (plus post title/caption),
resolves each slide's photo (AI-generated via the Gemini image model, or a
random pick from a preset ImageCollection), composes 1080x1920 slides with
TikTok-style caption text, and exports a PNG set + MP4.

Mock mode ships placeholder images and deterministic text so the whole flow
is testable with zero API cost.
"""
import os
import json
import random

import httpx
from PIL import Image
from google import genai

from db import get_session, CollectionImage
from characters import _generate_image, _mock_image
from slideshow import W, H, _font, _wrap, export_mp4

AUTO_DIR = "creations"
COLLECTIONS_DIR = os.path.join("creations", "collections")

TONE_PRESETS = {
    "conversational": (
        "Write like you're texting a good friend — first person, casual, lowercase-friendly, "
        "7th-grade reading level, no motivational-poster words, a little unsure of yourself, "
        "never preachy."
    ),
    "motivational": (
        "Write like a supportive coach — energetic, second person, short punchy lines, "
        "believable encouragement, no clichés like 'crush it' or 'unleash'."
    ),
    "educational": (
        "Write like a sharp explainer — clear, specific, concrete numbers and examples, "
        "no fluff, each line teaches one thing."
    ),
    "bold": (
        "Write bold, contrarian takes — confident declarative sentences, call out common "
        "mistakes directly, a little provocative but never mean."
    ),
    "calm": (
        "Write calm and reflective — gentle first-person observations, soft pacing, "
        "honest about struggle, reassuring without hype."
    ),
    "witty": (
        "Write witty and self-aware — dry humor, playful exaggeration, internet-native "
        "phrasing, still genuinely useful underneath the jokes."
    ),
}

MOCK_HOOK_SHAPES = [
    "5 things nobody tells you about {t}:",
    "how i finally figured out {t}:",
    "the {t} mistakes i wish i stopped sooner:",
    "POV: {t} finally clicked for you",
    "my honest {t} routine after a year:",
    "3 signs you're overcomplicating {t}:",
    "what actually changed my {t} game:",
    "i tried everything for {t} — this stuck:",
    "read this if {t} feels impossible rn",
    "the lazy person's guide to {t}:",
]


def _tone_text(automation):
    if automation.get("tone_preset") == "custom":
        return automation.get("tone_prompt") or TONE_PRESETS["conversational"]
    return TONE_PRESETS.get(automation.get("tone_preset"), TONE_PRESETS["conversational"])


def generate_hooks(api_key, topic, existing_hooks=None, n=10, mock=False):
    """New scroll-stopping hook lines for the automation's hook bank."""
    existing = existing_hooks or []
    if mock:
        t = (topic or "this").strip()[:40] or "this"
        pool = [s.format(t=t) for s in MOCK_HOOK_SHAPES]
        fresh = [h for h in pool if h not in existing]
        return fresh[:n]

    client = genai.Client(api_key=api_key)
    prompt = f"""You write scroll-stopping first-slide hook lines for TikTok photo carousels.

Topic / goal of the series: {topic or 'general lifestyle content'}

Write {n} NEW hook lines (max 90 chars each), lowercase TikTok-native voice, using proven
patterns: listicle teases ("5 ways i..."), POV, curiosity gaps, confessions, bold claims.
Do NOT repeat or lightly rephrase any of these existing hooks:
{json.dumps(existing[:40])}
Return ONLY a JSON array of {n} strings."""
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    hooks = json.loads(response.text)
    return [str(h) for h in hooks][:n]


def _slide_texts(automation, hook, api_key, mock=False):
    """One LLM call → text for every content slide (+ optional CTA, title, caption)."""
    slides = automation.get("slides") or []
    cta = automation.get("cta") or {}
    tiktok = automation.get("tiktok") or {}
    title_mode = tiktok.get("title_mode", "prompt")
    caption_mode = tiktok.get("caption_mode", "prompt")

    if mock:
        texts = [f"{(s.get('direction') or 'something helpful')[:70]}" for s in slides]
        return {
            "slides": texts,
            "cta_text": (cta.get("direction") or "try it — it helps")[:70] if cta.get("enabled") else "",
            "title": hook.title() if title_mode == "prompt" else tiktok.get("title", ""),
            "caption": "#fyp #foryou" if caption_mode == "prompt" else tiktok.get("caption", ""),
        }

    directions = "\n".join(
        f"Slide {i + 1}: {s.get('direction') or 'continue the story naturally'}"
        for i, s in enumerate(slides)
    )
    wants = ['"slides": an array of exactly %d strings (the on-image text for each content slide, max ~110 chars each)' % len(slides)]
    if cta.get("enabled"):
        wants.append(f'"cta_text": one final call-to-action slide line following this direction: {cta.get("direction") or "a soft CTA"}')
    if title_mode == "prompt":
        wants.append(f'"title": the TikTok post title, following this instruction: {tiktok.get("title") or "title-case the hook"}')
    if caption_mode == "prompt":
        wants.append(f'"caption": the TikTok caption, following this instruction: {tiktok.get("caption") or "3-5 broad lowercase hashtags"}')

    prompt = f"""You write the on-image text for a TikTok photo-carousel slideshow.

Series topic / goal: {automation.get('topic') or 'general lifestyle content'}
Voice & style rules: {_tone_text(automation)}

The first slide (already written) is this hook: "{hook}"
Now write the text for each CONTENT slide. Per-slide directions:
{directions}

Every slide should flow from the hook, feel native to TikTok (short lines, no hashtags
on slides, no emojis unless the voice calls for it), and respect its direction exactly
(including any length/casing rules in the direction).

Return ONLY a JSON object with:
{chr(10).join('- ' + w for w in wants)}"""
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    data = json.loads(response.text)
    out = {
        "slides": [str(t) for t in (data.get("slides") or [])][: len(slides)],
        "cta_text": str(data.get("cta_text") or "") if cta.get("enabled") else "",
        "title": str(data.get("title") or "") if title_mode == "prompt" else tiktok.get("title", ""),
        "caption": str(data.get("caption") or "") if caption_mode == "prompt" else tiktok.get("caption", ""),
    }
    while len(out["slides"]) < len(slides):
        out["slides"].append("")
    return out


AI_PHOTO_SUFFIX = (
    " Photorealistic, candid smartphone-photo aesthetic, natural lighting, "
    "vertical 9:16 composition, no text, no watermark."
)


def _collection_pick(collection_id, used_paths):
    """Random not-yet-used image (disk path) from a collection; None if empty."""
    with get_session() as s:
        rows = s.query(CollectionImage).filter(
            CollectionImage.collection_id == (collection_id or "")).all()
        paths = []
        for r in rows:
            fp = os.path.join(COLLECTIONS_DIR, r.collection_id, os.path.basename(r.image_path))
            if os.path.exists(fp):
                paths.append(fp)
    fresh = [p for p in paths if p not in used_paths] or paths
    return random.choice(fresh) if fresh else None


def _resolve_image(spec, used_paths, api_key, mock, out_dir, tag):
    """Slide image spec → disk path of a 9:16 photo (generated or picked)."""
    spec = spec or {}
    source = spec.get("source") or "ai"
    if source == "collection":
        picked = _collection_pick(spec.get("collection_id"), used_paths)
        if picked:
            used_paths.add(picked)
            return picked
        # fall through to a placeholder if the collection is empty
    out_path = os.path.join(out_dir, f"{tag}.png")
    prompt = (spec.get("image_prompt") or "").strip()
    if mock or source == "collection" or not prompt:
        _mock_image(tag if not prompt else prompt[:24], out_path, seed=tag + prompt)
    else:
        _generate_image(api_key, [prompt + AI_PHOTO_SUFFIX], out_path)
    used_paths.add(out_path)
    return out_path


def _compose_slide(image_path, text, out_path):
    """Photo + TikTok-style caption → 1080x1920 slide PNG."""
    img = Image.open(image_path).convert("RGB")
    # cover-crop to 9:16
    target = W / H
    ratio = img.width / img.height
    if ratio > target:
        new_w = int(img.height * target)
        x = (img.width - new_w) // 2
        img = img.crop((x, 0, x + new_w, img.height))
    else:
        new_h = int(img.width / target)
        y = (img.height - new_h) // 2
        img = img.crop((0, y, img.width, y + new_h))
    img = img.resize((W, H))

    # soft dark overlay so white text stays readable on any photo
    overlay = Image.new("L", (W, H), 60)
    img = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), img, overlay)

    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    if (text or "").strip():
        font = _font(64)
        lines = _wrap(d, text, font, int(W * 0.8))
        heights = [d.textbbox((0, 0), l or " ", font=font)[3] for l in lines]
        gap = 16
        total = sum(heights) + gap * (len(lines) - 1)
        y = int(H * 0.30) - total // 2
        for line, h in zip(lines, heights):
            lw = d.textbbox((0, 0), line, font=font)[2]
            d.text(((W - lw) // 2, y), line, font=font, fill=(255, 255, 255),
                   stroke_width=4, stroke_fill=(0, 0, 0))
            y += h + gap
    img.save(out_path)
    return out_path


def generate_slideshow(automation, api_key, mock=False, log=print):
    """Run an automation once → (png_paths, mp4_path, meta).

    meta = {"hook", "texts", "title", "caption"} — texts includes the hook
    and CTA lines in slide order.
    """
    hooks = automation.get("hooks") or []
    if not hooks:
        raise ValueError("Automation has no hooks — add at least one hook line")
    hook = random.choice([h for h in hooks if h.strip()] or hooks)

    log(f"🪝 Hook: {hook}")
    texts = _slide_texts(automation, hook, api_key, mock=mock)

    base = f"auto_{automation.get('id', 'x')[:8]}_{random.getrandbits(40):010x}"
    os.makedirs(AUTO_DIR, exist_ok=True)

    slide_specs = [("hook", hook, automation.get("hook_image"))]
    for i, s in enumerate(automation.get("slides") or []):
        slide_specs.append((f"content{i + 1}", texts["slides"][i], s.get("image")))
    if (automation.get("cta") or {}).get("enabled") and texts.get("cta_text"):
        slide_specs.append(("cta", texts["cta_text"], automation.get("hook_image")))

    used_paths = set()
    pngs = []
    for idx, (tag, text, image_spec) in enumerate(slide_specs, start=1):
        log(f"🖼️ Slide {idx}/{len(slide_specs)} ({tag})…")
        raw = _resolve_image(image_spec, used_paths, api_key, mock, AUTO_DIR, f"{base}_{tag}_raw")
        out = os.path.join(AUTO_DIR, f"{base}_slide{idx:02d}.png")
        pngs.append(_compose_slide(raw, text, out))
        if raw.startswith(os.path.join(AUTO_DIR, base)):  # temp AI/mock image, not a collection photo
            os.remove(raw)

    mp4 = export_mp4(pngs, AUTO_DIR, base, log=log)
    meta = {"hook": hook, "texts": [t for _, t, _ in slide_specs],
            "title": texts.get("title") or hook, "caption": texts.get("caption", "")}
    return pngs, mp4, meta


def post_to_upload_post(mp4_path, title, platforms, user_id, api_key):
    """Immediately publish an MP4 via Upload-Post. Returns the raw response text."""
    data_payload = {
        "user": user_id,
        "title": title,
        "platform[]": platforms,
        "async_upload": "true",
    }
    if "tiktok" in platforms:
        data_payload["tiktok_title"] = title
    if "instagram" in platforms:
        data_payload["instagram_title"] = title
        data_payload["media_type"] = "REELS"
    if "youtube" in platforms:
        data_payload["youtube_title"] = title
        data_payload["privacyStatus"] = "public"

    with open(mp4_path, "rb") as f:
        files = {"video": (os.path.basename(mp4_path), f.read(), "video/mp4")}
    with httpx.Client(timeout=120.0) as client:
        response = client.post("https://api.upload-post.com/api/upload",
                               headers={"Authorization": f"Apikey {api_key}"},
                               data=data_payload, files=files)
    if response.status_code not in (200, 201, 202):
        raise RuntimeError(f"Upload-Post error {response.status_code}: {response.text[:300]}")
    return response.text[:2000]
