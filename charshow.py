"""
Character Slideshows — cartoon-mascot TikTok photo carousels ("Gym Made Simple" style).

Sibling of slideshow.py / automations.py with NO shared state or imports of either's
internals (only TONE_PRESETS is reused from automations.py, by design, to keep voice
presets consistent across both slideshow systems). A Series (character + style preset +
niche + topic bank + plug config) generates Decks: a hook slide, N content slides, and a
plug slide, each 1080x1920. Headlines are typeset by PIL — never AI-generated into the
image — so branding is pixel-identical across every deck and edits re-composite instantly.

Mock mode ships canned text + zero-cost placeholder poses so the whole flow is testable
with no API calls.
"""
import os
import re
import json
import random
import shutil
import uuid
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont, ImageFilter
from google import genai

from automations import TONE_PRESETS

CHARSHOW_DIR = "creations"
FONT_DIR = "fonts"
ANTON_FONT_URL = "https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf"
ANTON_FONT_PATH = os.path.join(FONT_DIR, "Anton-Regular.ttf")

TEXT_MODEL = "gemini-2.5-flash"

W, H = 1080, 1920

# Data-only style definitions — adding a preset later is a new dict, no renderer changes.
STYLE_PRESETS = {
    "impact": {
        "font": "Anton",
        "casing": "upper",
        "align": "left",
        "bg": "#FFFFFF",
        "ink": "#111111",
        "accent": "#00C080",   # EVEX teal-dark, readable on white; overridden per-Series
    },
}

# Poses biased toward the plug slide ("showing app on phone" energy) — see characters.POSE_BANK.
PLUG_PREFERRED_POSE_KEYS = {"show_phone", "point_up_left", "point_at_viewer", "thumbs_up"}


# ---- Font -------------------------------------------------------------

def _download_anton_if_needed():
    if not os.path.exists(FONT_DIR):
        os.makedirs(FONT_DIR)
    if not os.path.exists(ANTON_FONT_PATH):
        import urllib.request
        print(f"⬇️ Downloading font from {ANTON_FONT_URL}...")
        try:
            req = urllib.request.Request(ANTON_FONT_URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as response, open(ANTON_FONT_PATH, "wb") as out_file:
                out_file.write(response.read())
            print("✅ Font downloaded.")
        except Exception as e:
            print(f"❌ Failed to download font: {e}")


def _font(size):
    _download_anton_if_needed()
    try:
        return ImageFont.truetype(ANTON_FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


# ---- Headline engine ---------------------------------------------------
# 1. parse *accent* spans from LLM text  2. auto-fit via binary search on font size so
# wrapped text fills its box  3. render word runs, accent words in the accent color.

_PUNCT_ONLY = re.compile(r"^[^\w]+$")


def _parse_accents(text):
    """'*word word* normal *word*.' -> [(word, is_accent), ...] per whitespace token,
    asterisks stripped. A run spanning multiple words stays accented across all of them.
    Punctuation glued directly to a closing '*' (e.g. '*GONE*.') re-attaches to that word
    instead of becoming its own floating token."""
    tokens = []
    for i, part in enumerate(re.split(r"\*([^*]+)\*", str(text or ""))):
        if not part:
            continue
        is_accent = i % 2 == 1
        leading_ws = part[:1].isspace()
        for j, word in enumerate(part.split()):
            if j == 0 and not leading_ws and tokens and _PUNCT_ONLY.match(word):
                prev_word, prev_accent = tokens[-1]
                tokens[-1] = (prev_word + word, prev_accent)
            else:
                tokens.append((word, is_accent))
    return tokens


def _wrap_tokens(draw, tokens, font, max_width):
    """tokens: [(word, is_accent), ...] -> list of lines, each a list of (word, is_accent)."""
    lines, current = [], []
    for word, accent in tokens:
        trial = current + [(word, accent)]
        trial_text = " ".join(w for w, _ in trial)
        w = draw.textbbox((0, 0), trial_text, font=font)[2]
        if w <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = [(word, accent)]
    if current:
        lines.append(current)
    return lines


def _autofit_size(draw, tokens, box_w, box_h, min_size=28, max_size=170):
    """Binary search the largest font size at which wrapped tokens fit inside box_h."""
    lo, hi, best = min_size, max_size, min_size
    while lo <= hi:
        mid = (lo + hi) // 2
        font = _font(mid)
        lines = _wrap_tokens(draw, tokens, font, box_w)
        line_h = draw.textbbox((0, 0), "Ag", font=font)[3] + int(mid * 0.18)
        total_h = line_h * len(lines)
        if total_h <= box_h:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def draw_headline(draw, text, box, preset, max_size=170, min_size=28):
    """Render an accent-parsed, auto-fit headline into box=(x0,y0,x1,y1). Returns the font
    size used (>= min_size always, since autofit never returns below its floor)."""
    tokens = _parse_accents(text)
    if not tokens:
        return min_size
    casing = preset.get("casing", "upper")
    if casing == "upper":
        tokens = [(w.upper(), a) for w, a in tokens]
    x0, y0, x1, y1 = box
    box_w, box_h = max(1, x1 - x0), max(1, y1 - y0)
    size = _autofit_size(draw, tokens, box_w, box_h, min_size=min_size, max_size=max_size)
    font = _font(size)
    lines = _wrap_tokens(draw, tokens, font, box_w)
    line_h = draw.textbbox((0, 0), "Ag", font=font)[3] + int(size * 0.18)
    align = preset.get("align", "left")
    ink, accent = preset.get("ink", "#111111"), preset.get("accent", "#00C080")
    space_w = draw.textbbox((0, 0), "M M", font=font)[2] - draw.textbbox((0, 0), "MM", font=font)[2]
    y = y0
    for line in lines:
        line_text = " ".join(w for w, _ in line)
        line_w = draw.textbbox((0, 0), line_text, font=font)[2]
        x = x0 + (box_w - line_w) // 2 if align == "center" else x0
        for word, is_accent in line:
            draw.text((x, y), word, font=font, fill=(accent if is_accent else ink))
            x += draw.textbbox((0, 0), word, font=font)[2] + space_w
        y += line_h
    return size


# ---- Mascot / phone-frame compositing ----------------------------------

def _paste_pose(img, pose_path, anchor, target_h_frac):
    """Pose PNGs are generated isolated on pure white (CARTOON_STYLE_SUFFIX) — the same
    white as the slide background — so they paste directly with no masking step."""
    if not pose_path or not os.path.exists(pose_path):
        return
    try:
        pose = Image.open(pose_path).convert("RGB")
    except Exception:
        return
    target_h = max(1, int(H * target_h_frac))
    scale = target_h / pose.height
    target_w = max(1, int(pose.width * scale))
    pose = pose.resize((target_w, target_h))
    y = H - target_h
    if anchor == "bottom_right":
        x = W - target_w - 20
    elif anchor == "bottom_left":
        x = 20
    else:
        x = (W - target_w) // 2
    img.paste(pose, (x, y))


def _rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def _draw_phone_frame(img, screenshot_path, center_x, center_y, frame_h, log=print):
    """PIL-drawn phone mock: rounded dark bezel + subtle shadow + the real screenshot
    pasted inside with a rounded-corner mask. Mutates img in place."""
    if not screenshot_path or not os.path.exists(screenshot_path):
        log(f"⚠️ Plug screenshot missing — skipping phone frame ({screenshot_path})")
        return
    try:
        shot = Image.open(screenshot_path).convert("RGB")
    except Exception as e:
        log(f"⚠️ Could not read plug screenshot: {e}")
        return

    aspect = shot.width / shot.height
    bezel = max(10, int(frame_h * 0.025))
    screen_h = frame_h - bezel * 2
    screen_w = int(screen_h * aspect)
    frame_w = screen_w + bezel * 2
    margin = int(bezel * 1.8)

    canvas = Image.new("RGBA", (frame_w + margin * 2, frame_h + margin * 2), (0, 0, 0, 0))

    # shadow
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_mask = _rounded_mask((frame_w, frame_h), int(bezel * 1.6))
    shadow = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 90))
    shadow_layer.paste(shadow, (margin, margin + 10), shadow_mask)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(12))
    canvas = Image.alpha_composite(canvas, shadow_layer)

    # bezel
    bezel_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(bezel_layer).rounded_rectangle(
        [margin, margin, margin + frame_w, margin + frame_h],
        radius=int(bezel * 1.6), fill=(17, 17, 17, 255))
    canvas = Image.alpha_composite(canvas, bezel_layer)

    # screenshot, rounded-corner masked, inset inside the bezel
    shot_resized = shot.resize((screen_w, screen_h)).convert("RGBA")
    screen_mask = _rounded_mask((screen_w, screen_h), bezel)
    canvas.paste(shot_resized, (margin + bezel, margin + bezel), screen_mask)

    cw, ch = canvas.size
    img.paste(canvas, (center_x - cw // 2, center_y - ch // 2), canvas)


# ---- Slide composers ----------------------------------------------------

HOOK_BOX = (70, 180, 1010, 900)
CONTENT_BOX = (70, 180, 1010, 820)
PLUG_HEADLINE_BOX = (70, 110, 1010, 420)


def _slide_base(preset):
    return Image.new("RGB", (W, H), preset.get("bg", "#FFFFFF"))


def compose_hook_slide(text, pose_path, out_path, preset, log=print):
    img = _slide_base(preset)
    draw_headline(ImageDraw.Draw(img), text, HOOK_BOX, preset, max_size=170, min_size=32)
    _paste_pose(img, pose_path, "bottom_right", 0.55)
    img.save(out_path)
    return out_path


def compose_content_slide(text, pose_path, out_path, preset, log=print):
    img = _slide_base(preset)
    draw_headline(ImageDraw.Draw(img), text, CONTENT_BOX, preset, max_size=130, min_size=30)
    _paste_pose(img, pose_path, "bottom_right", 0.55)
    img.save(out_path)
    return out_path


def compose_plug_slide(headline, pose_path, screenshot_path, out_path, preset, log=print):
    img = _slide_base(preset)
    draw_headline(ImageDraw.Draw(img), headline, PLUG_HEADLINE_BOX, preset, max_size=120, min_size=28)
    _draw_phone_frame(img, screenshot_path, center_x=730, center_y=1280, frame_h=1180, log=log)
    _paste_pose(img, pose_path, "bottom_left", 0.35)
    img.save(out_path)
    return out_path


# ---- Pose selection (from a character's pose pack — see characters.py) --

def _character_pose_looks(character_id):
    """[(pose_key, web_path), ...] for a character's pose-pack CharacterLook rows."""
    from db import get_session, CharacterLook
    from characters import POSE_PROMPT_PREFIX
    with get_session() as s:
        rows = s.query(CharacterLook).filter(
            CharacterLook.character_id == character_id,
            CharacterLook.prompt.like(f"{POSE_PROMPT_PREFIX}%"),
        ).all()
        return [(r.prompt[len(POSE_PROMPT_PREFIX):], r.image_path) for r in rows]


def _pose_disk_path(web_path):
    if not web_path:
        return None
    fp = os.path.join("creations", "avatars", os.path.basename(web_path))
    return fp if os.path.exists(fp) else None


def _all_poses(character_id):
    """[(disk_path, key, web_path), ...] for poses that actually exist on disk."""
    out = []
    for key, web_path in _character_pose_looks(character_id):
        disk = _pose_disk_path(web_path)
        if disk:
            out.append((disk, key, web_path))
    return out


def _pick_one_pose(character_id, used_keys, prefer_keys=None):
    """Random pose, avoiding repeats within a deck when the pack is large enough.
    Returns (disk_path, key, web_path) or (None, None, None) if the character has no pack yet."""
    pool = _all_poses(character_id)
    if not pool:
        return None, None, None
    if prefer_keys:
        preferred = [c for c in pool if c[1] in prefer_keys]
        if preferred:
            pool = preferred
    fresh = [c for c in pool if c[1] not in used_keys] or pool
    return random.choice(fresh)


# ---- Topic diversity: category round-robin ------------------------------

MOCK_TOPIC_BANK = {
    "form_technique": ["squat depth", "bracing your core", "elbow position on bench press", "grip width on pull-ups"],
    "myths": ["spot reduction is fake", "lifting heavy won't make you bulky", "cardio doesn't kill your gains"],
    "nutrition": ["protein timing myths", "why you're always hungry after leg day", "pre-workout meals that work"],
    "recovery": ["DOMS is not progress", "sleep vs supplements", "why rest days matter more than you think"],
}


def _generate_topic_bank(api_key, niche, mock=False):
    if mock:
        return {k: list(v) for k, v in MOCK_TOPIC_BANK.items()}
    client = genai.Client(api_key=api_key)
    prompt = f"""Return ONLY a JSON object mapping 4-6 topic CATEGORIES (short lowercase_snake_case
keys) to arrays of 5-8 short, specific topic phrases each, for a TikTok cartoon-mascot
slideshow series in this niche: {niche or 'fitness'}.
Topics should be concrete enough to write one focused carousel about (not vague like
"fitness tips" — instead like "squat depth" or "protein timing myths")."""
    response = client.models.generate_content(
        model=TEXT_MODEL, contents=prompt, config={"response_mime_type": "application/json"})
    data = json.loads(response.text)
    return {str(k): [str(t) for t in (v or [])][:10] for k, v in data.items()}


def _generate_topics_for_category(api_key, niche, category, existing=None, mock=False):
    if mock:
        base = len(existing or [])
        return [f"{category.replace('_', ' ')} idea {base + i + 1}" for i in range(5)]
    client = genai.Client(api_key=api_key)
    prompt = f"""Write 5 NEW specific topic phrases for the category "{category}" in a TikTok
slideshow series about {niche or 'fitness'}. Do not repeat or closely rephrase any of:
{json.dumps((existing or [])[:30])}
Return ONLY a JSON array of 5 short strings."""
    response = client.models.generate_content(
        model=TEXT_MODEL, contents=prompt, config={"response_mime_type": "application/json"})
    data = json.loads(response.text)
    return [str(t) for t in data][:5]


def pick_topic(series, api_key, mock=False, log=print):
    """Least-recently-used category, then an unused topic within it; refills a category
    via Gemini once its bank is exhausted. Returns (topic, category, topic_bank, used_topics)
    — the caller persists topic_bank/used_topics back onto the Series row."""
    topic_bank = dict(series.get("topic_bank") or {})
    used_topics = list(series.get("used_topics") or [])
    niche = series.get("niche") or "general fitness"

    if not topic_bank:
        log("📚 Topic bank empty — seeding via Gemini…")
        topic_bank = _generate_topic_bank(api_key, niche, mock=mock)

    last_used_idx = {}
    for i, entry in enumerate(used_topics):
        last_used_idx[entry.get("category")] = i
    categories = list(topic_bank.keys())
    categories.sort(key=lambda c: last_used_idx.get(c, -1))  # never-used categories first

    used_by_cat = {}
    for entry in used_topics:
        used_by_cat.setdefault(entry.get("category"), set()).add(entry.get("topic"))

    chosen_cat, chosen_topic = None, None
    for cat in categories:
        unused = [t for t in (topic_bank.get(cat) or []) if t not in used_by_cat.get(cat, set())]
        if unused:
            chosen_cat, chosen_topic = cat, random.choice(unused)
            break

    if chosen_topic is None:
        refill_cat = categories[0] if categories else niche
        log(f"📚 Category '{refill_cat}' exhausted — refilling via Gemini…")
        fresh = _generate_topics_for_category(
            api_key, niche, refill_cat, existing=list(topic_bank.get(refill_cat, [])), mock=mock)
        topic_bank[refill_cat] = list(topic_bank.get(refill_cat, [])) + fresh
        chosen_cat = refill_cat
        chosen_topic = fresh[0] if fresh else f"{refill_cat} tips"

    used_topics = used_topics + [{"category": chosen_cat, "topic": chosen_topic}]
    log(f"🎯 Topic: [{chosen_cat}] {chosen_topic}")
    return chosen_topic, chosen_cat, topic_bank, used_topics


# ---- Deck text (one LLM call: hook + slides + plug + caption + comment) -

MOCK_DECK_TEMPLATE = {
    "hook": "Your *lower belly fat* is not a mystery",
    "slides": [
        "Stop doing *endless cardio* for fat loss",
        "*Protein* first, everything else after",
        "Progressive overload beats *any* diet trick",
        "Sleep is the *cheat code* nobody uses",
    ],
    "plug_headline": "*EVEX* builds the plan for you",
    "caption": "the fat loss advice nobody gives you straight #fitness #gymtok #fatloss",
    "first_comment": "which one are you skipping? 👇",
}


def _deck_texts(series, topic, n_content, api_key, mock=False):
    plug = series.get("plug") or {}
    app_name = plug.get("app_name") or "EVEX"
    pitch = plug.get("pitch") or "the AI app that programs your workouts for you"

    if mock:
        pool = MOCK_DECK_TEMPLATE["slides"]
        slides = [pool[i % len(pool)] for i in range(n_content)]
        return {
            "hook": MOCK_DECK_TEMPLATE["hook"],
            "slides": slides,
            "plug_headline": MOCK_DECK_TEMPLATE["plug_headline"].replace("EVEX", app_name),
            "caption": MOCK_DECK_TEMPLATE["caption"],
            "first_comment": MOCK_DECK_TEMPLATE["first_comment"],
        }

    tone_text = TONE_PRESETS.get(series.get("tone") or "conversational", TONE_PRESETS["conversational"])
    niche = series.get("niche") or "fitness"
    prompt = f"""You write the on-image text for a cartoon-mascot TikTok slideshow (photo carousel)
in the style of top fitness carousel accounts: BIG bold statements, written like poster headlines,
never like transcribed speech.

Series niche: {niche}
Topic for this deck: {topic}
Voice & style: {tone_text}

HARD RULES for hook and slides (violating any of these is a failure):
- Poster copy, not conversation. NEVER use spoken filler: "like", "I think", "really", "just",
  "you know", "kinda", "honestly", "or", sentence-initial "so/and/but".
- No hedging, no rhetorical rambling. Every line is a confident claim or a concrete instruction.
- Be SPECIFIC: name exercises, numbers, sets/reps, timeframes, body parts. "Pause 3 seconds at
  the bottom" beats "control the movement". At least half the content slides must contain a
  number or an exercise name.
- One idea per slide. A reader should get the full tip from that slide alone.
- Fragments are good. Drop articles and glue words: "Weak glutes = weak lockout."

Write:
- "hook": first slide, max 8 words. A bold claim, sharp question, or curiosity gap about the topic.
- "slides": exactly {n_content} content slides, max 12 words each, in a logical order
  (problem -> why -> fixes), each teaching ONE concrete point, no repeats.
- "plug_headline": max 10 words, positions the app "{app_name}" ({pitch}) as the payoff/solution
  to THIS deck's topic.
- "caption": TikTok caption for the post (1-2 sentences + 3-5 lowercase hashtags).
- "first_comment": short first-comment with a soft CTA.

Mark the 1-3 highest-impact words or short phrases in EACH slide/headline (not the caption or
comment) by wrapping them in asterisks. Do not number the slides.

EXAMPLE (different topic, copy the style not the content):
hook: "Your bench is weak *off the chest.*"
slides: ["Cutting the rep short robs the *bottom range*.",
 "Fix 1: *Paused bench* — 2 seconds on the chest, 3x5.",
 "Fix 2: *Dumbbell press* deep stretch, full range, 3x10.",
 "Bracing: feet planted, upper back *tight*, then drive."]
plug_headline: "*{app_name}* programs the fix into your next push day."

Return ONLY a JSON object with keys: hook, slides, plug_headline, caption, first_comment."""
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=TEXT_MODEL, contents=prompt, config={"response_mime_type": "application/json"})
    data = json.loads(response.text)
    slides = [str(t) for t in (data.get("slides") or [])][:n_content]
    while len(slides) < n_content:
        slides.append("")
    return {
        "hook": str(data.get("hook") or topic),
        "slides": slides,
        "plug_headline": str(data.get("plug_headline") or f"{app_name} does this for you"),
        "caption": str(data.get("caption") or ""),
        "first_comment": str(data.get("first_comment") or ""),
    }


# ---- Deck orchestration --------------------------------------------------

def generate_deck(series, api_key, mock=False, log=print):
    """series: a SlideshowSeries.to_dict(). Returns (png_paths, meta). meta carries every
    per-slide 'raw' input (pose used, screenshot used, style) so rerender_deck() can
    recomposite instantly from edited text with zero new AI/image calls."""
    character_id = series.get("character_id")
    if not character_id:
        raise ValueError("Series has no character")

    lo = int(series.get("slide_min") or 4)
    hi = max(lo, int(series.get("slide_max") or 7))
    n_content = max(1, random.randint(lo, hi))

    topic, category, topic_bank, used_topics = pick_topic(series, api_key, mock=mock, log=log)
    log(f"✍️ Writing deck text ({n_content} content slides)…")
    texts = _deck_texts(series, topic, n_content, api_key, mock=mock)

    preset = dict(STYLE_PRESETS.get(series.get("style_key") or "impact", STYLE_PRESETS["impact"]))
    preset["accent"] = series.get("accent_hex") or preset.get("accent")

    base = f"charshow_{(series.get('id') or 'x')[:8]}_{random.getrandbits(40):010x}"
    os.makedirs(CHARSHOW_DIR, exist_ok=True)
    total_slides = 1 + n_content + 1  # hook + content + plug

    used_pose_keys = set()
    pngs, roles, final_texts, poses_used = [], [], [], []

    # hook
    pose_path, pose_key, pose_web = _pick_one_pose(character_id, used_pose_keys)
    if pose_key:
        used_pose_keys.add(pose_key)
    log(f"🖼️ Slide 1/{total_slides} (hook)…")
    out = os.path.join(CHARSHOW_DIR, f"{base}_slide01.png")
    pngs.append(compose_hook_slide(texts["hook"], pose_path, out, preset, log=log))
    roles.append("hook")
    final_texts.append(texts["hook"])
    poses_used.append({"key": pose_key, "path": pose_web})

    for i, slide_text in enumerate(texts["slides"], start=2):
        pose_path, pose_key, pose_web = _pick_one_pose(character_id, used_pose_keys)
        if pose_key:
            used_pose_keys.add(pose_key)
        log(f"🖼️ Slide {i}/{total_slides} (content)…")
        out = os.path.join(CHARSHOW_DIR, f"{base}_slide{i:02d}.png")
        pngs.append(compose_content_slide(slide_text, pose_path, out, preset, log=log))
        roles.append("content")
        final_texts.append(slide_text)
        poses_used.append({"key": pose_key, "path": pose_web})

    # plug (always last)
    plug = series.get("plug") or {}
    screenshots = [p for p in (plug.get("screenshots") or []) if p and os.path.exists(p)]
    screenshot_path = random.choice(screenshots) if screenshots else None
    plug_pose_path, plug_pose_key, plug_pose_web = _pick_one_pose(
        character_id, used_pose_keys, prefer_keys=PLUG_PREFERRED_POSE_KEYS)
    idx = total_slides
    log(f"🖼️ Slide {idx}/{total_slides} (plug)…")
    out = os.path.join(CHARSHOW_DIR, f"{base}_slide{idx:02d}.png")
    pngs.append(compose_plug_slide(texts["plug_headline"], plug_pose_path, screenshot_path, out, preset, log=log))
    roles.append("plug")
    final_texts.append(texts["plug_headline"])
    poses_used.append({"key": plug_pose_key, "path": plug_pose_web})

    meta = {
        "series_id": series.get("id"),
        "topic": topic, "category": category,
        "texts": final_texts, "roles": roles, "poses_used": poses_used,
        "plug_screenshot": screenshot_path,
        "style_key": series.get("style_key") or "impact",
        "accent_hex": preset.get("accent"),
        "caption": texts.get("caption", ""), "first_comment": texts.get("first_comment", ""),
        # persisted back onto the Series row by the caller (round-robin state)
        "topic_bank": topic_bank, "used_topics": used_topics,
    }
    log(f"✅ Deck rendered — {len(pngs)} slides")
    return pngs, meta


def rerender_deck(meta, new_texts, out_dir=CHARSHOW_DIR, log=print):
    """Recomposite a deck from its kept meta (pose paths, screenshot, style) with edited
    text — no new AI calls, matches automations.rerender_slides' instant re-render pattern."""
    roles = meta.get("roles") or []
    poses_used = meta.get("poses_used") or []
    if len(new_texts) != len(roles):
        raise ValueError(f"Expected {len(roles)} slide texts, got {len(new_texts)}")

    preset = dict(STYLE_PRESETS.get(meta.get("style_key") or "impact", STYLE_PRESETS["impact"]))
    preset["accent"] = meta.get("accent_hex") or preset.get("accent")
    base = f"charshow_rr_{uuid.uuid4().hex[:12]}"
    os.makedirs(out_dir, exist_ok=True)

    pngs = []
    for i, (role, text) in enumerate(zip(roles, new_texts), start=1):
        entry = poses_used[i - 1] if i - 1 < len(poses_used) else {}
        pose_path = _pose_disk_path(entry.get("path")) if isinstance(entry, dict) else None
        out = os.path.join(out_dir, f"{base}_slide{i:02d}.png")
        if role == "hook":
            pngs.append(compose_hook_slide(text, pose_path, out, preset, log=log))
        elif role == "plug":
            pngs.append(compose_plug_slide(text, pose_path, meta.get("plug_screenshot"), out, preset, log=log))
        else:
            pngs.append(compose_content_slide(text, pose_path, out, preset, log=log))
    return pngs


# ---- Batch export ---------------------------------------------------------

def _slugify(text):
    out = "".join(c.lower() if c.isalnum() else "-" for c in (text or ""))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def export_batch(creation_ids, log=print):
    """Copies each deck's PNGs into creations/exports/batch_<YYYYMMDD_HHMM>/deck_NN_<slug>/
    and writes one captions.md at the batch root (title, caption, first comment per deck).
    Returns the absolute batch directory path."""
    from db import get_session, Creation

    ts = datetime.now().strftime("%Y%m%d_%H%M")
    batch_dir = os.path.join(CHARSHOW_DIR, "exports", f"batch_{ts}")
    os.makedirs(batch_dir, exist_ok=True)

    with get_session() as s:
        rows = [s.get(Creation, cid) for cid in creation_ids]
        decks = [r.to_dict() for r in rows if r]

    lines = [f"# Batch export — {ts}", ""]
    for n, creation in enumerate(decks, start=1):
        slots = creation.get("slots") or {}
        title = creation.get("title") or slots.get("topic") or f"deck {n}"
        deck_dir = os.path.join(batch_dir, f"deck_{n:02d}_{_slugify(title)[:40] or 'deck'}")
        os.makedirs(deck_dir, exist_ok=True)
        for i, web_path in enumerate(creation.get("image_paths") or [], start=1):
            fp = os.path.join(CHARSHOW_DIR, os.path.basename(web_path))
            if os.path.exists(fp):
                shutil.copyfile(fp, os.path.join(deck_dir, f"slide{i:02d}.png"))
        lines += [
            f"## Deck {n:02d} — {title}",
            "",
            f"**Caption:** {slots.get('caption', '')}",
            "",
            f"**First comment:** {slots.get('first_comment', '')}",
            "",
        ]

    with open(os.path.join(batch_dir, "captions.md"), "w") as f:
        f.write("\n".join(lines))
    log(f"✅ Exported batch → {batch_dir}")
    return os.path.abspath(batch_dir)
