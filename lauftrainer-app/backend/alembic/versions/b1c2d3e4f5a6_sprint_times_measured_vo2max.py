"""race 100/400 sprint times and measured VO2max (Leistungsdiagnostik)

Revision ID: b1c2d3e4f5a6
Revises: a7b8c9d0e1f2
Create Date: 2026-08-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b1c2d3e4f5a6'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('race_100m_time_s', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('race_400m_time_s', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('vo2max_measured', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'vo2max_measured')
    op.drop_column('users', 'race_400m_time_s')
    op.drop_column('users', 'race_100m_time_s')
