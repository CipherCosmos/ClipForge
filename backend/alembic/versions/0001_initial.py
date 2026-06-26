"""initial migration

Revision ID: 0001
Revises:
Create Date: 2026-06-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


planenum = postgresql.ENUM("free", "pro", name="planenum", create_type=True)
videostatusenum = postgresql.ENUM(
    "uploaded", "processing", "completed", "failed", name="videostatusenum", create_type=True
)
jobtypeenum = postgresql.ENUM(
    "transcription", "highlight", "render", "dubbing", name="jobtypeenum", create_type=True
)
jobstatusenum = postgresql.ENUM(
    "queued", "running", "done", "failed", name="jobstatusenum", create_type=True
)


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("plan", planenum, nullable=False),
        sa.Column("preferences", postgresql.JSON, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # --- videos ---
    op.create_table(
        "videos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_url", sa.String(1024), nullable=False),
        sa.Column("status", videostatusenum, nullable=False),
        sa.Column("duration", sa.Float, nullable=True),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("transcript", postgresql.JSONB, nullable=True),
        sa.Column("segments", postgresql.JSONB, nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("platform", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_videos_user_id", "videos", ["user_id"])

    # --- clips ---
    op.create_table(
        "clips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "video_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("start_time", sa.Float, nullable=False),
        sa.Column("end_time", sa.Float, nullable=False),
        sa.Column("caption", sa.String(1024), nullable=True),
        sa.Column("score", sa.Float, nullable=False),
        sa.Column("file_url", sa.String(1024), nullable=True),
        sa.Column("thumbnail_url", sa.String(1024), nullable=True),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("hashtags", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_clips_video_id", "clips", ["video_id"])

    # --- jobs ---
    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "video_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", jobtypeenum, nullable=False),
        sa.Column("status", jobstatusenum, nullable=False),
        sa.Column("progress", sa.Float, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_jobs_video_id", "jobs", ["video_id"])
    op.create_index("ix_jobs_type", "jobs", ["type"])

    # --- api_keys ---
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("key_prefix", sa.String(16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"])

    # --- users: add missing columns ---
    op.add_column("users", sa.Column("email_verified", sa.Boolean, default=False, nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("verification_token", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("reset_token", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("reset_token_expires", sa.DateTime(timezone=True), nullable=True))

    # --- refresh_tokens ---
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean, default=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    # --- webhooks ---
    op.create_table(
        "webhooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("video_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("events", postgresql.JSON, default=lambda: ["job.completed"]),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_webhooks_video_id", "webhooks", ["video_id"])

    # --- subscriptions ---
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=False, unique=True),
        sa.Column("stripe_customer_id", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, default="active"),
        sa.Column("plan", sa.String(50), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean, default=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_stripe_subscription_id", "subscriptions", ["stripe_subscription_id"])

    # --- schedules ---
    op.create_table(
        "schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(50), nullable=False),
        sa.Column("title", sa.String(500), nullable=True, default=""),
        sa.Column("description", sa.String(2000), nullable=True, default=""),
        sa.Column("hashtags", sa.String(500), nullable=True, default=""),
        sa.Column("access_token", sa.Text, nullable=False),
        sa.Column("platform_user_id", sa.String(255), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, default="pending"),
        sa.Column("result", postgresql.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_schedules_user_id", "schedules", ["user_id"])
    op.create_index("ix_schedules_status", "schedules", ["status"])


def downgrade() -> None:
    op.drop_table("schedules")
    op.drop_table("subscriptions")
    op.drop_table("webhooks")
    op.drop_table("refresh_tokens")
    op.drop_column("users", "reset_token_expires")
    op.drop_column("users", "reset_token")
    op.drop_column("users", "verification_token")
    op.drop_column("users", "email_verified")
    op.drop_table("api_keys")
    op.drop_table("jobs")
    op.drop_table("clips")
    op.drop_table("videos")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS jobstatusenum")
    op.execute("DROP TYPE IF EXISTS jobtypeenum")
    op.execute("DROP TYPE IF EXISTS videostatusenum")
    op.execute("DROP TYPE IF EXISTS planenum")
