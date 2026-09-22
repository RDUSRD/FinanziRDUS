"""movement detail lines (optional invoice items)

Adds the ``movement_items`` table: optional product/service lines attached to a
movement. When a movement has lines its ``amount_cents`` is derived from their
sum (canonical USD cents). No backfill is needed: existing movements simply have
no lines.

Revision ID: 0004
Revises: 0003
Create Date: 2026-01-01 00:00:00

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "movement_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("movement_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("amount_cents > 0", name="ck_movement_items_amount_positive"),
        sa.ForeignKeyConstraint(
            ["movement_id"],
            ["movements.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_movement_items_movement_id", "movement_items", ["movement_id"])


def downgrade() -> None:
    op.drop_index("ix_movement_items_movement_id", table_name="movement_items")
    op.drop_table("movement_items")
