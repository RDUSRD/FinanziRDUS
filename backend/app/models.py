"""SQLAlchemy 2.x models for FinanciRDUS.

Tables: ``categories`` (fixed catalogue), ``movements``, ``budgets`` and the
money-jars tables ``jars`` / ``jar_categories``. All money is stored as an
integer number of cents (canonical USD cents for movements).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Fixed catalogue (id / label / type) in presentation order.
CATEGORY_SEED: list[dict[str, object]] = [
    {"id": "supermercado", "type": "gasto", "label": "Supermercado", "sort_order": 1},
    {"id": "comidas-afuera", "type": "gasto", "label": "Comidas afuera", "sort_order": 2},
    {"id": "transporte", "type": "gasto", "label": "Transporte", "sort_order": 3},
    {"id": "alquiler-servicios", "type": "gasto", "label": "Alquiler y servicios", "sort_order": 4},
    {"id": "salud", "type": "gasto", "label": "Salud", "sort_order": 5},
    {"id": "suscripciones", "type": "gasto", "label": "Suscripciones", "sort_order": 6},
    {"id": "ropa", "type": "gasto", "label": "Ropa", "sort_order": 7},
    {"id": "ocio", "type": "gasto", "label": "Ocio", "sort_order": 8},
    {"id": "ahorro", "type": "gasto", "label": "Ahorro", "sort_order": 9},
    {"id": "otros", "type": "gasto", "label": "Otros", "sort_order": 10},
    {"id": "deudas", "type": "gasto", "label": "Deudas", "sort_order": 11},
    {"id": "sueldo", "type": "ingreso", "label": "Sueldo", "sort_order": 1},
    {"id": "freelance", "type": "ingreso", "label": "Freelance", "sort_order": 2},
    {"id": "inversiones", "type": "ingreso", "label": "Inversiones", "sort_order": 3},
    {"id": "otros-ingresos", "type": "ingreso", "label": "Otros", "sort_order": 4},
]

# Categories that are managed by the system (never chosen by the user, never a
# budget, never mapped to a money jar). See :func:`is_system_category`.
SYSTEM_CATEGORY_IDS: set[str] = {"deudas"}


def is_system_category(category_id: str) -> bool:
    """Return ``True`` for categories seeded as system-managed (e.g. ``deudas``)."""
    return category_id in SYSTEM_CATEGORY_IDS


TYPE_CHECK = "type IN ('gasto', 'ingreso')"

# Fixed money-jars catalogue (id / label / pct / presentation order).
JAR_SEED: list[dict[str, object]] = [
    {"id": "crecimiento", "label": "Crecimiento", "pct": 25, "sort_order": 1},
    {"id": "estabilidad", "label": "Estabilidad", "pct": 15, "sort_order": 2},
    {"id": "esencial", "label": "Esencial", "pct": 50, "sort_order": 3},
    {"id": "recompensas", "label": "Recompensas", "pct": 10, "sort_order": 4},
]

# Default category -> jar mapping (editable from the plan panel). Only expense
# categories take part; entries follow the category catalogue order so the plan
# response can list category ids "like the catalogue".
JAR_CATEGORY_SEED: list[dict[str, str]] = [
    {"category_id": "supermercado", "jar_id": "esencial"},
    {"category_id": "comidas-afuera", "jar_id": "recompensas"},
    {"category_id": "transporte", "jar_id": "esencial"},
    {"category_id": "alquiler-servicios", "jar_id": "esencial"},
    {"category_id": "salud", "jar_id": "esencial"},
    {"category_id": "suscripciones", "jar_id": "esencial"},
    {"category_id": "ropa", "jar_id": "recompensas"},
    {"category_id": "ocio", "jar_id": "recompensas"},
    {"category_id": "ahorro", "jar_id": "crecimiento"},
    {"category_id": "otros", "jar_id": "estabilidad"},
]


class Base(DeclarativeBase):
    """Declarative base for all models."""


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    # System categories (e.g. ``deudas``) are hidden from the manual selector, the
    # budgets list and the money-jars mapping.
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    __table_args__ = (CheckConstraint(TYPE_CHECK, name="ck_categories_type"),)


class Account(Base):
    """A named USD wallet. A negative opening balance represents a debt."""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    opening_balance_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Movement(Base):
    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=False,
    )
    account_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("accounts.id", ondelete="RESTRICT", name="fk_movements_account"),
        nullable=False,
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # How the user typed the movement: ``entry_currency`` is 'USD' or 'VES',
    # ``entry_amount_cents`` is the amount in that currency (USD cents or Bs
    # céntimos) and ``rate_micros`` (Bs/USD x 1e6) is only present for 'VES'.
    # ``amount_cents`` above is always the canonical USD cents.
    entry_currency: Mapped[str] = mapped_column(Text, nullable=False)
    entry_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_micros: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # A debt payment is a ``gasto`` in the ``deudas`` category that raises the
    # (negative) balance of its account towards zero.
    is_debt_payment: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=text("''")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        CheckConstraint(TYPE_CHECK, name="ck_movements_type"),
        CheckConstraint("amount_cents > 0", name="ck_movements_amount_positive"),
        CheckConstraint(
            "entry_currency IN ('USD', 'VES')",
            name="ck_movements_entry_currency",
        ),
        CheckConstraint(
            "rate_micros IS NULL OR rate_micros > 0",
            name="ck_movements_rate_micros_positive",
        ),
        CheckConstraint(
            "is_debt_payment = false OR type = 'gasto'",
            name="ck_movements_debt_payment_type",
        ),
        Index("ix_movements_date", text("date DESC")),
        Index("ix_movements_category_id", "category_id"),
        Index("ix_movements_type_date", "type", "date"),
        Index("ix_movements_account_date", "account_id", text("date DESC")),
    )


class Budget(Base):
    __tablename__ = "budgets"

    category_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("categories.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    cap_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (CheckConstraint("cap_cents > 0", name="ck_budgets_cap_positive"),)


class Jar(Base):
    """A money jar (fixed catalogue) holding a share of the monthly income."""

    __tablename__ = "jars"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    pct: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )

    __table_args__ = (CheckConstraint("pct > 0", name="ck_jars_pct_positive"),)


class JarCategory(Base):
    """Category -> jar mapping (one jar per expense category, editable)."""

    __tablename__ = "jar_categories"

    category_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("categories.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    jar_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("jars.id", ondelete="RESTRICT"),
        nullable=False,
    )
