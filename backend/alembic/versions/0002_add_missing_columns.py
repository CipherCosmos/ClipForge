"""Safely add missing columns and tables with IF NOT EXISTS checks.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(name: str) -> bool:
    conn = op.get_bind()
    return inspect(conn).has_table(name)


def column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    # --- users: add missing columns ---
    if not column_exists("users", "email_verified"):
        op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    if not column_exists("users", "verification_token"):
        op.add_column("users", sa.Column("verification_token", sa.String(64), nullable=True))
    if not column_exists("users", "reset_token"):
        op.add_column("users", sa.Column("reset_token", sa.String(64), nullable=True))
    if not column_exists("users", "reset_token_expires"):
        op.add_column("users", sa.Column("reset_token_expires", sa.DateTime(timezone=True), nullable=True))

    # --- refresh_tokens ---
    if not table_exists("refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
        op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    # --- webhooks ---
    if not table_exists("webhooks"):
        op.create_table(
            "webhooks",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("video_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False),
            sa.Column("url", sa.String(1024), nullable=False),
            sa.Column("events", postgresql.JSON(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_webhooks_video_id", "webhooks", ["video_id"])

    # --- subscriptions ---
    if not table_exists("subscriptions"):
        op.create_table(
            "subscriptions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("stripe_subscription_id", sa.String(255), nullable=False, unique=True),
            sa.Column("stripe_customer_id", sa.String(255), nullable=False),
            sa.Column("status", sa.String(50), nullable=False, server_default=sa.text("'active'")),
            sa.Column("plan", sa.String(50), nullable=False),
            sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
        op.create_index("ix_subscriptions_stripe_subscription_id", "subscriptions", ["stripe_subscription_id"])

    # --- schedules ---
    if not table_exists("schedules"):
        op.create_table(
            "schedules",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("clip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clips.id", ondelete="CASCADE"), nullable=False),
            sa.Column("platform", sa.String(50), nullable=False),
            sa.Column("title", sa.String(500), nullable=True, server_default=sa.text("''")),
            sa.Column("description", sa.String(2000), nullable=True, server_default=sa.text("''")),
            sa.Column("hashtags", sa.String(500), nullable=True, server_default=sa.text("''")),
            sa.Column("access_token", sa.Text(), nullable=False),
            sa.Column("platform_user_id", sa.String(255), nullable=True),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(50), nullable=False, server_default=sa.text("'pending'")),
            sa.Column("result", postgresql.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_schedules_user_id", "schedules", ["user_id"])
        op.create_index("ix_schedules_status", "schedules", ["status"])


def downgrade() -> None:
    if table_exists("schedules"):
        op.drop_table("schedules")
    if table_exists("subscriptions"):
        op.drop_table("subscriptions")
    if table_exists("webhooks"):
        op.drop_table("webhooks")
    if table_exists("refresh_tokens"):
        op.drop_table("refresh_tokens")
    if column_exists("users", "reset_token_expires"):
        op.drop_column("users", "reset_token_expires")
    if column_exists("users", "reset_token"):
        op.drop_column("users", "reset_token")
    if column_exists("users", "verification_token"):
        op.drop_column("users", "verification_token")
    if column_exists("users", "email_verified"):
        op.drop_column("users", "email_verified")
