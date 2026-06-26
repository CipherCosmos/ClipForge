"""Add platform_accounts and publish_logs tables.

Revision ID: 0003
Revises: 45c35e2cb019
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "0003"
down_revision: Union[str, None] = "45c35e2cb019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(name: str) -> bool:
    return inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    if not table_exists("platform_accounts"):
        op.execute("""
            CREATE TABLE platform_accounts (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                platform VARCHAR(50) NOT NULL,
                label VARCHAR(128) NOT NULL DEFAULT '',
                access_token TEXT NOT NULL,
                platform_user_id VARCHAR(255),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
            );
            CREATE INDEX ix_platform_accounts_user_id ON platform_accounts(user_id);
        """)
    if not table_exists("publish_logs"):
        op.execute("""
            CREATE TABLE publish_logs (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                clip_id UUID REFERENCES clips(id) ON DELETE SET NULL,
                platform_account_id UUID REFERENCES platform_accounts(id) ON DELETE SET NULL,
                platform VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                title VARCHAR(500) DEFAULT '',
                description VARCHAR(2000) DEFAULT '',
                hashtags VARCHAR(500) DEFAULT '',
                dub_language VARCHAR(10),
                result JSONB,
                published_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
            );
            CREATE INDEX ix_publish_logs_user_id ON publish_logs(user_id);
        """)


def downgrade() -> None:
    if table_exists("publish_logs"):
        op.execute("DROP TABLE publish_logs")
    if table_exists("platform_accounts"):
        op.execute("DROP TABLE platform_accounts")
