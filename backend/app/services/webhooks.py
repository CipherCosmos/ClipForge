"""Webhook system for notifying external services of completed jobs."""
import json, logging, uuid, httpx
from datetime import datetime
from typing import Any
from sqlalchemy import Column, String, DateTime, JSON, Boolean
from app.database import Base
from app.config import settings

logger = logging.getLogger(__name__)

# In-memory webhook registrations (would be a DB table in production)
_webhooks: dict[str, list[dict]] = {}  # video_id -> [{"url": ..., "events": [...]}]

def register_webhook(video_id: str, url: str, events: list[str] | None = None):
    if video_id not in _webhooks:
        _webhooks[video_id] = []
    _webhooks[video_id].append({
        "url": url,
        "events": events or ["job.completed"],
    })

def unregister_webhook(video_id: str, url: str):
    if video_id in _webhooks:
        _webhooks[video_id] = [w for w in _webhooks[video_id] if w["url"] != url]

def fire_event(video_id: str, event: str, data: dict[str, Any]):
    """Fire event to all registered webhooks for this video."""
    hooks = _webhooks.get(video_id, [])
    for hook in hooks:
        if event in hook["events"] or "all" in hook["events"]:
            try:
                payload = {
                    "event": event,
                    "video_id": video_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": data,
                }
                with httpx.Client(timeout=10.0) as client:
                    client.post(hook["url"], json=payload)
                logger.info("Webhook fired: %s -> %s", event, hook["url"])
            except Exception as e:
                logger.warning("Webhook failed: %s -> %s: %s", event, hook["url"], e)
