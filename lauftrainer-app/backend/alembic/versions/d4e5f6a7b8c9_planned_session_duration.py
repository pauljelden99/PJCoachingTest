"""planned session target duration

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-29 00:00:01.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('planned_sessions', sa.Column('target_duration_s', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('planned_sessions', 'target_duration_s')
