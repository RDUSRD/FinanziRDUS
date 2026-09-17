"""Idempotent sample-data seed.

Run with ``python -m app.seed`` (add ``--force`` to wipe and reseed). Dates are
always relative to the current month computed with ``APP_TZ``. Amounts are in
USD (the canonical wallet); one movement is entered in bolívares (VES) with an
explicit rate to exercise the USD/VES entry flow, and one is a debt payment on
the "Binance" debt wallet.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping
from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from .domain import compute_amount_cents, shift_month
from .models import Account, Budget, Movement

# Sample wallets: one asset wallet plus two debts (negative opening balances).
# The main wallet gets a positive opening balance so that the sample net (about
# -154_700 cents: six months of expenses against only this month's income) still
# leaves it clearly in the black instead of looking like an accidental debt.
# (name, opening_balance_cents, sort_order)
ACCOUNT_SEED: list[dict[str, object]] = [
    {"name": "Cartera USD", "opening_balance_cents": 200_000, "sort_order": 1},
    {"name": "Binance", "opening_balance_cents": -60_000, "sort_order": 2},
    {"name": "Cartera USD normal", "opening_balance_cents": -20_000, "sort_order": 3},
]

DEFAULT_ACCOUNT_NAME = "Cartera USD"
DEBT_ACCOUNT_NAME = "Binance"
DEBT_PAYMENT_USD = 200

# --------------------------------------------------------------------------- #
# Current-month movements entered in USD: all 10 expense categories + 2 incomes.
# (day, type, dollars, category_id, note)
# --------------------------------------------------------------------------- #
CURRENT_MONTH_MOVEMENTS: list[tuple[int, str, int, str, str]] = [
    (2, "gasto", 250, "alquiler-servicios", "Alquiler y expensas"),
    (3, "gasto", 80, "supermercado", "Compra semanal"),
    (6, "gasto", 30, "supermercado", "Feria y verdulería"),
    (14, "gasto", 20, "supermercado", "Reposición"),
    (24, "gasto", 25, "supermercado", "Compra del finde"),
    (4, "gasto", 20, "transporte", "Gasolina y pasajes"),
    (11, "gasto", 8, "transporte", "Taxis"),
    (22, "gasto", 15, "transporte", "Service"),
    (5, "gasto", 25, "comidas-afuera", "Cena con amigos"),
    (13, "gasto", 12, "comidas-afuera", "Almuerzo oficina"),
    (21, "gasto", 8, "comidas-afuera", "Café y panadería"),
    (8, "gasto", 18, "salud", "Farmacia"),
    (19, "gasto", 6, "salud", "Consulta copago"),
    (7, "gasto", 12, "suscripciones", "Streaming"),
    (15, "gasto", 5, "suscripciones", "Música"),
    (9, "gasto", 30, "ropa", "Zapatillas"),
    (23, "gasto", 18, "ropa", "Campera"),
    (10, "gasto", 15, "ocio", "Cine y salida"),
    (20, "gasto", 7, "ocio", "Libro"),
    (2, "gasto", 50, "ahorro", "Transferencia a ahorro"),
    (16, "gasto", 8, "otros", "Regalo"),
    (1, "ingreso", 1200, "sueldo", "Sueldo del mes"),
    (12, "ingreso", 180, "freelance", "Proyecto web"),
]

# Current-month movements entered in bolívares: 4.000,00 Bs at 40 Bs/USD = $100.
# (day, ves_cents, rate_micros, category_id, note)
VES_CURRENT_MONTH_MOVEMENTS: list[tuple[int, int, int, str, str]] = [
    (26, 400_000, 40_000_000, "supermercado", "Compra en bolívares (@ 40 Bs/USD)"),
]

# --------------------------------------------------------------------------- #
# Previous 6 months: 2-4 USD expenses per month with variation.
# (months_back, [(day, category_id, dollars, note)])
# --------------------------------------------------------------------------- #
PREVIOUS_MONTHS_PLAN: list[tuple[int, list[tuple[int, str, int, str]]]] = [
    (6, [(2, "alquiler-servicios", 240, "Alquiler"), (6, "supermercado", 72, "Compras"),
         (21, "ocio", 18, "Salidas")]),
    (5, [(2, "alquiler-servicios", 240, "Alquiler"), (7, "supermercado", 78, "Compras"),
         (18, "transporte", 30, "Gasolina")]),
    (4, [(2, "alquiler-servicios", 250, "Alquiler"), (5, "supermercado", 84, "Compras"),
         (14, "transporte", 34, "Gasolina"), (22, "salud", 12, "Farmacia")]),
    (3, [(2, "alquiler-servicios", 250, "Alquiler"), (6, "supermercado", 70, "Compras"),
         (18, "comidas-afuera", 20, "Salidas")]),
    (2, [(2, "alquiler-servicios", 255, "Alquiler"), (4, "supermercado", 88, "Compras"),
         (16, "transporte", 32, "Gasolina"), (24, "ropa", 26, "Ropa")]),
    (1, [(2, "alquiler-servicios", 255, "Alquiler"), (5, "supermercado", 82, "Compras"),
         (3, "suscripciones", 15, "Streaming"), (20, "ocio", 14, "Salidas")]),
]

# Budgets for the 10 expense categories (in dollars). Supermercado is exceeded,
# alquiler/transporte/ropa/ahorro sit in the 80-100% band.
BUDGETS_USD: dict[str, int] = {
    "supermercado": 150,
    "alquiler-servicios": 300,
    "transporte": 50,
    "comidas-afuera": 50,
    "salud": 30,
    "suscripciones": 25,
    "ropa": 60,
    "ocio": 30,
    "ahorro": 60,
    "otros": 20,
}


def _to_date(month_key: str, day: int) -> date:
    return date.fromisoformat(f"{month_key}-{day:02d}")


def _usd_movement(
    type_value: str,
    category_id: str,
    dollars: int,
    movement_date: date,
    note: str,
    account_id: int | None = None,
    is_debt_payment: bool = False,
) -> Movement:
    cents = dollars * 100
    return Movement(
        type=type_value,
        category_id=category_id,
        amount_cents=cents,
        entry_currency="USD",
        entry_amount_cents=cents,
        rate_micros=None,
        date=movement_date,
        note=note,
        account_id=account_id,
        is_debt_payment=is_debt_payment,
    )


def build_movements(
    month_key: str,
    account_ids: Mapping[str, int] | None = None,
) -> list[Movement]:
    """Build the list of seed movements relative to ``month_key``.

    ``account_ids`` maps account name -> id (as resolved by :func:`_seed`); the
    sample movements belong to the default wallet and the debt payment to the
    debt wallet. When omitted, movements are built without an assigned account.
    """
    account_ids = account_ids or {}
    default_id = account_ids.get(DEFAULT_ACCOUNT_NAME)
    debt_id = account_ids.get(DEBT_ACCOUNT_NAME)

    movements: list[Movement] = []
    for day, type_value, dollars, category_id, note in CURRENT_MONTH_MOVEMENTS:
        movements.append(
            _usd_movement(
                type_value, category_id, dollars, _to_date(month_key, day), note, default_id
            )
        )
    for day, ves_cents, rate_micros, category_id, note in VES_CURRENT_MONTH_MOVEMENTS:
        movements.append(
            Movement(
                type="gasto",
                category_id=category_id,
                amount_cents=compute_amount_cents("VES", ves_cents, rate_micros),
                entry_currency="VES",
                entry_amount_cents=ves_cents,
                rate_micros=rate_micros,
                date=_to_date(month_key, day),
                note=note,
                account_id=default_id,
            )
        )
    for months_back, items in PREVIOUS_MONTHS_PLAN:
        target_month = shift_month(month_key, -months_back)
        for day, category_id, dollars, note in items:
            movements.append(
                _usd_movement(
                    "gasto", category_id, dollars, _to_date(target_month, day), note, default_id
                )
            )
    # One debt payment on the "Binance" wallet so the debt panel shows progress.
    movements.append(
        _usd_movement(
            "gasto",
            "deudas",
            DEBT_PAYMENT_USD,
            _to_date(month_key, 18),
            "Pago de deuda Binance",
            debt_id,
            is_debt_payment=True,
        )
    )
    return movements


def _resolve_accounts(db: Session) -> dict[str, int]:
    """Create or reconcile the sample wallets and return the name -> id map.

    A sample wallet that already exists (for instance the default wallet
    pre-created by migration ``0003`` with an opening balance of ``0``) keeps its
    id but has its ``opening_balance_cents`` reset to the ``ACCOUNT_SEED`` value,
    so the non-force seed produces the same state as the ``--force`` reseed.
    Wallets whose name is not in ``ACCOUNT_SEED`` are never touched.
    """
    account_ids: dict[str, int] = {}
    for spec in ACCOUNT_SEED:
        account = db.scalar(select(Account).where(Account.name == spec["name"]))
        if account is None:
            account = Account(**spec)
            db.add(account)
            db.flush()
        else:
            account.opening_balance_cents = spec["opening_balance_cents"]  # type: ignore[assignment]
        account_ids[account.name] = account.id
    return account_ids


def _seed(db: Session, force: bool, month_key: str) -> dict:
    existing_movements = db.scalar(select(func.count()).select_from(Movement)) or 0
    existing_budgets = db.scalar(select(func.count()).select_from(Budget)) or 0
    if not force and (existing_movements > 0 or existing_budgets > 0):
        return {"seeded": False, "reason": "already_has_data", "movements": existing_movements}

    if force:
        # Delete in FK order: movements (FK -> accounts) first, then budgets and
        # the wallets.
        db.execute(delete(Movement))
        db.execute(delete(Budget))
        db.execute(delete(Account))
        db.flush()

    account_ids = _resolve_accounts(db)
    movements = build_movements(month_key, account_ids)
    db.add_all(movements)

    for category_id, dollars in BUDGETS_USD.items():
        cap_cents = dollars * 100
        budget = db.get(Budget, category_id)
        if budget is None:
            db.add(Budget(category_id=category_id, cap_cents=cap_cents))
        else:
            budget.cap_cents = cap_cents

    db.commit()
    return {
        "seeded": True,
        "movements": len(movements),
        "budgets": len(BUDGETS_USD),
        "accounts": len(ACCOUNT_SEED),
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
        help="Delete existing movements, budgets and accounts, then reseed.",
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
            f"{result['budgets']} budgets, {result['accounts']} accounts "
            f"for month {result['month']}."
        )
    else:
        print("Seed skipped: the database already has data (use --force to reseed).")


if __name__ == "__main__":
    main()
