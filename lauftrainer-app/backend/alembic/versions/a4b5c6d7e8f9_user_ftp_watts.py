"""user ftp_watts

Adds ftp_watts to users - functional threshold power in watts, basis for
the cycling watt zones (services/watt_zones.py), analogous to
threshold_pace_sec_per_km for running.

Revision ID: a4b5c6d7e8f9
Revises: f7a8b9c0d1e2
Create Date: 2026-09-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a4b5c6d7e8f9'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ftp_watts", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ftp_watts")
