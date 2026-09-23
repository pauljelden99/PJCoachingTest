"""method field for planned sessions / activities (e.g. Fahrtspiel)

Fahrtspiel ist keine eigene Zielzone mehr (frueher Teil von OTHER_ZONES),
sondern eine Methodik-Variante EINER Lauf-Schwelleneinheit (siehe
services/training_zones.py-Kommentar zu PACE_ZONES) - dafuer braucht es ein
eigenes, unabhaengig von target_zone gesetztes Feld auf beiden Tabellen.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-09-22
"""

from alembic import op
import sqlalchemy as sa

revision = "d6e7f8a9b0c1"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None

_TABLES = ["planned_sessions", "activities"]


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column("method", sa.String(length=20), nullable=True))


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_column(table, "method")
