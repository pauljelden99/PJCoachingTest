"""daniels zone manual min/max bounds

Revision ID: afd762c4b8cc
Revises: b4c5d6e7f8a9
Create Date: 2026-09-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'afd762c4b8cc'
down_revision = 'b4c5d6e7f8a9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for zone in ('easy', 'marathon', 'threshold', 'vo2max', 'repetition'):
        op.add_column('users', sa.Column(f'{zone}_pace_min_sec_per_km', sa.Float(), nullable=True))
        op.add_column('users', sa.Column(f'{zone}_pace_max_sec_per_km', sa.Float(), nullable=True))


def downgrade() -> None:
    for zone in ('easy', 'marathon', 'threshold', 'vo2max', 'repetition'):
        op.drop_column('users', f'{zone}_pace_max_sec_per_km')
        op.drop_column('users', f'{zone}_pace_min_sec_per_km')
