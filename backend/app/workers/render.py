import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import cv2
from sqlalchemy import and_

from app.api.ws import broadcast_sync
from app.models import Job, JobStatusEnum, JobTypeEnum, User, Video, VideoStatusEnum
from app.services.branding import BrandConfig, build_watermark_filter, generate_title_card
from app.services.ducking import build_duck_filter
from app.services.moderation import moderate_segment
from app.services.platforms import get_preset
from app.services.storage import download_file, ensure_bucket, get_presigned_url, upload_file
from app.services.video import get_media_duration
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)

MAX_CLIPS = 10
MIN_CLIP_DURATION = 2.0
MAX_CLIP_DURATION = 60.0

_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
_PROFILE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_profileface.xml"
)

_DRAWTEXT_AVAILABLE: bool | None = None
_FONT_PATH: str | None = None


def _get_font_path() -> str:
    global _FONT_PATH
    if _FONT_PATH is not None:
        return _FONT_PATH
    """Find the DejaVu Sans or Arial font path for the current OS."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux
        os.path.expanduser("~/Library/Fonts/DejaVuSans.ttf"),  # macOS (homebrew)
        "/Library/Fonts/DejaVuSans.ttf",  # macOS (system)
        "/System/Library/Fonts/Supplemental/DejaVuSans.ttf",  # macOS (supplemental)
        "/System/Library/Fonts/Supplemental/Arial.ttf",  # macOS (supplemental Arial)
        "/opt/homebrew/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # macOS (brew)
        "C:\\Windows\\Fonts\\Arial.ttf",  # Windows
        "C:\\Windows\\Fonts\\DejaVuSans.ttf",  # Windows
    ]
    for path in candidates:
        if os.path.exists(path):
            _FONT_PATH = path
            return path
    _FONT_PATH = ""
    return ""


def _fontfile_arg() -> str:
    """Return ':fontfile=<path>' if a font is found, else empty string."""
    path = _get_font_path()
    return f":fontfile='{path}'" if path else ""


def _has_drawtext() -> bool:
    global _DRAWTEXT_AVAILABLE
    if _DRAWTEXT_AVAILABLE is not None:
        return _DRAWTEXT_AVAILABLE
    try:
        result = subprocess.run(
            ["ffmpeg", "-filters"], capture_output=True, text=True, timeout=10
        )
        _DRAWTEXT_AVAILABLE = "drawtext" in result.stdout
    except Exception:
        _DRAWTEXT_AVAILABLE = False
    if not _DRAWTEXT_AVAILABLE:
        logger.warning("FFmpeg drawtext filter not available — text overlays disabled")
    return _DRAWTEXT_AVAILABLE


_VIDEOTOOLBOX_AVAILABLE: bool | None = None
def _use_videotoolbox() -> bool:
    global _VIDEOTOOLBOX_AVAILABLE
    if _VIDEOTOOLBOX_AVAILABLE is not None:
        return _VIDEOTOOLBOX_AVAILABLE
    if sys.platform != "darwin":
        _VIDEOTOOLBOX_AVAILABLE = False
        return False
    try:
        result = subprocess.run(
            ["ffmpeg", "-encoders"], capture_output=True, text=True, timeout=10
        )
        _VIDEOTOOLBOX_AVAILABLE = "h264_videotoolbox" in result.stdout
    except Exception:
        _VIDEOTOOLBOX_AVAILABLE = False
    if _VIDEOTOOLBOX_AVAILABLE:
        logger.info("macOS h264_videotoolbox hardware encoder detected and enabled")
    return _VIDEOTOOLBOX_AVAILABLE

METADATA_PROMPT_TEMPLATE = (
    'Act as an expert social media manager. Generate highly engaging, viral metadata for this clip transcript.\n'
    'Return ONLY valid JSON:\n'
    '{{\n'
    '  "title": "<clickbait but accurate 30-char title>",\n'
    '  "caption": "<A detailed 2-3 sentence engaging description with emojis, asking a question to drive comments, and a strong call-to-action>",\n'
    '  "hashtags": "#viral #trending #<topic1> #<topic2> #<topic3>"\n'
    '}}\n\n'
    'Transcript: "{text}"'
)

BATCH_METADATA_PROMPT_TEMPLATE = (
    'Act as an expert social media manager. Generate highly engaging, viral metadata for each of the clip transcripts below.\n'
    'Return ONLY a valid JSON array with one object per clip, maintaining the exact same order.\n\n'
    'Format each object strictly like this:\n'
    '[{{"hook": "<punchy on-screen hook, max 60 chars>", "title": "<clickbait but accurate 30-char title>", '
    '"caption": "<A detailed 2-3 sentence engaging description with emojis, asking a question to drive comments, and a strong call-to-action>", '
    '"hashtags": "#viral #trending #<topic1> #<topic2> #<topic3>"}}]\n\n'
    'Clips:\n{clips}'
)


def _score_candidate_window(segments: list[dict], i: int, j: int, duration: float, avg_score: float) -> float:
    # 1. Apply Duration Bias (Peak at 60s / 1min)
    duration_diff = abs(duration - 60.0)
    duration_mult = 1.0 - 0.25 * (duration_diff / 30.0) # drops to 0.875 at 45s and 0.75 at 90s

    # 2. Coherence and Punctuation/Pause heuristics
    transition_words = {"hey", "hello", "today", "now", "so", "why", "how", "what", "did", "do", "you", "if", "when", "this", "there", "here"}
    conjunctions = {"and", "but", "because", "or", "so that"}
    incomplete_ends = {"the", "a", "an", "and", "but", "because", "of", "with", "is", "are", "was", "were", "has", "have", "to", "in", "on", "at", "for"}

    start_score = 0.5
    end_score = 0.5

    # Analyze start boundary (segment i)
    start_text = segments[i].get("text", "").strip()
    first_word = start_text.split()[0].rstrip(".,?!:;").lower() if start_text.split() else ""

    if i == 0:
        start_score = 1.0
    else:
        prev_text = segments[i-1].get("text", "").strip()
        if prev_text and prev_text[-1] in (".", "?", "!"):
            start_score = 1.0
        else:
            pause = segments[i].get("start", 0) - segments[i-1].get("end", 0)
            if pause >= 0.4:
                start_score = 0.9
            elif start_text and start_text[0].isupper() and start_text[0].isalpha():
                start_score = 0.8
            elif first_word in transition_words:
                start_score = 0.8
            elif first_word in conjunctions:
                start_score = 0.3

    # Analyze end boundary (segment j)
    end_text = segments[j].get("text", "").strip()
    last_word = end_text.split()[-1].rstrip(".,?!:;").lower() if end_text.split() else ""

    if j == len(segments) - 1:
        end_score = 1.0
    else:
        if end_text and end_text[-1] in (".", "?", "!"):
            end_score = 1.0
        else:
            next_seg = segments[j+1]
            pause = next_seg.get("start", 0) - segments[j].get("end", 0)
            if pause >= 0.4:
                end_score = 0.9
            else:
                next_text = next_seg.get("text", "").strip()
                if next_text and next_text[0].isupper() and next_text[0].isalpha():
                    end_score = 0.8
                elif last_word in incomplete_ends:
                    end_score = 0.3

    coherence_mult = start_score * end_score
    return avg_score * duration_mult * coherence_mult


def _generate_windows(segments: list[dict], min_dur: float, max_dur: float = 90.0) -> list[dict]:
    """Generate candidate clip windows from consecutive segments in [min_dur, max_dur] range."""
    candidates = []
    for i in range(len(segments)):
        for j in range(i, len(segments)):
            start_time = segments[i]["start"]
            end_time = segments[j]["end"]
            duration = end_time - start_time

            if min_dur <= duration <= max_dur:
                window_segs = segments[i:j+1]
                avg_score = sum(s.get("viral_score", 0.0) for s in window_segs) / len(window_segs)
                final_score = _score_candidate_window(segments, i, j, duration, avg_score)
                joined_text = " ".join(s.get("text", "").strip() for s in window_segs if s.get("text"))
                candidates.append({
                    "start": start_time, "end": end_time, "text": joined_text,
                    "viral_score": final_score, "segment_indices": set(range(i, j+1))
                })
            elif duration > max_dur:
                break
    return candidates


def _top_non_overlapping(candidates: list[dict], n: int) -> list[dict]:
    """Select top-N non-overlapping candidates via greedy NMS with overlap relaxation."""
    candidates.sort(key=lambda c: c["viral_score"], reverse=True)

    selected = []
    used = set()

    for cand in candidates:
        if len(selected) >= n:
            break
        if not cand["segment_indices"].intersection(used):
            selected.append(cand)
            used.update(cand["segment_indices"])

    # Relaxation pass — allow up to 30% overlap
    if len(selected) < n:
        for cand in candidates:
            if len(selected) >= n:
                break
            if cand in selected:
                continue
            overlap = len(cand["segment_indices"].intersection(used)) / max(len(cand["segment_indices"]), 1)
            if overlap <= 0.3:
                selected.append(cand)
                used.update(cand["segment_indices"])

    # Fill remaining with whatever's left
    for cand in candidates:
        if len(selected) >= n:
            break
        if cand not in selected:
            selected.append(cand)

    selected.sort(key=lambda c: c["start"])
    for clip in selected:
        clip.pop("segment_indices", None)
    return selected


def _get_top_segments(segments: list[dict], n: int = MAX_CLIPS) -> list[dict]:
    """Identify the best 45-90 second clips by grouping consecutive segments.
    Falls back through progressively shorter windows, then raw segments.
    """
    if not segments:
        return []

    if not all("start" in s and "end" in s for s in segments):
        scored = [s for s in segments if s.get("viral_score", 0) > 0]
        scored.sort(key=lambda s: s["viral_score"], reverse=True)
        return scored[:n]

    for min_dur in (45.0, 30.0, 15.0):
        candidates = _generate_windows(segments, min_dur)
        if candidates:
            return _top_non_overlapping(candidates, n)

    logger.warning("No multi-segment windows found, falling back to raw segments.")
    scored = [s for s in segments if s.get("viral_score", 0) > 0]
    scored.sort(key=lambda s: s["viral_score"], reverse=True)
    return scored[:n]



def _detect_stable_face_center(video_path: str, start_time: float, duration: float) -> tuple[int, int]:
    """Sample multiple frames across the clip duration to find a stable face center."""
    try:
        import numpy as np
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None
        iw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        ih = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Sample up to 15 frames spaced evenly across the clip
        num_samples = 15
        sample_times = [start_time + (i * duration / max(1, num_samples - 1)) for i in range(num_samples)]

        detected_centers = []

        for t in sample_times:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # 1. Try frontal face
            faces = _FACE_CASCADE.detectMultiScale(gray, 1.1, 3)

            # 2. Try profile face (facing right)
            if len(faces) == 0:
                faces = _PROFILE_CASCADE.detectMultiScale(gray, 1.1, 3)

            # 3. Try profile face flipped (facing left)
            if len(faces) == 0:
                flipped = cv2.flip(gray, 1)
                faces_flipped = _PROFILE_CASCADE.detectMultiScale(flipped, 1.1, 3)
                if len(faces_flipped) > 0:
                    largest_face = max(faces_flipped, key=lambda f: f[2] * f[3])
                    xf, yf, wf, hf = largest_face
                    # Map x back to original coordinate space
                    faces = [(iw - xf - wf, yf, wf, hf)]

            if len(faces) > 0:
                # Find the largest face detected
                largest_face = max(faces, key=lambda f: f[2] * f[3])
                x, y, w, h = largest_face
                detected_centers.append((x + w // 2, y + h // 2))

        cap.release()

        if detected_centers:
            cxs = [c[0] for c in detected_centers]
            cys = [c[1] for c in detected_centers]
            cx = int(np.median(cxs))
            cy = int(np.median(cys))
            logger.info("Face detection successful: detected %d/%d frames. Stable center: (%d, %d) in %dx%d video",
                        len(detected_centers), num_samples, cx, cy, iw, ih)
            return cx, cy

        logger.info("No faces detected in %d frames. Falling back to video center: (%d, %d)",
                    num_samples, iw // 2, ih // 2)
        return iw // 2, ih // 2
    except Exception as e:
        logger.warning("Stable face detection failed, using center fallback: %s", e)
        try:
            cap = cv2.VideoCapture(video_path)
            if cap.isOpened():
                iw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                ih = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                cap.release()
                return iw // 2, ih // 2
        except Exception:
            pass
        return 960, 540


def _get_crop_filter(
    video_path: str, start_time: float, duration: float,
    preset_w: int = 1080, preset_h: int = 1920,
) -> str | None:
    """Generate crop filter string based on stable face detection and zoom focus."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    iw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    ih = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    if iw <= 0 or ih <= 0:
        return None

    # Detect stable face center (falls back to frame center)
    cx, cy = _detect_stable_face_center(video_path, start_time, duration)

    # Apply 1.3x zoom factor to focus/zoom on the subject/speaker
    zoom_factor = 1.3
    crop_h = int(ih / zoom_factor)
    crop_w = int(crop_h * preset_w / preset_h)

    if crop_w > iw:
        crop_w = iw
        crop_h = int(iw * preset_h / preset_w)

    crop_w = (crop_w // 2) * 2
    crop_h = (crop_h // 2) * 2

    if crop_w <= 0 or crop_h <= 0:
        return None

    left = cx - crop_w // 2
    top = cy - crop_h // 2

    # Clip to video boundaries
    left = max(0, min(left, iw - crop_w))
    top = max(0, min(top, ih - crop_h))

    return f"crop={crop_w}:{crop_h}:{left}:{top},scale={preset_w}:{preset_h}"



def _generate_hook_text(text: str) -> str:
    """Generate a punchy hook text from segment content using Ollama."""
    from app.services.llm import generate_llm
    prompt = (
        "Generate a short, punchy hook text (max 60 chars) for a viral short clip. "
        "Make it attention-grabbing. Return ONLY the text, no quotes. "
        f"Text: {text[:500]}"
    )
    try:
        data = generate_llm(prompt, format_json=False, timeout=15.0)
        hook = data.get("response", "").strip().strip('"\'')
        if hook:
            return hook[:80]
    except Exception as exc:
        logger.warning("Hook text generation failed: %s", exc)
    return text.strip()[:60]


def _build_hook_overlay_filter(hook_text: str, duration: float) -> str | None:
    """Build FFmpeg drawtext filter for hook text overlay (first 3s, fade-in)."""
    if not _has_drawtext():
        return None
    if not hook_text or duration < 3:
        return None
    text = hook_text.strip()[:80]
    for ch in (":", "'", ",", "%", "[", "]", "{", "}"):
        text = text.replace(ch, f"\\{ch}")
    return (
        f"drawtext=text='{text}':"
        f"fontsize=52:fontcolor=white:borderw=2:bordercolor=black:"
        f"x=(w-text_w)/2:y=h/3:"
        f"alpha='if(lt(t,0.5),t/0.5,if(gt(t,3),(4-t)/1,1))':"
        f"enable='between(t,0,3)'"
        f"{_fontfile_arg()}"
    )


def _build_subtitle_filter(caption: str, style: str = "classic") -> list[str]:
    """Build FFmpeg drawtext filter for auto-captions with the given visual style."""
    if not _has_drawtext():
        return []
    if not caption or not caption.strip():
        return []
    from app.services.branding import build_caption_style_filter
    return build_caption_style_filter(caption.strip()[:120], style)


def _extract_frame(video_path: str, timestamp: float) -> str | None:
    fd, frame_path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            if os.path.exists(frame_path):
                os.unlink(frame_path)
            return None
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            if os.path.exists(frame_path):
                os.unlink(frame_path)
            return None
        cv2.imwrite(frame_path, frame)
        return frame_path
    except Exception as e:
        logger.debug("Frame extraction via OpenCV failed: %s", e)
        if os.path.exists(frame_path):
            os.unlink(frame_path)
        return None


def _compute_sharpness(image_path: str) -> float:
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    laplacian = cv2.Laplacian(img, cv2.CV_64F)
    return float(laplacian.var())


def _has_face(image_path: str) -> bool:
    img = cv2.imread(image_path)
    if img is None:
        return False
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _FACE_CASCADE.detectMultiScale(gray, 1.1, 4)
    return len(faces) > 0


def _select_best_thumbnail(video_path: str, start: float, end: float) -> str | None:
    duration = end - start
    timestamps = [
        start + duration * 0.2,
        start + duration * 0.35,
        start + duration * 0.5,
        start + duration * 0.65,
        start + duration * 0.8,
    ]

    best_score = -1.0
    best_frame = None

    for ts in timestamps:
        frame_path = _extract_frame(video_path, ts)
        if frame_path is None:
            continue

        try:
            sharpness = _compute_sharpness(frame_path) / 1000.0
            face_score = 2.0 if _has_face(frame_path) else 0.0
            score = sharpness + face_score

            if score > best_score:
                best_score = score
                if best_frame:
                    os.unlink(best_frame)
                best_frame = frame_path
            else:
                os.unlink(frame_path)
        except Exception:
            if os.path.exists(frame_path):
                os.unlink(frame_path)

    return best_frame


def _render_clip(
    input_path: str,
    output_path: str,
    start_time: float,
    end_time: float,
    caption: str = "",
    preset: object | None = None,
    hook_text: str = "",
    watermark_filters: list[str] | None = None,
    caption_style: str = "classic",
) -> None:
    if preset is None:
        from app.services.platforms import PlatformPreset
        preset = PlatformPreset(
            name="youtube_shorts", label="YouTube Shorts",
            width=1080, height=1920, max_duration=60.0,
        )
    duration = end_time - start_time
    if duration < MIN_CLIP_DURATION:
        logger.warning(
            "Clip duration %.2f < min %.2f, extending to %.2f",
            duration,
            MIN_CLIP_DURATION,
            MIN_CLIP_DURATION,
        )
        end_time = start_time + MIN_CLIP_DURATION
    if duration > MAX_CLIP_DURATION:
        logger.warning(
            "Clip duration %.2f > max %.2f, truncating to %.2f",
            duration,
            MAX_CLIP_DURATION,
            MAX_CLIP_DURATION,
        )
        end_time = start_time + MAX_CLIP_DURATION

    pw, ph = preset.width, preset.height

    # Build filter chain
    filters = []

    crop_filter = _get_crop_filter(input_path, start_time, duration, pw, ph)
    if crop_filter:
        filters.append(crop_filter)
    else:
        filters.append(
            f"scale='min({pw},iw)':'min({ph},ih)':force_original_aspect_ratio=decrease,"
            f"pad={pw}:{ph}:(ow-iw)/2:(oh-ih)/2"
        )

    subtitle_filters = _build_subtitle_filter(caption, caption_style)
    if subtitle_filters:
        filters.extend(subtitle_filters)

    if not hook_text:
        hook_text = _generate_hook_text(caption)
    hook_filter = _build_hook_overlay_filter(hook_text, duration)
    if hook_filter:
        if subtitle_filters:
            filters.insert(-1, hook_filter)
        else:
            filters.append(hook_filter)

    if watermark_filters:
        filters.extend(watermark_filters)

    vf_str = ",".join(filters)

    # Build audio ducking filter — reduce music volume during speech
    speech_segments = [{"start": 0.0, "end": duration}]
    duck_filter = build_duck_filter(speech_segments)

    # Input-seeking: -ss BEFORE -i does instant keyframe seek (vs slow decode-from-start)
    clip_duration = end_time - start_time
    if _use_videotoolbox():
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-i", input_path,
            "-t", str(clip_duration),
            "-c:v", "h264_videotoolbox",
            "-b:v", "8M",
            "-c:a", "aac",
            "-b:a", "192k",
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-i", input_path,
            "-t", str(clip_duration),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "192k",
        ]
    if duck_filter:
        cmd.extend(["-af", duck_filter])
    cmd.extend([
        "-vf", vf_str,
        "-movflags", "+faststart",
        output_path,
    ])
    logger.debug("Running FFmpeg: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg failed (rc={result.returncode}): {result.stderr[:500]}"
        )
    if not os.path.exists(output_path):
        raise RuntimeError(f"FFmpeg did not produce output: {output_path}")
    logger.info("Rendered clip: %s (%.2f-%.2f)", output_path, start_time, end_time)


def _upload_clip(
    file_path: str,
    video_id: str,
    clip_index: int,
) -> str:
    ensure_bucket()
    object_name = f"clips/{video_id}/{clip_index:04d}.mp4"
    upload_file(file_path, object_name)
    return object_name


def _generate_clip_metadata(text: str) -> dict:
    from app.services.llm import generate_llm
    prompt = METADATA_PROMPT_TEMPLATE.format(text=text[:500])
    try:
        data = generate_llm(prompt, format_json=True, timeout=30.0)
        meta = json.loads(data.get("response", "{}"))
        title_val = str(meta.get("title") or "")
        caption_val = str(meta.get("caption") or "")
        hashtags_raw = meta.get("hashtags") or ""
        hashtags_val = " ".join(str(h) for h in hashtags_raw) if isinstance(hashtags_raw, list) else str(hashtags_raw)
        hashtags_val = hashtags_val.replace("[", "").replace("]", "").replace("'", "").replace('"', "")
        return {
            "title": title_val[:100] if title_val else "",
            "caption": caption_val[:500] if caption_val else text[:500],
            "hashtags": hashtags_val if hashtags_val else "#viral",
        }
    except Exception as exc:
        logger.warning("Metadata generation failed: %s", exc)
        return {"title": "", "caption": text[:500], "hashtags": "#viral"}


def _batch_generate_metadata(segments: list[dict]) -> list[tuple[str, dict]]:
    """Generate hook texts + metadata for all segments in 1-2 Ollama calls.

    Returns a list of (hook_text, metadata_dict) tuples, one per segment.
    Falls back to sequential generation if batch call fails.
    """
    if not segments:
        return []

    from app.services.llm import generate_llm
    numbered = "\n".join(
        f"{i+1}. {seg.get('text', '')[:300]}" for i, seg in enumerate(segments)
    )
    prompt = BATCH_METADATA_PROMPT_TEMPLATE.format(clips=numbered)
    try:
        data = generate_llm(prompt, format_json=True, timeout=60.0)
        response_text = data.get("response", "[]")
        results = json.loads(response_text)
        if isinstance(results, dict):
            # If the LLM wrapped the array in an object (e.g. {"clips": [...]})
            for val in results.values():
                if isinstance(val, list):
                    results = val
                    break
        if not isinstance(results, list):
            results = [results]
    except Exception as exc:
        logger.warning("Batch metadata generation failed, falling back to sequential: %s", exc)
        results = []

    # Pad results if LLM returned fewer items
    while len(results) < len(segments):
        results.append({})

    output = []
    for i, seg in enumerate(segments):
        r = results[i] if i < len(results) else {}
        hook = str(r.get("hook", "")).strip().strip('"\'')
        if not hook:
            hook = seg.get("text", "").strip()[:60]
        else:
            hook = hook[:80]
        title_val = str(r.get("title") or "")
        caption_val = str(r.get("caption") or "")
        hashtags_raw = r.get("hashtags") or ""
        hashtags_val = " ".join(str(h) for h in hashtags_raw) if isinstance(hashtags_raw, list) else str(hashtags_raw)
        hashtags_val = hashtags_val.replace("[", "").replace("]", "").replace("'", "").replace('"', "")

        metadata = {
            "title": title_val[:100] if title_val else "Generated Clip",
            "caption": caption_val[:500] if caption_val else seg.get("text", "")[:500],
            "hashtags": hashtags_val if hashtags_val else "#viral",
        }
        output.append((hook, metadata))

    return output


def _render_black_video(output_path: str, pw: int, ph: int) -> str:
    """Render a 2-second black video with standard encoding."""
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=black:s={pw}x{ph}:d=2",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
    return output_path


def _create_title_card(text: str, output_path: str, pw: int = 1080, ph: int = 1920, brand: BrandConfig | None = None) -> str:
    """Create a 2-second title card with centered text on black background."""
    if brand:
        result = generate_title_card(text, output_path, brand, pw, ph)
        if result:
            return result
    if not _has_drawtext():
        return _render_black_video(output_path, pw, ph)
    safe_text = text.strip()[:50]
    for ch in (":", "'", "%", "[", "]", "{", "}", "\\"):
        safe_text = safe_text.replace(ch, f"\\{ch}")
    brand_color = brand.primary_color if brand else "white"
    label = f"Best of: {safe_text}"[:50]
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=black:s={pw}x{ph}:d=2",
        "-vf",
        f"drawtext=text='{label}':"
        f"fontsize=48:fontcolor={brand_color}:"
        f"x=(w-text_w)/2:y=(h-text_h)/2"
        f"{_fontfile_arg()}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    logger.debug("Creating title card: %s", " ".join(cmd))
    subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
    logger.info("Created title card: %s", output_path)
    return output_path


def _create_end_card(output_path: str, pw: int = 1080, ph: int = 1920) -> str:
    """Create a 2-second end card with Subscribe text on black background."""
    if not _has_drawtext():
        return _render_black_video(output_path, pw, ph)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=black:s={pw}x{ph}:d=2",
        "-vf",
        f"drawtext=text='Subscribe for more':"
        f"fontsize=52:fontcolor=white:"
        f"x=(w-text_w)/2:y=(h-text_h)/2"
        f"{_fontfile_arg()}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    logger.debug("Creating end card: %s", " ".join(cmd))
    subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
    logger.info("Created end card: %s", output_path)
    return output_path


def _render_compilation(
    rendered_clip_paths: list[str],
    segments: list[dict],
    video_id: str,
    preset: object | None = None,
    brand: BrandConfig | None = None,
) -> str | None:
    """Stitch already-rendered clips into a 'best of' compilation with title/end cards.

    Uses FFmpeg concat demuxer (requires same codecs) instead of xfade.
    Reuses clip files that were already rendered — no duplicate FFmpeg or Ollama calls.
    Returns presigned URL for the uploaded compilation, or None on failure.
    """
    if preset is None:
        from app.services.platforms import PlatformPreset
        preset = PlatformPreset(
            name="youtube_shorts", label="YouTube Shorts",
            width=1080, height=1920, max_duration=60.0,
        )
    pw, ph = preset.width, preset.height

    # Filter to clips that actually exist on disk
    valid_clips = [p for p in rendered_clip_paths[:5] if os.path.exists(p)]
    if len(valid_clips) < 3:
        logger.warning(
            "Not enough rendered clips for compilation (need 3, got %d)", len(valid_clips)
        )
        return None

    tmp_dir = tempfile.mkdtemp(prefix=f"compilation_{video_id}_")
    title_path = None
    end_path = None
    final_path = None
    concat_file = None
    try:
        first_text = segments[0].get("text", "")[:50] if segments else "Highlights"
        title_path = os.path.join(tmp_dir, "title.mp4")
        _create_title_card(first_text, title_path, pw, ph, brand)

        end_path = os.path.join(tmp_dir, "end.mp4")
        _create_end_card(end_path, pw, ph)

        all_paths = [title_path] + valid_clips + [end_path]

        concat_file = os.path.join(tmp_dir, "concat.txt")
        with open(concat_file, "w") as f:
            for p in all_paths:
                f.write(f"file '{p}'\n")

        final_path = os.path.join(tmp_dir, "best_of.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            "-movflags", "+faststart",
            final_path,
        ]
        logger.debug("Running compilation concat: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            raise RuntimeError(
                f"Compilation FFmpeg failed (rc={result.returncode}): {result.stderr[:500]}"
            )
        if not os.path.exists(final_path):
            raise RuntimeError("Compilation FFmpeg did not produce output")

        ensure_bucket()
        object_name = f"compilations/{video_id}/best_of.mp4"
        upload_file(final_path, object_name)
        presigned_url = get_presigned_url(object_name)
        logger.info("Uploaded compilation to %s", presigned_url)
        return presigned_url

    except Exception as exc:
        logger.warning("Compilation failed for video %s: %s", video_id, exc)
        return None
    finally:
        # Only clean up files we created (title, end, final, concat) — NOT the rendered clips
        if title_path and os.path.exists(title_path):
            os.unlink(title_path)
        if end_path and os.path.exists(end_path):
            os.unlink(end_path)
        if final_path and os.path.exists(final_path):
            os.unlink(final_path)
        if concat_file and os.path.exists(concat_file):
            os.unlink(concat_file)
        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)


def _render_clip_parallel(args: tuple) -> dict | None:
    """Render a single clip (runs in thread pool)."""
    input_path, start, end, caption, video_id, clip_idx, preset, hook_text, pre_metadata, watermark_filters, caption_style = args

    clip_filename = f"clip_{clip_idx:04d}.mp4"
    clip_dir = os.path.dirname(input_path)
    clip_path = os.path.join(clip_dir, clip_filename)

    _render_clip(input_path, clip_path, start, end, caption, preset, hook_text, watermark_filters, caption_style)

    moderation = moderate_segment(input_path, caption, start + 1.0)
    if not moderation["passed"]:
        logger.warning(
            "Clip %d flagged by moderation (reason=%s) — skipping upload",
            clip_idx,
            moderation["reason"],
        )
        if os.path.exists(clip_path):
            os.unlink(clip_path)
        return None

    file_url = _upload_clip(clip_path, video_id, clip_idx)

    thumbnail_path = _select_best_thumbnail(input_path, start, end)
    thumbnail_url = ""
    if thumbnail_path:
        try:
            ensure_bucket()
            thumb_object_name = f"clips/{video_id}/{clip_idx:04d}_thumb.jpg"
            upload_file(thumbnail_path, thumb_object_name)
            thumbnail_url = thumb_object_name
        except Exception as exc:
            logger.warning("Thumbnail upload failed for clip %d: %s", clip_idx, exc)
        finally:
            if os.path.exists(thumbnail_path):
                os.unlink(thumbnail_path)

    metadata = pre_metadata if pre_metadata else _generate_clip_metadata(caption)

    return {
        "clip_path": clip_path,
        "file_url": file_url,
        "start": start,
        "end": end,
        "caption": metadata.get("caption", caption[:1024]),
        "title": metadata.get("title", ""),
        "hashtags": metadata.get("hashtags", ""),
        "thumbnail_url": thumbnail_url,
        "viral_score": 0.0,
        "clip_idx": clip_idx,
        "moderation": moderation,
    }


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30, acks_late=True)
def run_render(self, video_id: str):
    session = SyncSessionLocal()
    clip_paths = []

    try:
        video_uuid = uuid.UUID(video_id)
        video = session.query(Video).filter(Video.id == video_uuid).first()
        if not video:
            raise ValueError(f"Video {video_id} not found")

        # Check user plan for watermark and resolution limits
        user = session.query(User).filter(User.id == video.user_id).first()
        needs_watermark = user and user.plan != "pro"

        # Load user preferences for branding
        prefs = user.preferences or {} if hasattr(user, 'preferences') else {}
        user_brand = BrandConfig(
            watermark_text=prefs.get("watermark_text", ""),
            primary_color=prefs.get("primary_color", "#FF6B35"),
        )
        caption_style = prefs.get("caption_style", "classic")
        music_track = prefs.get("music_track", "")

        preset = get_preset(video.platform or "youtube_shorts")

        # Resolution limit for free users
        if user and user.plan != "pro":
            if preset.width > 720 and preset.height > 720:
                scale_factor = 720 / max(preset.width, preset.height)
                preset.width = int(preset.width * scale_factor)
                preset.height = int(preset.height * scale_factor)
                preset.video_bitrate = "2M"

        # ── Smart Resume: skip if clips already exist (previous run completed) ──
        from app.models.clip import Clip
        existing_clips = session.query(Clip).filter(Clip.video_id == video_uuid).count()
        job = (
            session.query(Job)
            .filter(
                and_(
                    Job.video_id == video_uuid,
                    Job.type == JobTypeEnum.RENDER,
                )
            )
            .first()
        )
        render_done = existing_clips > 0 and job and job.status == JobStatusEnum.DONE

        if render_done:
            logger.info("Smart Resume: %d clips already exist for video %s, skipping render", existing_clips, video_id)
            return

        if job:
            job.status = JobStatusEnum.RUNNING
            job.progress = 0.0
            session.commit()

        segments = video.segments
        if not segments:
            logger.warning("No segments found for video %s, nothing to render", video_id)
            if job:
                job.status = JobStatusEnum.DONE
                job.progress = 1.0
                session.commit()
            return

        top_segments = _get_top_segments(segments)
        if not top_segments:
            logger.info("No high-scoring segments for video %s", video_id)
            if job:
                job.status = JobStatusEnum.DONE
                job.progress = 1.0
                session.commit()
            return

        # Batch-generate all hook texts and metadata in 1-2 Ollama calls
        # instead of 2× sequential calls per segment (was 20+ Ollama calls, now 1-2).
        logger.info("Batch-generating metadata for %d segments using Ollama", len(top_segments))
        broadcast_sync(video_id, "render", 0.0, "running", f"Analyzing metadata for {len(top_segments)} clips")

        pre_generated_data = _batch_generate_metadata(top_segments)

        broadcast_sync(video_id, "render", 0.0, "running", f"Rendering {len(top_segments)} clips")
        tmp_dir = tempfile.mkdtemp(prefix=f"render_{video_id}_")
        try:
            input_video_path = os.path.join(tmp_dir, "input.mp4")
            logger.info("Downloading video %s for rendering", video_id)
            download_file(video.source_url, input_video_path)

            # Build watermark filters for free users
            watermark_filters: list[str] | None = None
            if needs_watermark:
                watermark_filters = build_watermark_filter(user_brand, 1080, 1920)

            # Apply background music if configured
            music_track = prefs.get("music_track", "")
            if music_track and segments:
                from app.services.music import apply_backing_music, generate_backing_track
                music_path = tempfile.mktemp(suffix=".mp3")
                try:
                    video_duration = get_media_duration(input_video_path)
                    result = generate_backing_track(music_track, video_duration, music_path)
                    if result:
                        speech_segments = [{"start": s["start"], "end": s["end"]} for s in segments if s.get("text", "").strip()]
                        input_video_path = apply_backing_music(input_video_path, music_path, speech_segments, input_video_path)
                except Exception as e:
                    logger.warning("Background music failed: %s", e)
                finally:
                    if os.path.exists(music_path):
                        os.unlink(music_path)

            total = len(top_segments)
            render_args = [
                (input_video_path, seg["start"], seg["end"],
                 seg.get("text", ""), video_id, idx, preset,
                 pre_generated_data[idx][0], pre_generated_data[idx][1],
                 watermark_filters, caption_style)
                for idx, seg in enumerate(top_segments)
            ]

            # Parallel render
            from app.services.device import get_optimal_threads
            render_workers = get_optimal_threads()
            with ThreadPoolExecutor(max_workers=render_workers) as executor:
                futures = {
                    executor.submit(_render_clip_parallel, args): args
                    for args in render_args
                }
                results = []
                for future in as_completed(futures):
                    clip_data = future.result()
                    if clip_data is None:
                        continue
                    results.append(clip_data)
                    clip_paths.append(clip_data["clip_path"])

            if not results:
                logger.warning("All clips were flagged by moderation for video %s", video_id)
                if job:
                    job.status = JobStatusEnum.DONE
                    job.progress = 1.0
                    session.commit()
                return

            # Sort by clip_idx to maintain order
            results.sort(key=lambda r: r["clip_idx"])

            for idx, clip_data in enumerate(results):
                seg = top_segments[clip_data["clip_idx"]]

                clip_record = Clip(
                    id=uuid.uuid4(),
                    video_id=video_uuid,
                    start_time=clip_data["start"],
                    end_time=clip_data["end"],
                    caption=clip_data["caption"],
                    score=seg.get("viral_score", seg.get("score", 0.0)),
                    file_url=clip_data["file_url"],
                    title=clip_data["title"],
                    hashtags=clip_data["hashtags"],
                    thumbnail_url=clip_data.get("thumbnail_url", ""),
                )
                session.add(clip_record)

                if job:
                    job.progress = (idx + 1) / total
                session.commit()
                broadcast_sync(video_id, "render", (idx + 1) / total, "running", f"Rendered {idx + 1}/{total} clips")

            # Build compilation from already-rendered clips (no re-rendering)
            if len(results) >= 3:
                comp_clip_paths = [
                    r["clip_path"] for r in results[:5]
                    if r.get("clip_path") and os.path.exists(r["clip_path"])
                ]
                comp_segments = [
                    {"start": r["start"], "end": r["end"], "text": r.get("caption", "")}
                    for r in results[:5]
                ]
                comp_url = _render_compilation(comp_clip_paths, comp_segments, video_id, preset, user_brand)
                if comp_url:
                    logger.info(
                        "Compilation URL for video %s: %s", video_id, comp_url
                    )
                else:
                    logger.warning("Compilation skipped for video %s", video_id)
            else:
                logger.info(
                    "Skipping compilation for video %s: need 3+ clips, have %d",
                    video_id, len(results),
                )

            video.status = VideoStatusEnum.COMPLETED

            if job:
                job.status = JobStatusEnum.DONE
                job.progress = 1.0
            session.commit()
            broadcast_sync(video_id, "render", 1.0, "completed", f"Rendered {len(results)} clips")

            from app.services.webhooks import fire_event_sync
            fire_event_sync(video_id, "render.completed", {
                "status": "completed",
                "clips_count": len(results),
            })

            logger.info(
                "Rendered %d clips for video %s",
                len(top_segments),
                video_id,
            )

        except Exception:
            raise
        finally:
            if os.path.exists(tmp_dir):
                shutil.rmtree(tmp_dir, ignore_errors=True)

    except Exception as exc:
        logger.exception("Render failed for video %s", video_id)
        try:
            video = session.query(Video).filter(Video.id == uuid.UUID(video_id)).first()
            if video:
                video.status = VideoStatusEnum.FAILED
            job = (
                session.query(Job)
                .filter(
                    and_(
                        Job.video_id == uuid.UUID(video_id),
                        Job.type == JobTypeEnum.RENDER,
                    )
                )
                .first()
            )
            if job:
                job.status = JobStatusEnum.FAILED
            session.commit()
        except Exception:
            session.rollback()
        if self and hasattr(self, "retry"):
            raise self.retry(exc=exc)
        raise exc
    finally:
        session.close()
