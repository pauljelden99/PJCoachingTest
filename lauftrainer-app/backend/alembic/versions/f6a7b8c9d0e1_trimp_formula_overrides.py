"""trimp formula overrides

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('trimp_exponent_factor', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('trimp_weight_factor', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'trimp_weight_factor')
    op.drop_column('users', 'trimp_exponent_factor')
