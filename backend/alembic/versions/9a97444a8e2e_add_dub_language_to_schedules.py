"""add dub_language to schedules

Revision ID: 9a97444a8e2e
Revises: 0002
Create Date: 2026-06-26 22:32:54.085122
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '9a97444a8e2e'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('schedules', sa.Column('dub_language', sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column('schedules', 'dub_language')
