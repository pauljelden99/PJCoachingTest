"""continuous pace load formula (load_k0/delta_k/alpha), drop zone weights + rpe factor, add activity.rpe note

Revision ID: f4a5b6c7d8e9
Revises: d2e3f4a5b6c7
Create Date: 2026-09-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f4a5b6c7d8e9'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('load_k0', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('load_delta_k', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('load_alpha', sa.Float(), nullable=True))
    op.drop_column('users', 'zone_weight_ga1')
    op.drop_column('users', 'zone_weight_schwelle')
    op.drop_column('users', 'zone_weight_vo2max')
    op.drop_column('users', 'rpe_load_factor')
    op.add_column('activities', sa.Column('rpe', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('activities', 'rpe')
    op.add_column('users', sa.Column('rpe_load_factor', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('zone_weight_vo2max', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('zone_weight_schwelle', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('zone_weight_ga1', sa.Float(), nullable=True))
    op.drop_column('users', 'load_alpha')
    op.drop_column('users', 'load_delta_k')
    op.drop_column('users', 'load_k0')
