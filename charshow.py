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
from hooks import download_font_if_needed as _download_body_font_if_needed, FONT_PATH as BODY_FONT_PATH
from characters import POSE_BANK

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


def _body_font(size):
    """The serif body font (hooks.py's NotoSerif-Bold) used for list-slide bullet body
    text — distinct from the Anton display font so bullets read as body copy, not shouted
    headlines."""
    _download_body_font_if_needed()
    try:
        return ImageFont.truetype(BODY_FONT_PATH, size)
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
    """Render an accent-parsed, auto-fit headline into box=(x0,y0,x1,y1). Returns
    (size, bottom_y): the font size used (>= min_size always, since autofit never
    returns below its floor) and the y-coordinate immediately below the last rendered
    line — the actual text height, which is almost always less than box's y1. Callers
    that place something below the headline (the mascot, a bullet list) use bottom_y,
    not y1, so a short headline doesn't leave a dead gap before whatever follows it."""
    tokens = _parse_accents(text)
    if not tokens:
        return min_size, box[1]
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
    return size, y


def _wrap_plain(draw, text, font, max_width):
    """Greedy word-wrap of plain (non-accented) text — used for bullet labels/body and
    tip copy, which don't go through the accent/headline engine. Accent markers the LLM
    sneaks into these fields are stripped, not rendered literally."""
    words = str(text or "").replace("*", "").split()
    lines, current = [], []
    for word in words:
        trial = " ".join(current + [word])
        if draw.textbbox((0, 0), trial, font=font)[2] <= max_width or not current:
            current.append(word)
        else:
            lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines or [""]


# ---- Mascot / phone-frame compositing ----------------------------------
# Layout system: margins + a "dynamic packing" mascot (see _fit_mascot_frac below) so
# text + character fill the frame instead of leaving a dead band on short headlines.

SIDE_MARGIN = 55           # left/right margin for text and mascot placement (40-60px range)
BOTTOM_MARGIN = 55         # bottom margin before the frame edge
TOP_Y = 130                # headline top
TEXT_MASCOT_GAP = 60       # gap between headline bottom and mascot top
MASCOT_MIN_FRAC = 0.32     # floor so a very long headline still leaves a legible mascot
MASCOT_MAX_FRAC_CONTENT = 0.55
MASCOT_MAX_FRAC_HOOK = 0.58


def _paste_pose(img, pose_path, anchor, target_h_frac, bottom_margin=BOTTOM_MARGIN, side_margin=SIDE_MARGIN):
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
    y = H - bottom_margin - target_h
    if anchor == "bottom_right":
        x = W - target_w - side_margin
    elif anchor == "bottom_left":
        x = side_margin
    else:
        x = (W - target_w) // 2
    img.paste(pose, (x, y))


def _paste_pose_at(img, pose_path, target_h_px, center_x, center_y):
    """Place a pose PNG centered at (center_x, center_y), scaled to target_h_px tall —
    the center-anchored placement used by the list layout's side mascot and bottom
    mascot strip (as opposed to _paste_pose's bottom-anchored corner placement)."""
    if not pose_path or not os.path.exists(pose_path):
        return
    try:
        pose = Image.open(pose_path).convert("RGB")
    except Exception:
        return
    target_h = max(1, int(target_h_px))
    scale = target_h / pose.height
    target_w = max(1, int(pose.width * scale))
    pose = pose.resize((target_w, target_h))
    img.paste(pose, (center_x - target_w // 2, center_y - target_h // 2))


def _fit_mascot_frac(headline_bottom_y, max_frac, min_frac=MASCOT_MIN_FRAC,
                      gap=TEXT_MASCOT_GAP, bottom_margin=BOTTOM_MARGIN):
    """Dynamic packing: how tall (as a fraction of H) the mascot should render given
    where the headline actually ended, so it fills the remaining vertical space instead
    of leaving a dead band between a short headline and a fixed-size mascot. Clamped to
    [min_frac, max_frac] so an extremely short headline doesn't blow the mascot up past
    a sane size, and an extremely long one still leaves a legible mascot."""
    avail = (H - bottom_margin) - (headline_bottom_y + gap)
    return max(min_frac, min(max_frac, avail / H))


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
# Layout system: margins + a "dynamic packing" mascot (see _fit_mascot_frac above) so
# text + character fill the frame instead of leaving a dead band on short headlines.

# Kept as fixed reference boxes for external callers/tests (draw_headline's own auto-fit
# behavior) — the composers below build their headline box dynamically from the margin
# constants and only use these as the historical/default ceiling geometry.
HOOK_BOX = (SIDE_MARGIN, TOP_Y, W - SIDE_MARGIN, H - TEXT_MASCOT_GAP - int(MASCOT_MIN_FRAC * H) - BOTTOM_MARGIN)
CONTENT_BOX = HOOK_BOX
PLUG_HEADLINE_BOX = (SIDE_MARGIN, 110, W - SIDE_MARGIN, 420)


def _slide_base(preset):
    return Image.new("RGB", (W, H), preset.get("bg", "#FFFFFF"))


def compose_hook_slide(text, pose_path, out_path, preset, log=print):
    img = _slide_base(preset)
    draw = ImageDraw.Draw(img)
    _, bottom_y = draw_headline(draw, text, HOOK_BOX, preset, max_size=185, min_size=36)
    mascot_frac = _fit_mascot_frac(bottom_y, max_frac=MASCOT_MAX_FRAC_HOOK)
    _paste_pose(img, pose_path, "bottom_right", mascot_frac)
    img.save(out_path)
    return out_path


def compose_content_slide(text, pose_path, out_path, preset, log=print):
    img = _slide_base(preset)
    draw = ImageDraw.Draw(img)
    _, bottom_y = draw_headline(draw, text, CONTENT_BOX, preset, max_size=150, min_size=32)
    mascot_frac = _fit_mascot_frac(bottom_y, max_frac=MASCOT_MAX_FRAC_CONTENT)
    _paste_pose(img, pose_path, "bottom_right", mascot_frac)
    img.save(out_path)
    return out_path


def compose_plug_slide(headline, pose_path, screenshot_path, out_path, preset, cta_text=None, log=print):
    img = _slide_base(preset)
    d = ImageDraw.Draw(img)
    _, headline_bottom = draw_headline(d, headline, PLUG_HEADLINE_BOX, preset, max_size=120, min_size=28)
    if (cta_text or "").strip():
        # accent pill directly under the headline — dark ink on the accent fill (never white)
        font = _font(46)
        clean = str(cta_text).replace("*", "").strip()
        tw = d.textbbox((0, 0), clean, font=font)[2]
        px, py, pad_x, pad_y = SIDE_MARGIN, headline_bottom + 40, 34, 20
        th = d.textbbox((0, 0), "Ag", font=font)[3]
        d.rounded_rectangle([px, py, px + tw + 2 * pad_x, py + th + 2 * pad_y],
                            radius=(th + 2 * pad_y) // 2, fill=preset.get("accent", "#00C080"))
        d.text((px + pad_x, py + pad_y - 4), clean, font=font, fill="#0B2B1F")
    _draw_phone_frame(img, screenshot_path, center_x=730, center_y=1280, frame_h=1180, log=log)
    _paste_pose(img, pose_path, "bottom_left", 0.38, bottom_margin=BOTTOM_MARGIN, side_margin=SIDE_MARGIN)
    img.save(out_path)
    return out_path


# ---- List-layout composer (structured slides: heading + bullets + tip/mascot) --------

LIST_MARGIN_X = 60
LIST_TOP_Y = 110
LIST_HEADLINE_BOX_H = int(H * 0.30)
LIST_HEADLINE_MAX_SIZE = 92
LIST_HEADLINE_MIN_SIZE = 34

BULLET_CIRCLE_D = 64
BULLET_LABEL_SIZE = 44
BULLET_BODY_SIZE = 36
BULLET_TEXT_GAP_X = 24
BULLET_BLOCK_GAP = 40
BULLET_SEP_COLOR = "#E4E4E4"

RIGHT_MASCOT_COL_FRAC = 0.58   # bullet column stops here when a side mascot is shown
BOTTOM_STRIP_H_FRAC = 0.30
BOTTOM_STRIP_MASCOT_W_FRAC = 0.30


def _draw_bullets(draw, bullets, box, preset):
    """Numbered bullet list: accent circle + Anton label + serif body line, hairline
    separators between entries. Returns the y just past the last bullet."""
    x0, y0, x1, _y1 = box
    ink, accent = preset.get("ink", "#111111"), preset.get("accent", "#00C080")
    label_font = _font(BULLET_LABEL_SIZE)
    body_font = _body_font(BULLET_BODY_SIZE)
    num_font = _font(int(BULLET_CIRCLE_D * 0.55))
    text_x = x0 + BULLET_CIRCLE_D + BULLET_TEXT_GAP_X
    text_w = max(1, x1 - text_x)
    label_line_h = draw.textbbox((0, 0), "Ag", font=label_font)[3] + 8
    body_line_h = draw.textbbox((0, 0), "Ag", font=body_font)[3] + 8

    y = y0
    n = len(bullets)
    for i, b in enumerate(bullets):
        b = b or {}
        raw_label = str(b.get("label") or "").strip().rstrip(":").upper()
        label = f"{raw_label}:" if raw_label else ""
        body = str(b.get("text") or "")

        circle_top = y
        cx = x0 + BULLET_CIRCLE_D // 2
        cy = circle_top + BULLET_CIRCLE_D // 2
        draw.ellipse([x0, circle_top, x0 + BULLET_CIRCLE_D, circle_top + BULLET_CIRCLE_D], fill=accent)
        num = str(i + 1)
        nb = draw.textbbox((0, 0), num, font=num_font)
        draw.text((cx - (nb[2] - nb[0]) // 2 - nb[0], cy - (nb[3] - nb[1]) // 2 - nb[1]),
                   num, font=num_font, fill="#FFFFFF")

        ty = y
        if label:
            for line in _wrap_plain(draw, label, label_font, text_w):
                draw.text((text_x, ty), line, font=label_font, fill=ink)
                ty += label_line_h
            ty += 6
        for line in _wrap_plain(draw, body, body_font, text_w):
            draw.text((text_x, ty), line, font=body_font, fill=ink)
            ty += body_line_h

        block_bottom = max(ty, circle_top + BULLET_CIRCLE_D)
        y = block_bottom + BULLET_BLOCK_GAP
        if i < n - 1:
            sep_y = y - BULLET_BLOCK_GAP // 2
            draw.line([(x0, sep_y), (x1, sep_y)], fill=BULLET_SEP_COLOR, width=2)
    return y


def _tip_box_height(draw, tip, box_w, pad=26):
    label_font = _font(34)
    body_font = _body_font(32)
    label_h = draw.textbbox((0, 0), "Ag", font=label_font)[3] + 10
    lines = _wrap_plain(draw, tip, body_font, max(1, box_w - 2 * pad))
    line_h = draw.textbbox((0, 0), "Ag", font=body_font)[3] + 8
    return pad * 2 + label_h + line_h * len(lines)


def _draw_tip_box(draw, tip, x0, y0, box_w, box_h, preset, pad=26):
    """Rounded callout: accent border + accent-tinted (~10% opacity over white) fill,
    an Anton 'TIP:' label, and the wrapped body line below it."""
    ink, accent = preset.get("ink", "#111111"), preset.get("accent", "#00C080")
    x1, y1 = x0 + box_w, y0 + box_h
    r, g, b = tuple(int(accent.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    fill = (int(r * 0.10 + 255 * 0.90), int(g * 0.10 + 255 * 0.90), int(b * 0.10 + 255 * 0.90))
    draw.rounded_rectangle([x0, y0, x1, y1], radius=20, outline=accent, width=3, fill=fill)
    label_font = _font(34)
    body_font = _body_font(32)
    draw.text((x0 + pad, y0 + pad), "TIP:", font=label_font, fill=ink)
    label_h = draw.textbbox((0, 0), "Ag", font=label_font)[3] + 10
    line_h = draw.textbbox((0, 0), "Ag", font=body_font)[3] + 8
    ty = y0 + pad + label_h
    for line in _wrap_plain(draw, tip, body_font, box_w - 2 * pad):
        draw.text((x0 + pad, ty), line, font=body_font, fill=ink)
        ty += line_h


def _draw_bullet_pose_strip(img, bullets, y_top, strip_h):
    """Up to 3 small mascots along the bottom, one per bullet (bullet_poses=true)."""
    n = max(1, len(bullets))
    slot_w = W // n
    max_w = int(W * BOTTOM_STRIP_MASCOT_W_FRAC)
    for i, b in enumerate(bullets):
        pose_entry = (b or {}).get("pose") or {}
        disk = _pose_disk_path(pose_entry.get("path"))
        if not disk:
            continue
        try:
            pose = Image.open(disk).convert("RGB")
        except Exception:
            continue
        scale = min(max_w / pose.width, strip_h / pose.height)
        target_w = max(1, int(pose.width * scale))
        target_h = max(1, int(pose.height * scale))
        pose = pose.resize((target_w, target_h))
        cx = slot_w * i + slot_w // 2
        y = y_top + (strip_h - target_h)
        img.paste(pose, (cx - target_w // 2, y))


def compose_list_slide(slide, out_path, preset, log=print):
    """A structured 'list' slide: Anton heading, a left bullet column (numbered accent
    circles + label + body), and either a single mascot on the right (vertically
    centered on the bullet zone) or — when bullet_poses is set — a bottom strip of one
    small mascot per bullet instead. An optional accent-tinted TIP box sits at the
    bottom."""
    img = _slide_base(preset)
    draw = ImageDraw.Draw(img)

    x0, x1 = LIST_MARGIN_X, W - LIST_MARGIN_X
    heading_box = (x0, LIST_TOP_Y, x1, LIST_TOP_Y + LIST_HEADLINE_BOX_H)
    _, heading_bottom = draw_headline(draw, slide.get("text") or "", heading_box, preset,
                                       max_size=LIST_HEADLINE_MAX_SIZE, min_size=LIST_HEADLINE_MIN_SIZE)

    bullets = slide.get("bullets") or []
    tip = str(slide.get("tip") or "").strip()
    use_strip = bool(slide.get("bullet_poses")) and 1 <= len(bullets) <= 3
    side_pose_web = None if use_strip else (slide.get("pose") or {}).get("path")

    bottom_reserved = BOTTOM_MARGIN
    tip_h = 0
    if tip:
        tip_h = _tip_box_height(draw, tip, x1 - x0)
        bottom_reserved += tip_h + 30
    strip_h = int(H * BOTTOM_STRIP_H_FRAC) if use_strip else 0
    if use_strip:
        bottom_reserved += strip_h + 20

    zone_top = heading_bottom + 50
    zone_bottom = H - bottom_reserved
    col_x1 = x0 + int((x1 - x0) * (RIGHT_MASCOT_COL_FRAC if side_pose_web else 1.0))

    _draw_bullets(draw, bullets, (x0, zone_top, col_x1, zone_bottom), preset)

    if side_pose_web:
        disk = _pose_disk_path(side_pose_web)
        if disk:
            cx = col_x1 + (x1 - col_x1) // 2
            cy = (zone_top + zone_bottom) // 2
            available_h = max(1, zone_bottom - zone_top)
            _paste_pose_at(img, disk, target_h_px=min(available_h, int(H * 0.5)), center_x=cx, center_y=cy)
    elif use_strip:
        strip_y_top = H - BOTTOM_MARGIN - (tip_h + 30 if tip else 0) - strip_h
        _draw_bullet_pose_strip(img, bullets, y_top=strip_y_top, strip_h=strip_h)

    if tip:
        _draw_tip_box(draw, tip, x0, H - BOTTOM_MARGIN - tip_h, x1 - x0, tip_h, preset)

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


def _match_pose_hint(pose_hint, pool):
    """Keyword/substring match a free-text pose_hint (e.g. 'dumbbell curl') against a
    pose pack's keys (['dumbbell_curl', ...]) and POSE_BANK's longer descriptions.
    Returns the best-matching pool key, or None if nothing scores."""
    hint = (pose_hint or "").lower().strip()
    if not hint:
        return None
    hint_words = set(re.findall(r"[a-z0-9]+", hint))
    hint_compact = hint.replace(" ", "_")
    desc_by_key = {k: d.lower() for k, d in POSE_BANK}
    best_key, best_score = None, 0
    for key, _web_path in pool:
        key_words = set(key.split("_"))
        desc_words = set(re.findall(r"[a-z0-9]+", desc_by_key.get(key, "")))
        score = 2 * len(hint_words & key_words) + len(hint_words & desc_words)
        if key == hint_compact or key in hint_compact or hint_compact in key:
            score += 3
        if score > best_score:
            best_key, best_score = key, score
    return best_key


def _resolve_pose_hint(character_id, pose_hint, used_keys, api_key, mock, log=print):
    """A 2-4 word pose_hint (from the LLM, e.g. 'dumbbell curl') -> {'key','path'} pose
    dict. Order of resolution:
      1. Match against the character's existing pose pack (keyword/substring, see
         _match_pose_hint) — zero-cost, the common case once a pack has some breadth.
      2. No match + a real API key present (not mock) -> generate the pose on the fly
         via characters.generate_pose and persist it as a new CharacterLook, so it's in
         the pack (and free) for every future deck.
      3. Otherwise (mock mode, no key, or generation failed) -> a random pack pose, same
         as the pre-existing behavior.
    Returns {'key': str|None, 'path': str|None} (path is a web path, or None if the
    character has no pack at all yet)."""
    pool = _character_pose_looks(character_id)
    matched_key = _match_pose_hint(pose_hint, pool)
    if matched_key:
        for key, web_path in pool:
            if key == matched_key:
                return {"key": key, "path": web_path}

    if pose_hint and not mock and api_key:
        try:
            from db import get_session, Character, CharacterLook
            from characters import POSE_PROMPT_PREFIX, generate_pose
            with get_session() as s:
                char = s.get(Character, character_id)
            if char:
                slug = _slugify(pose_hint)[:40] or f"custom{random.getrandbits(20):06x}"
                out_name = f"pose_{character_id[:8]}_{slug}.png"
                log(f"🎨 On-the-fly pose (not in pack): '{pose_hint}' → generating…")
                web_path = generate_pose(api_key, char.portrait_path, pose_hint, out_name, mock=False)
                with get_session() as s:
                    look = CharacterLook(character_id=character_id, prompt=f"{POSE_PROMPT_PREFIX}{slug}",
                                          image_path=web_path)
                    s.add(look)
                    s.commit()
                log(f"✅ On-the-fly pose cached for future decks: {slug}")
                return {"key": slug, "path": web_path}
        except Exception as e:
            log(f"⚠️ On-the-fly pose generation failed for '{pose_hint}': {e} — falling back to pack pose")

    disk_path, key, web_path = _pick_one_pose(character_id, used_keys)
    return {"key": key, "path": web_path}


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

    # optional batch-level audience filter ("men"/"women"): only tagged topics qualify
    aud_filter = (series.get("_audience_filter") or "").lower() or None

    chosen_cat, chosen_topic = None, None
    for cat in categories:
        unused = [t for t in (topic_bank.get(cat) or []) if t not in used_by_cat.get(cat, set())]
        if aud_filter:
            unused = [t for t in unused if _parse_audience_tag(t)[1] == aud_filter]
        if unused:
            chosen_cat, chosen_topic = cat, random.choice(unused)
            break

    if chosen_topic is None and aud_filter:
        raise ValueError(f"No unused @{aud_filter}-tagged topics left in the bank — "
                         f"add more @{aud_filter} topics or generate without the audience filter")

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
        {"layout": "statement", "text": "Stop doing *endless cardio* for fat loss", "pose_hint": "arms crossed confident"},
        {"layout": "list", "text": "3 fixes for a *fat loss* stall", "pose_hint": "arms crossed confident",
         "bullets": [
             {"label": "Be consistent", "text": "Train the *same 3 days* every week.", "pose_hint": "fist pump"},
             {"label": "Protein first", "text": "*30g protein* at every meal.", "pose_hint": "shaker bottle"},
             {"label": "Sleep 7+ hours", "text": "Recovery is where the *results* happen.", "pose_hint": "arms crossed confident"},
         ],
         "tip": "Track just ONE of these for 2 weeks before adding another.",
         "bullet_poses": True},
        {"layout": "statement", "text": "Progressive overload beats *any* diet trick", "pose_hint": "barbell back squat"},
        {"layout": "statement", "text": "Sleep is the *cheat code* nobody uses", "pose_hint": "thumbs-up toward viewer"},
    ],
    "plug_headline": "*EVEX* builds the plan for you",
    "caption": "the fat loss advice nobody gives you straight #fitness #gymtok #fatloss",
    "first_comment": "which one are you skipping? 👇",
}


def _normalize_llm_slides(raw_slides, n_content):
    """Coerce the LLM's (or mock's) 'slides' output into a safe, uniform list of
    slide-spec dicts of exactly n_content entries — tolerates a plain string entry
    (treated as a 'statement' slide, e.g. an older prompt/response), a missing
    layout/pose_hint, or malformed bullets, so a slightly-off LLM response degrades
    gracefully instead of crashing the render."""
    out = []
    for item in (raw_slides or [])[:n_content]:
        if isinstance(item, str):
            out.append({"layout": "statement", "text": item, "pose_hint": ""})
            continue
        item = item or {}
        layout = item.get("layout") if item.get("layout") in ("statement", "list") else "statement"
        slide = {"layout": layout, "text": str(item.get("text") or ""), "pose_hint": str(item.get("pose_hint") or "")}
        if layout == "list":
            bullets = []
            for b in (item.get("bullets") or [])[:4]:
                b = b or {}
                bullets.append({"label": str(b.get("label") or ""), "text": str(b.get("text") or ""),
                                 "pose_hint": str(b.get("pose_hint") or "")})
            slide["bullets"] = bullets
            slide["tip"] = str(item.get("tip") or "")
            slide["bullet_poses"] = bool(item.get("bullet_poses")) and 1 <= len(bullets) <= 3
        out.append(slide)
    while len(out) < n_content:
        out.append({"layout": "statement", "text": "", "pose_hint": ""})
    return out


def _deck_texts(series, topic, n_content, api_key, mock=False, audience=None):
    plug = series.get("plug") or {}
    app_name = plug.get("app_name") or "EVEX"
    pitch = plug.get("pitch") or "the AI app that programs your workouts for you"

    if mock:
        pool = MOCK_DECK_TEMPLATE["slides"]
        slides = _normalize_llm_slides([pool[i % len(pool)] for i in range(n_content)], n_content)
        return {
            "hook": MOCK_DECK_TEMPLATE["hook"],
            "slides": slides,
            "plug_headline": MOCK_DECK_TEMPLATE["plug_headline"].replace("EVEX", app_name),
            "caption": MOCK_DECK_TEMPLATE["caption"],
            "first_comment": MOCK_DECK_TEMPLATE["first_comment"],
        }

    audience_line = ""
    if audience:
        audience_line = (f"\nTarget audience: {audience} — write specifically for "
                         f"{audience} lifters (their goals, their language), "
                         'without saying "for women"/"for men" on the slides.')
    tone_text = TONE_PRESETS.get(series.get("tone") or "conversational", TONE_PRESETS["conversational"])
    niche = series.get("niche") or "fitness"
    prompt = f"""You write the on-image text for a cartoon-mascot TikTok slideshow (photo carousel)
in the style of top fitness carousel accounts: BIG bold statements, written like poster headlines,
never like transcribed speech.

Series niche: {niche}
Topic for this deck: {topic}{audience_line}
Voice & style: {tone_text}

HARD RULES for hook and slides (violating any of these is a failure):
- Poster copy, not conversation. NEVER use spoken filler: "like", "I think", "really", "just",
  "you know", "kinda", "honestly", "or", sentence-initial "so/and/but".
- No hedging, no rhetorical rambling. Every line is a confident claim or a concrete instruction.
- Be SPECIFIC: name exercises, numbers, sets/reps, timeframes, body parts. "Pause 3 seconds at
  the bottom" beats "control the movement". At least half the content slides must contain a
  number or an exercise name.
- One idea per slide (or, for a "list" slide, one idea per bullet). A reader should get the full
  tip from that slide/bullet alone.
- Fragments are good. Drop articles and glue words: "Weak glutes = weak lockout."

Each content slide is an OBJECT with a "layout":
- "statement" — a single punchy claim or instruction. Fields: layout, text (max 12 words),
  pose_hint.
- "list" — 2-4 short bullets, for a tip roundup or an exercise breakdown. Fields: layout,
  text (a short heading, max 8 words), bullets (2-4 objects: {{label (1-3 words), text (one
  concrete line, max 10 words), pose_hint}}), tip (optional, one short actionable line), pose_hint
  (the mascot shown beside the bullets, only used when bullet_poses is false), bullet_poses (true
  ONLY for an exercise/action breakdown where a different mascot pose per bullet reads better —
  set it true only when there are 2 or 3 bullets).
Use AT MOST 2 "list" slides in the whole deck; the rest are "statement".

"pose_hint" (every slide and every bullet needs one, even statement slides): 2-4 words describing
what the mascot is DOING in that beat — e.g. "dumbbell curl", "pointing at viewer", "arms crossed
confident". Prefer an action that matches the text.

Write:
- "hook": first slide, max 8 words. A bold claim, sharp question, or curiosity gap about the topic.
- "slides": exactly {n_content} content slide objects (as specified above), in a logical order
  (problem -> why -> fixes), each teaching ONE concrete point (or set of bullets), no repeats.
- "plug_headline": max 10 words, positions the app "{app_name}" ({pitch}) as the payoff/solution
  to THIS deck's topic.
- "caption": TikTok caption for the post (1-2 sentences + 3-5 lowercase hashtags).
- "first_comment": short first-comment with a soft CTA.

Mark the 1-3 highest-impact words or short phrases in EACH slide/bullet/headline (not the caption,
comment, bullet labels, or pose_hint) by wrapping them in asterisks. Do not number the slides.

EXAMPLE (different topic, copy the style not the content):
hook: "Your bench is weak *off the chest.*"
slides: [
  {{"layout": "statement", "text": "Cutting the rep short robs the *bottom range*.", "pose_hint": "facepalm"}},
  {{"layout": "list", "text": "2 fixes for a *weak* bottom", "pose_hint": "arms crossed confident",
    "bullets": [
      {{"label": "Paused bench", "text": "*2 seconds* on the chest, 3x5.", "pose_hint": "dumbbell bicep curl"}},
      {{"label": "Dumbbell press", "text": "Deep stretch, *full range*, 3x10.", "pose_hint": "overhead barbell press"}}
    ],
    "tip": "Cut the load 20% the first week you add these.",
    "bullet_poses": true}},
  {{"layout": "statement", "text": "Bracing: feet planted, upper back *tight*, then drive.", "pose_hint": "barbell back squat"}}
]
plug_headline: "*{app_name}* programs the fix into your next push day."

Return ONLY a JSON object with keys: hook, slides, plug_headline, caption, first_comment."""
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=TEXT_MODEL, contents=prompt, config={"response_mime_type": "application/json"})
    data = json.loads(response.text)
    slides = _normalize_llm_slides(data.get("slides"), n_content)
    return {
        "hook": str(data.get("hook") or topic),
        "slides": slides,
        "plug_headline": str(data.get("plug_headline") or f"{app_name} does this for you"),
        "caption": str(data.get("caption") or ""),
        "first_comment": str(data.get("first_comment") or ""),
    }


# ---- Deck orchestration --------------------------------------------------

AUDIENCE_TAG = re.compile(r"\s*@(men|women)\s*$", re.IGNORECASE)


def _parse_audience_tag(topic):
    """'5 glute tips no one tells you @women' -> ('5 glute tips no one tells you', 'women').
    No tag -> (topic, None). Tags let one series hold men- and women-targeted topics; the
    audience picks the mascot variant and flavors the copy."""
    m = AUDIENCE_TAG.search(str(topic or ""))
    if not m:
        return str(topic or "").strip(), None
    return AUDIENCE_TAG.sub("", topic).strip(), m.group(1).lower()


def _screenshot_disk_path(p):
    """A series plug screenshot entry may be a web path ('/creations/...', the current
    format) or a legacy raw disk path ('data/plug_screenshots/...', pre-migration) —
    resolve either to an existing file on disk."""
    if not p:
        return None
    if p.startswith("/creations/"):
        fp = os.path.join("creations", p[len("/creations/"):])
        return fp if os.path.exists(fp) else None
    return p if os.path.exists(p) else None


# ---- Full-AI slide rendering (render_mode="ai_full") ----------------------
# Experimental alternative to the PIL typesetting path: Gemini renders the ENTIRE
# slide (text included) from the structured slide content, with the mascot portrait
# as an identity reference. Trades pixel-perfect typography/edit-speed for the image
# model's native sense of layout (no dead whitespace, character reuse, richer motifs).

AI_SLIDE_STYLE = (
    "STYLE (identical on every slide of this carousel — consistent theme): vertical 9:16 "
    "TikTok carousel slide, clean pure-white background. Headlines in an ULTRA-BOLD condensed "
    "uppercase black sans-serif (Anton/impact style); the specific words called out as ACCENT "
    "words are rendered in the accent color {accent}, all other text near-black. Body/secondary "
    "text smaller, dark, highly legible. The cartoon character from the FIRST reference image: "
    "copy its identity EXACTLY — teal skin, two plain white eyes, no other facial features, and the "
    "same outfit as the reference — in the same flat cel-shaded comic style with thick clean outlines. "
    "COMPOSITION: fill the frame with purposeful content — big type, large character art, tight "
    "but breathable margins (~60px), NO large empty white regions and no cramped overlaps. The "
    "character may appear MULTIPLE TIMES in different poses when it serves the layout. Allowed "
    "motifs: numbered accent circles, bulleted lists, green-checkmark vs red-X comparison columns, "
    "thin separator lines, softly tinted rounded callout boxes. "
    "TEXT ACCURACY IS CRITICAL: render every quoted string EXACTLY as written, spelled perfectly, "
    "and exactly ONCE — never duplicate a string or a word within it. Text must NEVER be covered "
    "or overlapped by the character or any artwork: reserve clear space for every text block and "
    "keep it fully legible. Add NO other words, labels, watermarks, or logos anywhere, and NO "
    "empty placeholder boxes, badges, or panels — draw only the elements explicitly specified."
)


def _accent_split(text):
    """'your *progress* stalled' -> ('your progress stalled', ['progress']) — the image
    model gets clean text plus an explicit accent-word list (sending raw asterisks made
    it draw them literally)."""
    accents = [m.strip() for m in re.findall(r"\*([^*]+)\*", str(text or "")) if m.strip()]
    clean = re.sub(r"\*([^*]*)\*", r"\1", str(text or "")).strip()
    return clean, accents


def _quoted(text):
    clean, accents = _accent_split(text)
    out = f'"{clean}"'
    if accents:
        out += " (ACCENT words: " + ", ".join(f'"{a}"' for a in accents) + ")"
    return out


def _ai_slide_prompt(slide, accent_hex):
    """Structured slide -> a layout brief for the image model."""
    role = slide.get("role") or "content"
    layout = slide.get("layout") or "statement"
    text = str(slide.get("text") or "").strip()
    hint = (slide.get("pose_hint") or "").strip()
    lines = []
    if role == "hook":
        lines.append(
            f'HOOK/COVER SLIDE with a strict two-zone layout. TOP ZONE (upper ~40% of the frame): '
            f'ONLY the giant scroll-stopping headline, on clean white: {_quoted(text)}. BOTTOM ZONE '
            f'(lower ~60%): the character, large and dynamic{f", {hint}" if hint else ""}. The '
            'character\'s head may rise slightly into the headline zone BEHIND the text, but every '
            'letter of every word must remain fully readable — no letter may be hidden, and the '
            'character must never sit IN FRONT of any text.')
    elif role == "plug":
        lines.append(
            f'FINAL APP-PROMO SLIDE. Headline at the top: {_quoted(text)}. Below it, ONE instance of the '
            'character (at most two) enthusiastically presents a large smartphone; the phone screen '
            'shows the app UI from the SECOND reference image, reproduced faithfully. Keep the '
            'composition simple: headline, character, phone — no lists, no extra badges or pills.')
        if (slide.get("cta") or "").strip():
            lines.append(f'Additionally, ONE prominent rounded pill-shaped button filled with the accent color, '
                         f'containing the exact dark text {_quoted(slide["cta"])} — place it clearly visible '
                         'near the headline or bottom, overlapping nothing.')
    elif layout == "list":
        lines.append(f'LIST SLIDE. Headline at the top: {_quoted(text)}. Then a clear list:')
        for i, b in enumerate(slide.get("bullets") or [], start=1):
            bhint = (b.get("pose_hint") or "").strip()
            lines.append(f'  Item {i}: bold label {_quoted(b.get("label"))} with text {_quoted(b.get("text"))}.'
                         + (f' If illustrating items with the character, this one is: {bhint}.' if bhint else ""))
        if (slide.get("tip") or "").strip():
            lines.append(f'At the bottom, a tinted rounded callout box: bold "TIP:" then {_quoted(slide["tip"])} — '
                         'make it visually distinct from the list (accent-tinted fill, accent border).')
        lines.append('Illustrate with the character (one or several instances) integrated into the layout.')
    else:
        lines.append(
            f'CONTENT SLIDE. Big headline: {_quoted(text)}. The character illustrates the point'
            + (f': {hint}.' if hint else '.'))
    lines.append(AI_SLIDE_STYLE.replace("{accent}", accent_hex or "#00C080"))
    return "\n".join(lines)


QC_PROMPT = (
    "You are checking a social-media slide image for text defects. Answer with EXACTLY one word: "
    "OK or BAD. Answer BAD if any letters or words are partially covered by artwork, cut off at "
    "an edge, overlapped so they are hard to read, visibly misspelled, or duplicated. Small "
    "stylistic overlap where every letter is still clearly readable is OK. Empty decorative "
    "shapes are OK. Otherwise answer OK."
)


def _qc_slide_text(image_path, api_key, log=print):
    """One cheap vision check per AI-rendered slide: is the text clean? True = OK.
    Any API failure counts as OK (QC must never block generation)."""
    try:
        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model=TEXT_MODEL, contents=[Image.open(image_path), QC_PROMPT])
        return "BAD" not in (resp.text or "").strip().upper()
    except Exception as e:
        log(f"⚠️ QC check skipped ({e})")
        return True


def _character_portrait_disk(character_id):
    from db import get_session, Character
    with get_session() as s:
        row = s.get(Character, character_id)
    if not row or not row.portrait_path:
        return None
    fp = os.path.join("creations", os.path.relpath(row.portrait_path, "/creations")) \
        if str(row.portrait_path).startswith("/creations/") else row.portrait_path
    return fp if os.path.exists(fp) else None


def _ai_render_slide(slide, accent_hex, portrait_disk, out_path, api_key, mock=False,
                     screenshot_disk=None, log=print):
    if mock:
        from characters import _mock_image
        _mock_image(f"AI {slide.get('role')}", out_path, seed=str(slide)[:40])
        return out_path
    from characters import _generate_image
    parts = []
    if portrait_disk and os.path.exists(portrait_disk):
        parts.append(Image.open(portrait_disk))
    if slide.get("role") == "plug" and screenshot_disk and os.path.exists(screenshot_disk):
        parts.append(Image.open(screenshot_disk))
    parts.append(_ai_slide_prompt(slide, accent_hex))
    _generate_image(api_key, parts, out_path)
    return out_path


def generate_deck(series, api_key, mock=False, log=print):
    """series: a SlideshowSeries.to_dict(). Returns (png_paths, meta). meta['slides'] is
    the structured, persistable slide list (role, layout, text, bullets, tip, pose_hint,
    pose, bullet_poses) so rerender_deck() can recomposite instantly from edited content
    with zero new AI/image calls, and pose_hint resolution (pack match or on-the-fly
    generation) never needs to run twice for the same slide."""
    character_id = series.get("character_id")
    if not character_id:
        raise ValueError("Series has no character")

    lo = int(series.get("slide_min") or 4)
    hi = max(lo, int(series.get("slide_max") or 7))
    n_content = max(1, random.randint(lo, hi))

    topic, category, topic_bank, used_topics = pick_topic(series, api_key, mock=mock, log=log)
    topic, audience = _parse_audience_tag(topic)
    if audience == "women" and series.get("female_character_id"):
        # women-targeted topics render with the female mascot (portrait ref in ai_full;
        # typeset falls back to the default mascot if the female has no pose pack)
        if series.get("render_mode") == "ai_full" or _all_poses(series["female_character_id"]):
            character_id = series["female_character_id"]
            log("👩 Audience: women → female mascot")
        else:
            log("⚠️ Women-targeted topic but female mascot has no pose pack — using default mascot")
    elif audience:
        log(f"🎯 Audience: {audience}")
    series = {**series, "character_id": character_id}
    log(f"✍️ Writing deck text ({n_content} content slides)…")
    texts = _deck_texts(series, topic, n_content, api_key, mock=mock, audience=audience)

    preset = dict(STYLE_PRESETS.get(series.get("style_key") or "impact", STYLE_PRESETS["impact"]))
    preset["accent"] = series.get("accent_hex") or preset.get("accent")

    base = f"charshow_{(series.get('id') or 'x')[:8]}_{random.getrandbits(40):010x}"
    os.makedirs(CHARSHOW_DIR, exist_ok=True)
    total_slides = 1 + n_content + 1  # hook + content + plug

    render_mode = series.get("render_mode") or "typeset"
    if render_mode == "ai_full":
        return _generate_deck_ai_full(series, texts, n_content, base, api_key, mock=mock, log=log,
                                      topic=topic, category=category, audience=audience,
                                      topic_bank=topic_bank, used_topics=used_topics)

    used_pose_keys = set()
    pngs, slides = [], []

    # hook
    pose_path, pose_key, pose_web = _pick_one_pose(character_id, used_pose_keys)
    if pose_key:
        used_pose_keys.add(pose_key)
    log(f"🖼️ Slide 1/{total_slides} (hook)…")
    out = os.path.join(CHARSHOW_DIR, f"{base}_slide01.png")
    pngs.append(compose_hook_slide(texts["hook"], pose_path, out, preset, log=log))
    slides.append({"role": "hook", "layout": "statement", "text": texts["hook"], "bullets": [],
                    "tip": "", "pose_hint": "", "bullet_poses": False,
                    "pose": {"key": pose_key, "path": pose_web}})

    for i, slide_spec in enumerate(texts["slides"], start=2):
        layout = slide_spec.get("layout") or "statement"
        text = slide_spec.get("text") or ""
        out = os.path.join(CHARSHOW_DIR, f"{base}_slide{i:02d}.png")
        log(f"🖼️ Slide {i}/{total_slides} (content, {layout})…")

        if layout == "list":
            bullets_in = slide_spec.get("bullets") or []
            use_strip = bool(slide_spec.get("bullet_poses")) and 1 <= len(bullets_in) <= 3
            resolved_bullets = []
            for b in bullets_in:
                entry = {"label": b.get("label") or "", "text": b.get("text") or "", "pose_hint": b.get("pose_hint") or ""}
                if use_strip:
                    pose = _resolve_pose_hint(character_id, entry["pose_hint"], used_pose_keys, api_key, mock, log=log)
                    if pose.get("key"):
                        used_pose_keys.add(pose["key"])
                    entry["pose"] = pose
                resolved_bullets.append(entry)

            slide_obj = {"role": "content", "layout": "list", "text": text, "bullets": resolved_bullets,
                         "tip": slide_spec.get("tip") or "", "bullet_poses": use_strip,
                         "pose_hint": slide_spec.get("pose_hint") or "", "pose": {"key": None, "path": None}}
            if not use_strip:
                pose = _resolve_pose_hint(character_id, slide_obj["pose_hint"], used_pose_keys, api_key, mock, log=log)
                if pose.get("key"):
                    used_pose_keys.add(pose["key"])
                slide_obj["pose"] = pose
            pngs.append(compose_list_slide(slide_obj, out, preset, log=log))
        else:
            hint = slide_spec.get("pose_hint") or ""
            pose = _resolve_pose_hint(character_id, hint, used_pose_keys, api_key, mock, log=log)
            if pose.get("key"):
                used_pose_keys.add(pose["key"])
            slide_obj = {"role": "content", "layout": "statement", "text": text, "bullets": [],
                         "tip": "", "pose_hint": hint, "bullet_poses": False, "pose": pose}
            pngs.append(compose_content_slide(text, _pose_disk_path(pose.get("path")), out, preset, log=log))

        slides.append(slide_obj)

    # plug (always last)
    plug = series.get("plug") or {}
    screenshots = [sp for sp in (_screenshot_disk_path(p) for p in (plug.get("screenshots") or [])) if sp]
    screenshot_path = random.choice(screenshots) if screenshots else None
    plug_pose_path, plug_pose_key, plug_pose_web = _pick_one_pose(
        character_id, used_pose_keys, prefer_keys=PLUG_PREFERRED_POSE_KEYS)
    idx = total_slides
    log(f"🖼️ Slide {idx}/{total_slides} (plug)…")
    out = os.path.join(CHARSHOW_DIR, f"{base}_slide{idx:02d}.png")
    plug_cta = (plug.get("cta_text") or "").strip()
    pngs.append(compose_plug_slide(texts["plug_headline"], plug_pose_path, screenshot_path, out, preset,
                                   cta_text=plug_cta, log=log))
    slides.append({"role": "plug", "layout": "statement", "text": texts["plug_headline"], "bullets": [],
                    "tip": "", "pose_hint": "", "bullet_poses": False, "cta": plug_cta,
                    "pose": {"key": plug_pose_key, "path": plug_pose_web}})

    meta = {
        "series_id": series.get("id"), "character_id": series.get("character_id"),
        "render_mode": "typeset", "audience": audience,
        "topic": topic, "category": category,
        "slides": slides,
        "plug_screenshot": screenshot_path,
        "style_key": series.get("style_key") or "impact",
        "accent_hex": preset.get("accent"),
        "caption": texts.get("caption", ""), "first_comment": texts.get("first_comment", ""),
        # persisted back onto the Series row by the caller (round-robin state)
        "topic_bank": topic_bank, "used_topics": used_topics,
    }
    log(f"✅ Deck rendered — {len(pngs)} slides")
    return pngs, meta


def _generate_deck_ai_full(series, texts, n_content, base, api_key, mock=False, log=print,
                           topic=None, category=None, audience=None, topic_bank=None, used_topics=None):
    """Full-AI branch of generate_deck: every slide image is Gemini-rendered whole.
    Slides keep the same structured shape as the typeset path (pose fields empty)."""
    accent = series.get("accent_hex") or "#00C080"
    portrait_disk = _character_portrait_disk(series.get("character_id"))
    plug = series.get("plug") or {}
    screenshots = [sp for sp in (_screenshot_disk_path(p) for p in (plug.get("screenshots") or [])) if sp]
    screenshot_disk = random.choice(screenshots) if screenshots else None

    slides = [{"role": "hook", "layout": "statement", "text": texts["hook"], "bullets": [],
               "tip": "", "pose_hint": texts.get("hook_pose_hint", ""), "bullet_poses": False,
               "pose": {"key": None, "path": None}}]
    for spec in texts["slides"]:
        slides.append({"role": "content", "layout": spec.get("layout") or "statement",
                       "text": spec.get("text") or "",
                       "bullets": [{"label": b.get("label") or "", "text": b.get("text") or "",
                                    "pose_hint": b.get("pose_hint") or ""} for b in (spec.get("bullets") or [])],
                       "tip": spec.get("tip") or "", "pose_hint": spec.get("pose_hint") or "",
                       "bullet_poses": bool(spec.get("bullet_poses")),
                       "pose": {"key": None, "path": None}})
    slides.append({"role": "plug", "layout": "statement", "text": texts["plug_headline"], "bullets": [],
                   "tip": "", "pose_hint": "", "bullet_poses": False,
                   "cta": (plug.get("cta_text") or "").strip(), "pose": {"key": None, "path": None}})

    pngs = []
    for i, slide in enumerate(slides, start=1):
        out = os.path.join(CHARSHOW_DIR, f"{base}_slide{i:02d}.png")
        log(f"🎨 Slide {i}/{len(slides)} — full-AI render ({slide['role']}/{slide['layout']})…")
        _ai_render_slide(slide, accent, portrait_disk, out, api_key, mock=mock,
                         screenshot_disk=screenshot_disk, log=log)
        if not mock and not _qc_slide_text(out, api_key, log=log):
            log(f"🔁 QC flagged slide {i} (covered/garbled text) — regenerating once…")
            _ai_render_slide(slide, accent, portrait_disk, out, api_key, mock=mock,
                             screenshot_disk=screenshot_disk, log=log)
        pngs.append(out)

    meta = {
        "series_id": series.get("id"), "character_id": series.get("character_id"),
        "render_mode": "ai_full", "audience": audience,
        "topic": topic, "category": category,
        "slides": slides,
        "plug_screenshot": screenshot_disk,
        "style_key": series.get("style_key") or "impact", "accent_hex": accent,
        "caption": texts.get("caption", ""), "first_comment": texts.get("first_comment", ""),
        "topic_bank": topic_bank, "used_topics": used_topics,
    }
    log(f"✅ Deck rendered (full-AI) — {len(pngs)} slides")
    return pngs, meta


def _slide_content_key(slide):
    """The content that matters for an ai_full re-render decision (text-only edits)."""
    return json.dumps({"text": slide.get("text"), "tip": slide.get("tip"),
                       "bullets": [{"label": b.get("label"), "text": b.get("text")}
                                   for b in (slide.get("bullets") or [])]}, sort_keys=True)


def rerender_deck_ai_full(meta, new_slides, api_key, mock=False, out_dir=CHARSHOW_DIR, log=print):
    """Re-render an ai_full deck: only slides whose CONTENT changed get regenerated
    (each is a paid image call); unchanged slides keep their existing PNG. Needs the
    Gemini key unless mock."""
    if not mock and not api_key:
        raise ValueError("This deck is Full-AI rendered — the Gemini key is required to regenerate edited slides")
    old_slides = meta.get("slides") or []
    old_images = meta.get("old_images") or []
    accent = meta.get("accent_hex") or "#00C080"
    portrait_disk = _character_portrait_disk(meta.get("character_id"))
    screenshot_disk = meta.get("plug_screenshot")
    base = f"charshow_rr_{uuid.uuid4().hex[:12]}"
    os.makedirs(out_dir, exist_ok=True)

    pngs = []
    for i, slide in enumerate(new_slides, start=1):
        unchanged = (i <= len(old_slides) and i <= len(old_images)
                     and _slide_content_key(slide) == _slide_content_key(old_slides[i - 1]))
        old_disk = os.path.join("creations", os.path.basename(old_images[i - 1])) if i <= len(old_images) else None
        if unchanged and old_disk and os.path.exists(old_disk):
            pngs.append(old_disk)
            continue
        out = os.path.join(out_dir, f"{base}_slide{i:02d}.png")
        log(f"🎨 Slide {i}/{len(new_slides)} — full-AI regenerate…")
        _ai_render_slide(slide, accent, portrait_disk, out, api_key, mock=mock,
                         screenshot_disk=screenshot_disk, log=log)
        if not mock and not _qc_slide_text(out, api_key, log=log):
            log(f"🔁 QC flagged slide {i} — regenerating once…")
            _ai_render_slide(slide, accent, portrait_disk, out, api_key, mock=mock,
                             screenshot_disk=screenshot_disk, log=log)
        pngs.append(out)
    return pngs, new_slides


def rerender_deck(meta, new_slides=None, new_texts=None, out_dir=CHARSHOW_DIR, log=print):
    """Recomposite a deck from its kept meta (poses, screenshot, style) — no new AI or
    pose-gen calls, matches automations.rerender_slides' instant re-render pattern.
    Accepts either:
      - new_slides: the new structured format (list of slide dicts, as generate_deck
        produces) — used directly.
      - new_texts: the legacy pre-v2 format (list[str], one per meta['roles'] entry,
        with meta['poses_used'] giving each slide's pose) — for decks generated before
        structured slides existed. Each is rendered as a plain statement slide.
    Returns (png_paths, slides) — 'slides' is always the structured form (a legacy call
    is normalized on the way in), so the caller can persist it and the deck is on the
    new format from then on.
    """
    preset = dict(STYLE_PRESETS.get(meta.get("style_key") or "impact", STYLE_PRESETS["impact"]))
    preset["accent"] = meta.get("accent_hex") or preset.get("accent")
    base = f"charshow_rr_{uuid.uuid4().hex[:12]}"
    os.makedirs(out_dir, exist_ok=True)

    if new_slides is not None:
        slides = new_slides
    else:
        roles = meta.get("roles") or []
        poses_used = meta.get("poses_used") or []
        if new_texts is None or len(new_texts) != len(roles):
            expected = len(roles)
            got = len(new_texts) if new_texts is not None else 0
            raise ValueError(f"Expected {expected} slide texts, got {got}")
        slides = []
        for i, (role, text) in enumerate(zip(roles, new_texts)):
            entry = poses_used[i] if i < len(poses_used) else {}
            slides.append({"role": role, "layout": "statement", "text": text, "bullets": [],
                            "tip": "", "pose_hint": "", "bullet_poses": False,
                            "pose": entry if isinstance(entry, dict) else {}})

    pngs = []
    for i, slide in enumerate(slides, start=1):
        role = slide.get("role") or "content"
        layout = slide.get("layout") or "statement"
        pose_disk = _pose_disk_path((slide.get("pose") or {}).get("path"))
        out = os.path.join(out_dir, f"{base}_slide{i:02d}.png")
        if role == "hook":
            pngs.append(compose_hook_slide(slide.get("text") or "", pose_disk, out, preset, log=log))
        elif role == "plug":
            pngs.append(compose_plug_slide(slide.get("text") or "", pose_disk, meta.get("plug_screenshot"), out, preset,
                                           cta_text=slide.get("cta") or "", log=log))
        elif layout == "list":
            pngs.append(compose_list_slide(slide, out, preset, log=log))
        else:
            pngs.append(compose_content_slide(slide.get("text") or "", pose_disk, out, preset, log=log))
    return pngs, slides


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
