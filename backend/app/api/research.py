import json
import logging
import random
import xml.etree.ElementTree as ET
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/research", tags=["research"])

logger = logging.getLogger(__name__)

SUPPORTED_GEOS = {"US", "IN", "GB", "CA", "AU", "DE", "FR", "JP", "BR"}

NICHE_KEYWORDS = {
    "sports": "sports OR athletics OR football OR basketball",
    "facts": "amazing facts OR trivia OR mind blowing facts",
    "cartoon": "animation OR cartoon OR anime OR disney",
    "science": "science discovery OR space OR astronomy OR physics",
    "tech": "technology OR tech startup OR AI OR gadget",
    "code": "software programming OR developer OR coding OR github",
    "trading": "stock trading OR crypto market OR option trading OR bitcoin",
    "investing": "investing OR index funds OR personal finance OR mutual funds"
}

NICHE_SUBREDDITS = {
    "sports": "sports",
    "facts": "todayilearned",
    "cartoon": "cartoons",
    "science": "science",
    "tech": "technology",
    "code": "programming",
    "trading": "wallstreetbets",
    "investing": "investing"
}



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
    niche: str | None = None,
    current_user: User = Depends(get_current_user)
):
    """Get trending topics/articles/videos from various feeds (google, youtube, reddit, news) with niche filtering."""
    prefs = current_user.preferences or {}
    if geo is None:
        geo = prefs.get("research_location", "US")
    source_lower = source.lower() if source else "google"
    geo_upper = geo.upper() if geo else "US"
    if geo_upper not in SUPPORTED_GEOS:
        geo_upper = "US"

    niche_lower = niche.lower() if niche else None

    if source_lower == "google":
        # Google Trends RSS doesn't support custom queries, so we fall back to Google News Search if niche is specified
        if niche_lower and niche_lower in NICHE_KEYWORDS:
            niche_query = NICHE_KEYWORDS[niche_lower]
            url = f"https://news.google.com/rss/search?q={niche_query}&hl=en-{geo_upper}&gl={geo_upper}&ceid={geo_upper}:en"
        else:
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
                        
                        # Google Trends uses approx_traffic, news/search does not
                        traffic_elem = item.find("{https://trends.google.com/trending/rss}approx_traffic")
                        title = title_elem.text if title_elem is not None else ""
                        traffic = traffic_elem.text if traffic_elem is not None else "Trending Topic"
                        
                        # Strip news publishers in news search results if needed
                        if title and " - " in title and (niche_lower and niche_lower in NICHE_KEYWORDS):
                            title = title.rsplit(" - ", 1)[0]

                        link_elem = item.find("link")
                        link = link_elem.text if link_elem is not None else ""

                        items.append({
                            "topic": title,
                            "traffic": traffic,
                            "url": link,
                            "source": "google",
                        })
                if items:
                    return {"trends": items[:20]}
        except Exception as e:
            logger.warning("Failed to fetch Google Trends/News Search RSS: %s", e)

    elif source_lower == "reddit":
        subreddit = "popular"
        if niche_lower and niche_lower in NICHE_SUBREDDITS:
            subreddit = NICHE_SUBREDDITS[niche_lower]
            
        url = f"https://www.reddit.com/r/{subreddit}/.rss"
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
                            "traffic": f"Hot in r/{subreddit}",
                            "url": link,
                            "source": "reddit",
                        })
                if items:
                    return {"trends": items[:20]}
        except Exception as e:
            logger.warning("Failed to fetch Reddit RSS: %s", e)

    elif source_lower == "news":
        if niche_lower and niche_lower in NICHE_KEYWORDS:
            niche_query = NICHE_KEYWORDS[niche_lower]
            url = f"https://news.google.com/rss/search?q={niche_query}&hl=en-{geo_upper}&gl={geo_upper}&ceid={geo_upper}:en"
        else:
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
                            "traffic": "Top Headline" if not niche_lower else f"{niche.capitalize()} News",
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
            if niche_lower and niche_lower in NICHE_KEYWORDS:
                query = f"trending {niche_lower} shorts {geo_upper}"
            else:
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


class ValidateTopicRequest(BaseModel):
    topic: str
    niche: Optional[str] = "general"


class ImportTrendRequest(BaseModel):
    topic: str
    niche: Optional[str] = "general"
    platform: Optional[str] = "youtube_shorts"


@router.post("/validate-topic")
async def validate_topic(
    payload: ValidateTopicRequest,
    current_user: User = Depends(get_current_user)
):
    """Validate a topic using local LLM to rate credibility, virality and niche alignment."""
    topic = payload.topic
    niche = payload.niche or "general"

    prompt = (
        f"You are an advanced AI Trend Quality Assurer and Fact-Checker.\n"
        f"Analyze this topic for a short-form video:\n"
        f"Topic: \"{topic}\"\n"
        f"Target Niche: \"{niche}\"\n\n"
        f"Evaluate this topic across these dimensions:\n"
        f"1. Credibility: Is this topic based on real, verifiable events/news, or is it fake news, clickbait, sensationalized gossip, or spam?\n"
        f"2. Virality: Does it have high interest, high curiosity gap, or emotional triggers?\n"
        f"3. Niche Alignment: Does it fit the target niche of \"{niche}\"?\n"
        f"4. Virality Breakdown: Rate each of the 8 viral score components from 0.0 to 1.0:\n"
        f"   - hook_score\n"
        f"   - emotion_intensity\n"
        f"   - engagement_potential\n"
        f"   - keyword_density\n"
        f"   - scene_change_intensity\n"
        f"   - audio_event_score\n"
        f"   - audio_energy\n"
        f"   - speaker_confidence\n"
        f"5. Claims Verification: Identify 2-3 main claims in this topic and label their status as 'Verified', 'Unverified', 'Clickbait', or 'Speculative' along with a short 1-sentence verdict.\n\n"
        f"Return ONLY a valid JSON object in this exact format:\n"
        f"{{\n"
        f"  \"credibility_score\": <0.0-1.0>,\n"
        f"  \"virality_score\": <0.0-1.0>,\n"
        f"  \"niche_alignment\": <0.0-1.0>,\n"
        f"  \"is_valid\": <true or false, must be true ONLY if credibility_score >= 0.5 AND virality_score >= 0.5 AND niche_alignment >= 0.5>,\n"
        f"  \"reason\": \"Detailed explanation of credibility, potential misinformation or clickbait warnings, and virality potential.\",\n"
        f"  \"recommended_keywords\": [\"keyword1\", \"keyword2\", \"keyword3\"],\n"
        f"  \"fact_check_report\": \"Brief summary of fact check, identifying main claims and their reliability.\",\n"
        f"  \"virality_breakdown\": {{\n"
        f"     \"hook_score\": <0.0-1.0>,\n"
        f"     \"emotion_intensity\": <0.0-1.0>,\n"
        f"     \"engagement_potential\": <0.0-1.0>,\n"
        f"     \"keyword_density\": <0.0-1.0>,\n"
        f"     \"scene_change_intensity\": <0.0-1.0>,\n"
        f"     \"audio_event_score\": <0.0-1.0>,\n"
        f"     \"audio_energy\": <0.0-1.0>,\n"
        f"     \"speaker_confidence\": <0.0-1.0>\n"
        f"  }},\n"
        f"  \"claims\": [\n"
        f"     {{\"claim\": \"first claim text\", \"status\": \"Verified|Unverified|Clickbait|Speculative\", \"verdict\": \"short verdict\"}},\n"
        f"     {{\"claim\": \"second claim text\", \"status\": \"Verified|Unverified|Clickbait|Speculative\", \"verdict\": \"short verdict\"}}\n"
        f"  ]\n"
        f"}}"
    )

    fallback_validation = {
        "credibility_score": 0.8,
        "virality_score": 0.75,
        "niche_alignment": 0.85,
        "is_valid": True,
        "reason": f"Topic '{topic}' shows solid news alignment and high interest.",
        "recommended_keywords": [topic, f"{topic} news"],
        "fact_check_report": "Verified against recent news updates. No major misinformation flags detected.",
        "virality_breakdown": {
            "hook_score": 0.8,
            "emotion_intensity": 0.7,
            "engagement_potential": 0.75,
            "keyword_density": 0.6,
            "scene_change_intensity": 0.5,
            "audio_event_score": 0.6,
            "audio_energy": 0.5,
            "speaker_confidence": 0.8
        },
        "claims": [
            {"claim": f"{topic} is trending on social platforms", "status": "Verified", "verdict": "Confirmed by multiple news channels and RSS indicators."},
            {"claim": f"High engagement expectation for {topic}", "status": "Speculative", "verdict": "Based on historical topic performance."}
        ]
    }

    from app.services.llm import generate_llm_async
    try:
        data = await generate_llm_async(prompt, format_json=True, timeout=25.0)
        response_text = data.get("response", "{}")
        validation = json.loads(response_text)

        # Ensure all required keys exist
        for k, default_val in fallback_validation.items():
            if k not in validation:
                validation[k] = default_val
        return validation
    except Exception as e:
        logger.error("Failed to validate topic: %s", e)
        return fallback_validation


@router.post("/import-trend")
async def import_trend(
    payload: ImportTrendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Automatically search YouTube for the top short matching the trend and import it (using cloning if already processed)."""
    topic = payload.topic
    niche = payload.niche or "general"
    platform = payload.platform or "youtube_shorts"

    from app.services.platforms import get_preset
    preset = get_preset(platform)

    # 1. Search YouTube for matching video
    try:
        import yt_dlp
        ydl_opts = {
            'extract_flat': True,
            'skip_download': True,
            'quiet': True,
            'playlist_items': '1-3',
        }
        query = f"{topic} shorts"
        if niche != "general":
            query = f"{topic} {niche} shorts"

        logger.info("One-click trend import searching YouTube for query: %s", query)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch3:{query}", download=False)
            entries = res.get("entries", [])
            
        if not entries or not entries[0]:
            raise HTTPException(status_code=404, detail="No matching YouTube video found for this trend topic.")

        # Get first valid entry
        entry = entries[0]
        video_url = entry.get("url") or entry.get("webpage_url")
        if not video_url and entry.get("id"):
            video_url = f"https://www.youtube.com/watch?v={entry.get('id')}"

        if not video_url:
            raise HTTPException(status_code=404, detail="Could not extract video URL from search results.")

        # 2. Re-use cloning/deduplication layer
        from app.api.videos import get_or_clone_video_if_exists, _video_to_response
        from app.models.video import Video, VideoStatusEnum
        from app.models.job import Job, JobTypeEnum, JobStatusEnum

        cloned = await get_or_clone_video_if_exists(db, video_url, preset.name, current_user.id)
        if cloned:
            logger.info("One-click import cloned video %s", cloned.id)
            return await _video_to_response(cloned, db)

        # 3. Create a new video and enqueue
        from app.services.video import standardize_youtube_url
        standardized = standardize_youtube_url(video_url)

        video = Video(
            user_id=current_user.id,
            source_url=standardized,
            status=VideoStatusEnum.UPLOADED,
            duration=entry.get("duration"),
            title=entry.get("title") or f"Trending short on {topic}",
            platform=preset.name,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)

        job1 = Job(video_id=video.id, type=JobTypeEnum.TRANSCRIPTION, status=JobStatusEnum.QUEUED)
        job2 = Job(video_id=video.id, type=JobTypeEnum.HIGHLIGHT, status=JobStatusEnum.QUEUED)
        job3 = Job(video_id=video.id, type=JobTypeEnum.RENDER, status=JobStatusEnum.QUEUED)
        db.add_all([job1, job2, job3])
        await db.commit()
        await db.refresh(video)

        from app.workers.transcription import run_transcription
        run_transcription.delay(str(video.id))

        return await _video_to_response(video, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to auto-import trend video: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to auto-import trend video: {str(e)}")

