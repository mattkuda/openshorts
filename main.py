import time
import cv2
import scenedetect
import subprocess
import argparse
import re
import sys
from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector
from ultralytics import YOLO
import torch
import os
import numpy as np
from tqdm import tqdm
import yt_dlp
import mediapipe as mp
# import whisper (replaced by faster_whisper inside function)
from google import genai
from dotenv import load_dotenv
import json

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module='google.protobuf')

# Load environment variables
load_dotenv()

# --- Constants ---
ASPECT_RATIO = 9 / 16

GEMINI_PROMPT_TEMPLATE = """
You are a senior short-form video editor. Read the ENTIRE transcript and word-level timestamps to choose the 3–15 MOST VIRAL moments for TikTok/IG Reels/YouTube Shorts. Each clip must be between 15 and 60 seconds long.

⚠️ FFMPEG TIME CONTRACT — STRICT REQUIREMENTS:
- Return timestamps in ABSOLUTE SECONDS from the start of the video (usable in: ffmpeg -ss <start> -to <end> -i <input> ...).
- Only NUMBERS with decimal point, up to 3 decimals (examples: 0, 1.250, 17.350).
- Ensure 0 ≤ start < end ≤ VIDEO_DURATION_SECONDS.
- Each clip between 15 and 60 s (inclusive).
- Prefer starting 0.2–0.4 s BEFORE the hook and ending 0.2–0.4 s AFTER the payoff.
- Use silence moments for natural cuts; never cut in the middle of a word or phrase.
- STRICTLY FORBIDDEN to use time formats other than absolute seconds.

VIDEO_DURATION_SECONDS: {video_duration}

TRANSCRIPT_TEXT (raw):
{transcript_text}

WORDS_JSON (array of {{w, s, e}} where s/e are seconds):
{words_json}

STRICT EXCLUSIONS:
- No generic intros/outros or purely sponsorship segments unless they contain the hook.
- No clips < 15 s or > 60 s.

OUTPUT — RETURN ONLY VALID JSON (no markdown, no comments). Order clips by predicted performance (best to worst). In the descriptions, ALWAYS include a CTA like "Follow me and comment X and I'll send you the workflow" (especially if discussing an n8n workflow):
{{
  "shorts": [
    {{
      "start": <number in seconds, e.g., 12.340>,
      "end": <number in seconds, e.g., 37.900>,
      "video_description_for_tiktok": "<description for TikTok oriented to get views>",
      "video_description_for_instagram": "<description for Instagram oriented to get views>",
      "video_title_for_youtube_short": "<title for YouTube Short oriented to get views 100 chars max>",
      "viral_hook_text": "<SHORT punchy text overlay (max 10 words). MUST BE IN THE SAME LANGUAGE AS THE VIDEO TRANSCRIPT. Examples: 'POV: You realized...', 'Did you know?', 'Stop doing this!'>"
    }}
  ]
}}
"""

SUMMARY_PROMPT_TEMPLATE = """
You are a senior short-form video editor. Read the ENTIRE transcript and word-level timestamps and choose 4–8 short segments that, when concatenated in chronological order, form a ~{target_duration}-second SUMMARY reel of the video covering its major beats.

⚠️ FFMPEG TIME CONTRACT — STRICT REQUIREMENTS:
- Return timestamps in ABSOLUTE SECONDS from the start of the source video.
- Only NUMBERS with decimal point, up to 3 decimals (e.g. 0, 1.250, 17.350).
- Ensure 0 ≤ start < end ≤ VIDEO_DURATION_SECONDS.
- Each segment between 3 and 10 seconds long.
- Sum of all segment durations must be between {min_total} and {max_total} seconds.
- ORDER segments chronologically by start time, ascending.
- Use silence/breath moments for natural cuts; never cut in the middle of a word.
- STRICTLY FORBIDDEN to use time formats other than absolute seconds.

GOALS:
- The concatenated reel must read as a coherent ~{target_duration}-second summary, not a random montage.
- Cover the MAJOR beats: opening hook → key points → conclusion / takeaway.
- Prefer punchy, self-contained sentences over half-thoughts.
- Skip filler, throat-clearing ("um", "so basically"), sponsor breaks, generic intros/outros.

VIDEO_DURATION_SECONDS: {video_duration}

TRANSCRIPT_TEXT (raw):
{transcript_text}

WORDS_JSON (array of {{w, s, e}} where s/e are seconds):
{words_json}

OUTPUT — RETURN ONLY VALID JSON (no markdown, no comments):
{{
  "segments": [
    {{
      "start": <number in seconds>,
      "end": <number in seconds>,
      "reason": "<one short phrase: why this segment is in the summary>"
    }}
  ],
  "video_title_for_youtube_short": "<title for the summary reel, 100 chars max>",
  "video_description_for_tiktok": "<TikTok description oriented to get views>",
  "video_description_for_instagram": "<Instagram description oriented to get views>",
  "viral_hook_text": "<SHORT punchy text overlay (max 10 words). MUST BE IN THE SAME LANGUAGE AS THE TRANSCRIPT.>"
}}
"""

# Load the YOLO model once (Keep for backup or scene analysis if needed)
model = YOLO('yolov8n.pt')

# --- MediaPipe Setup ---
# Use standard Face Detection (BlazeFace) for speed
mp_face_detection = mp.solutions.face_detection
face_detection = mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)

class SmoothedCameraman:
    """
    Handles smooth camera movement.
    Simplified Logic: "Heavy Tripod"
    Only moves if the subject leaves the center safe zone.
    Moves slowly and linearly.
    """
    def __init__(self, output_width, output_height, video_width, video_height):
        self.output_width = output_width
        self.output_height = output_height
        self.video_width = video_width
        self.video_height = video_height
        
        # Initial State
        self.current_center_x = video_width / 2
        self.target_center_x = video_width / 2
        
        # Calculate crop dimensions once
        self.crop_height = video_height
        self.crop_width = int(self.crop_height * ASPECT_RATIO)
        if self.crop_width > video_width:
             self.crop_width = video_width
             self.crop_height = int(self.crop_width / ASPECT_RATIO)
             
        # Safe Zone: 20% of the video width
        # As long as the target is within this zone relative to current center, DO NOT MOVE.
        self.safe_zone_radius = self.crop_width * 0.25

    def update_target(self, face_box):
        """
        Updates the target center based on detected face/person.
        """
        if face_box:
            x, y, w, h = face_box
            self.target_center_x = x + w / 2
    
    def get_crop_box(self, force_snap=False):
        """
        Returns the (x1, y1, x2, y2) for the current frame.
        """
        if force_snap:
            self.current_center_x = self.target_center_x
        else:
            diff = self.target_center_x - self.current_center_x
            
            # SIMPLIFIED LOGIC:
            # 1. Is the target outside the safe zone?
            if abs(diff) > self.safe_zone_radius:
                # 2. If yes, move towards it slowly (Linear Speed)
                # Determine direction
                direction = 1 if diff > 0 else -1
                
                # Speed: 2 pixels per frame (Slow pan)
                # If the distance is HUGE (scene change or fast movement), speed up slightly
                if abs(diff) > self.crop_width * 0.5:
                    speed = 15.0 # Fast re-frame
                else:
                    speed = 3.0  # Slow, steady pan
                
                self.current_center_x += direction * speed
                
                # Check if we overshot (prevent oscillation)
                new_diff = self.target_center_x - self.current_center_x
                if (direction == 1 and new_diff < 0) or (direction == -1 and new_diff > 0):
                    self.current_center_x = self.target_center_x
            
            # If inside safe zone, DO NOTHING (Stationary Camera)
                
        # Clamp center
        half_crop = self.crop_width / 2
        
        if self.current_center_x - half_crop < 0:
            self.current_center_x = half_crop
        if self.current_center_x + half_crop > self.video_width:
            self.current_center_x = self.video_width - half_crop
            
        x1 = int(self.current_center_x - half_crop)
        x2 = int(self.current_center_x + half_crop)
        
        x1 = max(0, x1)
        x2 = min(self.video_width, x2)
        
        y1 = 0
        y2 = self.video_height
        
        return x1, y1, x2, y2

class SpeakerTracker:
    """
    Tracks speakers over time to prevent rapid switching and handle temporary obstructions.
    """
    def __init__(self, stabilization_frames=15, cooldown_frames=30):
        self.active_speaker_id = None
        self.speaker_scores = {}  # {id: score}
        self.last_seen = {}       # {id: frame_number}
        self.locked_counter = 0   # How long we've been locked on current speaker
        
        # Hyperparameters
        self.stabilization_threshold = stabilization_frames # Frames needed to confirm a new speaker
        self.switch_cooldown = cooldown_frames              # Minimum frames before switching again
        self.last_switch_frame = -1000
        
        # ID tracking
        self.next_id = 0
        self.known_faces = [] # [{'id': 0, 'center': x, 'last_frame': 123}]

    def get_target(self, face_candidates, frame_number, width):
        """
        Decides which face to focus on.
        face_candidates: list of {'box': [x,y,w,h], 'score': float}
        """
        current_candidates = []
        
        # 1. Match faces to known IDs (simple distance tracking)
        for face in face_candidates:
            x, y, w, h = face['box']
            center_x = x + w / 2
            
            best_match_id = -1
            min_dist = width * 0.15 # Reduced matching radius to avoid jumping in groups
            
            # Try to match with known faces seen recently
            for kf in self.known_faces:
                if frame_number - kf['last_frame'] > 30: # Forgot faces older than 1s (was 2s)
                    continue
                    
                dist = abs(center_x - kf['center'])
                if dist < min_dist:
                    min_dist = dist
                    best_match_id = kf['id']
            
            # If no match, assign new ID
            if best_match_id == -1:
                best_match_id = self.next_id
                self.next_id += 1
            
            # Update known face
            self.known_faces = [kf for kf in self.known_faces if kf['id'] != best_match_id]
            self.known_faces.append({'id': best_match_id, 'center': center_x, 'last_frame': frame_number})
            
            current_candidates.append({
                'id': best_match_id,
                'box': face['box'],
                'score': face['score']
            })

        # 2. Update Scores with decay
        for pid in list(self.speaker_scores.keys()):
             self.speaker_scores[pid] *= 0.85 # Faster decay (was 0.9)
             if self.speaker_scores[pid] < 0.1:
                 del self.speaker_scores[pid]

        # Add new scores
        for cand in current_candidates:
            pid = cand['id']
            # Score is purely based on size (proximity) now that we don't have mouth
            raw_score = cand['score'] / (width * width * 0.05)
            self.speaker_scores[pid] = self.speaker_scores.get(pid, 0) + raw_score

        # 3. Determine Best Speaker
        if not current_candidates:
            # If no one found, maintain last active speaker if cooldown allows
            # to avoid black screen or jump to 0,0
            return None 
            
        best_candidate = None
        max_score = -1
        
        for cand in current_candidates:
            pid = cand['id']
            total_score = self.speaker_scores.get(pid, 0)
            
            # Hysteresis: HUGE Bonus for current active speaker
            if pid == self.active_speaker_id:
                total_score *= 3.0 # Sticky factor
                
            if total_score > max_score:
                max_score = total_score
                best_candidate = cand

        # 4. Decide Switch
        if best_candidate:
            target_id = best_candidate['id']
            
            if target_id == self.active_speaker_id:
                self.locked_counter += 1
                return best_candidate['box']
            
            # New person
            if frame_number - self.last_switch_frame < self.switch_cooldown:
                old_cand = next((c for c in current_candidates if c['id'] == self.active_speaker_id), None)
                if old_cand:
                    return old_cand['box']
            
            self.active_speaker_id = target_id
            self.last_switch_frame = frame_number
            self.locked_counter = 0
            return best_candidate['box']
            
        return None

def detect_face_candidates(frame):
    """
    Returns list of all detected faces using lightweight FaceDetection.
    """
    height, width, _ = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_detection.process(rgb_frame)
    
    candidates = []
    
    if not results.detections:
        return []
        
    for detection in results.detections:
        bboxC = detection.location_data.relative_bounding_box
        x = int(bboxC.xmin * width)
        y = int(bboxC.ymin * height)
        w = int(bboxC.width * width)
        h = int(bboxC.height * height)
        
        candidates.append({
            'box': [x, y, w, h],
            'score': w * h # Area as score
        })
            
    return candidates

def detect_person_yolo(frame):
    """
    Fallback: Detect largest person using YOLO when face detection fails.
    Returns [x, y, w, h] of the person's 'upper body' approximation.
    """
    # Use the globally loaded model
    results = model(frame, verbose=False, classes=[0]) # class 0 is person
    
    if not results:
        return None
        
    best_box = None
    max_area = 0
    
    for result in results:
        boxes = result.boxes
        for box in boxes:
            x1, y1, x2, y2 = [int(i) for i in box.xyxy[0]]
            w = x2 - x1
            h = y2 - y1
            area = w * h
            
            if area > max_area:
                max_area = area
                # Focus on the top 40% of the person (head/chest) for framing
                # This approximates where the face is if we can't detect it directly
                face_h = int(h * 0.4)
                best_box = [x1, y1, w, face_h]
                
    return best_box

def _letterbox_fit(src, target_w, target_h):
    """Scale src to fit target_w x target_h, letterbox-padding with black."""
    src_h, src_w = src.shape[:2]
    if src_w <= 0 or src_h <= 0:
        return np.zeros((target_h, target_w, 3), dtype=np.uint8)

    src_aspect = src_w / src_h
    tgt_aspect = target_w / target_h

    if src_aspect > tgt_aspect:
        new_w = target_w
        new_h = max(2, int(target_w / src_aspect))
    else:
        new_h = target_h
        new_w = max(2, int(target_h * src_aspect))

    if new_w % 2: new_w -= 1
    if new_h % 2: new_h -= 1
    new_w = max(2, new_w)
    new_h = max(2, new_h)

    resized = cv2.resize(src, (new_w, new_h), interpolation=cv2.INTER_AREA)

    canvas = np.zeros((target_h, target_w, 3), dtype=resized.dtype)
    pad_x = (target_w - new_w) // 2
    pad_y = (target_h - new_h) // 2
    canvas[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized
    return canvas


def create_streamer_frame(frame, output_width, output_height,
                          facecam_corner='tr',
                          facecam_w_ratio=0.25, facecam_h_ratio=0.30):
    """
    Two-tile vertical layout for streamer / face-cam-overlay content.

    Top half  : cropped face-cam region from a configurable source corner, scaled up.
    Bottom half: the full source frame, letterbox-fit (full game/screen visible).

    facecam_corner: 'tl' | 'tr' (default) | 'bl' | 'br'
    facecam_w_ratio/h_ratio: face-cam window size as fraction of source dimensions.
    """
    src_h, src_w = frame.shape[:2]
    fc_w = max(2, int(src_w * facecam_w_ratio))
    fc_h = max(2, int(src_h * facecam_h_ratio))

    if facecam_corner == 'tl':
        fc_x, fc_y = 0, 0
    elif facecam_corner == 'bl':
        fc_x, fc_y = 0, src_h - fc_h
    elif facecam_corner == 'br':
        fc_x, fc_y = src_w - fc_w, src_h - fc_h
    else:  # 'tr' default
        fc_x, fc_y = src_w - fc_w, 0

    fc_x = max(0, min(src_w - 2, fc_x))
    fc_y = max(0, min(src_h - 2, fc_y))
    facecam = frame[fc_y:fc_y + fc_h, fc_x:fc_x + fc_w]

    tile_h = output_height // 2
    top_tile = _letterbox_fit(facecam, output_width, tile_h)
    bottom_tile = _letterbox_fit(frame, output_width, output_height - tile_h)

    output = np.vstack([top_tile, bottom_tile])

    # Defensive: ensure exact target shape
    if output.shape[0] != output_height or output.shape[1] != output_width:
        canvas = np.zeros((output_height, output_width, 3), dtype=output.dtype)
        h = min(output.shape[0], output_height)
        w = min(output.shape[1], output_width)
        canvas[:h, :w] = output[:h, :w]
        output = canvas
    return output


def create_general_frame(frame, output_width, output_height):
    """
    Creates a 'General Shot' frame: 
    - Background: Blurred zoom of original
    - Foreground: Original video scaled to fit width, centered vertically.
    """
    orig_h, orig_w = frame.shape[:2]
    
    # 1. Background (Fill Height)
    # Crop center to aspect ratio
    bg_scale = output_height / orig_h
    bg_w = int(orig_w * bg_scale)
    bg_resized = cv2.resize(frame, (bg_w, output_height))
    
    # Crop center of background
    start_x = (bg_w - output_width) // 2
    if start_x < 0: start_x = 0
    background = bg_resized[:, start_x:start_x+output_width]
    if background.shape[1] != output_width:
        background = cv2.resize(background, (output_width, output_height))
        
    # Blur background
    background = cv2.GaussianBlur(background, (51, 51), 0)
    
    # 2. Foreground (Fit Width)
    scale = output_width / orig_w
    fg_h = int(orig_h * scale)
    foreground = cv2.resize(frame, (output_width, fg_h))
    
    # 3. Overlay
    y_offset = (output_height - fg_h) // 2
    
    # Clone background to avoid modifying it
    final_frame = background.copy()
    final_frame[y_offset:y_offset+fg_h, :] = foreground
    
    return final_frame

def analyze_scenes_strategy(video_path, scenes):
    """
    Analyzes each scene to determine if it should be TRACK (Single person) or GENERAL (Group/Wide).
    Returns list of strategies corresponding to scenes.
    """
    cap = cv2.VideoCapture(video_path)
    strategies = []
    
    if not cap.isOpened():
        return ['TRACK'] * len(scenes)
        
    for start, end in tqdm(scenes, desc="   Analyzing Scenes"):
        # Sample 3 frames (start, middle, end)
        frames_to_check = [
            start.get_frames() + 5,
            int((start.get_frames() + end.get_frames()) / 2),
            end.get_frames() - 5
        ]
        
        face_counts = []
        for f_idx in frames_to_check:
            cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
            ret, frame = cap.read()
            if not ret: continue
            
            # Detect faces
            candidates = detect_face_candidates(frame)
            face_counts.append(len(candidates))
            
        # Decision Logic
        if not face_counts:
            avg_faces = 0
        else:
            avg_faces = sum(face_counts) / len(face_counts)
            
        # Strategy:
        # 0 faces -> GENERAL (Landscape/B-roll)
        # 1 face -> TRACK
        # > 1.2 faces -> GENERAL (Group)
        
        if avg_faces > 1.2 or avg_faces < 0.5:
            strategies.append('GENERAL')
        else:
            strategies.append('TRACK')
            
    cap.release()
    return strategies

def detect_scenes(video_path):
    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector())
    scene_manager.detect_scenes(video=video)
    scene_list = scene_manager.get_scene_list()
    fps = video.frame_rate
    return scene_list, fps

def get_video_resolution(video_path):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise IOError(f"Could not open video file {video_path}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return width, height


def sanitize_filename(filename):
    """Remove invalid characters from filename."""
    filename = re.sub(r'[<>:"/\\|?*#]', '', filename)
    filename = filename.replace(' ', '_')
    return filename[:100]


def download_youtube_video(url, output_dir="."):
    """
    Downloads a YouTube video using yt-dlp.
    Returns the path to the downloaded video and the video title.
    """
    print(f"🔍 Debug: yt-dlp version: {yt_dlp.version.__version__}")
    print("📥 Downloading video from YouTube...")
    step_start_time = time.time()

    cookies_path = '/app/cookies.txt'
    cookies_env = os.environ.get("YOUTUBE_COOKIES")
    if cookies_env:
        print("🍪 Found YOUTUBE_COOKIES env var, creating cookies file inside container...")
        try:
            with open(cookies_path, 'w') as f:
                f.write(cookies_env)
            if os.path.exists(cookies_path):
                 print(f"   Debug: Cookies file created. Size: {os.path.getsize(cookies_path)} bytes")
                 with open(cookies_path, 'r') as f:
                     content = f.read(100)
                     print(f"   Debug: First 100 chars of cookie file: {content}")
        except Exception as e:
            print(f"⚠️ Failed to write cookies file: {e}")
            cookies_path = None
    else:
        cookies_path = None
        print("⚠️ YOUTUBE_COOKIES env var not found.")
    
    # Common yt-dlp options to work around YouTube bot detection.
    # extractor_args tries multiple player clients in order; tv_embed / android
    # avoid the OAuth/PO-token checks that block server IPs.
    _COMMON_YDL_OPTS = {
        'quiet': False,
        'verbose': True,
        'no_warnings': False,
        'cookiefile': cookies_path if cookies_path else None,
        'socket_timeout': 30,
        'retries': 10,
        'fragment_retries': 10,
        'nocheckcertificate': True,
        'cachedir': False,
        'extractor_args': {
            'youtube': {
                'player_client': ['tv_embed', 'android', 'mweb', 'web'],
                'player_skip': ['webpage', 'configs'],
            }
        },
        'http_headers': {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
        },
    }

    with yt_dlp.YoutubeDL(_COMMON_YDL_OPTS) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            video_title = info.get('title', 'youtube_video')
            sanitized_title = sanitize_filename(video_title)
        except Exception as e:
            # Force print to stderr/stdout immediately so it's captured before crash
            import sys
            import traceback
            
            # Print minimal error first to ensure something gets out
            print("🚨 YOUTUBE DOWNLOAD ERROR 🚨", file=sys.stderr)
            
            error_msg = f"""
            
❌ ================================================================= ❌
❌ FATAL ERROR: YOUTUBE DOWNLOAD FAILED
❌ ================================================================= ❌
            
REASON: YouTube has blocked the download request (Error 429/Unavailable).
        This is likely a temporary IP ban on this server.

👇 SOLUTION FOR USER 👇
---------------------------------------------------------------------
1. Download the video manually to your computer.
2. Use the 'Upload Video' tab in this app to process it.
---------------------------------------------------------------------

Technical Details: {str(e)}
            """
            # Print to both streams to ensure capture
            print(error_msg, file=sys.stdout)
            print(error_msg, file=sys.stderr)
            
            # Force flush
            sys.stdout.flush()
            sys.stderr.flush()
            
            # Wait a split second to allow buffer to drain before raising
            time.sleep(0.5)
            
            raise e
    
    output_template = os.path.join(output_dir, f'{sanitized_title}.%(ext)s')
    expected_file = os.path.join(output_dir, f'{sanitized_title}.mp4')
    if os.path.exists(expected_file):
        os.remove(expected_file)
        print(f"🗑️  Removed existing file to re-download with H.264 codec")
    
    ydl_opts = {
        **_COMMON_YDL_OPTS,
        'format': 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1]+bestaudio/best[ext=mp4]/best',
        'outtmpl': output_template,
        'merge_output_format': 'mp4',
        'overwrites': True,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    
    downloaded_file = os.path.join(output_dir, f'{sanitized_title}.mp4')
    
    if not os.path.exists(downloaded_file):
        for f in os.listdir(output_dir):
            if f.startswith(sanitized_title) and f.endswith('.mp4'):
                downloaded_file = os.path.join(output_dir, f)
                break
    
    step_end_time = time.time()
    print(f"✅ Video downloaded in {step_end_time - step_start_time:.2f}s: {downloaded_file}")
    
    return downloaded_file, sanitized_title

def process_video_to_vertical(input_video, final_output_video,
                              reframe_mode='auto', facecam_corner='tr'):
    """
    Core logic to convert horizontal video to vertical.

    reframe_mode:
      'auto'     - per-scene TRACK (face follow) or GENERAL (blurred bg) — default.
      'streamer' - top tile = face-cam corner, bottom tile = full frame letterboxed.
                   Skips per-frame detection entirely.
    facecam_corner: 'tl' | 'tr' | 'bl' | 'br' — used only when reframe_mode='streamer'.
    """
    script_start_time = time.time()
    
    # Define temporary file paths based on the output name
    base_name = os.path.splitext(final_output_video)[0]
    temp_video_output = f"{base_name}_temp_video.mp4"
    temp_audio_output = f"{base_name}_temp_audio.aac"
    
    # Clean up previous temp files if they exist
    if os.path.exists(temp_video_output): os.remove(temp_video_output)
    if os.path.exists(temp_audio_output): os.remove(temp_audio_output)
    if os.path.exists(final_output_video): os.remove(final_output_video)

    print(f"🎬 Processing clip: {input_video}")
    if reframe_mode == 'streamer':
        print(f"   ▶ Streamer split-screen mode (face cam: {facecam_corner})")
        # Get FPS without scene detection — single uniform strategy.
        cap_meta = cv2.VideoCapture(input_video)
        fps = cap_meta.get(cv2.CAP_PROP_FPS) or 30.0
        cap_meta.release()
        scenes = []  # unused in streamer branch below
        scene_strategies = []
    else:
        print("   Step 1: Detecting scenes...")
        scenes, fps = detect_scenes(input_video)

        if not scenes:
            print("   ❌ No scenes were detected. Using full video as one scene.")
            # If scene detection fails or finds nothing, treat whole video as one scene
            cap = cv2.VideoCapture(input_video)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            cap.release()
            from scenedetect import FrameTimecode
            scenes = [(FrameTimecode(0, fps), FrameTimecode(total_frames, fps))]

        print(f"   ✅ Found {len(scenes)} scenes.")

    print("\n   🧠 Step 2: Preparing Active Tracking...")
    original_width, original_height = get_video_resolution(input_video)

    OUTPUT_HEIGHT = original_height
    OUTPUT_WIDTH = int(OUTPUT_HEIGHT * ASPECT_RATIO)
    if OUTPUT_WIDTH % 2 != 0:
        OUTPUT_WIDTH += 1

    # Initialize Cameraman (only used in 'auto' mode)
    cameraman = SmoothedCameraman(OUTPUT_WIDTH, OUTPUT_HEIGHT, original_width, original_height)

    if reframe_mode != 'streamer':
        # --- New Strategy: Per-Scene Analysis ---
        print("\n   🤖 Step 3: Analyzing Scenes for Strategy (Single vs Group)...")
        scene_strategies = analyze_scenes_strategy(input_video, scenes)
        # scene_strategies is a list of 'TRACK' or 'General' corresponding to scenes
    
    print("\n   ✂️ Step 4: Processing video frames...")
    
    command = [
        'ffmpeg', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
        '-s', f'{OUTPUT_WIDTH}x{OUTPUT_HEIGHT}', '-pix_fmt', 'bgr24',
        '-r', str(fps), '-i', '-', '-c:v', 'libx264',
        '-preset', 'fast', '-crf', '23', '-an', temp_video_output
    ]

    ffmpeg_process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    cap = cv2.VideoCapture(input_video)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    frame_number = 0
    current_scene_index = 0
    
    # Pre-calculate scene boundaries
    scene_boundaries = []
    for s_start, s_end in scenes:
        scene_boundaries.append((s_start.get_frames(), s_end.get_frames()))

    # Global tracker for single-person shots
    speaker_tracker = SpeakerTracker(cooldown_frames=30)

    with tqdm(total=total_frames, desc="   Processing", file=sys.stdout) as pbar:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if reframe_mode == 'streamer':
                # Skip scene/strategy logic — uniform split-screen composition.
                output_frame = create_streamer_frame(
                    frame, OUTPUT_WIDTH, OUTPUT_HEIGHT, facecam_corner=facecam_corner
                )
                ffmpeg_process.stdin.write(output_frame.tobytes())
                frame_number += 1
                pbar.update(1)
                continue

            # Update Scene Index
            if current_scene_index < len(scene_boundaries):
                start_f, end_f = scene_boundaries[current_scene_index]
                if frame_number >= end_f and current_scene_index < len(scene_boundaries) - 1:
                    current_scene_index += 1

            # Determine Strategy for current frame based on scene
            current_strategy = scene_strategies[current_scene_index] if current_scene_index < len(scene_strategies) else 'TRACK'

            # Apply Strategy
            if current_strategy == 'GENERAL':
                # "Plano General" -> Blur Background + Fit Width
                output_frame = create_general_frame(frame, OUTPUT_WIDTH, OUTPUT_HEIGHT)
                
                # Reset cameraman/tracker so they don't drift while inactive
                cameraman.current_center_x = original_width / 2
                cameraman.target_center_x = original_width / 2
                
            else:
                # "Single Speaker" -> Track & Crop
                
                # Detect every 2nd frame for performance
                if frame_number % 2 == 0:
                    candidates = detect_face_candidates(frame)
                    target_box = speaker_tracker.get_target(candidates, frame_number, original_width)
                    if target_box:
                        cameraman.update_target(target_box)
                    else:
                        person_box = detect_person_yolo(frame)
                        if person_box:
                            cameraman.update_target(person_box)

                # Snap camera on scene change to avoid panning from previous scene position
                is_scene_start = (frame_number == scene_boundaries[current_scene_index][0])
                
                x1, y1, x2, y2 = cameraman.get_crop_box(force_snap=is_scene_start)
                
                # Crop
                if y2 > y1 and x2 > x1:
                    cropped = frame[y1:y2, x1:x2]
                    output_frame = cv2.resize(cropped, (OUTPUT_WIDTH, OUTPUT_HEIGHT))
                else:
                    output_frame = cv2.resize(frame, (OUTPUT_WIDTH, OUTPUT_HEIGHT))

            ffmpeg_process.stdin.write(output_frame.tobytes())
            frame_number += 1
            pbar.update(1)
    
    ffmpeg_process.stdin.close()
    stderr_output = ffmpeg_process.stderr.read().decode()
    ffmpeg_process.wait()
    cap.release()

    if ffmpeg_process.returncode != 0:
        print("\n   ❌ FFmpeg frame processing failed.")
        print("   Stderr:", stderr_output)
        return False

    print("\n   🔊 Step 5: Extracting audio...")
    audio_extract_command = [
        'ffmpeg', '-y', '-i', input_video, '-vn', '-acodec', 'copy', temp_audio_output
    ]
    try:
        subprocess.run(audio_extract_command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError:
        print("\n   ❌ Audio extraction failed (maybe no audio?). Proceeding without audio.")
        pass

    print("\n   ✨ Step 6: Merging...")
    if os.path.exists(temp_audio_output):
        merge_command = [
            'ffmpeg', '-y', '-i', temp_video_output, '-i', temp_audio_output,
            '-c:v', 'copy', '-c:a', 'copy', final_output_video
        ]
    else:
         merge_command = [
            'ffmpeg', '-y', '-i', temp_video_output,
            '-c:v', 'copy', final_output_video
        ]
        
    try:
        subprocess.run(merge_command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        print(f"   ✅ Clip saved to {final_output_video}")
    except subprocess.CalledProcessError as e:
        print("\n   ❌ Final merge failed.")
        print("   Stderr:", e.stderr.decode())
        return False

    # Clean up temp files
    if os.path.exists(temp_video_output): os.remove(temp_video_output)
    if os.path.exists(temp_audio_output): os.remove(temp_audio_output)
    
    return True

def transcribe_video(video_path):
    print("🎙️  Transcribing video with Faster-Whisper (CPU Optimized)...")
    from faster_whisper import WhisperModel
    
    # Run on CPU with INT8 quantization for speed
    model = WhisperModel("base", device="cpu", compute_type="int8")
    
    segments, info = model.transcribe(video_path, word_timestamps=True)
    
    print(f"   Detected language '{info.language}' with probability {info.language_probability:.2f}")
    
    # Convert to openai-whisper compatible format
    transcript_segments = []
    full_text = ""
    
    for segment in segments:
        # Print progress to keep user informed (and prevent timeouts feeling)
        print(f"   [{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
        
        seg_dict = {
            'text': segment.text,
            'start': segment.start,
            'end': segment.end,
            'words': []
        }
        
        if segment.words:
            for word in segment.words:
                seg_dict['words'].append({
                    'word': word.word,
                    'start': word.start,
                    'end': word.end,
                    'probability': word.probability
                })
        
        transcript_segments.append(seg_dict)
        full_text += segment.text + " "
        
    return {
        'text': full_text.strip(),
        'segments': transcript_segments,
        'language': info.language
    }

def get_viral_clips(transcript_result, video_duration):
    print("🤖  Analyzing with Gemini...")
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY not found in environment variables.")
        return None


    client = genai.Client(api_key=api_key)
    
    # We use gemini-2.5-flash as requested.
    model_name = 'gemini-2.5-flash' 
    
    print(f"🤖  Initializing Gemini with model: {model_name}")

    # Extract words
    words = []
    for segment in transcript_result['segments']:
        for word in segment.get('words', []):
            words.append({
                'w': word['word'],
                's': word['start'],
                'e': word['end']
            })

    prompt = GEMINI_PROMPT_TEMPLATE.format(
        video_duration=video_duration,
        transcript_text=json.dumps(transcript_result['text']),
        words_json=json.dumps(words)
    )

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt
        )
        
        # --- Cost Calculation ---
        try:
            usage = response.usage_metadata
            if usage:
                # Gemini 2.5 Flash Pricing (Dec 2025)
                # Input: $0.10 per 1M tokens
                # Output: $0.40 per 1M tokens
                
                input_price_per_million = 0.10
                output_price_per_million = 0.40
                
                prompt_tokens = usage.prompt_token_count
                output_tokens = usage.candidates_token_count
                
                input_cost = (prompt_tokens / 1_000_000) * input_price_per_million
                output_cost = (output_tokens / 1_000_000) * output_price_per_million
                total_cost = input_cost + output_cost
                
                cost_analysis = {
                    "input_tokens": prompt_tokens,
                    "output_tokens": output_tokens,
                    "input_cost": input_cost,
                    "output_cost": output_cost,
                    "total_cost": total_cost,
                    "model": model_name
                }

                print(f"💰 Token Usage ({model_name}):")
                print(f"   - Input Tokens: {prompt_tokens} (${input_cost:.6f})")
                print(f"   - Output Tokens: {output_tokens} (${output_cost:.6f})")
                print(f"   - Total Estimated Cost: ${total_cost:.6f}")
                
        except Exception as e:
            print(f"⚠️ Could not calculate cost: {e}")
            cost_analysis = None
        # ------------------------

        # Clean response if it contains markdown code blocks
        text = response.text
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        result_json = json.loads(text)
        if cost_analysis:
            result_json['cost_analysis'] = cost_analysis
            
        return result_json
    except Exception as e:
        print(f"❌ Gemini Error: {e}")
        return None


def get_summary_segments(transcript_result, video_duration, target_duration):
    """Ask Gemini to pick chronological segments forming a ~target_duration summary reel."""
    print(f"🤖  Analyzing for {target_duration}s summary reel with Gemini...")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY not found in environment variables.")
        return None

    client = genai.Client(api_key=api_key)
    model_name = 'gemini-2.5-flash'

    words = []
    for segment in transcript_result['segments']:
        for word in segment.get('words', []):
            words.append({'w': word['word'], 's': word['start'], 'e': word['end']})

    # Allow ±20% slack on the total duration so Gemini can pick natural sentence boundaries.
    min_total = max(10, int(target_duration * 0.8))
    max_total = max(min_total + 5, int(target_duration * 1.2))

    prompt = SUMMARY_PROMPT_TEMPLATE.format(
        video_duration=video_duration,
        target_duration=target_duration,
        min_total=min_total,
        max_total=max_total,
        transcript_text=json.dumps(transcript_result['text']),
        words_json=json.dumps(words)
    )

    try:
        response = client.models.generate_content(model=model_name, contents=prompt)

        cost_analysis = None
        try:
            usage = response.usage_metadata
            if usage:
                input_price_per_million = 0.10
                output_price_per_million = 0.40
                prompt_tokens = usage.prompt_token_count
                output_tokens = usage.candidates_token_count
                input_cost = (prompt_tokens / 1_000_000) * input_price_per_million
                output_cost = (output_tokens / 1_000_000) * output_price_per_million
                cost_analysis = {
                    "input_tokens": prompt_tokens,
                    "output_tokens": output_tokens,
                    "input_cost": input_cost,
                    "output_cost": output_cost,
                    "total_cost": input_cost + output_cost,
                    "model": model_name,
                }
                print(f"💰 Token Usage ({model_name}):")
                print(f"   - Input Tokens: {prompt_tokens} (${input_cost:.6f})")
                print(f"   - Output Tokens: {output_tokens} (${output_cost:.6f})")
                print(f"   - Total Estimated Cost: ${cost_analysis['total_cost']:.6f}")
        except Exception as e:
            print(f"⚠️ Could not calculate cost: {e}")

        text = response.text
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        result_json = json.loads(text)

        # Validate + sort + clamp segments.
        segments = result_json.get('segments') or []
        cleaned = []
        for seg in segments:
            try:
                s = max(0.0, float(seg['start']))
                e = min(float(video_duration), float(seg['end']))
            except (KeyError, TypeError, ValueError):
                continue
            if e - s < 1.0:
                continue
            cleaned.append({"start": s, "end": e, "reason": seg.get("reason", "")})
        cleaned.sort(key=lambda x: x['start'])

        if not cleaned:
            print("❌ Gemini returned no valid summary segments.")
            return None

        result_json['segments'] = cleaned
        if cost_analysis:
            result_json['cost_analysis'] = cost_analysis
        return result_json
    except Exception as e:
        print(f"❌ Gemini Error: {e}")
        return None


def build_summary_transcript(source_transcript, segments):
    """
    Given the source transcript and a list of {start, end} segments (in source time),
    return a synthetic transcript whose word timestamps are remapped to the concatenated
    reel's timeline, so existing /api/subtitle plumbing works on the summary reel.
    """
    new_segments = []
    full_text_parts = []
    cumulative_offset = 0.0

    for seg in segments:
        s, e = seg['start'], seg['end']
        seg_words = []
        seg_text_parts = []
        for src_seg in source_transcript.get('segments', []):
            for word in src_seg.get('words', []):
                if word['end'] > s and word['start'] < e:
                    new_start = max(0.0, word['start'] - s) + cumulative_offset
                    new_end = max(new_start + 0.05, word['end'] - s + cumulative_offset)
                    seg_words.append({
                        'word': word['word'],
                        'start': new_start,
                        'end': new_end,
                    })
                    seg_text_parts.append(word['word'])
        if seg_words:
            seg_text = " ".join(seg_text_parts).strip()
            full_text_parts.append(seg_text)
            new_segments.append({
                'start': cumulative_offset,
                'end': cumulative_offset + (e - s),
                'text': seg_text,
                'words': seg_words,
            })
        cumulative_offset += (e - s)

    return {
        'segments': new_segments,
        'language': source_transcript.get('language', 'en'),
        'text': " ".join(full_text_parts),
    }


def assemble_summary_reel(input_video, segments, output_dir, base_name,
                          reframe_mode='auto', facecam_corner='tr'):
    """
    Cut each segment, concat them, then reframe vertical.
    Writes the final reel to `<output_dir>/<base_name>_clip_1.mp4` so the dashboard
    discovers it via the existing metadata convention.
    Returns (final_path, total_reel_seconds) on success, (None, 0) on failure.
    """
    if not segments:
        return None, 0.0

    work_dir = os.path.join(output_dir, "_summary_work")
    os.makedirs(work_dir, exist_ok=True)

    seg_paths = []
    total_seconds = 0.0
    for i, seg in enumerate(segments):
        s, e = seg['start'], seg['end']
        seg_path = os.path.join(work_dir, f"seg_{i:02d}.mp4")
        cut_cmd = [
            'ffmpeg', '-y',
            '-ss', f"{s:.3f}",
            '-to', f"{e:.3f}",
            '-i', input_video,
            '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
            '-c:a', 'aac', '-ar', '48000', '-ac', '2',
            seg_path,
        ]
        result = subprocess.run(cut_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print(f"❌ Failed to cut segment {i}: {result.stderr.decode()[:300]}")
            return None, 0.0
        seg_paths.append(seg_path)
        total_seconds += (e - s)

    # Concat via demuxer.
    concat_list = os.path.join(work_dir, "concat.txt")
    with open(concat_list, 'w') as f:
        for p in seg_paths:
            f.write(f"file '{os.path.abspath(p)}'\n")

    concat_path = os.path.join(work_dir, "concat.mp4")
    concat_cmd = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', concat_list,
        '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
        '-c:a', 'aac', '-ar', '48000', '-ac', '2',
        concat_path,
    ]
    result = subprocess.run(concat_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if result.returncode != 0:
        print(f"❌ Failed to concat segments: {result.stderr.decode()[:300]}")
        return None, 0.0

    final_path = os.path.join(output_dir, f"{base_name}_clip_1.mp4")
    success = process_video_to_vertical(
        concat_path, final_path,
        reframe_mode=reframe_mode, facecam_corner=facecam_corner,
    )
    if not success:
        return None, 0.0

    # Best-effort cleanup of intermediates.
    try:
        for p in seg_paths:
            if os.path.exists(p):
                os.remove(p)
        if os.path.exists(concat_list):
            os.remove(concat_list)
        if os.path.exists(concat_path):
            os.remove(concat_path)
        os.rmdir(work_dir)
    except OSError:
        pass

    return final_path, total_seconds


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="AutoCrop-Vertical with Viral Clip Detection.")
    
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument('-i', '--input', type=str, help="Path to the input video file.")
    input_group.add_argument('-u', '--url', type=str, help="YouTube URL to download and process.")
    
    parser.add_argument('-o', '--output', type=str, help="Output directory or file (if processing whole video).")
    parser.add_argument('--keep-original', action='store_true', help="Keep the downloaded YouTube video.")
    parser.add_argument('--skip-analysis', action='store_true', help="Skip AI analysis and convert the whole video.")
    parser.add_argument('--mode', type=str, choices=['viral', 'summary'], default='viral',
                        help="viral=multiple viral clips (default); summary=one concatenated summary reel.")
    parser.add_argument('--target-duration', type=int, default=30,
                        help="Target length in seconds for --mode summary (default 30).")
    parser.add_argument('--reframe-mode', type=str, choices=['auto', 'streamer'], default='auto',
                        help="auto=face-track or blurred-bg per scene (default); streamer=top tile face cam, bottom tile full frame.")
    parser.add_argument('--facecam-corner', type=str, choices=['tl', 'tr', 'bl', 'br'], default='tr',
                        help="For --reframe-mode streamer: which corner the face cam occupies (default tr).")

    args = parser.parse_args()

    script_start_time = time.time()
    
    def _ensure_dir(path: str) -> str:
        """Create directory if missing and return the same path."""
        if path:
            os.makedirs(path, exist_ok=True)
        return path
    
    # 1. Get Input Video
    if args.url:
        # For multi-clip runs, treat --output as an OUTPUT DIRECTORY (create it if needed).
        # For whole-video runs (--skip-analysis), --output can be a file path.
        if args.output and not args.skip_analysis:
            output_dir = _ensure_dir(args.output)
        else:
            # If output is a directory, use it; if it's a filename, use its directory; else default "."
            if args.output and os.path.isdir(args.output):
                output_dir = args.output
            elif args.output and not os.path.isdir(args.output):
                output_dir = os.path.dirname(args.output) or "."
            else:
                output_dir = "."
        
        input_video, video_title = download_youtube_video(args.url, output_dir)
    else:
        input_video = args.input
        video_title = os.path.splitext(os.path.basename(input_video))[0]
        
        if args.output and not args.skip_analysis:
            # For multi-clip runs, treat --output as an OUTPUT DIRECTORY (create it if needed).
            output_dir = _ensure_dir(args.output)
        else:
            # If output is a directory, use it; if it's a filename, use its directory; else default to input dir.
            if args.output and os.path.isdir(args.output):
                output_dir = args.output
            elif args.output and not os.path.isdir(args.output):
                output_dir = os.path.dirname(args.output) or os.path.dirname(input_video)
            else:
                output_dir = os.path.dirname(input_video)

    if not os.path.exists(input_video):
        print(f"❌ Input file not found: {input_video}")
        exit(1)

    # 2. Decision: Analyze clips or process whole?
    if args.skip_analysis:
        print("⏩ Skipping analysis, processing entire video...")
        output_file = args.output if args.output else os.path.join(output_dir, f"{video_title}_vertical.mp4")
        process_video_to_vertical(
            input_video, output_file,
            reframe_mode=args.reframe_mode, facecam_corner=args.facecam_corner,
        )
    elif args.mode == 'summary':
        # Summary reel: pick segments, concat, reframe — produce a single clip.
        print(f"📰  Summary mode: target ~{args.target_duration}s reel")
        transcript = transcribe_video(input_video)

        cap = cv2.VideoCapture(input_video)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps
        cap.release()

        summary_data = get_summary_segments(transcript, duration, args.target_duration)

        if not summary_data or not summary_data.get('segments'):
            print("❌ Failed to identify summary segments. Falling back to whole-video vertical convert.")
            output_file = os.path.join(output_dir, f"{video_title}_vertical.mp4")
            process_video_to_vertical(
                input_video, output_file,
                reframe_mode=args.reframe_mode, facecam_corner=args.facecam_corner,
            )
        else:
            segments = summary_data['segments']
            print(f"🪄  Building summary reel from {len(segments)} segments...")
            for i, seg in enumerate(segments):
                print(f"   {i+1}. {seg['start']:.2f}s → {seg['end']:.2f}s  ({seg.get('reason','')})")

            final_path, total_seconds = assemble_summary_reel(
                input_video, segments, output_dir, video_title,
                reframe_mode=args.reframe_mode, facecam_corner=args.facecam_corner,
            )
            if not final_path:
                print("❌ Summary reel assembly failed.")
            else:
                # Build a synthetic transcript with timestamps remapped to the reel timeline,
                # so downstream subtitle/edit/hook endpoints work unchanged.
                synthetic_transcript = build_summary_transcript(transcript, segments)

                metadata = {
                    'mode': 'summary',
                    'target_duration': args.target_duration,
                    'reel_duration': total_seconds,
                    'source_segments': segments,
                    'shorts': [{
                        'start': 0.0,
                        'end': total_seconds,
                        'video_title_for_youtube_short': summary_data.get('video_title_for_youtube_short', f"{video_title} - Summary"),
                        'video_description_for_tiktok': summary_data.get('video_description_for_tiktok', ''),
                        'video_description_for_instagram': summary_data.get('video_description_for_instagram', ''),
                        'viral_hook_text': summary_data.get('viral_hook_text', ''),
                        'is_summary': True,
                    }],
                    'transcript': synthetic_transcript,
                    'cost_analysis': summary_data.get('cost_analysis'),
                }
                metadata_file = os.path.join(output_dir, f"{video_title}_metadata.json")
                with open(metadata_file, 'w') as f:
                    json.dump(metadata, f, indent=2)
                print(f"✅ Summary reel ready: {final_path} ({total_seconds:.1f}s)")
                print(f"   Saved metadata to {metadata_file}")
    else:
        # 3. Transcribe
        transcript = transcribe_video(input_video)

        # Get duration
        cap = cv2.VideoCapture(input_video)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps
        cap.release()

        # 4. Gemini Analysis
        clips_data = get_viral_clips(transcript, duration)
        
        if not clips_data or 'shorts' not in clips_data:
            print("❌ Failed to identify clips. Converting whole video as fallback.")
            output_file = os.path.join(output_dir, f"{video_title}_vertical.mp4")
            process_video_to_vertical(
                input_video, output_file,
                reframe_mode=args.reframe_mode, facecam_corner=args.facecam_corner,
            )
        else:
            print(f"🔥 Found {len(clips_data['shorts'])} viral clips!")
            
            # Save metadata
            clips_data['transcript'] = transcript # Save full transcript for subtitles
            metadata_file = os.path.join(output_dir, f"{video_title}_metadata.json")
            with open(metadata_file, 'w') as f:
                json.dump(clips_data, f, indent=2)
            print(f"   Saved metadata to {metadata_file}")

            # 5. Process each clip
            for i, clip in enumerate(clips_data['shorts']):
                start = clip['start']
                end = clip['end']
                print(f"\n🎬 Processing Clip {i+1}: {start}s - {end}s")
                print(f"   Title: {clip.get('video_title_for_youtube_short', 'No Title')}")
                
                # Cut clip
                clip_filename = f"{video_title}_clip_{i+1}.mp4"
                clip_temp_path = os.path.join(output_dir, f"temp_{clip_filename}")
                clip_final_path = os.path.join(output_dir, clip_filename)
                
                # ffmpeg cut
                # Using re-encoding for precision as requested by strict seconds
                cut_command = [
                    'ffmpeg', '-y', 
                    '-ss', str(start), 
                    '-to', str(end), 
                    '-i', input_video,
                    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
                    '-c:a', 'aac',
                    clip_temp_path
                ]
                subprocess.run(cut_command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                
                # Process vertical
                success = process_video_to_vertical(
                    clip_temp_path, clip_final_path,
                    reframe_mode=args.reframe_mode, facecam_corner=args.facecam_corner,
                )
                
                if success:
                    print(f"   ✅ Clip {i+1} ready: {clip_final_path}")
                
                # Clean up temp cut
                if os.path.exists(clip_temp_path):
                    os.remove(clip_temp_path)

    # Clean up original if requested
    if args.url and not args.keep_original and os.path.exists(input_video):
        os.remove(input_video)
        print(f"🗑️  Cleaned up downloaded video.")

    total_time = time.time() - script_start_time
    print(f"\n⏱️  Total execution time: {total_time:.2f}s")
