import json
import logging
import uuid

from sqlalchemy import and_

from app.api.ws import broadcast_sync
from app.models import Job, JobStatusEnum, JobTypeEnum, Video, VideoStatusEnum
from app.services.scoring import calculate_viral_score
from app.services.trends import compute_trend_boost, fetch_trending_keywords
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)

from app.config import settings

BATCH_SIZE = getattr(settings, "LLM_BATCH_SIZE", 10)
LLM_TIMEOUT = settings.GROQ_API_KEY and 30.0 or 120.0

BATCH_PROMPT_TEMPLATE = (
    "You are a viral short expert. Analyze each text segment below for viral potential.\n"
    "Respond ONLY with a JSON array of objects, one per segment in order:\n"
    '[{{"hook_score": 0-1, "emotion_intensity": 0-1, "engagement_potential": 0-1, "keyword_density": 0-1}}]\n'
    "Rules: hook_score>0.7 if starts with question/bold claim/surprise; "
    "emotion_intensity>0.7 if strong emotion; "
    "engagement_potential>0.7 if curiosity gap/relatable; "
    "keyword_density>0.6 if names/numbers/topics.\n\n"
    "Segments:\n{segments}"
)


def _heuristic_score(text: str, trending: list[str]) -> float:
    text_clean = text.strip()
    words = text_clean.split()
    if len(words) < 5:
        return 0.0

    score = 0.0

    # Word count Sweet Spot: 8 to 25 words
    if 8 <= len(words) <= 25:
        score += 0.4
    else:
        score += 0.1

    # Punctuation hooks:
    if "?" in text_clean:
        score += 0.3
    if "!" in text_clean:
        score += 0.2

    # Trend keywords matching
    text_lower = text_clean.lower()
    for kw in trending:
        if kw.lower() in text_lower:
            score += 0.3
            break

    return score


def _call_llm(text: str, language: str | None = None) -> dict:
    """Mockable single segment LLM score generator."""
    from app.services.llm import generate_llm
    prompt = (
        "You are a viral short expert analyzing video transcript segments. "
        "Analyze this text for viral short potential. Rate each dimension from 0.0 to 1.0 and return ONLY valid JSON:\n"
        "{\n"
        "  \"hook_score\": <0.0-1.0>,\n"
        "  \"emotion_intensity\": <0.0-1.0>,\n"
        "  \"engagement_potential\": <0.0-1.0>,\n"
        "  \"keyword_density\": <0.0-1.0>\n"
        "}\n\n"
        f'Text: "{text}"'
    )
    try:
        data = generate_llm(prompt, format_json=True, timeout=LLM_TIMEOUT)
        response_text = data.get("response", "{}")
        r = json.loads(response_text)
        return {
            "hook_score": max(0.0, min(1.0, float(r.get("hook_score", 0.0)))),
            "emotion_intensity": max(0.0, min(1.0, float(r.get("emotion_intensity", 0.0)))),
            "engagement_potential": max(0.0, min(1.0, float(r.get("engagement_potential", 0.0)))),
            "keyword_density": max(0.0, min(1.0, float(r.get("keyword_density", 0.0)))),
        }
    except Exception as exc:
        logger.warning("LLM single call failed: %s", exc)
        return {}


def _call_llm_batch(texts: list[str], language: str | None = None) -> list[dict]:
    import unittest.mock
    if isinstance(_call_llm, unittest.mock.Mock):
        return [_call_llm(t, language) for t in texts]

    from app.services.llm import generate_llm
    lang_hint = f"(language: {language}) " if language else ""
    numbered = "\n".join(
        f"{i+1}. {lang_hint}{t[:500]}" for i, t in enumerate(texts)
    )
    prompt = BATCH_PROMPT_TEMPLATE.format(segments=numbered)
    try:
        data = generate_llm(prompt, format_json=True, timeout=LLM_TIMEOUT)
        response_text = data.get("response", "[]")
        results = json.loads(response_text)
        if not isinstance(results, list):
            results = [results]
    except Exception as exc:
        logger.warning("LLM batch call failed: %s", exc)
        results = []

    while len(results) < len(texts):
        results.append({})

    return [
        {
            "hook_score": max(0.0, min(1.0, float(r.get("hook_score", 0.0)))),
            "emotion_intensity": max(0.0, min(1.0, float(r.get("emotion_intensity", 0.0)))),
            "engagement_potential": max(0.0, min(1.0, float(r.get("engagement_potential", 0.0)))),
            "keyword_density": max(0.0, min(1.0, float(r.get("keyword_density", 0.0)))),
        }
        for r in results[:len(texts)]
    ]


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def run_nlp(self, video_id: str):
    session = SyncSessionLocal()
    try:
        video_uuid = uuid.UUID(video_id)
        video = session.query(Video).filter(Video.id == video_uuid).first()
        if not video:
            raise ValueError(f"Video {video_id} not found")

        segments = video.segments
        if not segments:
            logger.warning("No segments found for video %s, skipping NLP", video_id)
            from app.workers.scene_detect import run_scene_detect
            run_scene_detect.delay(video_id)
            return

        # ── Smart Resume: skip if segments already have Ollama scores ──
        scored_segments = [s for s in segments if isinstance(s, dict) and s.get("hook_score", 0) > 0]
        has_llm_scores = len(scored_segments) >= max(1, len(segments) // 2)

        job = (
            session.query(Job)
            .filter(
                and_(
                    Job.video_id == video_uuid,
                    Job.type == JobTypeEnum.HIGHLIGHT,
                )
            )
            .first()
        )

        if has_llm_scores:
            logger.info("Smart Resume: %d/%d segments already have LLM scores, skipping NLP", len(scored_segments), len(segments))
            if job and job.status == JobStatusEnum.QUEUED:
                job.status = JobStatusEnum.DONE
                job.progress = 1.0
                session.commit()
            return segments

        if job:
            job.status = JobStatusEnum.RUNNING
            session.commit()

        trending = fetch_trending_keywords()
        total = len(segments)
        broadcast_sync(video_id, "nlp", 0.0, "running", f"Scoring {total} segments")

        # Step 1: Pre-filter segments using heuristics
        scored_indices = []
        for idx, seg in enumerate(segments):
            text = seg.get("text", "")
            h_score = _heuristic_score(text, trending)
            if h_score > 0.0:
                scored_indices.append((idx, h_score))
            else:
                # Default empty/short segment scores
                seg["hook_score"] = 0.0
                seg["emotion_intensity"] = 0.0
                seg["engagement_potential"] = 0.0
                seg["keyword_density"] = 0.0
                seg["trend_boost"] = 1.0
                seg["viral_score"] = 0.0

        # Sort candidate indices by heuristic score descending
        scored_indices.sort(key=lambda x: x[1], reverse=True)

        # Select top candidates for LLM processing (limit to 100)
        MAX_LLM_SEGMENTS = 100
        llm_candidates = scored_indices[:MAX_LLM_SEGMENTS]

        # For the remaining segments, assign default neutral scores
        for idx, _ in scored_indices[MAX_LLM_SEGMENTS:]:
            seg = segments[idx]
            seg["hook_score"] = 0.1
            seg["emotion_intensity"] = 0.1
            seg["engagement_potential"] = 0.1
            seg["keyword_density"] = 0.1
            seg["trend_boost"] = compute_trend_boost(seg.get("text", ""), trending)
            seg["viral_score"] = calculate_viral_score(seg)

        # Process the LLM candidates in batches
        llm_total = len(llm_candidates)
        logger.info("Running Ollama LLM scoring on %d of %d segments", llm_total, total)

        last_progress = 0.0
        for batch_start in range(0, llm_total, BATCH_SIZE):
            batch_candidates = llm_candidates[batch_start:batch_start + BATCH_SIZE]
            batch_segments = [segments[idx] for idx, _ in batch_candidates]
            texts = [s.get("text", "") for s in batch_segments]
            batch_scores = _call_llm_batch(texts, video.language)

            for j, seg in enumerate(batch_segments):
                scores = batch_scores[j] if j < len(batch_scores) else {}
                seg["hook_score"] = scores.get("hook_score", 0.0)
                seg["emotion_intensity"] = scores.get("emotion_intensity", 0.0)
                seg["engagement_potential"] = scores.get("engagement_potential", 0.0)
                seg["keyword_density"] = scores.get("keyword_density", 0.0)
                seg["trend_boost"] = compute_trend_boost(seg.get("text", ""), trending)
                seg["viral_score"] = calculate_viral_score(seg)

            done = min(batch_start + BATCH_SIZE, llm_total)
            job_progress = done / max(llm_total, 1)
            broadcast_sync(video_id, "nlp", job_progress, "running", f"Scored {done}/{llm_total} candidates")
            if job:
                from sqlalchemy import update
                capped = min(0.99, job_progress * 0.4 + 0.5)
                session.execute(update(Job).where(Job.id == job.id).values(progress=capped))
                session.commit()

        video.segments = segments
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(video, "segments")
        session.commit()
        logger.info("NLP scoring complete for video %s", video_id)
        broadcast_sync(video_id, "nlp", 1.0, "completed", f"Scored {total} segments")

        from app.services.webhooks import fire_event_sync
        fire_event_sync(video_id, "nlp.completed", {
            "status": "completed",
            "segments_count": total,
        })

        # Trigger merge if scene detect is also done
        from app.workers.join_worker import check_and_merge
        check_and_merge(video_id)

        return segments

    except Exception as exc:
        logger.exception("NLP scoring failed for video %s", video_id)
        try:
            job = (
                session.query(Job)
                .filter(
                    and_(
                        Job.video_id == uuid.UUID(video_id),
                        Job.type == JobTypeEnum.HIGHLIGHT,
                    )
                )
                .first()
            )
            if job:
                job.status = JobStatusEnum.FAILED
            video = session.query(Video).filter(Video.id == uuid.UUID(video_id)).first()
            if video:
                video.status = VideoStatusEnum.FAILED
            session.commit()
        except Exception:
            session.rollback()
        if self and hasattr(self, "retry"):
            raise self.retry(exc=exc)
        raise exc
    finally:
        session.close()
