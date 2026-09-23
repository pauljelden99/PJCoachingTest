"""composite (athlete_id, day) indexes

Jede athletenbezogene Leseabfrage auf activities/planned_sessions filtert
auf `athlete_id` und grenzt zusaetzlich ueber `day` ein bzw. sortiert
danach (siehe api/activities.py, api/analytics.py, api/training_zones.py,
api/training_plans.py). Bisher gab es nur zwei getrennte Einzelindizes,
von denen Postgres pro Abfrage praktisch nur einen nutzt - der Rest der
Zeilen wird gefiltert und anschliessend sortiert. Ein zusammengesetzter
Index (athlete_id, day) bedient beide Teile in einem Zugriff und liefert
die Zeilen bereits in der gewuenschten Reihenfolge (kein separater Sort).

daily_wellness und calendar_notes brauchen nichts davon: deren
UniqueConstraint (athlete_id, day) (siehe models/daily_wellness.py bzw.
models/calendar_note.py) ist bereits ein zusammengesetzter Index ueber
genau diese beiden Spalten und bedient die Zeitraumabfragen dort schon.

Die bestehenden Einzelindizes auf `athlete_id` bleiben absichtlich
erhalten: die Fremdschluessel-Pruefung beim Loeschen eines Athleten
(services/user_profile.py:delete_athlete_data) nutzt sie weiterhin, und
der zusammengesetzte Index ersetzt sie zwar als Praefix, das Entfernen
waere aber eine eigene, hier nicht noetige Entscheidung.

Revision ID: c5d6e7f8a9b0
Revises: b2c3d4e5f6a8
Create Date: 2026-09-22
"""

from alembic import op

revision = "c5d6e7f8a9b0"
down_revision = "b2c3d4e5f6a8"
branch_labels = None
depends_on = None

# (Indexname, Tabelle) - die beiden Tabellen ohne passenden
# UniqueConstraint (s.o.).
_INDEXES = [
    ("ix_activities_athlete_day", "activities"),
    ("ix_planned_sessions_athlete_day", "planned_sessions"),
]


def upgrade() -> None:
    for name, table in _INDEXES:
        op.create_index(name, table, ["athlete_id", "day"])


def downgrade() -> None:
    for name, table in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
