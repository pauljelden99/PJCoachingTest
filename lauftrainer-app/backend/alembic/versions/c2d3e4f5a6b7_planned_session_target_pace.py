"""editable target pace for planned sessions (GA1 runs)

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-08-30 00:00:01.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c2d3e4f5a6b7'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'planned_sessions', sa.Column('target_pace', sa.String(length=10), nullable=False, server_default='')
    )
    op.alter_column('planned_sessions', 'target_pace', server_default=None)


def downgrade() -> None:
    op.drop_column('planned_sessions', 'target_pace')
