"""user warmup/cooldown defaults

Adds warmup_pace_sec_per_km/cooldown_pace_sec_per_km (running) and
warmup_watts/cooldown_watts (cycling) to users - trainer-configured
defaults for warmup/cooldown segments, automatically applied instead of
the generic estimate (see frontend/src/lib/paceZones.ts:deriveZonePace and
wattZones.ts:deriveZoneWatts).

Revision ID: b4c5d6e7f8a9
Revises: a4b5c6d7e8f9
Create Date: 2026-09-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b4c5d6e7f8a9'
down_revision = 'a4b5c6d7e8f9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("warmup_pace_sec_per_km", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("cooldown_pace_sec_per_km", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("warmup_watts", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("cooldown_watts", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "cooldown_watts")
    op.drop_column("users", "warmup_watts")
    op.drop_column("users", "cooldown_pace_sec_per_km")
    op.drop_column("users", "warmup_pace_sec_per_km")
