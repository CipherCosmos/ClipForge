"""Content moderation gate — NSFW/profanity/violence detection.
Free/open-source: HuggingFace transformers + Ollama text moderation.
"""
import logging
import os
import threading
import tempfile
from typing import Any

import cv2

logger = logging.getLogger(__name__)

# Thread-safe NSFW classifier singleton — prevents race-condition reloading
_nsfw_classifier = None
_nsfw_lock = threading.Lock()
_nsfw_load_attempted = False


def _get_nsfw_classifier():
    """Thread-safe lazy singleton for NSFW image classifier."""
    global _nsfw_classifier, _nsfw_load_attempted
    if _nsfw_load_attempted:
        return _nsfw_classifier
    with _nsfw_lock:
        if _nsfw_load_attempted:
            return _nsfw_classifier
        try:
            from transformers import pipeline
            from app.services.device import get_optimal_device
            nsfw_device = get_optimal_device()
            nsfw_device_id = -1 if nsfw_device == "cpu" else 0
            _nsfw_classifier = pipeline(
                "image-classification",
                model="Falconsai/nsfw_image_detection",
                device=nsfw_device_id,
            )
            # After first successful load, prevent HuggingFace HTTP checks
            os.environ["HF_HUB_OFFLINE"] = "1"
            logger.info("NSFW image classifier loaded (singleton)")
        except Exception as e:
            logger.debug("NSFW image classifier not available: %s", e)
        _nsfw_load_attempted = True
    return _nsfw_classifier


def moderate_image(video_path: str, timestamp: float) -> dict[str, Any]:
    """Check a video frame for NSFW content using OpenCV frame extraction.

    Returns: {"nsfw": bool, "confidence": float, "label": str}
    Falls back to {"nsfw": False, "confidence": 0.0, "label": "unknown"} if classifier unavailable.
    """
    classifier = _get_nsfw_classifier()
    if classifier is None:
        return {"nsfw": False, "confidence": 0.0, "label": "unknown"}

    fd, frame_path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    try:
        # Use OpenCV instead of FFmpeg subprocess for frame extraction
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"nsfw": False, "confidence": 0.0, "label": "error"}
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return {"nsfw": False, "confidence": 0.0, "label": "error"}
        cv2.imwrite(frame_path, frame)

        results = classifier(frame_path)
        if results:
            top = results[0]
            is_nsfw = top["label"].lower() == "nsfw"
            return {
                "nsfw": is_nsfw,
                "confidence": float(top["score"]),
                "label": top["label"],
            }
        return {"nsfw": False, "confidence": 0.0, "label": "unknown"}
    except Exception as e:
        logger.debug("Image moderation failed: %s", e)
        return {"nsfw": False, "confidence": 0.0, "label": "error"}
    finally:
        if os.path.exists(frame_path):
            os.unlink(frame_path)


def moderate_text(text: str) -> dict[str, Any]:
    """Check text for profanity/harmful content using simple keyword matching.

    Returns: {"flagged": bool, "categories": list[str]}
    """
    text_lower = text.lower()

    profanity_keywords = [
        "fuck", "shit", "ass", "bitch", "damn", "crap", "dick", "piss",
        "slut", "whore", "bastard", "douche",
    ]
    violence_keywords = [
        "kill", "murder", "death", "die", "shoot", "stab", "attack",
        "bomb", "terror", "weapon", "gun",
    ]
    hate_keywords = [
        "nazi", "racist", "white suprem", "kkk",
    ]

    flagged_categories = []
    for kw in profanity_keywords:
        if kw in text_lower:
            flagged_categories.append("profanity")
            break

    for kw in violence_keywords:
        if kw in text_lower:
            flagged_categories.append("violence")
            break

    for kw in hate_keywords:
        if kw in text_lower:
            flagged_categories.append("hate_speech")
            break

    return {
        "flagged": len(flagged_categories) > 0,
        "categories": flagged_categories,
    }


def moderate_segment(video_path: str, transcript: str, timestamp: float) -> dict[str, Any]:
    """Full moderation check for a video segment.

    Combines image NSFW detection + text moderation.
    Returns: {"passed": bool, "image": dict, "text": dict, "reason": str}
    """
    image_result = moderate_image(video_path, timestamp)
    text_result = moderate_text(transcript)

    if image_result.get("nsfw") and image_result.get("confidence", 0) > 0.7:
        return {
            "passed": False,
            "image": image_result,
            "text": text_result,
            "reason": "nsfw_image",
        }

    if text_result.get("flagged"):
        return {
            "passed": False,
            "image": image_result,
            "text": text_result,
            "reason": f"flagged_text: {','.join(text_result['categories'])}",
        }

    return {
        "passed": True,
        "image": image_result,
        "text": text_result,
        "reason": "",
    }
