import logging
import os
import sys
import time
from typing import Any

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

os.environ.setdefault("OMP_NUM_THREADS", "6")
os.environ.setdefault("TORCH_NUM_THREADS", "6")

# ── MLX Whisper availability ──────────────────────────────────────────────
_mlx_available: bool | None = None

def _has_mlx() -> bool:
    """Check if MLX Whisper is available (Apple Silicon only)."""
    global _mlx_available
    if _mlx_available is not None:
        return _mlx_available
    if sys.platform != "darwin":
        _mlx_available = False
        return False
    try:
        import mlx_whisper
        _mlx_available = True
        logger.info("MLX Whisper available — will use Metal GPU for transcription")
    except ImportError:
        _mlx_available = False
        logger.info("MLX Whisper not available — falling back to faster-whisper CPU")
    return _mlx_available


# ── faster-whisper CPU model cache ────────────────────────────────────────
_cpu_model: dict[str, Any] = {}

def _get_cpu_model(model_size: str | None = None) -> Any:
    global _cpu_model
    model_size = model_size or settings.WHISPER_MODEL_SIZE
    if model_size in _cpu_model:
        return _cpu_model[model_size]

    from faster_whisper import WhisperModel
    from app.services.device import get_whisper_compute_type, get_whisper_device
    device = get_whisper_device()
    compute_type = get_whisper_compute_type(device)

    cores = os.cpu_count() or 4
    cpu_threads = max(4, min(8, cores // 2))

    logger.info("Loading faster-whisper %s on %s (compute_type=%s, cpu_threads=%d)",
                model_size, device, compute_type, cpu_threads)
    m = WhisperModel(model_size, device=device, compute_type=compute_type, cpu_threads=cpu_threads)
    logger.info("faster-whisper model loaded")
    _cpu_model[model_size] = m
    return m


# ── Model size auto-selection ─────────────────────────────────────────────
def _auto_model_size(audio_path: str) -> str:
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


# ── Public API ────────────────────────────────────────────────────────────
def get_model(model_size: str | None = None) -> Any:
    """Get the CPU model (for backward compat with tests)."""
    return _get_cpu_model(model_size)


def _transcribe_groq(audio_path: str) -> dict[str, Any]:
    """Transcribe using Groq serverless Whisper API."""
    import httpx
    
    logger.info("Transcribing using Groq Cloud Whisper API...")
    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}"
    }
    
    with open(audio_path, "rb") as f:
        files = {
            "file": (os.path.basename(audio_path), f, "audio/wav")
        }
        data = {
            "model": getattr(settings, "GROQ_WHISPER_MODEL", "whisper-large-v3"),
            "response_format": "verbose_json"
        }
        
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, files=files, data=data, headers=headers)
            resp.raise_for_status()
            result = resp.json()
            
    segments = []
    for seg in result.get("segments", []):
        start = round(seg.get("start", 0.0), 2)
        end = round(seg.get("end", 0.0), 2)
        text = seg.get("text", "").strip()
        
        # Synthesize word level timestamps to support video word highlights
        text_words = text.split()
        words = []
        if text_words:
            duration = max(0.1, end - start)
            word_dur = duration / len(text_words)
            for i, w in enumerate(text_words):
                words.append({
                    "word": w,
                    "start": round(start + i * word_dur, 2),
                    "end": round(start + (i + 1) * word_dur, 2),
                    "probability": 1.0
                })
                
        segments.append({
            "start": start,
            "end": end,
            "text": text,
            "words": words
        })
        
    duration = round(result.get("duration", 0.0), 2)
    if duration == 0 and segments:
        duration = segments[-1]["end"]
        
    return {
        "language": result.get("language", "en"),
        "language_probability": 1.0,
        "duration": duration,
        "segments": segments
    }


def transcribe_audio(audio_path: str, model_size: str | None = None) -> dict[str, Any]:
    if settings.GROQ_API_KEY:
        return _transcribe_groq(audio_path)

    if model_size is None:
        model_size = _auto_model_size(audio_path)

    if _has_mlx():
        return _transcribe_mlx(audio_path, model_size)
    return _transcribe_cpu(audio_path, model_size)


# ── MLX Whisper (Metal GPU — 10-15x faster) ──────────────────────────────
def _transcribe_mlx(audio_path: str, model_size: str = "large-v3-turbo") -> dict[str, Any]:
    """Transcribe using MLX Whisper on Apple Metal GPU."""
    import mlx_whisper

    # Map model sizes to HuggingFace MLX model IDs
    model_map = {
        "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
        "large-v3": "mlx-community/whisper-large-v3-turbo",
        "medium": "mlx-community/whisper-medium-mlx",
        "small": "mlx-community/whisper-small-mlx",
    }
    requested_model = model_map.get(model_size, "mlx-community/whisper-large-v3-turbo")

    # Check cache and fall back if requested model not cached
    def _is_cached(m_id: str) -> bool:
        try:
            cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
            folder = f"models--{m_id.replace('/', '--')}"
            path = os.path.join(cache_dir, folder)
            if not os.path.isdir(path):
                return False
            blobs = os.path.join(path, "blobs")
            if os.path.isdir(blobs):
                if any(f.endswith(".incomplete") for f in os.listdir(blobs)):
                    return False
            return True
        except Exception:
            return False

    mlx_model = requested_model
    if not _is_cached(requested_model):
        logger.info("MLX Whisper model %s not cached. Checking for alternative cached models...", requested_model)
        # Try finding a fully cached alternative
        for alt_size in ["large-v3-turbo", "medium", "small"]:
            alt_model = model_map[alt_size]
            if alt_model != requested_model and _is_cached(alt_model):
                logger.info("Found cached alternative: %s. Using it to avoid download.", alt_model)
                mlx_model = alt_model
                break

    logger.info("Transcribing with MLX Whisper on Metal GPU (model=%s)", mlx_model)
    t0 = time.time()

    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo=mlx_model,
        word_timestamps=True,
        verbose=False,
    )

    elapsed = time.time() - t0
    logger.info("MLX Whisper transcription completed in %.2fs", elapsed)

    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip(),
            "words": [
                {
                    "word": w["word"].strip(),
                    "start": round(w["start"], 2),
                    "end": round(w["end"], 2),
                    "probability": w.get("probability", 0.0),
                }
                for w in seg.get("words", [])
            ],
        })

    duration = round(segments[-1]["end"], 2) if segments else 0
    return {
        "language": result.get("language", "en"),
        "language_probability": 1.0,
        "duration": duration,
        "segments": segments,
    }


# ── faster-whisper CPU (fallback) ────────────────────────────────────────
def _transcribe_cpu(audio_path: str, model_size: str = "large-v3") -> dict[str, Any]:
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    from concurrent.futures import ThreadPoolExecutor

    model = _get_cpu_model(model_size)

    # Decode audio to numpy array for chunking
    logger.info("Decoding audio for parallel transcription...")
    audio = decode_audio(audio_path, sampling_rate=16000)
    total_duration = len(audio) / 16000
    logger.info("Audio decoded: %.2f seconds", total_duration)

    t0 = time.time()

    # For short audio (<= 2 min), use sequential transcription (no overhead)
    if total_duration <= 120:
        segments, info = model.transcribe(
            audio,
            beam_size=1,
            best_of=1,
            word_timestamps=True,
        )
        results = []
        for segment in segments:
            results.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip(),
                "words": [
                    {
                        "word": w.word,
                        "start": round(w.start, 2),
                        "end": round(w.end, 2),
                        "probability": w.probability,
                    }
                    for w in (segment.words or [])
                ],
            })
        elapsed = time.time() - t0
        logger.info("Sequential transcription completed in %.2fs", elapsed)
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": round(info.duration, 2) if info.duration else 0,
            "segments": results,
        }

    # For long audio, use parallel chunked transcription
    # Step 1: Detect language from first 30 seconds
    sample_30s = audio[:16000 * 30]
    _, detect_info = model.transcribe(sample_30s, beam_size=1, best_of=1)
    detected_lang = detect_info.language
    detected_prob = detect_info.language_probability
    logger.info("Pre-detected language: %s (probability: %.2f)", detected_lang, detected_prob)

    # Step 2: Split audio into chunks
    sr = 16000
    chunk_len_seconds = 60  # 1-minute chunks
    chunk_samples = chunk_len_seconds * sr

    chunks = []
    for offset in range(0, len(audio), chunk_samples):
        chunk_audio = audio[offset : offset + chunk_samples]
        chunk_start = offset / sr
        chunks.append((chunk_audio, chunk_start))

    logger.info("Split audio into %d chunks of %ds for parallel transcription", len(chunks), chunk_len_seconds)

    # Step 3: Transcribe chunks in parallel
    cores = os.cpu_count() or 4
    max_workers = max(2, min(4, cores // 2))

    def _transcribe_chunk(args):
        chunk_audio, chunk_start = args
        segs, _ = model.transcribe(
            chunk_audio,
            beam_size=1,
            best_of=1,
            word_timestamps=True,
            language=detected_lang,
        )
        chunk_results = []
        for segment in segs:
            chunk_results.append({
                "start": round(segment.start + chunk_start, 2),
                "end": round(segment.end + chunk_start, 2),
                "text": segment.text.strip(),
                "words": [
                    {
                        "word": w.word,
                        "start": round(w.start + chunk_start, 2),
                        "end": round(w.end + chunk_start, 2),
                        "probability": w.probability,
                    }
                    for w in (segment.words or [])
                ],
            })
        return chunk_results

    all_segments = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_transcribe_chunk, chunk) for chunk in chunks]
        for future in futures:
            all_segments.extend(future.result())

    # Sort by start time to ensure chronological order
    all_segments.sort(key=lambda s: s["start"])

    elapsed = time.time() - t0
    logger.info("Parallel transcription complete in %.2fs: %d segments from %d chunks",
                elapsed, len(all_segments), len(chunks))

    return {
        "language": detected_lang,
        "language_probability": detected_prob,
        "duration": round(total_duration, 2),
        "segments": all_segments,
    }

