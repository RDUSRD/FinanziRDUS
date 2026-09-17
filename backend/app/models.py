"""SQLAlchemy 2.x models for FinanciRDUS.

Three tables only: ``categories`` (fixed catalogue), ``movements`` and
``budgets``. All money is stored as an integer number of cents.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
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
    {"id": "sueldo", "type": "ingreso", "label": "Sueldo", "sort_order": 1},
    {"id": "freelance", "type": "ingreso", "label": "Freelance", "sort_order": 2},
    {"id": "inversiones", "type": "ingreso", "label": "Inversiones", "sort_order": 3},
    {"id": "otros-ingresos", "type": "ingreso", "label": "Otros", "sort_order": 4},
]

TYPE_CHECK = "type IN ('gasto', 'ingreso')"


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

    __table_args__ = (CheckConstraint(TYPE_CHECK, name="ck_categories_type"),)


class Movement(Base):
    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
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
        Index("ix_movements_date", text("date DESC")),
        Index("ix_movements_category_id", "category_id"),
        Index("ix_movements_type_date", "type", "date"),
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
