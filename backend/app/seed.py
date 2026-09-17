"""Idempotent sample-data seed.

Run with ``python -m app.seed`` (add ``--force`` to wipe and reseed). Dates are
always relative to the current month computed with ``APP_TZ``.
"""

from __future__ import annotations

import argparse
from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from .domain import shift_month
from .models import Budget, Movement

# --------------------------------------------------------------------------- #
# Current-month movements: all 10 expense categories + 2 incomes.
# (day, type, pesos, category_id, note)
# --------------------------------------------------------------------------- #
CURRENT_MONTH_MOVEMENTS: list[tuple[int, str, int, str, str]] = [
    (2, "gasto", 320000, "alquiler-servicios", "Alquiler y expensas"),
    (3, "gasto", 85000, "supermercado", "Compra semanal"),
    (6, "gasto", 32000, "supermercado", "Feria y verdulería"),
    (14, "gasto", 21000, "supermercado", "Reposición"),
    (24, "gasto", 26000, "supermercado", "Compra del finde"),
    (4, "gasto", 42000, "transporte", "SUBE y nafta"),
    (11, "gasto", 9500, "transporte", "Taxis"),
    (22, "gasto", 15000, "transporte", "Service"),
    (5, "gasto", 23000, "comidas-afuera", "Cena con amigos"),
    (13, "gasto", 12000, "comidas-afuera", "Almuerzo oficina"),
    (21, "gasto", 9000, "comidas-afuera", "Café y panadería"),
    (8, "gasto", 18000, "salud", "Farmacia"),
    (19, "gasto", 6500, "salud", "Consulta copago"),
    (7, "gasto", 12000, "suscripciones", "Streaming"),
    (15, "gasto", 4500, "suscripciones", "Música"),
    (9, "gasto", 30000, "ropa", "Zapatillas"),
    (23, "gasto", 18000, "ropa", "Campera"),
    (10, "gasto", 15000, "ocio", "Cine y salida"),
    (20, "gasto", 7000, "ocio", "Libro"),
    (2, "gasto", 50000, "ahorro", "Transferencia a ahorro"),
    (16, "gasto", 8000, "otros", "Regalo"),
    (1, "ingreso", 1200000, "sueldo", "Sueldo del mes"),
    (12, "ingreso", 180000, "freelance", "Proyecto web"),
]

# --------------------------------------------------------------------------- #
# Previous 6 months: 2-4 expenses per month with variation.
# (months_back, [(day, category_id, pesos, note)])
# --------------------------------------------------------------------------- #
PREVIOUS_MONTHS_PLAN: list[tuple[int, list[tuple[int, str, int, str]]]] = [
    (6, [(2, "alquiler-servicios", 300000, "Alquiler"), (6, "supermercado", 76000, "Compras"),
         (21, "ocio", 18000, "Salidas")]),
    (5, [(2, "alquiler-servicios", 300000, "Alquiler"), (7, "supermercado", 82000, "Compras"),
         (18, "transporte", 36000, "Nafta")]),
    (4, [(2, "alquiler-servicios", 310000, "Alquiler"), (5, "supermercado", 88000, "Compras"),
         (14, "transporte", 41000, "Nafta"), (22, "salud", 12000, "Farmacia")]),
    (3, [(2, "alquiler-servicios", 310000, "Alquiler"), (6, "supermercado", 70000, "Compras"),
         (18, "comidas-afuera", 20000, "Salidas")]),
    (2, [(2, "alquiler-servicios", 320000, "Alquiler"), (4, "supermercado", 91000, "Compras"),
         (16, "transporte", 38000, "Nafta"), (24, "ropa", 26000, "Ropa")]),
    (1, [(2, "alquiler-servicios", 320000, "Alquiler"), (5, "supermercado", 86000, "Compras"),
         (3, "suscripciones", 15000, "Streaming"), (20, "ocio", 14000, "Salidas")]),
]

# Budgets for the 10 expense categories (in cents). Supermercado is exceeded,
# alquiler/transporte/ropa sit in the 80-100% band.
BUDGETS_PESOS: dict[str, int] = {
    "supermercado": 150000,
    "alquiler-servicios": 350000,
    "transporte": 80000,
    "comidas-afuera": 60000,
    "salud": 40000,
    "suscripciones": 25000,
    "ropa": 50000,
    "ocio": 30000,
    "ahorro": 50000,
    "otros": 20000,
}


def _to_date(month_key: str, day: int) -> date:
    return date.fromisoformat(f"{month_key}-{day:02d}")


def build_movements(month_key: str) -> list[Movement]:
    """Build the list of seed movements relative to ``month_key``."""
    movements: list[Movement] = []
    for day, type_value, pesos, category_id, note in CURRENT_MONTH_MOVEMENTS:
        movements.append(
            Movement(
                type=type_value,
                category_id=category_id,
                amount_cents=pesos * 100,
                date=_to_date(month_key, day),
                note=note,
            )
        )
    for months_back, items in PREVIOUS_MONTHS_PLAN:
        target_month = shift_month(month_key, -months_back)
        for day, category_id, pesos, note in items:
            movements.append(
                Movement(
                    type="gasto",
                    category_id=category_id,
                    amount_cents=pesos * 100,
                    date=_to_date(target_month, day),
                    note=note,
                )
            )
    return movements


def _seed(db: Session, force: bool, month_key: str) -> dict:
    existing_movements = db.scalar(select(func.count()).select_from(Movement)) or 0
    existing_budgets = db.scalar(select(func.count()).select_from(Budget)) or 0
    if not force and (existing_movements > 0 or existing_budgets > 0):
        return {"seeded": False, "reason": "already_has_data", "movements": existing_movements}

    if force:
        db.execute(delete(Budget))
        db.execute(delete(Movement))
        db.flush()

    movements = build_movements(month_key)
    db.add_all(movements)

    for category_id, pesos in BUDGETS_PESOS.items():
        budget = db.get(Budget, category_id)
        if budget is None:
            db.add(Budget(category_id=category_id, cap_cents=pesos * 100))
        else:
            budget.cap_cents = pesos * 100

    db.commit()
    return {
        "seeded": True,
        "movements": len(movements),
        "budgets": len(BUDGETS_PESOS),
        "month": month_key,
    }


def seed(force: bool = False) -> dict:
    """Seed the database. Idempotent unless ``force=True``."""
    settings = get_settings()
    month_key = settings.current_month()
    with SessionLocal() as db:
        return _seed(db, force=force, month_key=month_key)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed FinanciRDUS sample data.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing movements and budgets, then reseed.",
    )
    args = parser.parse_args()

    # Settings is the single source of truth for whether to seed; --force always wins.
    if not args.force and not get_settings().seed_on_start:
        print(
            "Seed skipped: SEED_ON_START is disabled "
            "(set SEED_ON_START=true or use --force)."
        )
        return

    result = seed(force=args.force)
    if result.get("seeded"):
        print(
            f"Seed complete: {result['movements']} movements, "
            f"{result['budgets']} budgets for month {result['month']}."
        )
    else:
        print("Seed skipped: the database already has data (use --force to reseed).")


if __name__ == "__main__":
    main()
