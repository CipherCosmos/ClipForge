"""One-off script to resume all stuck/queued videos in the database."""
import os
import sys
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))
from app.models.job import Job, JobStatusEnum, JobTypeEnum
from app.models.video import Video, VideoStatusEnum
from app.workers.transcription import run_transcription
from app.workers.nlp import run_nlp
from app.workers.scene_detect import run_scene_detect
from app.workers.render import run_render

engine = create_engine("postgresql://clipforge:clipforge@localhost:5432/clipforge")
SessionLocal = sessionmaker(bind=engine)
session = SessionLocal()

try:
    # 1. Find all videos in UPLOADED or PROCESSING state
    videos = session.query(Video).filter(
        Video.status.in_([VideoStatusEnum.UPLOADED, VideoStatusEnum.PROCESSING])
    ).all()

    print(f"Found {len(videos)} videos in progress.")

    for v in videos:
        print(f"Video {v.id} (status={v.status.value})")
        
        # Get all jobs
        jobs = session.query(Job).filter(Job.video_id == v.id).all()
        job_map = {j.type: j for j in jobs}
        
        trans_job = job_map.get(JobTypeEnum.TRANSCRIPTION)
        highlight_job = job_map.get(JobTypeEnum.HIGHLIGHT)
        render_job = job_map.get(JobTypeEnum.RENDER)
        
        # Determine the correct stage to resume
        if v.status == VideoStatusEnum.UPLOADED or not trans_job or trans_job.status != JobStatusEnum.DONE:
            print("  -> Resuming TRANSCRIPTION")
            if trans_job:
                trans_job.status = JobStatusEnum.QUEUED
                trans_job.progress = 0.0
            run_transcription.delay(str(v.id))
            
        elif highlight_job and highlight_job.status != JobStatusEnum.DONE:
            print("  -> Resuming HIGHLIGHTS (NLP & Scene Detect)")
            highlight_job.status = JobStatusEnum.QUEUED
            highlight_job.progress = 0.0
            run_nlp.delay(str(v.id))
            run_scene_detect.delay(str(v.id))
            
        elif render_job and render_job.status != JobStatusEnum.DONE:
            print("  -> Resuming RENDER")
            render_job.status = JobStatusEnum.QUEUED
            render_job.progress = 0.0
            run_render.delay(str(v.id))
            
        else:
            print("  -> No action needed (already done or invalid state)")

    session.commit()
    print("Done resuming pipeline.")
except Exception as e:
    print(f"Error: {e}")
    session.rollback()
finally:
    session.close()
