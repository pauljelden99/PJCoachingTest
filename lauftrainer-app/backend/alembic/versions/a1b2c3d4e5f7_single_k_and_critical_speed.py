"""single K cost exponent (drop load_k0/load_delta_k/load_alpha), add cs_use_vlt3 toggle

Revision ID: a1b2c3d4e5f7
Revises: f4a5b6c7d8e9
Create Date: 2026-09-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f7'
down_revision = 'f4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('load_k', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('cs_use_vlt3', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.drop_column('users', 'load_k0')
    op.drop_column('users', 'load_delta_k')
    op.drop_column('users', 'load_alpha')


def downgrade() -> None:
    op.add_column('users', sa.Column('load_alpha', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('load_delta_k', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('load_k0', sa.Float(), nullable=True))
    op.drop_column('users', 'cs_use_vlt3')
    op.drop_column('users', 'load_k')
