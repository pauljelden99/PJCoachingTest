"""activity effective_vo2max

Adds effective_vo2max to activities (persisted once at import/manual-entry
time, see services/normalizer.py:build_activity_record - either from a
Strava velocity time series or, as a fallback, the simple distance/duration
Daniels-Gilbert formula) and backfills existing rows with the simple
formula, so the VO2max chart doesn't lose historical data points until
those activities are re-synced/edited.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-09-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'e6f7a8b9c0d1'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activities", sa.Column("effective_vo2max", sa.Float(), nullable=True))

    # Backfill mit der einfachen Daniels-Gilbert-Formel (identisch zu
    # services/analytics.py:effective_vo2max) - Streams gibt es fuer
    # Altdaten nicht, daher hier bewusst nur die einfache Rechnung.
    op.execute(
        """
        UPDATE activities
        SET effective_vo2max = (
            (-4.60 + 0.182258 * sub.v + 0.000104 * sub.v * sub.v)
            / (0.8 + 0.1894393 * EXP(-0.012778 * sub.t) + 0.2989558 * EXP(-0.1932605 * sub.t))
        )
        FROM (
            SELECT id,
                   distance_m * 60.0 / duration_s AS v,
                   duration_s / 60.0 AS t
            FROM activities
            WHERE distance_m IS NOT NULL AND distance_m > 0 AND duration_s >= 180
        ) AS sub
        WHERE activities.id = sub.id
        """
    )


def downgrade() -> None:
    op.drop_column("activities", "effective_vo2max")
