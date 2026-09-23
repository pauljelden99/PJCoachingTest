"""planned session segments

Revision ID: 0f346d489735
Revises: 5c4c148f0030
Create Date: 2026-08-27 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = '0f346d489735'
down_revision = '5c4c148f0030'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'planned_sessions',
        sa.Column('segments', sa.JSON(), nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    op.drop_column('planned_sessions', 'segments')
