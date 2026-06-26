"""GPU/CPU auto-detection utility for ClipForge services.

Auto-detects platform and selects optimal device:
  - macOS Apple Silicon  → MPS (Metal GPU) via MLX Whisper
  - Windows/Linux NVIDIA → CUDA (GPU) via faster-whisper + transformers
  - Any OS (fallback)    → CPU with int8 quantization
"""

import logging
import os

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
            logger.info("CUDA detected: %s", torch.cuda.get_device_name(0))
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            logger.info("MPS (Metal GPU) detected")
            return "mps"
    except ImportError:
        logger.debug("torch not installed, falling back to cpu")
    except Exception as e:
        logger.debug("Device detection failed: %s, falling back to cpu", e)
    return "cpu"


def get_whisper_device() -> str:
    """Return device for faster-whisper (CTranslate2).

    CTranslate2 supports "cuda" and "cpu" (not "mps").
    On macOS returns "cpu" (MLX handles Metal separately).
    """
    device = get_optimal_device()
    if device == "mps":
        return "cpu"
    return device


def get_whisper_compute_type(device: str | None = None) -> str:
    """Optimal compute type for the given device."""
    if device is None:
        device = get_whisper_device()
    return {"cuda": "float16", "cpu": "int8"}.get(device, "int8")


def get_optimal_threads() -> int:
    """Optimal thread count for CPU-bound operations.

    Returns half the available cores (leaves room for I/O),
    clamped between 2 and 8.
    """
    cores = os.cpu_count() or 4
    return max(2, min(8, cores // 2))


def get_cuda_device_count() -> int:
    """Number of CUDA devices available (0 if none)."""
    try:
        import torch
        return torch.cuda.device_count()
    except Exception:
        return 0


def get_cuda_vram_gb() -> float:
    """Total VRAM in GB on the primary CUDA device (0 if none)."""
    try:
        import torch
        if not torch.cuda.is_available():
            return 0.0
        return torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    except Exception:
        return 0.0


def get_platform_label() -> str:
    """Human-readable platform label."""
    device = get_optimal_device()
    if device == "cuda":
        try:
            import torch
            name = torch.cuda.get_device_name(0)
            vram = get_cuda_vram_gb()
            return f"CUDA ({name}, {vram:.0f}GB VRAM)"
        except Exception:
            return "CUDA (NVIDIA GPU)"
    if device == "mps":
        return "MPS (Apple Metal GPU)"
    cores = os.cpu_count() or 4
    return f"CPU ({cores} cores)"
