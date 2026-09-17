"""Budgets endpoints: monthly view, upsert and delete a cap."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..domain import DomainError, budget_status, validate_cap
from ..models import Budget, Category, Movement
from ..schemas import BudgetCapIn, BudgetCapOut, BudgetsOut
from . import month_bounds

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def _month_key(month: str | None) -> str:
    return month if month is not None else get_settings().current_month()


@router.get("", response_model=BudgetsOut)
def get_budgets(month: str | None = None, db: Session = Depends(get_db)) -> dict:
    month_key = _month_key(month)
    start, end = month_bounds(month_key)

    categories = (
        db.execute(
            select(Category)
            .where(Category.type == "gasto", Category.is_system.is_(False))
            .order_by(Category.sort_order, Category.id)
        )
        .scalars()
        .all()
    )
    caps = {
        budget.category_id: budget.cap_cents
        for budget in db.execute(select(Budget)).scalars().all()
    }
    spent_rows = db.execute(
        select(Movement.category_id, func.sum(Movement.amount_cents))
        .where(
            Movement.type == "gasto",
            Movement.date >= start,
            Movement.date < end,
        )
        .group_by(Movement.category_id)
    ).all()
    spent = {category_id: int(total or 0) for category_id, total in spent_rows}

    items = []
    total_cap = 0
    total_spent = 0
    for category in categories:
        cap = int(caps.get(category.id, 0))
        category_spent = int(spent.get(category.id, 0))
        total_cap += cap
        total_spent += category_spent
        items.append(
            {
                "category_id": category.id,
                "label": category.label,
                "cap_cents": cap,
                "spent_cents": category_spent,
                "pct": (category_spent / cap) if cap > 0 else 0.0,
                "status": budget_status(category_spent, cap),
            }
        )

    return {
        "month": month_key,
        "total_cap_cents": total_cap,
        "total_spent_cents": total_spent,
        "items": items,
    }


@router.put("/{category_id}", response_model=BudgetCapOut)
def put_budget(
    category_id: str,
    payload: BudgetCapIn,
    db: Session = Depends(get_db),
) -> dict:
    try:
        cap_cents = validate_cap(payload.cap_cents)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    category = db.get(Category, category_id)
    if category is None or category.type != "gasto":
        raise HTTPException(status_code=422, detail="La categoría no es de tipo gasto.")

    budget = db.get(Budget, category_id)
    if budget is None:
        try:
            db.add(Budget(category_id=category_id, cap_cents=cap_cents))
            db.commit()
        except IntegrityError:
            db.rollback()
            budget = db.get(Budget, category_id)
            if budget is None:
                # The row we lost the race to add also vanished: re-raise the
                # original IntegrityError instead of masking it with an
                # AttributeError -> HTTP 500.
                raise
            budget.cap_cents = cap_cents
            db.commit()
    else:
        budget.cap_cents = cap_cents
        db.commit()
    return {"category_id": category_id, "cap_cents": cap_cents}


@router.delete("/{category_id}", status_code=204)
def delete_budget(category_id: str, db: Session = Depends(get_db)) -> Response:
    budget = db.get(Budget, category_id)
    if budget is not None:
        db.delete(budget)
        db.commit()
    return Response(status_code=204)
