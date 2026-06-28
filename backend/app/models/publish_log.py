import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PublishLog(Base):
    __tablename__ = "publish_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clip_id = Column(UUID(as_uuid=True), ForeignKey("clips.id", ondelete="SET NULL"), nullable=True)
    platform_account_id = Column(
        UUID(as_uuid=True), ForeignKey("platform_accounts.id", ondelete="SET NULL"), nullable=True
    )
    platform = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending, success, failed
    title = Column(String(500), nullable=True, default="")
    description = Column(String(2000), nullable=True, default="")
    hashtags = Column(String(500), nullable=True, default="")
    dub_language = Column(String(10), nullable=True)
    result = Column(JSON, nullable=True)
    published_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", backref="publish_logs")
    clip = relationship("Clip", backref="publish_logs")
