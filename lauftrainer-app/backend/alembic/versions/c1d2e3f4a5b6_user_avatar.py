"""user avatar

Revision ID: c1d2e3f4a5b6
Revises: afd762c4b8cc
Create Date: 2026-09-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c1d2e3f4a5b6'
down_revision = 'afd762c4b8cc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar')
