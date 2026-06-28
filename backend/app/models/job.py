import enum
import uuid

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class JobTypeEnum(str, enum.Enum):
    TRANSCRIPTION = "transcription"
    HIGHLIGHT = "highlight"
    RENDER = "render"
    DUBBING = "dubbing"


class JobStatusEnum(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_video_id", "video_id"), Index("ix_jobs_type", "type"))

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(
        UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False
    )
    type = Column(Enum(JobTypeEnum), nullable=False)
    status = Column(Enum(JobStatusEnum), default=JobStatusEnum.QUEUED, nullable=False)
    progress = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    video = relationship("Video", back_populates="jobs")
