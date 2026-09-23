"""oauth token last_synced_at

Adds last_synced_at to oauth_tokens so the automatic sync-on-login/
dashboard-view (app/services/strava_sync.py) can throttle repeated Strava
API calls per athlete instead of re-fetching on every request.

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-09-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("oauth_tokens", sa.Column("last_synced_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("oauth_tokens", "last_synced_at")
