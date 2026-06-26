"""SenseVoice-based emotion + event detection and audio prosody analysis.
Free/open-source: MIT license (SenseVoice), CPU-compatible.
"""

import logging
import os
import subprocess
import tempfile
from typing import Any

from app.services.device import get_optimal_device

logger = logging.getLogger(__name__)


DEVICE: str = get_optimal_device()

_model = None


def _get_sensevoice_model():
    global _model
    if _model is None:
        try:
            from funasr import AutoModel
            _model = AutoModel(
                model="iic/SenseVoiceSmall",
                disable_update=True,
                disable_progress_bar=True,
            )
        except ImportError:
            logger.warning("funasr not installed, SenseVoice disabled")
            return None
    return _model


def _analyze_with_sensevoice(audio_path: str) -> dict[str, Any]:
    """Run SenseVoice on an audio file. Returns emotions + events."""
    model = _get_sensevoice_model()
    if model is None:
        return {"emotions": [], "events": []}
    try:
        result = model.generate(input=audio_path)
        emotions = []
        events = []
        for item in result if isinstance(result, list) else [result]:
            text = ""
            if isinstance(item, dict):
                text = item.get("text", "")
            else:
                text = getattr(item, "text", "")

            # Scan text for emotion tags
            for tag, emotion_name in [("<|angry|>", "angry"), ("<|sad|>", "sad"), ("<|happy|>", "happy"), ("<|neutral|>", "neutral")]:
                if tag in text:
                    emotions.append({
                        "start": 0.0,
                        "end": 3600.0,
                        "emotion": emotion_name,
                        "confidence": 0.8,
                    })

            # Scan text for event tags
            for tag, event_name in [("<|laughter|>", "laughter"), ("<|applause|>", "applause"), ("<|music|>", "music"), ("<|singing|>", "music")]:
                if tag in text:
                    events.append({
                        "start": 0.0,
                        "end": 3600.0,
                        "event": event_name,
                        "confidence": 0.8,
                    })

            # Support direct attributes if returned in custom format
            if isinstance(item, dict):
                if "emotion" in item and item["emotion"]:
                    emotions.append({"start": item.get("start", 0.0), "end": item.get("end", 3600.0), "emotion": item["emotion"], "confidence": item.get("confidence", 0.8)})
                if "event" in item and item["event"]:
                    events.append({"start": item.get("start", 0.0), "end": item.get("end", 3600.0), "event": item["event"], "confidence": item.get("confidence", 0.8)})
            else:
                if hasattr(item, "emotion") and item.emotion:
                    emotions.append({"start": getattr(item, "start", 0.0), "end": getattr(item, "end", 3600.0), "emotion": item.emotion, "confidence": getattr(item, "confidence", 0.8)})
                if hasattr(item, "event") and item.event:
                    events.append({"start": getattr(item, "start", 0.0), "end": getattr(item, "end", 3600.0), "event": item.event, "confidence": getattr(item, "confidence", 0.8)})

        return {"emotions": emotions, "events": events}
    except Exception as e:
        logger.debug("SenseVoice analysis failed: %s", e)
        return {"emotions": [], "events": []}


def _extract_prosody_features(audio_path: str) -> dict[str, float]:
    """Extract prosody features (energy, ZCR, spectral centroid) using librosa."""
    try:
        import librosa
        import numpy as np
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        if len(y) == 0:
            return {}
        rms = librosa.feature.rms(y=y)[0]
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        return {
            "energy_mean": float(np.mean(rms)),
            "energy_std": float(np.std(rms)),
            "energy_peak": float(np.max(rms)),
            "zcr_mean": float(np.mean(zcr)),
            "zcr_std": float(np.std(zcr)),
            "spectral_centroid_mean": float(np.mean(spec_cent)),
            "energy_variance": float(np.var(rms)),
        }
    except ImportError:
        logger.debug("librosa not installed, prosody disabled")
        return {}
    except Exception as e:
        logger.debug("Prosody extraction failed: %s", e)
        return {}


def extract_segment_emotion(video_path: str, start: float, end: float) -> dict[str, Any]:
    """Extract emotion + audio events for a video segment.

    Slices the segment to a temp WAV, runs SenseVoice analysis.
    Falls back to empty results if SenseVoice unavailable.
    """
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        subprocess.run([
            "ffmpeg", "-y",
            "-ss", str(start), "-i", video_path,
            "-t", str(end - start),
            "-ar", "16000", "-ac", "1",
            tmp_path,
        ], capture_output=True, check=True, timeout=120)
        return _analyze_with_sensevoice(tmp_path)
    except Exception as e:
        logger.debug("Segment emotion extraction failed: %s", e)
        return {"emotions": [], "events": []}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def analyze_full_audio_emotions(audio_path: str) -> dict[str, Any]:
    """Run SenseVoice on the full audio file. Returns emotions + events across the whole file."""
    return _analyze_with_sensevoice(audio_path)


def extract_full_audio_features(audio_path: str) -> dict[str, Any]:
    """Extract prosody arrays from full audio file in a single load (in-process)."""
    try:
        import librosa
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        if len(y) == 0:
            return {}
        
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        zcr = librosa.feature.zero_crossing_rate(y, hop_length=hop_length)[0]
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
        
        return {
            "sr": sr,
            "hop_length": hop_length,
            "rms": rms,
            "zcr": zcr,
            "spectral_centroid": spec_cent,
        }
    except Exception as e:
        logger.debug("Full prosody extraction failed: %s", e)
        return {}


def get_segment_prosody_from_full(features: dict, start: float, end: float) -> dict[str, float]:
    """Slice and compute segment prosody statistics from pre-extracted full audio features."""
    if not features:
        return {}
    
    try:
        import numpy as np
        sr = features["sr"]
        hop_length = features["hop_length"]
        rms = features["rms"]
        zcr = features["zcr"]
        spec_cent = features["spectral_centroid"]
        
        start_frame = max(0, int(start * sr / hop_length))
        end_frame = min(len(rms), int(end * sr / hop_length))
        
        if start_frame >= end_frame:
            return {}
            
        rms_seg = rms[start_frame:end_frame]
        zcr_seg = zcr[start_frame:end_frame]
        spec_cent_seg = spec_cent[start_frame:end_frame]
        
        if len(rms_seg) == 0:
            return {}
            
        return {
            "energy_mean": float(np.mean(rms_seg)),
            "energy_std": float(np.std(rms_seg)),
            "energy_peak": float(np.max(rms_seg)),
            "zcr_mean": float(np.mean(zcr_seg)),
            "zcr_std": float(np.std(zcr_seg)),
            "spectral_centroid_mean": float(np.mean(spec_cent_seg)),
            "energy_variance": float(np.var(rms_seg)),
        }
    except Exception as e:
        logger.debug("Slicing segment prosody failed: %s", e)
        return {}


