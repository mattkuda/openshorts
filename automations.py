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
import re
import json
import random
import shutil

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


LENGTH_RULES = {
    "short": "ONE punchy line per slide, max 12 words",
    "medium": "2-3 sentences per slide (roughly 25-45 words)",
    "long": "4-6 sentences per slide (roughly 60-90 words) — mini-storytime depth",
}

NUM_PREFIX = re.compile(r"^\s*\d+\s*[\.\)\:–-]?\s+")


def resolve_layout(automation, n_content):
    """Slide positions for one run. Returns an ordered list of
    (position, role) where role is 'hook' | 'content' | 'cta'."""
    cta = automation.get("cta") or {}
    total = 1 + n_content + (1 if cta.get("enabled") else 0)
    layout = {1: "hook"}
    if cta.get("enabled"):
        pos = cta.get("position", "last")
        cta_pos = total if pos == "last" or not isinstance(pos, int) else max(2, min(int(pos), total))
        layout[cta_pos] = "cta"
    p = 2
    for _ in range(n_content):
        while p in layout:
            p += 1
        layout[p] = "content"
        p += 1
    return sorted(layout.items())


def apply_numbering(texts, numbering):
    """Strip any model-added numeric prefixes, then (re)apply '1. ' style if on."""
    out = []
    for i, t in enumerate(texts):
        clean = NUM_PREFIX.sub("", str(t or "").strip())
        out.append(f"{i + 1}. {clean}" if numbering else clean)
    return out


def _slide_texts(automation, hook, n_content, api_key, mock=False):
    """One LLM call → text for every content slide (+ optional CTA, title, caption)."""
    content = automation.get("content") or {}
    overrides = {int(o["slide_n"]): o.get("direction", "") for o in (automation.get("slides") or [])
                 if str(o.get("slide_n", "")).lstrip("-").isdigit()}
    cta = automation.get("cta") or {}
    tiktok = automation.get("tiktok") or {}
    title_mode = tiktok.get("title_mode", "prompt")
    caption_mode = tiktok.get("caption_mode", "prompt")
    numbering = bool(content.get("numbering"))
    layout = resolve_layout(automation, n_content)
    content_positions = [p for p, role in layout if role == "content"]

    if mock:
        texts = [overrides.get(p) or f"tip about {(content.get('instructions') or automation.get('topic') or 'this')[:50]}"
                 for p in content_positions]
        return {
            "slides": apply_numbering(texts, numbering),
            "cta_text": (cta.get("direction") or "try it — it helps")[:80] if cta.get("enabled") else "",
            "title": hook.title() if title_mode == "prompt" else tiktok.get("title", ""),
            "caption": "#fyp #foryou" if caption_mode == "prompt" else tiktok.get("caption", ""),
        }

    override_lines = "\n".join(
        f"- Content slide {i + 1} MUST follow this direction: {overrides[p]}"
        for i, p in enumerate(content_positions) if overrides.get(p, "").strip()
    ) or "- (no per-slide directions — cover the instructions above in a natural order)"

    wants = [f'"slides": an array of exactly {n_content} strings — the on-image text for each content slide, in order']
    if cta.get("enabled"):
        wants.append(f'"cta_text": one call-to-action slide line following this direction: {cta.get("direction") or "a soft CTA"}')
    if title_mode == "prompt":
        wants.append(f'"title": the TikTok post title, following this instruction: {tiktok.get("title") or "title-case the hook"}')
    if caption_mode == "prompt":
        wants.append(f'"caption": the TikTok caption, following this instruction: {tiktok.get("caption") or "3-5 broad lowercase hashtags"}')

    prompt = f"""You write the on-image text for a TikTok photo-carousel slideshow.

Series topic / goal: {automation.get('topic') or 'general lifestyle content'}
What the content slides should cover, collectively: {content.get('instructions') or 'useful, specific points on the topic'}
Voice & style rules: {_tone_text(automation)}
Length rule: {LENGTH_RULES.get(content.get('text_length'), LENGTH_RULES['short'])}.

The first slide (already written) is this hook: "{hook}"
Write the text for the {n_content} CONTENT slides that follow it.
{override_lines}

Every slide should flow from the hook, feel native to TikTok (no hashtags on slides,
no emojis unless the voice calls for it), respect the length rule, and never repeat
another slide's point. Do NOT number the slides — numbering is added separately.

Return ONLY a JSON object with:
{chr(10).join('- ' + w for w in wants)}"""
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    data = json.loads(response.text)
    texts = [str(t) for t in (data.get("slides") or [])][:n_content]
    while len(texts) < n_content:
        texts.append("")
    return {
        "slides": apply_numbering(texts, numbering),
        "cta_text": str(data.get("cta_text") or "") if cta.get("enabled") else "",
        "title": str(data.get("title") or "") if title_mode == "prompt" else tiktok.get("title", ""),
        "caption": str(data.get("caption") or "") if caption_mode == "prompt" else tiktok.get("caption", ""),
    }


AI_PHOTO_SUFFIX = (
    " Looks like a casual photo taken on an iPhone and posted to a TikTok story: "
    "true-to-life muted colors, available light only, slight grain, imperfect framing — "
    "NOT professional photography, no cinematic color grading, no studio lighting, "
    "no heavy saturation or gray editorial filter. "
    "Do not include any people or faces unless the prompt explicitly asks for a person. "
    "Vertical 9:16 composition, no text, no watermark."
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


def _web_to_disk(web_path):
    """Web path under /creations/... → disk path (None if missing)."""
    if not (web_path or "").startswith("/creations/"):
        return None
    fp = os.path.join("creations", os.path.relpath(web_path, "/creations"))
    return fp if os.path.exists(fp) else None


def _resolve_image(spec, used_paths, api_key, mock, out_dir, tag):
    """Slide image spec → disk path of a 9:16 photo (generated, picked, or pinned)."""
    spec = spec or {}
    source = spec.get("source") or "ai"
    if source == "specific":
        pinned = _web_to_disk(spec.get("image_path"))
        if pinned:
            return pinned
        # fall through to a placeholder if the pinned file is gone
    if source == "collection":
        picked = _collection_pick(spec.get("collection_id"), used_paths)
        if picked:
            used_paths.add(picked)
            return picked
        # fall through to a placeholder if the collection is empty
    out_path = os.path.join(out_dir, f"{tag}.png")
    prompt = (spec.get("image_prompt") or "").strip()
    if mock or source in ("collection", "specific") or not prompt:
        _mock_image(tag if not prompt else prompt[:24], out_path, seed=tag + prompt)
    else:
        _generate_image(api_key, [prompt + AI_PHOTO_SUFFIX], out_path)
    used_paths.add(out_path)
    return out_path


DEFAULT_TEXT_STYLE = {"style": "outline", "size": "md", "position": "top", "width": 80}
TEXT_SIZES = {"sm": 48, "md": 64, "lg": 84}
TEXT_ANCHORS = {"top": 0.30, "center": 0.50, "bottom": 0.72}


def _compose_slide(image_path, text, out_path, text_style=None):
    """Photo + TikTok-style caption → 1080x1920 slide PNG.

    text_style: {style: outline|white|white_bg, size: sm|md|lg,
                 position: top|center|bottom, width: percent of frame}
    """
    ts = {**DEFAULT_TEXT_STYLE, **(text_style or {})}
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

    # soft dark overlay so text stays readable on any photo (skip for white_bg — the box carries contrast)
    if ts["style"] != "white_bg":
        overlay = Image.new("L", (W, H), 60)
        img = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), img, overlay)

    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    if (text or "").strip():
        font = _font(TEXT_SIZES.get(ts.get("size"), 64))
        max_w = int(W * max(30, min(100, int(ts.get("width") or 80))) / 100)
        lines = _wrap(d, text, font, max_w)
        heights = [d.textbbox((0, 0), l or " ", font=font)[3] for l in lines]
        gap = 16
        total = sum(heights) + gap * (len(lines) - 1)
        y = int(H * TEXT_ANCHORS.get(ts.get("position"), 0.30)) - total // 2
        for line, h in zip(lines, heights):
            lw = d.textbbox((0, 0), line, font=font)[2]
            lx = (W - lw) // 2
            if ts["style"] == "white_bg":
                pad_x, pad_y = 28, 14
                d.rounded_rectangle([lx - pad_x, y - pad_y, lx + lw + pad_x, y + h + pad_y],
                                    radius=18, fill=(255, 255, 255))
                d.text((lx, y), line, font=font, fill=(20, 20, 20))
            elif ts["style"] == "white":
                d.text((lx, y), line, font=font, fill=(255, 255, 255))
            else:  # outline
                d.text((lx, y), line, font=font, fill=(255, 255, 255),
                       stroke_width=4, stroke_fill=(0, 0, 0))
            y += h + gap + (28 if ts["style"] == "white_bg" else 0)
    img.save(out_path)
    return out_path


def generate_slideshow(automation, api_key, mock=False, log=print):
    """Run an automation once → (png_paths, mp4_path, meta).

    meta = {"hook", "texts", "title", "caption", "raws", "roles"} — texts/raws/roles
    are in final slide order (hook + content [+ CTA at its position]). Raw source
    images are kept on disk so a draft can be re-rendered with edited text later.
    """
    hooks = automation.get("hooks") or []
    if not hooks:
        raise ValueError("Automation has no hooks — add at least one hook line")
    hook = random.choice([h for h in hooks if h.strip()] or hooks)

    content = automation.get("content") or {}
    if content.get("count_mode") == "vary":
        lo = int(content.get("count_min") or 3)
        hi = max(lo, int(content.get("count_max") or 6))
        n_content = random.randint(lo, hi)
    else:
        n_content = int(content.get("slide_count") or 4)
    n_content = max(1, min(n_content, 12))

    log(f"🪝 Hook: {hook} · {n_content} content slides")
    texts = _slide_texts(automation, hook, n_content, api_key, mock=mock)

    layout = resolve_layout(automation, n_content)
    image_overrides = {int(o["slide_n"]): o for o in (automation.get("image_overrides") or [])
                       if str(o.get("slide_n", "")).lstrip("-").isdigit()}
    image_default = automation.get("image_default") or {}
    hook_image = automation.get("hook_image") or image_default

    base = f"auto_{automation.get('id', 'x')[:8]}_{random.getrandbits(40):010x}"
    os.makedirs(AUTO_DIR, exist_ok=True)

    text_style = content.get("text_style") or {}
    slide_texts_by_role = {"hook": [hook], "content": list(texts["slides"]), "cta": [texts.get("cta_text", "")]}
    used_paths = set()
    pngs, raws, roles, final_texts = [], [], [], []
    for idx, (pos, role) in enumerate(layout, start=1):
        text = slide_texts_by_role[role].pop(0) if slide_texts_by_role[role] else ""
        spec = hook_image if role == "hook" else image_overrides.get(pos, image_default)
        log(f"🖼️ Slide {idx}/{len(layout)} ({role})…")
        src = _resolve_image(spec, used_paths, api_key, mock, AUTO_DIR, f"{base}_{role}{idx}_gen")
        raw = os.path.join(AUTO_DIR, f"{base}_raw{idx:02d}.png")
        if src != raw:
            shutil.copyfile(src, raw)  # own copy → re-render survives collection edits
            if src.startswith(os.path.join(AUTO_DIR, base)):
                os.remove(src)
        out = os.path.join(AUTO_DIR, f"{base}_slide{idx:02d}.png")
        pngs.append(_compose_slide(raw, text, out, text_style=text_style))
        raws.append(raw)
        roles.append(role)
        final_texts.append(text)

    mp4 = export_mp4(pngs, AUTO_DIR, base, log=log)
    meta = {"hook": hook, "texts": final_texts, "roles": roles,
            "raws": [f"/creations/{os.path.basename(r)}" for r in raws],
            "text_style": text_style,
            "title": texts.get("title") or hook, "caption": texts.get("caption", "")}
    return pngs, mp4, meta


def rerender_slides(raw_web_paths, new_texts, base, text_style=None, log=print):
    """Re-compose slides from kept raw images with edited texts → (pngs, mp4)."""
    os.makedirs(AUTO_DIR, exist_ok=True)
    pngs = []
    for idx, (raw_web, text) in enumerate(zip(raw_web_paths, new_texts), start=1):
        raw = _web_to_disk(raw_web)
        if not raw:
            raise ValueError(f"Raw image missing for slide {idx} — regenerate instead")
        out = os.path.join(AUTO_DIR, f"{base}_slide{idx:02d}.png")
        pngs.append(_compose_slide(raw, text, out, text_style=text_style))
    mp4 = export_mp4(pngs, AUTO_DIR, base, log=log)
    return pngs, mp4


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
