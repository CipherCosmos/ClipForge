"""Shared viral score calculation — single source of truth."""

import logging

logger = logging.getLogger(__name__)


def calculate_viral_score(seg: dict) -> float:
    """8-dimension viral score formula."""
    return (
        0.25 * seg.get("hook_score", 0.0)
        + 0.20 * seg.get("emotion_intensity", 0.0)
        + 0.15 * seg.get("engagement_potential", 0.0)
        + 0.10 * seg.get("keyword_density", 0.0)
        + 0.10 * seg.get("scene_change_intensity", 0.0)
        + 0.10 * seg.get("audio_event_score", 0.0)
        + 0.05 * seg.get("audio_energy", 0.0)
        + 0.05 * seg.get("speaker_confidence", 0.0)
    )
