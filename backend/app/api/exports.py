"""Video export endpoints."""
import uuid, logging, tempfile, os, subprocess, zipfile
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.models.clip import Clip
from app.services.storage import download_file, get_presigned_url
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/videos", tags=["exports"])

@router.get("/{video_id}/export")
async def export_video(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    clips_result = await db.execute(
        select(Clip).where(Clip.video_id == video_id)
    )
    clips = clips_result.scalars().all()

    if not clips:
        raise HTTPException(status_code=400, detail="No clips to export")

    tmp_dir = tempfile.mkdtemp(prefix=f"export_{video_id}_")
    zip_path = os.path.join(tmp_dir, f"{video.title or 'export'}_clips.zip")

    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for clip in clips:
                clip_tmp = os.path.join(tmp_dir, f"clip_{str(clip.id)[:8]}.mp4")
                try:
                    download_file(clip.file_url, clip_tmp)
                    arcname = f"clip_{clip.start_time:.0f}-{clip.end_time:.0f}s.mp4"
                    zf.write(clip_tmp, arcname)
                    os.unlink(clip_tmp)
                except Exception as e:
                    logger.warning("Failed to add clip %s: %s", clip.id, e)

            # Add metadata JSON
            import json
            metadata = [{
                "id": str(c.id),
                "start_time": c.start_time,
                "end_time": c.end_time,
                "title": c.title,
                "caption": c.caption,
                "score": c.score,
                "hashtags": c.hashtags,
            } for c in clips]
            zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        return FileResponse(zip_path, media_type="application/zip",
                            filename=f"{video.title or 'export'}_clips.zip")
    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
