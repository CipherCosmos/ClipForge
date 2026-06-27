import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.security import get_current_user
from app.database import get_db
from app.models.job import Job, JobStatusEnum, JobTypeEnum
from app.models.user import User
from app.models.video import Video

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/videos/{video_id}/transcript", tags=["transcript"])


class SegmentUpdate(BaseModel):
    index: int
    start: float
    end: float
    text: str


class TranscriptUpdate(BaseModel):
    segments: list[SegmentUpdate]


async def _get_video(video_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Video:
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.user_id == user_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return video


def _format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _parse_timestamp(ts: str) -> float:
    parts = ts.replace(",", ".").split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


@router.get("")
async def get_transcript(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_video(video_id, current_user.id, db)
    if not video.transcript:
        raise HTTPException(status_code=404, detail="No transcript found for this video")
    segments = video.transcript.get("segments", [])
    enriched = []
    for i, seg in enumerate(segments):
        enriched.append({
            "start": seg.get("start", 0.0),
            "end": seg.get("end", 0.0),
            "text": seg.get("text", ""),
            "index": i,
        })
    return {
        "language": video.transcript.get("language", video.language or "en"),
        "full_text": video.transcript.get("full_text", ""),
        "segments": enriched,
    }


@router.put("")
async def update_transcript(
    video_id: uuid.UUID,
    payload: TranscriptUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_video(video_id, current_user.id, db)
    if not video.transcript:
        raise HTTPException(status_code=404, detail="No transcript found for this video")

    current_segments = list(video.transcript.get("segments", []))
    updated_map: dict[int, dict] = {}

    for upd in payload.segments:
        updated_map[upd.index] = {"start": upd.start, "end": upd.end, "text": upd.text}

    merged = []
    for i, seg in enumerate(current_segments):
        if i in updated_map:
            merged_seg = dict(seg)
            merged_seg["start"] = updated_map[i]["start"]
            merged_seg["end"] = updated_map[i]["end"]
            merged_seg["text"] = updated_map[i]["text"]
            merged.append(merged_seg)
        else:
            merged.append(seg)

    full_text = " ".join(s["text"] for s in merged if s.get("text"))

    video.transcript["segments"] = merged
    video.transcript["full_text"] = full_text
    video.segments = merged
    flag_modified(video, "transcript")
    flag_modified(video, "segments")
    await db.commit()
    await db.refresh(video)

    enriched = []
    for i, seg in enumerate(merged):
        enriched.append({
            "start": seg.get("start", 0.0),
            "end": seg.get("end", 0.0),
            "text": seg.get("text", ""),
            "index": i,
        })

    return {
        "language": video.transcript.get("language", video.language or "en"),
        "full_text": full_text,
        "segments": enriched,
    }


@router.post("/regenerate", status_code=status.HTTP_201_CREATED)
async def regenerate_transcript(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_video(video_id, current_user.id, db)

    from app.services.pipeline import start_pipeline
    await start_pipeline(db, video, force_transcribe=True)

    result = await db.execute(
        select(Job).where(Job.video_id == video.id, Job.type == JobTypeEnum.TRANSCRIPTION)
    )
    job = result.scalar_one_or_none()
    return {"job_id": str(job.id) if job else None}


@router.get("/export-srt")
async def export_transcript_srt(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_video(video_id, current_user.id, db)
    if not video.transcript:
        raise HTTPException(status_code=404, detail="No transcript found for this video")

    segments = video.transcript.get("segments", [])
    lines = []
    for i, seg in enumerate(segments):
        start = seg.get("start", 0.0)
        end = seg.get("end", 0.0)
        text = seg.get("text", "").strip()
        if not text:
            continue
        lines.append(f"{i + 1}")
        lines.append(f"{_format_timestamp(start)} --> {_format_timestamp(end)}")
        lines.append(text)
        lines.append("")

    srt_content = "\n".join(lines)

    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        content=srt_content,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=transcript_{video_id}.srt"},
    )


@router.post("/import-srt")
async def import_transcript_srt(
    video_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_video(video_id, current_user.id, db)

    content = await file.read()
    srt_text = content.decode("utf-8-sig")

    segments = []
    lines = srt_text.strip().split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.isdigit():
            i += 1
            if i >= len(lines):
                break
            time_line = lines[i].strip()
            i += 1
            if " --> " not in time_line:
                continue
            parts = time_line.split(" --> ")
            start = _parse_timestamp(parts[0])
            end = _parse_timestamp(parts[1])
            text_parts = []
            while i < len(lines) and lines[i].strip():
                text_parts.append(lines[i].strip())
                i += 1
            text = " ".join(text_parts)
            if text:
                segments.append({
                    "start": start,
                    "end": end,
                    "text": text,
                    "score": 0.0,
                    "emotion_intensity": 0.0,
                    "keyword_density": 0.0,
                    "scene_change_intensity": 0.0,
                    "audio_energy": 0.0,
                    "viral_score": 0.0,
                    "hook_score": 0.0,
                    "engagement_potential": 0.0,
                })
        else:
            i += 1

    if not segments:
        raise HTTPException(status_code=400, detail="No valid SRT segments found")

    full_text = " ".join(s["text"] for s in segments)

    video.transcript = {
        "language": video.transcript.get("language", video.language or "en") if video.transcript else "en",
        "segments": segments,
        "full_text": full_text,
    }
    video.segments = segments
    flag_modified(video, "transcript")
    flag_modified(video, "segments")
    await db.commit()
    await db.refresh(video)

    enriched = []
    for i, seg in enumerate(segments):
        enriched.append({
            "start": seg.get("start", 0.0),
            "end": seg.get("end", 0.0),
            "text": seg.get("text", ""),
            "index": i,
        })

    return {
        "language": video.transcript.get("language", "en"),
        "full_text": full_text,
        "segments": enriched,
    }
