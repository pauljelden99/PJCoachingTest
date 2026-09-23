"""activity elevation_gain_m

Adds elevation_gain_m to activities - optional, primarily for cycling
(Strava provides total_elevation_gain in the activity summary at no extra
API cost; manual entries can set it via ManualActivityForm.tsx).

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-09-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'f7a8b9c0d1e2'
down_revision = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activities", sa.Column("elevation_gain_m", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("activities", "elevation_gain_m")
