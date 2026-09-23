"""user gender

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None

gender_enum = sa.Enum('MALE', 'FEMALE', 'DIVERSE', name='gender')


def upgrade() -> None:
    gender_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('users', sa.Column('gender', gender_enum, nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'gender')
    gender_enum.drop(op.get_bind(), checkfirst=True)
