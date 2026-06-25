"""Trend-aware scoring - boosts viral scores for trending topics.
Free/open-source Trend-Pulse API with zero auth required.
"""
import logging
import re
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TREND_API_URL = "https://api.trend-pulse.com/v1/trending/keywords"

FALLBACK_TRENDS = [
    "AI", "artificial intelligence", "machine learning", "chatgpt", "openai",
    "crypto", "bitcoin", "blockchain", "nft",
    "health", "fitness", "workout", "diet", "mental health",
    "money", "investing", "stocks", "real estate",
    "tech", "startup", "entrepreneur", "coding", "programming",
    "productivity", "focus", "habits",
    "relationship", "dating", "psychology",
    "travel", "food", "recipe", "cooking",
    "gaming", "streaming", "youtube", "tiktok",
    "sports", "football", "soccer", "basketball",
    "motivation", "inspiration", "success",
    " कृत्रिम बुद्धिमत्ता", "एआई", "टेक्नोलॉजी",
    "मोटिवेशन", "सफलता", "पैसा", "हेल्थ",
    "फिटनेस", "वर्कआउट", "खाना", "रिलेशनशिप",
    "बिजनेस", "स्टार्टअप", "इन्वेस्टमेंट",
    "एजुकेशन", "करियर", "जॉब", "स्किल्स",
]

_cache: dict = {"keywords": [], "timestamp": 0.0}
CACHE_TTL = 3600  # 1 hour


def fetch_trending_keywords() -> list[str]:
    """Fetch trending keywords with 1-hour cache."""
    now = time.time()
    if _cache["keywords"] and (now - _cache["timestamp"]) < CACHE_TTL:
        return _cache["keywords"]

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(TREND_API_URL)
            resp.raise_for_status()
            data = resp.json()
            keywords = data.get("keywords", [])
            if keywords:
                _cache["keywords"] = keywords
                _cache["timestamp"] = now
                logger.info("Fetched %d trending keywords", len(keywords))
                return keywords
    except Exception as e:
        logger.debug("Trend API unavailable: %s", e)

    _cache["keywords"] = FALLBACK_TRENDS
    _cache["timestamp"] = now
    return FALLBACK_TRENDS


def compute_trend_boost(segment_text: str, trending: Optional[list[str]] = None) -> float:
    """Compute a trend multiplier (1.0-3.0) based on keyword overlap.

    Higher overlap = higher boost. Caps at 3.0 for segments entirely about trending topics.
    """
    if trending is None:
        trending = fetch_trending_keywords()

    text_lower = segment_text.lower()
    matches = sum(
        1 for kw in trending
        if re.search(r'\b' + re.escape(kw.lower()) + r'\b', text_lower)
    )

    if matches == 0:
        return 1.0

    # Boost scale: 1 match = 1.5x, 2 matches = 2.0x, 3+ = 3.0x
    return min(3.0, 1.0 + matches * 0.5)
