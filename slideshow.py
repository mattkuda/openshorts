"""
Slideshow renderer — P2 formats (listicle / before-after).

Renders 1080x1920 slides with PIL and exports BOTH a PNG set (TikTok photo
carousels get outsized reach) and an MP4 (IG Reels / YT Shorts). Text-first by
design: every slot stays editable in the dashboard and re-renders are cheap.
"""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont
from hooks import download_font_if_needed, FONT_PATH

W, H = 1080, 1920
SLIDE_SECONDS = 2.5

# Palette mirrors the dashboard tokens (light theme + brand leaf green #6DB364).
BG_LIGHT = (250, 250, 250)
BG_DARK = (20, 20, 20)
BG_GREEN = (109, 179, 100)
INK_DARK = (20, 20, 20)
INK_LIGHT = (250, 250, 250)
INK_GREEN_DEEP = (23, 46, 21)
MUTED_ON_LIGHT = (107, 107, 107)
MUTED_ON_DARK = (176, 176, 176)


def _font(size):
    download_font_if_needed()
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def _wrap(draw, text, font, max_width):
    lines = []
    for para in str(text).split("\n"):
        words, line = para.split(), []
        for word in words:
            trial = " ".join(line + [word])
            if draw.textbbox((0, 0), trial, font=font)[2] <= max_width:
                line.append(word)
            else:
                if line:
                    lines.append(" ".join(line))
                line = [word]
        lines.append(" ".join(line) if line else "")
    return lines


def _draw_center(draw, text, font, fill, center_y, max_width=int(W * 0.82), line_gap=18):
    lines = _wrap(draw, text, font, max_width)
    heights = [draw.textbbox((0, 0), l or " ", font=font)[3] for l in lines]
    total = sum(heights) + line_gap * (len(lines) - 1)
    y = center_y - total // 2
    for line, h in zip(lines, heights):
        w = draw.textbbox((0, 0), line, font=font)[2]
        draw.text(((W - w) // 2, y), line, font=font, fill=fill)
        y += h + line_gap
    return total


def _paste_avatar_circle(img, avatar_path, center_x, center_y, diameter):
    """Paste a circular-cropped character image onto a slide."""
    try:
        avatar = Image.open(avatar_path).convert("RGB")
    except Exception:
        return
    side = min(avatar.size)
    avatar = avatar.crop(((avatar.width - side) // 2, (avatar.height - side) // 2,
                          (avatar.width + side) // 2, (avatar.height + side) // 2))
    avatar = avatar.resize((diameter, diameter))
    mask = Image.new("L", (diameter, diameter), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, diameter, diameter], fill=255)
    img.paste(avatar, (center_x - diameter // 2, center_y - diameter // 2), mask)


def _slide(bg, painter, out_path):
    img = Image.new("RGB", (W, H), bg)
    painter(ImageDraw.Draw(img))
    img.save(out_path)
    return out_path


def _title_slide(title, out_path, avatar_path=None):
    img = Image.new("RGB", (W, H), BG_LIGHT)
    d = ImageDraw.Draw(img)
    if avatar_path:
        _paste_avatar_circle(img, avatar_path, W // 2, int(H * 0.26), 420)
        _draw_center(d, title, _font(96), INK_DARK, int(H * 0.52))
    else:
        _draw_center(d, title, _font(96), INK_DARK, int(H * 0.45))
    _draw_center(d, "( swipe )", _font(44), MUTED_ON_LIGHT, int(H * 0.78))
    img.save(out_path)
    return out_path


def _item_slide(index, name, note, out_path, dark=False):
    bg, ink, muted = (BG_DARK, INK_LIGHT, MUTED_ON_DARK) if dark else (BG_LIGHT, INK_DARK, MUTED_ON_LIGHT)

    def paint(d):
        d.text((int(W * 0.09), int(H * 0.16)), f"{index}", font=_font(200), fill=BG_GREEN)
        _draw_center(d, name, _font(104), ink, int(H * 0.46))
        if note:
            _draw_center(d, note, _font(56), muted, int(H * 0.60))
    return _slide(bg, paint, out_path)


def _payoff_slide(index, name, note, out_path):
    """The founder's product — always the green slide."""
    def paint(d):
        d.text((int(W * 0.09), int(H * 0.16)), f"{index}", font=_font(200), fill=INK_GREEN_DEEP)
        _draw_center(d, f"{name} ⭐", _font(108), INK_GREEN_DEEP, int(H * 0.44))
        if note:
            _draw_center(d, note, _font(58), INK_GREEN_DEEP, int(H * 0.59))
    return _slide(BG_GREEN, paint, out_path)


def _panel_slide(label, text, out_path, dark=False):
    bg, ink = (BG_DARK, INK_LIGHT) if dark else (BG_LIGHT, INK_DARK)

    def paint(d):
        badge_font = _font(52)
        bw = d.textbbox((0, 0), label, font=badge_font)[2]
        bx, by = (W - bw - 88) // 2, int(H * 0.22)
        d.rounded_rectangle([bx, by, bx + bw + 88, by + 116], radius=58, fill=BG_GREEN)
        d.text((bx + 44, by + 26), label, font=badge_font, fill=INK_GREEN_DEEP)
        _draw_center(d, text, _font(84), ink, int(H * 0.52))
    return _slide(bg, paint, out_path)


def _cta_slide(cta_text, out_path, avatar_path=None):
    img = Image.new("RGB", (W, H), BG_GREEN)
    d = ImageDraw.Draw(img)
    if avatar_path:
        _paste_avatar_circle(img, avatar_path, W // 2, int(H * 0.30), 380)
        _draw_center(d, cta_text, _font(92), INK_GREEN_DEEP, int(H * 0.55))
    else:
        _draw_center(d, cta_text, _font(92), INK_GREEN_DEEP, int(H * 0.48))
    img.save(out_path)
    return out_path


def render_slideshow(template_key, slots, out_dir, base_name, character_image=None, log=print):
    """Render slides for a filled template. Returns (png_paths, mp4_path)."""
    os.makedirs(out_dir, exist_ok=True)
    pngs = []
    p = lambda i: os.path.join(out_dir, f"{base_name}_slide{i:02d}.png")

    if template_key == "listicle":
        log("🖼️ Rendering listicle slides…")
        pngs.append(_title_slide(slots.get("title", ""), p(1), avatar_path=character_image))
        items = slots.get("items", [])
        for i, item in enumerate(items):
            idx, last = i + 1, i == len(items) - 1
            name, note = item.get("name", ""), item.get("note", "")
            if last:
                pngs.append(_payoff_slide(idx, name, note, p(idx + 1)))
            else:
                pngs.append(_item_slide(idx, name, note, p(idx + 1), dark=(i % 2 == 1)))
    elif template_key == "before_after":
        log("🖼️ Rendering before/after slides…")
        pngs.append(_title_slide(slots.get("title", ""), p(1), avatar_path=character_image))
        pngs.append(_panel_slide("BEFORE", slots.get("before_text", ""), p(2), dark=True))
        pngs.append(_panel_slide("AFTER", slots.get("after_text", ""), p(3)))
    else:
        raise ValueError(f"Not a slideshow template: {template_key}")

    if (slots.get("cta_text") or "").strip():
        pngs.append(_cta_slide(slots["cta_text"], p(len(pngs) + 1), avatar_path=character_image))

    mp4_path = export_mp4(pngs, out_dir, base_name, log=log)
    log(f"✅ Slideshow rendered → {mp4_path}")
    return pngs, mp4_path


def export_mp4(pngs, out_dir, base_name, log=print):
    """PNG slide set → MP4 via the ffmpeg concat demuxer. Returns the mp4 path."""
    log(f"🎬 Exporting MP4 ({len(pngs)} slides × {SLIDE_SECONDS}s)…")
    mp4_path = os.path.join(out_dir, f"{base_name}.mp4")
    list_path = os.path.join(out_dir, f"{base_name}_concat.txt")
    with open(list_path, "w") as f:
        for png in pngs:
            f.write(f"file '{os.path.abspath(png)}'\nduration {SLIDE_SECONDS}\n")
        f.write(f"file '{os.path.abspath(pngs[-1])}'\n")  # concat demuxer needs the last frame repeated
    try:
        subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', list_path,
                        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                        '-shortest', '-vf', f'scale={W}:{H},format=yuv420p', '-r', '30',
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
                        '-c:a', 'aac', '-b:a', '128k', mp4_path],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    finally:
        if os.path.exists(list_path):
            os.remove(list_path)
    return mp4_path
