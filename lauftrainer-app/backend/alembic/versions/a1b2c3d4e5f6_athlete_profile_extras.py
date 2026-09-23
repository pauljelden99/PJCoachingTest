"""athlete profile extras

Revision ID: a1b2c3d4e5f6
Revises: 0f346d489735
Create Date: 2026-08-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = '0f346d489735'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('birth_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('height_cm', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('weight_kg', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('weekly_rhythm_note', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('goal_race_name', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('goal_race_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('goal_time_s', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('goals_note', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'notes')
    op.drop_column('users', 'goals_note')
    op.drop_column('users', 'goal_time_s')
    op.drop_column('users', 'goal_race_date')
    op.drop_column('users', 'goal_race_name')
    op.drop_column('users', 'weekly_rhythm_note')
    op.drop_column('users', 'weight_kg')
    op.drop_column('users', 'height_cm')
    op.drop_column('users', 'birth_date')
