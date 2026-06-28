"""add platform_accounts and publish_logs tables

Revision ID: 45c35e2cb019
Revises: 9a97444a8e2e
Create Date: 2026-06-26 22:40:44.076950
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '45c35e2cb019'
down_revision: Union[str, None] = '9a97444a8e2e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('platform_accounts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('platform', sa.String(length=50), nullable=False),
    sa.Column('label', sa.String(length=255), nullable=False),
    sa.Column('access_token', sa.Text(), nullable=False),
    sa.Column('refresh_token_enc', sa.Text(), nullable=True),
    sa.Column('platform_user_id', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_platform_accounts_platform', 'platform_accounts', ['platform'], unique=False)
    op.create_index('ix_platform_accounts_user_id', 'platform_accounts', ['user_id'], unique=False)
    op.create_table('publish_logs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('clip_id', sa.UUID(), nullable=False),
    sa.Column('platform_account_id', sa.UUID(), nullable=True),
    sa.Column('platform', sa.String(length=50), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('dub_language', sa.String(length=10), nullable=True),
    sa.Column('title', sa.String(length=500), nullable=True),
    sa.Column('description', sa.String(length=2000), nullable=True),
    sa.Column('hashtags', sa.String(length=500), nullable=True),
    sa.Column('result', sa.JSON(), nullable=True),
    sa.Column('published_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['clip_id'], ['clips.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['platform_account_id'], ['platform_accounts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_publish_logs_clip_id', 'publish_logs', ['clip_id'], unique=False)
    op.create_index('ix_publish_logs_status', 'publish_logs', ['status'], unique=False)
    op.create_index('ix_publish_logs_user_id', 'publish_logs', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_publish_logs_user_id', table_name='publish_logs')
    op.drop_index('ix_publish_logs_status', table_name='publish_logs')
    op.drop_index('ix_publish_logs_clip_id', table_name='publish_logs')
    op.drop_table('publish_logs')
    op.drop_index('ix_platform_accounts_user_id', table_name='platform_accounts')
    op.drop_index('ix_platform_accounts_platform', table_name='platform_accounts')
    op.drop_table('platform_accounts')
