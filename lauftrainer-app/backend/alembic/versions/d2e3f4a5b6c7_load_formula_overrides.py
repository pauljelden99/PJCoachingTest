"""load formula overrides (zone weights, rpe factor)

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-09-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd2e3f4a5b6c7'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('zone_weight_ga1', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('zone_weight_schwelle', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('zone_weight_vo2max', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('rpe_load_factor', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'rpe_load_factor')
    op.drop_column('users', 'zone_weight_vo2max')
    op.drop_column('users', 'zone_weight_schwelle')
    op.drop_column('users', 'zone_weight_ga1')
