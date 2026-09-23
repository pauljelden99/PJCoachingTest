"""oauth token sync progress

Adds sync_status/sync_total/sync_done/sync_error to oauth_tokens so the
Strava-Sync (now a background Celery task, see app/services/strava_sync.py)
can report progress to the frontend via GET /api/oauth/{provider}/sync-status
- the sync keeps running independent of the page that triggered it, so
progress must live in the DB rather than in request/response state.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-09-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'd5e6f7a8b9c0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "oauth_tokens",
        sa.Column("sync_status", sa.String(length=20), nullable=False, server_default="idle"),
    )
    op.alter_column("oauth_tokens", "sync_status", server_default=None)
    op.add_column("oauth_tokens", sa.Column("sync_total", sa.Integer(), nullable=True))
    op.add_column("oauth_tokens", sa.Column("sync_done", sa.Integer(), nullable=True))
    op.add_column("oauth_tokens", sa.Column("sync_error", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("oauth_tokens", "sync_error")
    op.drop_column("oauth_tokens", "sync_done")
    op.drop_column("oauth_tokens", "sync_total")
    op.drop_column("oauth_tokens", "sync_status")
