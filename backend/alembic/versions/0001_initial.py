"""initial schema and category seed

Revision ID: 0001
Revises:
Create Date: 2026-01-01 00:00:00

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op
from app.models import CATEGORY_SEED

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("type IN ('gasto', 'ingreso')", name="ck_categories_type"),
    )

    op.create_table(
        "movements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Text(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("type IN ('gasto', 'ingreso')", name="ck_movements_type"),
        sa.CheckConstraint("amount_cents > 0", name="ck_movements_amount_positive"),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name="fk_movements_category",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_movements_date", "movements", [sa.text("date DESC")])
    op.create_index("ix_movements_category_id", "movements", ["category_id"])
    op.create_index("ix_movements_type_date", "movements", ["type", "date"])

    op.create_table(
        "budgets",
        sa.Column("category_id", sa.Text(), primary_key=True),
        sa.Column("cap_cents", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("cap_cents > 0", name="ck_budgets_cap_positive"),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name="fk_budgets_category",
            ondelete="RESTRICT",
        ),
    )

    _seed_categories()


def _seed_categories() -> None:
    bind = op.get_bind()
    rows = [
        {
            "id": item["id"],
            "type": item["type"],
            "label": item["label"],
            "sort_order": item["sort_order"],
        }
        for item in CATEGORY_SEED
    ]
    categories = sa.table(
        "categories",
        sa.column("id", sa.Text),
        sa.column("type", sa.Text),
        sa.column("label", sa.Text),
        sa.column("sort_order", sa.Integer),
    )

    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        bind.execute(
            pg_insert(categories)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["id"])
        )
        return

    # Fallback for non-PostgreSQL dialects: only insert the missing rows.
    existing = {row[0] for row in bind.execute(sa.text("SELECT id FROM categories"))}
    pending = [row for row in rows if row["id"] not in existing]
    if pending:
        bind.execute(categories.insert(), pending)


def downgrade() -> None:
    op.drop_table("budgets")
    op.drop_index("ix_movements_type_date", table_name="movements")
    op.drop_index("ix_movements_category_id", table_name="movements")
    op.drop_index("ix_movements_date", table_name="movements")
    op.drop_table("movements")
    op.drop_table("categories")
