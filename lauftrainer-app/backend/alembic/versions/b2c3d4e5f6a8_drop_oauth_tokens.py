"""drop oauth_tokens (Strava-Import entfernt)

Der Strava-Import (OAuth-Verbindung, Hintergrund-Sync) wurde komplett aus
der Codebase entfernt - die Tabelle wird nicht mehr geschrieben/gelesen
(vormals app/models/oauth_token.py, app/api/oauth.py,
app/services/strava_sync.py). Bereits importierte Aktivitaeten
(Activity.source == "strava") bleiben unveraendert erhalten.

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-09-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a8'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("oauth_tokens")


def downgrade() -> None:
    op.create_table(
        "oauth_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.Enum("GARMIN", "POLAR", "COROS", "STRAVA", "MANUAL", name="datasource"), nullable=False),
        sa.Column("access_token", sa.String(length=1000), nullable=False),
        sa.Column("refresh_token", sa.String(length=1000), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("provider_user_id", sa.String(length=255), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("sync_status", sa.String(length=20), nullable=False, server_default="idle"),
        sa.Column("sync_total", sa.Integer(), nullable=True),
        sa.Column("sync_done", sa.Integer(), nullable=True),
        sa.Column("sync_error", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["athlete_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("athlete_id", "provider", name="uq_oauth_tokens_athlete_provider"),
    )
    op.create_index(op.f("ix_oauth_tokens_athlete_id"), "oauth_tokens", ["athlete_id"], unique=False)
