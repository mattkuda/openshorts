"""
Hook + Demo composer — the P1 format.

Renders a full-frame 9:16 hook card (reusing the hooks.py text renderer) and
stitches it BEFORE the app-demo footage via FFmpeg concat, with an optional CTA
end-card. "overlay" style instead overlays the hook on the first seconds.

Mock mode substitutes mocks/mock-ai-generation.mp4 for the demo so text-overlay
work can be verified without burning AI credits or uploads.
"""
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

from hooks import create_hook_image, add_hook_to_video, download_font_if_needed, FONT_PATH

W, H = 1080, 1920
CARD_SECONDS = 2.5
CTA_SECONDS = 2.0
MOCK_DEMO = os.path.join("mocks", "mock-ai-generation.mp4")

# Brand leaf green (#6DB364) — matches the dashboard token.
BRAND_GREEN = (109, 179, 100)
BRAND_GREEN_DEEP = (27, 58, 27)


def _run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def _first_frame(video_path, out_path):
    _run(['ffmpeg', '-y', '-i', video_path, '-vframes', '1',
          '-vf', f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}', out_path])
    return out_path


def render_full_card(text, out_path, bg_frame=None, bg_color=None, font_scale=1.15):
    """Full-frame 1080x1920 card: blurred/darkened demo frame (or solid color)
    behind the standard hook text box, centered."""
    if bg_frame and os.path.exists(bg_frame):
        bg = Image.open(bg_frame).convert('RGB').resize((W, H))
        bg = bg.filter(ImageFilter.GaussianBlur(18))
        bg = ImageEnhance.Brightness(bg).enhance(0.55)
    else:
        bg = Image.new('RGB', (W, H), bg_color or BRAND_GREEN_DEEP)

    box_path = out_path + ".box.png"
    try:
        _, box_w, box_h = create_hook_image(text, int(W * 0.9), box_path, font_scale=font_scale)
        box = Image.open(box_path).convert('RGBA')
        bg.paste(box, ((W - box_w) // 2, (H - box_h) // 2), box)
    finally:
        if os.path.exists(box_path):
            os.remove(box_path)

    bg.save(out_path)
    return out_path


def render_outline_text(text, out_path, width=W, font_scale=1.0):
    """ReelFarm-style hook text: bold white serif with a black outline on a
    transparent canvas (no box). Returns (path, w, h)."""
    download_font_if_needed()
    font_size = int(width * 0.055 * font_scale)
    stroke = max(4, font_size // 9)
    try:
        font = ImageFont.truetype(FONT_PATH, font_size)
    except Exception:
        font = ImageFont.load_default()

    max_text_width = int(width * 0.85)
    dummy = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    lines, line = [], []
    for word in text.split():
        trial = ' '.join(line + [word])
        if dummy.textbbox((0, 0), trial, font=font, stroke_width=stroke)[2] <= max_text_width:
            line.append(word)
        else:
            if line:
                lines.append(' '.join(line))
            line = [word]
    if line:
        lines.append(' '.join(line))

    line_gap = int(font_size * 0.28)
    heights = [dummy.textbbox((0, 0), l, font=font, stroke_width=stroke)[3] for l in lines]
    total_h = sum(heights) + line_gap * (len(lines) - 1) + stroke * 4
    img = Image.new('RGBA', (width, total_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = stroke * 2
    for l, h in zip(lines, heights):
        wpx = d.textbbox((0, 0), l, font=font, stroke_width=stroke)[2]
        d.text(((width - wpx) // 2, y), l, font=font, fill='white',
               stroke_width=stroke, stroke_fill='black')
        y += h + line_gap
    img.save(out_path)
    return out_path, width, total_h


def render_text_asset(text, text_style, out_path, font_scale=1.0):
    """Text block PNG in the chosen style: 'box' (white card) or 'outline' (ReelFarm)."""
    if text_style == "outline":
        return render_outline_text(text, out_path, font_scale=font_scale)
    return create_hook_image(text, int(W * 0.9), out_path, font_scale=font_scale)


def _text_y(position, box_h):
    if position == "top":
        return int(H * 0.16)
    if position == "bottom":
        return int(H * 0.72)
    return (H - box_h) // 2


def _overlay_text(video_path, text_png, y, out_path):
    _run(['ffmpeg', '-y', '-i', video_path, '-i', text_png,
          '-filter_complex', f"[0:v][1:v]overlay=(W-w)/2:{y},setsar=1",
          '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', out_path])
    return out_path


def _kenburns_segment(img_path, seconds, out_path):
    """Still image → gentle push-in video segment (silent audio for concat)."""
    frames = int(seconds * 30)
    _run(['ffmpeg', '-y', '-loop', '1', '-i', img_path,
          '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-t', str(seconds),
          '-vf', (f"scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},"
                  f"zoompan=z='min(zoom+0.0009,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                  f":d={frames}:s={W}x{H}:fps=30,format=yuv420p,setsar=1"),
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
          '-c:a', 'aac', '-b:a', '128k', '-shortest', out_path])
    return out_path


def _card_to_segment(img_path, seconds, out_path):
    """PNG → short video segment with silent audio (uniform codecs for concat)."""
    _run(['ffmpeg', '-y', '-loop', '1', '-i', img_path,
          '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-t', str(seconds),
          '-vf', f'scale={W}:{H},format=yuv420p,setsar=1',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
          '-c:a', 'aac', '-b:a', '128k', '-shortest', out_path])
    return out_path


def mix_background_music(video_path, music_path, out_path, music_volume=0.35):
    """Loop background music under the video's audio (ReelFarm's Sound feature)."""
    _run(['ffmpeg', '-y', '-i', video_path, '-stream_loop', '-1', '-i', music_path,
          '-filter_complex',
          f"[1:a]volume={music_volume}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]",
          '-map', '0:v', '-map', '[a]',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', out_path])
    return out_path


def _normalize_demo(video_path, out_path):
    """Any input → 1080x1920 h264/aac (center-crop fill), so concat is safe."""
    _run(['ffmpeg', '-y', '-i', video_path,
          '-vf', f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},format=yuv420p,setsar=1',
          '-r', '30',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', out_path])
    return out_path


def compose_hook_demo(demo_path, hook_text, output_path, style="preroll",
                      cta_text="", use_mock_demo=False,
                      avatar_image_path=None, avatar_video_path=None,
                      text_style="box", text_position="center",
                      sound_path=None, log=print):
    """Assemble the final clip. ReelFarm-style structure: hook segment (avatar
    image w/ push-in, avatar video, or card) → demo → optional CTA card.
    Returns output_path."""
    if use_mock_demo:
        demo_path = MOCK_DEMO
        log(f"🧪 Mock mode: using {MOCK_DEMO} as demo footage")
    if not os.path.exists(demo_path):
        raise FileNotFoundError(f"Demo footage not found: {demo_path}")

    workdir = os.path.dirname(output_path) or "."
    base = os.path.splitext(os.path.basename(output_path))[0]
    tmp = lambda name: os.path.join(workdir, f"tmp_{base}_{name}")
    temps = []

    try:
        log("🎞️ Normalizing demo footage to 1080x1920…")
        demo_norm = _normalize_demo(demo_path, tmp("demo.mp4")); temps.append(demo_norm)

        if style == "overlay":
            # Hook text overlaid on the demo itself.
            log("🅾️ Overlaying hook on demo…")
            text_png, _, box_h = render_text_asset(hook_text, text_style, tmp("text.png")); temps.append(text_png)
            hooked = _overlay_text(demo_norm, text_png, _text_y(text_position, box_h), tmp("hooked.mp4"))
            temps.append(hooked)
            segments = [hooked]
        elif avatar_video_path and os.path.exists(avatar_video_path):
            log("🧑‍🎤 Building avatar-video hook segment…")
            ava_norm = _normalize_demo(avatar_video_path, tmp("ava.mp4")); temps.append(ava_norm)
            trimmed = tmp("ava_trim.mp4")
            _run(['ffmpeg', '-y', '-i', ava_norm, '-t', '3.0', '-c', 'copy', trimmed]); temps.append(trimmed)
            text_png, _, box_h = render_text_asset(hook_text, text_style, tmp("text.png")); temps.append(text_png)
            hook_seg = _overlay_text(trimmed, text_png, _text_y(text_position, box_h), tmp("hookseg.mp4"))
            temps.append(hook_seg)
            segments = [hook_seg, demo_norm]
        elif avatar_image_path and os.path.exists(avatar_image_path):
            log("🧑‍🎤 Building avatar-image hook segment (push-in)…")
            kb = _kenburns_segment(avatar_image_path, CARD_SECONDS, tmp("kb.mp4")); temps.append(kb)
            text_png, _, box_h = render_text_asset(hook_text, text_style, tmp("text.png")); temps.append(text_png)
            hook_seg = _overlay_text(kb, text_png, _text_y(text_position, box_h), tmp("hookseg.mp4"))
            temps.append(hook_seg)
            segments = [hook_seg, demo_norm]
        else:
            log("🃏 Rendering pre-roll hook card…")
            frame = _first_frame(demo_norm, tmp("frame.png")); temps.append(frame)
            card_img = render_full_card(hook_text, tmp("card.png"), bg_frame=frame); temps.append(card_img)
            card_seg = _card_to_segment(card_img, CARD_SECONDS, tmp("card.mp4")); temps.append(card_seg)
            segments = [card_seg, demo_norm]

        if cta_text.strip():
            log("📣 Rendering CTA end-card…")
            cta_img = render_full_card(cta_text, tmp("cta.png"), bg_color=BRAND_GREEN, font_scale=1.0)
            temps.append(cta_img)
            cta_seg = _card_to_segment(cta_img, CTA_SECONDS, tmp("cta.mp4")); temps.append(cta_seg)
            segments.append(cta_seg)

        # Assemble (to a pre-mix temp when music is requested)
        assembled = tmp("assembled.mp4") if (sound_path and os.path.exists(sound_path)) else output_path
        if assembled != output_path:
            temps.append(assembled)
        if len(segments) == 1:
            _run(['ffmpeg', '-y', '-i', segments[0], '-c', 'copy', assembled])
        else:
            log(f"🔗 Concatenating {len(segments)} segments…")
            inputs = []
            for s in segments:
                inputs += ['-i', s]
            n = len(segments)
            filt = ''.join(f'[{i}:v][{i}:a]' for i in range(n)) + f'concat=n={n}:v=1:a=1[v][a]'
            _run(['ffmpeg', '-y', *inputs, '-filter_complex', filt,
                  '-map', '[v]', '-map', '[a]',
                  '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
                  '-c:a', 'aac', '-b:a', '128k', assembled])

        if assembled != output_path:
            log("🎵 Mixing background music…")
            mix_background_music(assembled, sound_path, output_path)

        log(f"✅ Hook+Demo composed → {output_path}")
        return output_path
    finally:
        for t in temps:
            if os.path.exists(t):
                os.remove(t)
