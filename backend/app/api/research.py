import json
import logging
import random
import xml.etree.ElementTree as ET
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/research", tags=["research"])

logger = logging.getLogger(__name__)

SUPPORTED_GEOS = {"US", "IN", "GB", "CA", "AU", "DE", "FR", "JP", "BR"}


class AnalyzeRequest(BaseModel):
    topic: str
    tone: Optional[str] = "viral"  # viral, clickbait, hype, educational, dramatic, funny


class CrawlRequest(BaseModel):
    query: str
    video_type: Optional[str] = "all"  # all, shorts, long


@router.get("/trends")
async def get_trends(
    source: str = "google",
    geo: str | None = None,
    current_user: User = Depends(get_current_user)
):
    """Get trending topics/articles/videos from various feeds (google, youtube, reddit, news)."""
    prefs = current_user.preferences or {}
    if geo is None:
        geo = prefs.get("research_location", "US")
    source_lower = source.lower() if source else "google"
    geo_upper = geo.upper() if geo else "US"
    if geo_upper not in SUPPORTED_GEOS:
        geo_upper = "US"

    if source_lower == "google":
        url = f"https://trends.google.com/trending/rss?geo={geo_upper}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                xml_data = resp.text
                root = ET.fromstring(xml_data)
                channel = root.find("channel")
                items = []
                if channel is not None:
                    for item in channel.findall("item"):
                        title_elem = item.find("title")
                        traffic_elem = item.find("{https://trends.google.com/trending/rss}approx_traffic")

                        title = title_elem.text if title_elem is not None else ""
                        traffic = traffic_elem.text if traffic_elem is not None else "50K+ searches"

                        items.append({
                            "topic": title,
                            "traffic": traffic,
                            "source": "google",
                        })
                if items:
                    return {"trends": items}
        except Exception as e:
            logger.warning("Failed to fetch Google Trends RSS: %s", e)

    elif source_lower == "reddit":
        url = "https://www.reddit.com/r/popular/.rss"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        try:
            async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                root = ET.fromstring(resp.text)
                entries = root.findall("{http://www.w3.org/2005/Atom}entry")
                items = []
                for entry in entries:
                    title_elem = entry.find("{http://www.w3.org/2005/Atom}title")
                    link_elem = entry.find("{http://www.w3.org/2005/Atom}link")

                    title = title_elem.text if title_elem is not None else ""
                    link = link_elem.attrib.get("href", "") if link_elem is not None else ""

                    if title:
                        items.append({
                            "topic": title,
                            "traffic": "Hot on Reddit",
                            "url": link,
                            "source": "reddit",
                        })
                if items:
                    return {"trends": items[:20]}
        except Exception as e:
            logger.warning("Failed to fetch Reddit RSS: %s", e)

    elif source_lower == "news":
        url = f"https://news.google.com/rss?hl=en-{geo_upper}&gl={geo_upper}&ceid={geo_upper}:en"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                root = ET.fromstring(resp.text)
                items = []
                for item in root.findall(".//item"):
                    title_elem = item.find("title")
                    link_elem = item.find("link")

                    title = title_elem.text if title_elem is not None else ""
                    if title and " - " in title:
                        title = title.rsplit(" - ", 1)[0]

                    link = link_elem.text if link_elem is not None else ""

                    if title:
                        items.append({
                            "topic": title,
                            "traffic": "Top Headline",
                            "url": link,
                            "source": "news",
                        })
                if items:
                    return {"trends": items[:20]}
        except Exception as e:
            logger.warning("Failed to fetch Google News RSS for %s: %s", geo_upper, e)

    elif source_lower == "youtube":
        try:
            import yt_dlp
            ydl_opts = {
                'extract_flat': True,
                'skip_download': True,
                'quiet': True,
                'playlist_items': '1-15',
            }
            query = f"trending shorts {geo_upper}"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res = ydl.extract_info(f"ytsearch15:{query}", download=False)
                entries = res.get("entries", [])
                items = []
                for entry in entries:
                    if entry:
                        title = entry.get("title", "")
                        uploader = entry.get("uploader", "Creator")
                        views = entry.get("view_count")
                        traffic_desc = f"by {uploader}"
                        if views:
                            if views >= 1000000:
                                traffic_desc += f" • {views/1000000:.1f}M views"
                            elif views >= 1000:
                                traffic_desc += f" • {views/1000:.0f}K views"
                            else:
                                traffic_desc += f" • {views} views"

                        video_url = entry.get("url") or entry.get("webpage_url")
                        if not video_url and entry.get("id"):
                            video_url = f"https://www.youtube.com/watch?v={entry.get('id')}"

                        if title:
                            items.append({
                                "topic": title,
                                "traffic": traffic_desc,
                                "url": video_url,
                                "source": "youtube",
                            })
                if items:
                    return {"trends": items}
        except Exception as e:
            logger.warning("Failed to fetch YouTube trends via yt-dlp: %s", e)

    # Fallback to local trending keywords
    from app.services.trends import FALLBACK_TRENDS
    selected = random.sample(FALLBACK_TRENDS, min(10, len(FALLBACK_TRENDS)))
    return {"trends": [{"topic": kw, "traffic": "Trending", "source": "google"} for kw in selected]}


@router.post("/analyze")
async def analyze_trend_topic(
    payload: AnalyzeRequest,
    current_user: User = Depends(get_current_user)
):
    """Analyze a trending topic using Ollama. Outputs rich script outline, hook variations, viral triggers, and CTA."""
    topic = payload.topic
    tone = payload.tone or "viral"

    prompt = (
        f"You are a viral shorts creator. Analyze the trending topic: '{topic}' with a '{tone}' tone.\n"
        "Provide a plan to create a viral short video about this topic. Rate its viral potential and return ONLY valid JSON in this exact structure:\n"
        "{\n"
        "  \"viral_potential\": 0.0-1.0,\n"
        "  \"video_concept\": \"Brief description of the visual and concept\",\n"
        "  \"suggested_search_query\": \"Keywords to search on YouTube to find source footage\",\n"
        "  \"punchy_hook\": \"First 3-second attention grabber text\",\n"
        "  \"hook_variations\": [\"alternative hook 1\", \"alternative hook 2\", \"alternative hook 3\"],\n"
        "  \"script_body\": \"30-60s script content divided with [Visual: B-roll cue] notes\",\n"
        "  \"call_to_action\": \"CTA to get subscribers/likes\",\n"
        "  \"pin_comment\": \"Engagement-driving question to pin in the comments\",\n"
        "  \"hashtags\": [\"tag1\", \"tag2\"],\n"
        "  \"viral_triggers\": [\"trigger 1\", \"trigger 2\"],\n"
        "  \"audio_music_recommendation\": \"Music style or mood recommendation\",\n"
        "  \"target_audience\": \"Niche or demographic description\"\n"
        "}"
    )

    from app.services.llm import generate_llm_async

    # Ensure fallback keys match exactly
    fallback_analysis = {
        "viral_potential": 0.85,
        "video_concept": f"A dynamic overview highlighting key aspects of {topic}.",
        "suggested_search_query": f"{topic} news updates",
        "punchy_hook": f"Did you hear about {topic}?",
        "hook_variations": [
            f"Did you hear about {topic}?",
            f"The truth about {topic} just leaked...",
            f"Why everyone is talking about {topic} right now!"
        ],
        "script_body": f"[Visual: show trending charts of {topic}] Here is why {topic} is trending right now... [Visual: show B-roll related to {topic}] It's taking over the internet! What do you think about this?",
        "call_to_action": "Subscribe for daily trending updates!",
        "pin_comment": f"What is your opinion on {topic}? Let me know below!",
        "hashtags": [topic.replace(" ", ""), "trending", "news"],
        "viral_triggers": ["Trend Wave", "Curiosity Gap"],
        "audio_music_recommendation": "Suspenseful, high-energy synthwave beat",
        "target_audience": "General audience interested in trending topics"
    }

    try:
        data = await generate_llm_async(prompt, format_json=True, timeout=30.0)
        response_text = data.get("response", "{}")
        analysis = json.loads(response_text)

        # Ensure all required keys exist in response
        for k, default_val in fallback_analysis.items():
            if k not in analysis:
                analysis[k] = default_val
        return analysis
    except Exception as e:
        logger.error("Failed to analyze topic: %s", e)
        return fallback_analysis


@router.post("/crawl")
async def crawl_videos(
    payload: CrawlRequest,
    current_user: User = Depends(get_current_user)
):
    """Scrape/crawl YouTube search results using flat extraction in yt-dlp with type filtering."""
    query = payload.query
    video_type = payload.video_type or "all"
    logger.info("Crawling YouTube search for query: %s (type: %s)", query, video_type)
    try:
        import yt_dlp
        ydl_opts = {
            'extract_flat': True,
            'skip_download': True,
            'quiet': True,
            'playlist_items': '1-10',
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch10:{query}", download=False)
            entries = res.get("entries", [])

            results = []
            for item in entries:
                if not item:
                    continue

                duration = item.get("duration")

                # Apply duration filter based on video_type
                if video_type == "shorts":
                    if duration is not None and duration > 60:
                        continue
                elif video_type == "long":
                    if duration is not None and duration <= 60:
                        continue

                video_url = item.get("url") or item.get("webpage_url")
                if not video_url and item.get("id"):
                    video_url = f"https://www.youtube.com/watch?v={item.get('id')}"

                results.append({
                    "title": item.get("title", "Untitled Video"),
                    "url": video_url,
                    "duration": duration,
                    "uploader": item.get("uploader") or item.get("channel", "Unknown Channel"),
                    "view_count": item.get("view_count"),
                })

            # Slice results to top 5 matches
            return {"videos": results[:5]}
    except Exception as e:
        logger.error("Failed to crawl search results via yt-dlp: %s", e)
        raise HTTPException(status_code=500, detail=f"Web crawler failed: {str(e)}")
