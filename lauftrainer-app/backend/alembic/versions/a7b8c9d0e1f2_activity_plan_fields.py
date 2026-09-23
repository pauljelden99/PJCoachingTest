"""activity plan fields

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('activities', sa.Column('title', sa.String(length=200), nullable=False, server_default=''))
    op.add_column('activities', sa.Column('description', sa.Text(), nullable=False, server_default=''))
    op.add_column('activities', sa.Column('target_zone', sa.String(length=20), nullable=True))
    op.add_column('activities', sa.Column('segments', sa.JSON(), nullable=False, server_default='[]'))
    # Athletik/Beweglichkeit-Einheiten (wie bei PlannedSession) werden ueber
    # duration_s statt distance_m erfasst - siehe models/training_plan.py.
    op.alter_column('activities', 'distance_m', existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    op.alter_column('activities', 'distance_m', existing_type=sa.Float(), nullable=False)
    op.drop_column('activities', 'segments')
    op.drop_column('activities', 'target_zone')
    op.drop_column('activities', 'description')
    op.drop_column('activities', 'title')
