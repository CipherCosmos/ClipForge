"""Transcription service — auto-selects best backend for current platform.

Backend priority:
  1. Groq Cloud API (if GROQ_API_KEY is set) — fastest, ~100x realtime
  2. MLX Whisper (macOS Apple Silicon) — Metal GPU, ~10x realtime
  3. faster-whisper CUDA (Windows/Linux with NVIDIA GPU) — ~5-10x realtime
  4. faster-whisper CPU (fallback, any OS) — ~1-3x realtime with int8
"""

import logging
import os
import sys
import time
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


# ── Thread counts ───────────────────────────────────────────────────────────
_dynamic_threads = max(2, min(8, (os.cpu_count() or 4) // 2))
os.environ.setdefault("OMP_NUM_THREADS", str(_dynamic_threads))
os.environ.setdefault("TORCH_NUM_THREADS", str(_dynamic_threads))


# ── MLX Whisper availability (Apple Silicon only) ──────────────────────────
_mlx_available: bool | None = None


def _has_mlx() -> bool:
    global _mlx_available
    if _mlx_available is not None:
        return _mlx_available
    if sys.platform != "darwin":
        _mlx_available = False
        return False
    try:
        import mlx_whisper
        _mlx_available = True
        logger.info("MLX Whisper available — will use Metal GPU")
    except ImportError:
        _mlx_available = False
    return _mlx_available


# ── faster-whisper model cache ─────────────────────────────────────────────
_local_model: dict[str, Any] = {}


def _get_local_model(model_size: str | None = None) -> Any:
    global _local_model
    model_size = model_size or settings.WHISPER_MODEL_SIZE
    if model_size in _local_model:
        return _local_model[model_size]

    from faster_whisper import WhisperModel
    from app.services.device import get_whisper_compute_type, get_whisper_device, get_optimal_threads

    device = get_whisper_device()
    compute_type = get_whisper_compute_type(device)
    threads = get_optimal_threads()

    logger.info("Loading Whisper %s on %s (compute=%s, threads=%d)",
                model_size, device, compute_type, threads)
    m = WhisperModel(model_size, device=device, compute_type=compute_type, cpu_threads=threads)
    _local_model[model_size] = m
    return m


# ── Model size auto-selection ─────────────────────────────────────────────
def _auto_model_size(audio_path: str) -> str:
    """Pick smaller model for very long audio (over 30 min) to save memory."""
    try:
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True, timeout=15
        )
        duration = float(result.stdout.strip())
        if duration > 7200:
            return "small"
        if duration > 1800:
            return "medium"
    except Exception:
        pass
    return settings.WHISPER_MODEL_SIZE


# ── Public API ─────────────────────────────────────────────────────────────
def get_model(model_size: str | None = None) -> Any:
    return _get_local_model(model_size)


# ── Groq Cloud API (fastest, any platform) ─────────────────────────────────
def _transcribe_groq(audio_path: str) -> dict[str, Any]:
    import httpx

    logger.info("Transcribing via Groq Cloud Whisper API...")
    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}

    with open(audio_path, "rb") as f:
        files = {"file": (os.path.basename(audio_path), f, "audio/wav")}
        data = {
            "model": getattr(settings, "GROQ_WHISPER_MODEL", "whisper-large-v3"),
            "response_format": "verbose_json",
        }
        with httpx.Client(timeout=180.0) as client:
            resp = client.post(url, files=files, data=data, headers=headers)
            resp.raise_for_status()
            result = resp.json()

    segments = []
    for seg in result.get("segments", []):
        start = round(seg.get("start", 0.0), 2)
        end = round(seg.get("end", 0.0), 2)
        text = seg.get("text", "").strip()
        text_words = text.split()
        words = []
        if text_words:
            duration = max(0.1, end - start)
            word_dur = duration / len(text_words)
            for i, w in enumerate(text_words):
                words.append({
                    "word": w, "start": round(start + i * word_dur, 2),
                    "end": round(start + (i + 1) * word_dur, 2), "probability": 1.0,
                })
        segments.append({"start": start, "end": end, "text": text, "words": words})

    duration = round(result.get("duration", 0.0), 2)
    if duration == 0 and segments:
        duration = segments[-1]["end"]

    return {
        "language": result.get("language", "en"),
        "language_probability": 1.0,
        "duration": duration,
        "segments": segments,
    }


# ── Main entry point ───────────────────────────────────────────────────────
def transcribe_audio(audio_path: str, model_size: str | None = None) -> dict[str, Any]:
    """Transcribe audio using the best available backend for this platform."""
    if settings.GROQ_API_KEY:
        return _transcribe_groq(audio_path)

    if model_size is None:
        model_size = _auto_model_size(audio_path)

    if _has_mlx():
        return _transcribe_mlx(audio_path, model_size)

    return _transcribe_local(audio_path, model_size)


# ── MLX Whisper (macOS Metal GPU — ~10x realtime) ─────────────────────────
def _transcribe_mlx(audio_path: str, model_size: str = "large-v3-turbo") -> dict[str, Any]:
    import mlx_whisper

    model_map = {
        "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
        "large-v3": "mlx-community/whisper-large-v3-turbo",
        "medium": "mlx-community/whisper-medium-mlx",
        "small": "mlx-community/whisper-small-mlx",
    }
    requested_model = model_map.get(model_size, "mlx-community/whisper-large-v3-turbo")

    def _is_cached(m_id: str) -> bool:
        try:
            cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
            folder = f"models--{m_id.replace('/', '--')}"
            path = os.path.join(cache_dir, folder)
            if not os.path.isdir(path):
                return False
            blobs = os.path.join(path, "blobs")
            if os.path.isdir(blobs) and any(f.endswith(".incomplete") for f in os.listdir(blobs)):
                return False
            return True
        except Exception:
            return False

    mlx_model = requested_model
    if not _is_cached(requested_model):
        for alt_size in ["large-v3-turbo", "medium", "small"]:
            alt_model = model_map[alt_size]
            if alt_model != requested_model and _is_cached(alt_model):
                mlx_model = alt_model
                break

    logger.info("Transcribing with MLX Whisper on Metal GPU (model=%s)", mlx_model)
    t0 = time.time()

    result = mlx_whisper.transcribe(
        audio_path, path_or_hf_repo=mlx_model,
        word_timestamps=True, verbose=False,
    )

    elapsed = time.time() - t0
    logger.info("MLX Whisper done in %.2fs", elapsed)

    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip(),
            "words": [{
                "word": w["word"].strip(),
                "start": round(w["start"], 2),
                "end": round(w["end"], 2),
                "probability": w.get("probability", 0.0),
            } for w in seg.get("words", [])],
        })

    duration = round(segments[-1]["end"], 2) if segments else 0
    return {
        "language": result.get("language", "en"),
        "language_probability": 1.0,
        "duration": duration,
        "segments": segments,
    }


# ── faster-whisper (CUDA GPU or CPU) ──────────────────────────────────────
def _transcribe_local(audio_path: str, model_size: str = "large-v3-turbo") -> dict[str, Any]:
    """Transcribe using faster-whisper on the detected device (CUDA or CPU).

    On Windows/Linux with NVIDIA GPU: uses CUDA float16 for ~5-10x realtime.
    On any system without GPU: uses CPU int8.
    """
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    from concurrent.futures import ThreadPoolExecutor
    from app.services.device import get_whisper_device, get_cuda_vram_gb

    model = _get_local_model(model_size)
    device = get_whisper_device()
    is_cuda = device == "cuda"

    logger.info("Decoding audio for transcription...")
    audio = decode_audio(audio_path, sampling_rate=16000)
    total_duration = len(audio) / 16000
    logger.info("Audio decoded: %.2f seconds on %s", total_duration, device)

    t0 = time.time()

    # CUDA path: single-pass, larger beam for quality
    if is_cuda:
        vram_gb = get_cuda_vram_gb()
        beam = 5 if vram_gb >= 8 else 3
        logger.info("CUDA transcription: beam_size=%d, VRAM=%.1fGB", beam, vram_gb)
        segments, info = model.transcribe(
            audio, beam_size=beam, word_timestamps=True,
        )
        results = []
        for segment in segments:
            results.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip(),
                "words": [{
                    "word": w.word, "start": round(w.start, 2),
                    "end": round(w.end, 2), "probability": w.probability,
                } for w in (segment.words or [])],
            })
        elapsed = time.time() - t0
        logger.info("CUDA transcription done in %.2fs (x%.1f realtime)",
                    elapsed, total_duration / elapsed if elapsed else 0)
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": round(info.duration, 2) if info.duration else 0,
            "segments": results,
        }

    # CPU path: sequential for short audio, parallel chunks for long
    if total_duration <= 120:
        segments, info = model.transcribe(
            audio, beam_size=1, best_of=1, word_timestamps=True,
        )
        results = []
        for segment in segments:
            results.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip(),
                "words": [{
                    "word": w.word, "start": round(w.start, 2),
                    "end": round(w.end, 2), "probability": w.probability,
                } for w in (segment.words or [])],
            })
        elapsed = time.time() - t0
        logger.info("CPU transcription done in %.2fs", elapsed)
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": round(info.duration, 2) if info.duration else 0,
            "segments": results,
        }

    # Long audio CPU path: parallel chunked transcription
    sample_30s = audio[:16000 * 30]
    _, detect_info = model.transcribe(sample_30s, beam_size=1, best_of=1)
    detected_lang = detect_info.language
    logger.info("Detected language: %s", detected_lang)

    sr = 16000
    chunk_len_seconds = 60
    chunk_samples = chunk_len_seconds * sr
    chunks = [(audio[off:off + chunk_samples], off / sr) for off in range(0, len(audio), chunk_samples)]

    from app.services.device import get_optimal_threads
    max_workers = get_optimal_threads()

    def _transcribe_chunk(args):
        chunk_audio, chunk_start = args
        segs, _ = model.transcribe(
            chunk_audio, beam_size=1, best_of=1,
            word_timestamps=True, language=detected_lang,
        )
        return [{
            "start": round(s.start + chunk_start, 2),
            "end": round(s.end + chunk_start, 2),
            "text": s.text.strip(),
            "words": [{"word": w.word, "start": round(w.start + chunk_start, 2),
                        "end": round(w.end + chunk_start, 2), "probability": w.probability}
                      for w in (s.words or [])],
        } for s in segs]

    all_segments = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_transcribe_chunk, chunk) for chunk in chunks]
        for future in futures:
            all_segments.extend(future.result())

    all_segments.sort(key=lambda s: s["start"])
    elapsed = time.time() - t0
    logger.info("Parallel CPU transcription done in %.2fs: %d segments", elapsed, len(all_segments))

    return {
        "language": detected_lang,
        "language_probability": detect_info.language_probability,
        "duration": round(total_duration, 2),
        "segments": all_segments,
    }
