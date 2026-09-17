"""usd wallet, ves entry and money jars

Adds the entry triplet to ``movements`` (``entry_currency``,
``entry_amount_cents``, ``rate_micros``) with a backfill for existing rows, plus
the ``jars`` / ``jar_categories`` catalogues.

Revision ID: 0002
Revises: 0001
Create Date: 2026-01-01 00:00:00

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op
from app.models import JAR_CATEGORY_SEED, JAR_SEED

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) New movement columns. ``entry_currency`` starts with a server default so
    #    pre-existing rows are backfilled to 'USD' before it becomes mandatory.
    op.add_column(
        "movements",
        sa.Column("entry_currency", sa.Text(), nullable=True, server_default=sa.text("'USD'")),
    )
    op.add_column(
        "movements",
        sa.Column("entry_amount_cents", sa.Integer(), nullable=True),
    )
    op.add_column(
        "movements",
        sa.Column("rate_micros", sa.BigInteger(), nullable=True),
    )

    # 2) Backfill: the old records were canonical USD amounts.
    op.execute(
        "UPDATE movements SET entry_amount_cents = amount_cents "
        "WHERE entry_amount_cents IS NULL"
    )
    op.execute("UPDATE movements SET entry_currency = 'USD' WHERE entry_currency IS NULL")

    # 3) Make them mandatory and drop the temporary default.
    op.alter_column(
        "movements",
        "entry_currency",
        existing_type=sa.Text(),
        nullable=False,
        server_default=None,
    )
    op.alter_column(
        "movements",
        "entry_amount_cents",
        existing_type=sa.Integer(),
        nullable=False,
    )

    # 4) Checks for the new columns.
    op.create_check_constraint(
        "ck_movements_entry_currency",
        "movements",
        "entry_currency IN ('USD', 'VES')",
    )
    op.create_check_constraint(
        "ck_movements_rate_micros_positive",
        "movements",
        "rate_micros IS NULL OR rate_micros > 0",
    )

    # 5) Money jars catalogue.
    op.create_table(
        "jars",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("pct", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("pct > 0", name="ck_jars_pct_positive"),
    )
    _seed_jars()

    # 6) Category -> jar mapping.
    op.create_table(
        "jar_categories",
        sa.Column("category_id", sa.Text(), primary_key=True),
        sa.Column("jar_id", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name="fk_jar_categories_category",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["jar_id"],
            ["jars.id"],
            name="fk_jar_categories_jar",
            ondelete="RESTRICT",
        ),
    )
    _seed_jar_categories()


def _seed_jars() -> None:
    bind = op.get_bind()
    rows = [
        {
            "id": item["id"],
            "label": item["label"],
            "pct": item["pct"],
            "sort_order": item["sort_order"],
        }
        for item in JAR_SEED
    ]
    jars = sa.table(
        "jars",
        sa.column("id", sa.Text),
        sa.column("label", sa.Text),
        sa.column("pct", sa.Integer),
        sa.column("sort_order", sa.Integer),
    )

    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        bind.execute(
            pg_insert(jars).values(rows).on_conflict_do_nothing(index_elements=["id"])
        )
        return

    # Fallback for non-PostgreSQL dialects: only insert the missing rows.
    existing = {row[0] for row in bind.execute(sa.text("SELECT id FROM jars"))}
    pending = [row for row in rows if row["id"] not in existing]
    if pending:
        bind.execute(jars.insert(), pending)


def _seed_jar_categories() -> None:
    bind = op.get_bind()
    rows = [
        {"category_id": item["category_id"], "jar_id": item["jar_id"]}
        for item in JAR_CATEGORY_SEED
    ]
    jar_categories = sa.table(
        "jar_categories",
        sa.column("category_id", sa.Text),
        sa.column("jar_id", sa.Text),
    )

    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        bind.execute(
            pg_insert(jar_categories)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["category_id"])
        )
        return

    # Fallback for non-PostgreSQL dialects: only insert the missing rows.
    existing = {row[0] for row in bind.execute(sa.text("SELECT category_id FROM jar_categories"))}
    pending = [row for row in rows if row["category_id"] not in existing]
    if pending:
        bind.execute(jar_categories.insert(), pending)


def downgrade() -> None:
    op.drop_table("jar_categories")
    op.drop_table("jars")
    op.drop_constraint("ck_movements_rate_micros_positive", "movements", type_="check")
    op.drop_constraint("ck_movements_entry_currency", "movements", type_="check")
    op.drop_column("movements", "rate_micros")
    op.drop_column("movements", "entry_amount_cents")
    op.drop_column("movements", "entry_currency")
