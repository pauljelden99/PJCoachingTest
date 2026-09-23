"""daniels zone manual paces (easy/marathon/repetition)

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-09-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('easy_pace_sec_per_km', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('marathon_pace_sec_per_km', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('repetition_pace_sec_per_km', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'repetition_pace_sec_per_km')
    op.drop_column('users', 'marathon_pace_sec_per_km')
    op.drop_column('users', 'easy_pace_sec_per_km')
