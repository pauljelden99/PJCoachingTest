"""calendar notes

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'calendar_notes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('athlete_id', 'day', name='uq_calendar_notes_athlete_day'),
    )
    op.create_index('ix_calendar_notes_athlete_id', 'calendar_notes', ['athlete_id'])
    op.create_index('ix_calendar_notes_day', 'calendar_notes', ['day'])


def downgrade() -> None:
    op.drop_index('ix_calendar_notes_day', table_name='calendar_notes')
    op.drop_index('ix_calendar_notes_athlete_id', table_name='calendar_notes')
    op.drop_table('calendar_notes')
