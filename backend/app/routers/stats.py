"""Statistics endpoints: summary, by-category and monthly totals."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..domain import (
    average_prev_months,
    category_shares,
    comparison,
    month_key_of,
    monthly_totals,
)
from ..models import Category, Movement
from ..schemas import ByCategoryOut, MonthlyPointOut, SummaryOut
from . import month_bounds, month_window_start

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _month_key(month: str | None) -> str:
    return month if month is not None else get_settings().current_month()


@router.get("/summary", response_model=SummaryOut)
def summary(month: str | None = None, db: Session = Depends(get_db)) -> dict:
    month_key = _month_key(month)
    start, end = month_bounds(month_key)

    rows = db.execute(
        select(Movement.type, Movement.amount_cents).where(
            Movement.date >= start,
            Movement.date < end,
        )
    ).all()
    income = sum(amount for type_value, amount in rows if type_value == "ingreso")
    expenses = sum(amount for type_value, amount in rows if type_value == "gasto")

    # Average of the 6 months *before* the requested month. The window start is
    # guarded so an underflow (e.g. 0001-06) is a 422, never an uncaught 500.
    prev_start, _ = month_bounds(month_window_start(month_key, 6))
    prev_rows = db.execute(
        select(Movement.date, Movement.amount_cents).where(
            Movement.type == "gasto",
            Movement.date >= prev_start,
            Movement.date < start,
        )
    ).all()
    monthly_expenses: dict[str, int] = {}
    for movement_date, amount in prev_rows:
        key = month_key_of(movement_date)
        monthly_expenses[key] = monthly_expenses.get(key, 0) + int(amount)

    avg_cents, months_used = average_prev_months(monthly_expenses, month_key, 6)

    return {
        "month": month_key,
        "income_cents": income,
        "expenses_cents": expenses,
        "balance_cents": income - expenses,
        "average_prev": {"avg_cents": avg_cents, "months_used": months_used},
        "comparison": comparison(expenses, avg_cents),
    }


@router.get("/by-category", response_model=ByCategoryOut)
def by_category(month: str | None = None, db: Session = Depends(get_db)) -> dict:
    month_key = _month_key(month)
    start, end = month_bounds(month_key)

    rows = db.execute(
        select(Movement.category_id, func.sum(Movement.amount_cents))
        .where(
            Movement.type == "gasto",
            Movement.date >= start,
            Movement.date < end,
        )
        .group_by(Movement.category_id)
    ).all()
    by_cat = {category_id: int(total) for category_id, total in rows if total and total > 0}

    labels = {
        category.id: category.label
        for category in db.execute(select(Category)).scalars().all()
    }
    total = sum(by_cat.values())

    items = []
    for entry in category_shares(by_cat):
        category_id = entry["category_id"]
        items.append(
            {
                "category_id": category_id,
                "label": labels.get(category_id, category_id),
                "cents": entry["cents"],
                "share": entry["share"],
            }
        )
    # Contract: order by cents desc, tie-break by label asc.
    items.sort(key=lambda item: (-item["cents"], item["label"]))

    return {"month": month_key, "total_cents": total, "items": items}


@router.get("/monthly", response_model=list[MonthlyPointOut])
def monthly(
    end: str | None = None,
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
) -> list[dict]:
    end_key = end if end is not None else get_settings().current_month()
    # Validate `end` first: month_bounds raises 422 on a malformed key and also
    # covers the upper bound (9999-12). The window start is guarded separately so
    # a backwards underflow is a 422, never an uncaught 500.
    _, end_exclusive = month_bounds(end_key)
    start_key = month_window_start(end_key, months - 1)
    start, _ = month_bounds(start_key)

    rows = db.execute(
        select(Movement.date, Movement.type, Movement.amount_cents).where(
            Movement.date >= start,
            Movement.date < end_exclusive,
        )
    ).all()

    expenses_by_month: dict[str, int] = {}
    income_by_month: dict[str, int] = {}
    for movement_date, type_value, amount in rows:
        key = month_key_of(movement_date)
        if type_value == "gasto":
            expenses_by_month[key] = expenses_by_month.get(key, 0) + int(amount)
        else:
            income_by_month[key] = income_by_month.get(key, 0) + int(amount)

    return monthly_totals(expenses_by_month, income_by_month, end_key, months)
