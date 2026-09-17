"""Movements endpoints: list, create, update, delete."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..domain import (
    VALID_TYPES,
    DomainError,
    validate_amount,
    validate_category_match,
    validate_date,
    validate_note,
    validate_type,
)
from ..models import Category, Movement
from ..schemas import MovementCreate, MovementOut, MovementUpdate
from . import month_bounds

router = APIRouter(prefix="/api/movements", tags=["movements"])


def _validate_and_build(
    db: Session,
    type_value: str,
    category_id: str,
    amount_cents: int,
    date_str: str,
    note: str,
) -> Movement:
    try:
        validate_type(type_value)
        validate_amount(amount_cents)
        validate_date(date_str)
        clean_note = validate_note(note)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    category = db.get(Category, category_id)
    try:
        validate_category_match(type_value, category.type if category else None)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return Movement(
        type=type_value,
        category_id=category_id,
        amount_cents=amount_cents,
        date=date.fromisoformat(date_str),
        note=clean_note,
    )


@router.get("", response_model=list[MovementOut])
def list_movements(
    month: str | None = None,
    category: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> list[Movement]:
    stmt = select(Movement)
    if month is not None:
        start, end = month_bounds(month)
        stmt = stmt.where(Movement.date >= start, Movement.date < end)
    if category is not None:
        stmt = stmt.where(Movement.category_id == category)
    if type is not None:
        if type not in VALID_TYPES:
            raise HTTPException(status_code=422, detail="El tipo debe ser 'gasto' o 'ingreso'.")
        stmt = stmt.where(Movement.type == type)
    stmt = stmt.order_by(Movement.date.desc(), Movement.created_at.desc(), Movement.id.desc())
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=MovementOut, status_code=201)
def create_movement(payload: MovementCreate, db: Session = Depends(get_db)) -> Movement:
    movement = _validate_and_build(
        db,
        payload.type,
        payload.category_id,
        payload.amount_cents,
        payload.date,
        payload.note,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


@router.patch("/{movement_id}", response_model=MovementOut)
def update_movement(
    movement_id: int,
    payload: MovementUpdate,
    db: Session = Depends(get_db),
) -> Movement:
    movement = db.get(Movement, movement_id)
    if movement is None:
        raise HTTPException(status_code=404, detail="El movimiento no existe.")

    data = payload.model_dump(exclude_unset=True)
    new_type = data.get("type", movement.type)
    new_category = data.get("category_id", movement.category_id)
    new_amount = data.get("amount_cents", movement.amount_cents)
    new_date = data.get("date", movement.date.isoformat())
    new_note = data.get("note", movement.note)

    try:
        validate_type(new_type)
        validate_amount(new_amount)
        validate_date(new_date)
        clean_note = validate_note(new_note)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    category = db.get(Category, new_category)
    try:
        validate_category_match(new_type, category.type if category else None)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    movement.type = new_type
    movement.category_id = new_category
    movement.amount_cents = new_amount
    movement.date = date.fromisoformat(new_date)
    movement.note = clean_note
    db.commit()
    db.refresh(movement)
    return movement


@router.delete("/{movement_id}", status_code=204)
def delete_movement(movement_id: int, db: Session = Depends(get_db)) -> Response:
    movement = db.get(Movement, movement_id)
    if movement is None:
        raise HTTPException(status_code=404, detail="El movimiento no existe.")
    db.delete(movement)
    db.commit()
    return Response(status_code=204)
