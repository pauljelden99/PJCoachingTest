"""strava only datasource

Removes GARMIN/POLAR/COROS from the datasource enum - the app now only
integrates with Strava (plus manual entries). Safe because no rows use
those values (Garmin/Polar/Coros credentials were never configured).

Revision ID: b3c4d5e6f7a8
Revises: a3b4c5d6e7f8
Create Date: 2026-09-12 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b3c4d5e6f7a8'
down_revision = 'a3b4c5d6e7f8'
branch_labels = None
depends_on = None

old_values = ('GARMIN', 'POLAR', 'COROS', 'STRAVA', 'MANUAL')
new_values = ('STRAVA', 'MANUAL')


def upgrade() -> None:
    op.execute("ALTER TYPE datasource RENAME TO datasource_old")
    sa.Enum(*new_values, name='datasource').create(op.get_bind())
    op.execute(
        "ALTER TABLE activities ALTER COLUMN source TYPE datasource "
        "USING source::text::datasource"
    )
    op.execute(
        "ALTER TABLE oauth_tokens ALTER COLUMN provider TYPE datasource "
        "USING provider::text::datasource"
    )
    op.execute("DROP TYPE datasource_old")


def downgrade() -> None:
    op.execute("ALTER TYPE datasource RENAME TO datasource_new")
    sa.Enum(*old_values, name='datasource').create(op.get_bind())
    op.execute(
        "ALTER TABLE activities ALTER COLUMN source TYPE datasource "
        "USING source::text::datasource"
    )
    op.execute(
        "ALTER TABLE oauth_tokens ALTER COLUMN provider TYPE datasource "
        "USING provider::text::datasource"
    )
    op.execute("DROP TYPE datasource_new")
