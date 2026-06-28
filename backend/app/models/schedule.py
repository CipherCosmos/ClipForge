import uuid

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Schedule(Base):
    __tablename__ = "schedules"
    __table_args__ = (
        Index("ix_schedules_user_id", "user_id"),
        Index("ix_schedules_status", "status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    clip_id = Column(UUID(as_uuid=True), ForeignKey("clips.id", ondelete="CASCADE"), nullable=False)
    platform = Column(String(50), nullable=False)
    title = Column(String(500), nullable=True, default="")
    description = Column(String(2000), nullable=True, default="")
    hashtags = Column(String(500), nullable=True, default="")
    access_token = Column(Text, nullable=False)
    platform_user_id = Column(String(255), nullable=True)
    dub_language = Column(String(10), nullable=True)  # e.g. "es", "fr" — publish dubbed version
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    result = Column(JSON, nullable=True)
    platform_account_id = Column(
        UUID(as_uuid=True), ForeignKey("platform_accounts.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User", backref="schedules")
    clip = relationship("Clip", backref="schedules")
