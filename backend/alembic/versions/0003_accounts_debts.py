"""named USD wallets (accounts) and debts

Adds ``categories.is_system`` plus the system ``deudas`` category, the
``accounts`` table (a negative opening balance represents a debt) and the
``movements.account_id`` / ``movements.is_debt_payment`` columns with a backfill
of every existing movement to the default wallet.

Revision ID: 0003
Revises: 0002
Create Date: 2026-01-01 00:00:00

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op
from app.domain import DEBT_CATEGORY_ID
from app.models import CATEGORY_SEED, SYSTEM_CATEGORY_IDS

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

DEFAULT_ACCOUNT_NAME = "Cartera USD"


def upgrade() -> None:
    bind = op.get_bind()

    # 1) System flag on the category catalogue, then seed the system categories.
    op.add_column(
        "categories",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("categories", "is_system", server_default=None)
    _seed_system_categories(bind)

    # 2) Named USD wallets. The default wallet is inserted without an explicit id
    #    so the sequence advances normally.
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "opening_balance_cents",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.execute(
        "INSERT INTO accounts (name, opening_balance_cents, sort_order) VALUES "
        f"('{DEFAULT_ACCOUNT_NAME}', 0, 1)"
    )

    # 3) Every movement belongs to an account: add the column, backfill the rows
    #    to the default wallet, then make it mandatory with an FK and an index.
    op.add_column("movements", sa.Column("account_id", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE movements SET account_id = "
        "(SELECT id FROM accounts ORDER BY id LIMIT 1) WHERE account_id IS NULL"
    )
    op.alter_column("movements", "account_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        "fk_movements_account",
        "movements",
        "accounts",
        ["account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_movements_account_date",
        "movements",
        ["account_id", sa.text("date DESC")],
    )

    # 4) Debt-payment flag with its CHECK constraint.
    op.add_column(
        "movements",
        sa.Column(
            "is_debt_payment",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_check_constraint(
        "ck_movements_debt_payment_type",
        "movements",
        "is_debt_payment = false OR type = 'gasto'",
    )
    op.alter_column("movements", "is_debt_payment", server_default=None)


def _seed_system_categories(bind) -> None:
    rows = [
        {
            "id": item["id"],
            "type": item["type"],
            "label": item["label"],
            "sort_order": item["sort_order"],
            "is_system": True,
        }
        for item in CATEGORY_SEED
        if item["id"] in SYSTEM_CATEGORY_IDS
    ]
    categories = sa.table(
        "categories",
        sa.column("id", sa.Text),
        sa.column("type", sa.Text),
        sa.column("label", sa.Text),
        sa.column("sort_order", sa.Integer),
        sa.column("is_system", sa.Boolean),
    )

    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        bind.execute(
            pg_insert(categories).values(rows).on_conflict_do_nothing(index_elements=["id"])
        )
    else:
        # Fallback for non-PostgreSQL dialects: only insert the missing rows.
        existing = {row[0] for row in bind.execute(sa.text("SELECT id FROM categories"))}
        pending = [row for row in rows if row["id"] not in existing]
        if pending:
            bind.execute(categories.insert(), pending)

    # A fresh install seeds the whole catalogue from ``CATEGORY_SEED`` in 0001,
    # before this column existed, so re-assert the flag for the system ids.
    for category_id in sorted(SYSTEM_CATEGORY_IDS):
        bind.execute(
            sa.text("UPDATE categories SET is_system = true WHERE id = :category_id"),
            {"category_id": category_id},
        )


def downgrade() -> None:
    op.drop_constraint("ck_movements_debt_payment_type", "movements", type_="check")
    op.drop_column("movements", "is_debt_payment")
    op.drop_index("ix_movements_account_date", table_name="movements")
    op.drop_constraint("fk_movements_account", "movements", type_="foreignkey")
    op.drop_column("movements", "account_id")
    op.drop_table("accounts")
    op.execute(sa.text("DELETE FROM categories WHERE id = :category_id").bindparams(
        category_id=DEBT_CATEGORY_ID
    ))
    op.drop_column("categories", "is_system")
