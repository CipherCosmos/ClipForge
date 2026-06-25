"""GPU/CPU auto-detection utility for ClipForge services."""

import logging

logger = logging.getLogger(__name__)


def get_optimal_device() -> str:
    """Detect the optimal compute device.

    Returns "cuda" if CUDA GPU is available,
    "mps" if Apple Silicon Metal Performance Shaders is available,
    otherwise "cpu".
    """
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        logger.debug("torch not installed, falling back to cpu")
    except Exception as e:
        logger.debug("Device detection failed: %s, falling back to cpu", e)
    return "cpu"


def get_whisper_device() -> str:
    """Return device compatible with faster-whisper (CTranslate2).

    CTranslate2 only supports "cuda" and "cpu", not "mps".
    """
    device = get_optimal_device()
    if device == "mps":
        return "cpu"
    return device


def get_whisper_compute_type(device: str | None = None) -> str:
    """Return the optimal whisper compute type for the given or detected device.

    - "cuda" -> "float16"
    - "cpu"  -> "int8"
    """
    if device is None:
        device = get_whisper_device()
    return {"cuda": "float16", "cpu": "int8"}.get(device, "int8")
