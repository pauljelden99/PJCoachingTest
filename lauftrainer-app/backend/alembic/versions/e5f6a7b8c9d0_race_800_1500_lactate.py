"""race 800/1500 and lactate params (vLT3, VLaMax)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('race_800m_time_s', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('race_1500m_time_s', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('vlt3_pace_sec_per_km', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('vla_max', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'vla_max')
    op.drop_column('users', 'vlt3_pace_sec_per_km')
    op.drop_column('users', 'race_1500m_time_s')
    op.drop_column('users', 'race_800m_time_s')
