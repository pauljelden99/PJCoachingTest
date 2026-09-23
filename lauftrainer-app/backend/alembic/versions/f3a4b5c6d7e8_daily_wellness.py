"""daily wellness

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-09-08 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'daily_wellness',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('resting_hr', sa.Float(), nullable=True),
        sa.Column('hrv', sa.Float(), nullable=True),
        sa.Column('sleep_duration_h', sa.Float(), nullable=True),
        sa.Column('sleep_quality', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('athlete_id', 'day', name='uq_daily_wellness_athlete_day'),
    )
    op.create_index('ix_daily_wellness_athlete_id', 'daily_wellness', ['athlete_id'])
    op.create_index('ix_daily_wellness_day', 'daily_wellness', ['day'])


def downgrade() -> None:
    op.drop_index('ix_daily_wellness_day', table_name='daily_wellness')
    op.drop_index('ix_daily_wellness_athlete_id', table_name='daily_wellness')
    op.drop_table('daily_wellness')
