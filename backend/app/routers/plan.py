"""Money-jars plan endpoints: monthly target/spent view and category mapping."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..domain import budget_status, jar_targets
from ..models import Category, Jar, JarCategory, Movement
from ..schemas import JarAssignIn, PlanOut
from . import month_bounds

router = APIRouter(prefix="/api/plan", tags=["plan"])


def _month_key(month: str | None) -> str:
    return month if month is not None else get_settings().current_month()


@router.get("", response_model=PlanOut)
def get_plan(month: str | None = None, db: Session = Depends(get_db)) -> dict:
    month_key = _month_key(month)
    start, end = month_bounds(month_key)

    income = int(
        db.scalar(
            select(func.coalesce(func.sum(Movement.amount_cents), 0)).where(
                Movement.type == "ingreso",
                Movement.date >= start,
                Movement.date < end,
            )
        )
        or 0
    )

    jars = list(db.execute(select(Jar).order_by(Jar.sort_order, Jar.id)).scalars().all())
    expense_categories = list(
        db.execute(
            select(Category)
            .where(Category.type == "gasto")
            .order_by(Category.sort_order, Category.id)
        )
        .scalars()
        .all()
    )
    mapping = {
        row.category_id: row.jar_id
        for row in db.execute(select(JarCategory)).scalars().all()
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

    targets = {
        item["jar_id"]: int(item["target_cents"])
        for item in jar_targets(income, [{"id": jar.id, "pct": jar.pct} for jar in jars])
    }

    known_jars = {jar.id for jar in jars}
    category_ids_by_jar: dict[str, list[str]] = {jar.id: [] for jar in jars}
    spent_by_jar: dict[str, int] = {jar.id: 0 for jar in jars}
    for category in expense_categories:
        jar_id = mapping.get(category.id)
        if jar_id in known_jars:
            category_ids_by_jar[jar_id].append(category.id)
            spent_by_jar[jar_id] += spent.get(category.id, 0)

    items = []
    for jar in jars:
        target = targets.get(jar.id, 0)
        jar_spent = spent_by_jar[jar.id]
        items.append(
            {
                "jar_id": jar.id,
                "label": jar.label,
                "pct": jar.pct,
                "target_cents": target,
                "spent_cents": jar_spent,
                "remaining_cents": target - jar_spent,
                "used": (jar_spent / target) if target > 0 else 0.0,
                "status": budget_status(jar_spent, target),
                "category_ids": category_ids_by_jar[jar.id],
            }
        )

    return {"month": month_key, "income_cents": income, "jars": items}


@router.put("/categories/{category_id}")
def assign_category(
    category_id: str,
    payload: JarAssignIn,
    db: Session = Depends(get_db),
) -> dict:
    jar = db.get(Jar, payload.jar_id)
    if jar is None:
        raise HTTPException(status_code=422, detail="El frasco no existe.")

    category = db.get(Category, category_id)
    if category is None or category.type != "gasto":
        raise HTTPException(
            status_code=422,
            detail="Solo las categorías de gasto pueden asignarse a un frasco.",
        )

    assignment = db.get(JarCategory, category_id)
    if assignment is None:
        db.add(JarCategory(category_id=category_id, jar_id=payload.jar_id))
    else:
        assignment.jar_id = payload.jar_id
    db.commit()
    return {"category_id": category_id, "jar_id": payload.jar_id}
