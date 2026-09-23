"""trainer is_admin flag

Revision ID: a3b4c5d6e7f8
Revises: f3a4b5c6d7e8
Create Date: 2026-09-09 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a3b4c5d6e7f8'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()))
    # Vor Einfuehrung dieses Felds hatte jeder Trainer implizit Admin-Rechte
    # (siehe core/deps.py:require_admin) - bestehende Trainer behalten sie.
    op.execute("UPDATE users SET is_admin = true WHERE role = 'TRAINER'")


def downgrade() -> None:
    op.drop_column('users', 'is_admin')
