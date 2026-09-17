"""Movements endpoints: list, create, update, delete."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..domain import (
    DEBT_CATEGORY_ID,
    VALID_TYPES,
    DomainError,
    compute_amount_cents,
    validate_amount,
    validate_category_match,
    validate_date,
    validate_debt_payment,
    validate_entry_currency,
    validate_is_debt_payment,
    validate_note,
    validate_type,
)
from ..models import Account, Category, Movement
from ..schemas import MovementCreate, MovementOut, MovementUpdate
from . import account_id_param, month_bounds

router = APIRouter(prefix="/api/movements", tags=["movements"])


def _canonical_entry(
    entry_currency: object,
    entry_amount_cents: object,
    rate_micros: object,
) -> tuple[str, int, int | None, int]:
    """Validate an entry triplet.

    Returns ``(currency, entry_amount_cents, rate_micros, amount_cents)`` where
    ``amount_cents`` is the canonical USD cents. Raises :class:`DomainError`.
    """
    currency = validate_entry_currency(entry_currency)
    entry_amount = validate_amount(entry_amount_cents)
    amount_cents = compute_amount_cents(currency, entry_amount, rate_micros)
    # ``compute_amount_cents`` guarantees the rate is a valid int for VES and
    # ``None`` for USD, so the stored value is always consistent.
    rate = int(rate_micros) if currency == "VES" else None  # type: ignore[arg-type]
    return currency, entry_amount, rate, amount_cents


def _resolve_target(
    db: Session,
    account_id: int,
    type_value: str,
    category_id: str | None,
    is_debt_payment: bool,
) -> tuple[Account, str, str]:
    """Resolve the account and the effective (type, category) of a movement.

    A debt payment is *forced* to ``gasto`` + ``deudas`` and must belong to a
    debt account; a regular movement requires a category matching its type.
    Raises :class:`HTTPException` (422) on any business-rule violation.
    """
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=422, detail="La cartera no existe.")

    if is_debt_payment:
        type_value = "gasto"
        category_id = DEBT_CATEGORY_ID
    elif category_id is None:
        raise HTTPException(status_code=422, detail="La categoría es obligatoria.")

    try:
        validate_debt_payment(is_debt_payment, type_value, account.opening_balance_cents)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    category = db.get(Category, category_id)
    try:
        validate_category_match(type_value, category.type if category else None)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return account, type_value, category_id


def _serialize_movement(movement: Movement, account_name: str) -> dict:
    """Build a ``MovementOut`` payload, injecting the resolved account name."""
    return {
        "id": movement.id,
        "type": movement.type,
        "category_id": movement.category_id,
        "account_id": movement.account_id,
        "account_name": account_name,
        "is_debt_payment": movement.is_debt_payment,
        "amount_cents": movement.amount_cents,
        "entry_currency": movement.entry_currency,
        "entry_amount_cents": movement.entry_amount_cents,
        "rate_micros": movement.rate_micros,
        "date": movement.date,
        "note": movement.note,
        "created_at": movement.created_at,
    }


def _account_name(db: Session, account_id: int) -> str:
    name = db.scalar(select(Account.name).where(Account.id == account_id))
    return name if name is not None else ""


def _validate_and_build(
    db: Session,
    type_value: str,
    category_id: str | None,
    account_id: int,
    is_debt_payment: bool,
    entry_currency: str,
    entry_amount_cents: int,
    rate_micros: int | None,
    date_str: str,
    note: str,
) -> Movement:
    try:
        validate_type(type_value)
        validate_is_debt_payment(is_debt_payment)
        validate_date(date_str)
        clean_note = validate_note(note)
        currency, entry_amount, rate, amount_cents = _canonical_entry(
            entry_currency, entry_amount_cents, rate_micros
        )
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    _, effective_type, effective_category = _resolve_target(
        db, account_id, type_value, category_id, is_debt_payment
    )

    return Movement(
        type=effective_type,
        category_id=effective_category,
        account_id=account_id,
        is_debt_payment=is_debt_payment,
        amount_cents=amount_cents,
        entry_currency=currency,
        entry_amount_cents=entry_amount,
        rate_micros=rate,
        date=date.fromisoformat(date_str),
        note=clean_note,
    )


@router.get("", response_model=list[MovementOut])
def list_movements(
    month: str | None = None,
    category: str | None = None,
    type: str | None = None,
    account: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
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
    account_id = account_id_param(account)
    if account_id is not None:
        stmt = stmt.where(Movement.account_id == account_id)
    stmt = stmt.order_by(Movement.date.desc(), Movement.created_at.desc(), Movement.id.desc())

    movements = list(db.execute(stmt).scalars().all())
    names = {account.id: account.name for account in db.execute(select(Account)).scalars().all()}
    return [
        _serialize_movement(movement, names.get(movement.account_id, ""))
        for movement in movements
    ]


@router.post("", response_model=MovementOut, status_code=201)
def create_movement(payload: MovementCreate, db: Session = Depends(get_db)) -> dict:
    movement = _validate_and_build(
        db,
        payload.type,
        payload.category_id,
        payload.account_id,
        payload.is_debt_payment,
        payload.entry_currency,
        payload.entry_amount_cents,
        payload.rate_micros,
        payload.date,
        payload.note,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return _serialize_movement(movement, _account_name(db, movement.account_id))


@router.patch("/{movement_id}", response_model=MovementOut)
def update_movement(
    movement_id: int,
    payload: MovementUpdate,
    db: Session = Depends(get_db),
) -> dict:
    movement = db.get(Movement, movement_id)
    if movement is None:
        raise HTTPException(status_code=404, detail="El movimiento no existe.")

    data = payload.model_dump(exclude_unset=True)
    new_type = data.get("type", movement.type)
    new_category = data.get("category_id", movement.category_id)
    new_account_id = data.get("account_id", movement.account_id)
    new_is_debt_payment = data.get("is_debt_payment", movement.is_debt_payment)
    new_date = data.get("date", movement.date.isoformat())
    new_note = data.get("note", movement.note)
    new_currency = data.get("entry_currency", movement.entry_currency)
    new_entry_amount = data.get("entry_amount_cents", movement.entry_amount_cents)
    new_rate = data.get("rate_micros", movement.rate_micros)
    # Switching to USD makes any stored rate meaningless: clear it unless the
    # caller explicitly sent one (an explicit rate with USD is rejected below).
    if new_currency == "USD" and "rate_micros" not in data:
        new_rate = None

    try:
        validate_type(new_type)
        validate_is_debt_payment(new_is_debt_payment)
        validate_date(new_date)
        clean_note = validate_note(new_note)
        currency, entry_amount, rate, amount_cents = _canonical_entry(
            new_currency, new_entry_amount, new_rate
        )
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    _, effective_type, effective_category = _resolve_target(
        db, new_account_id, new_type, new_category, new_is_debt_payment
    )

    movement.type = effective_type
    movement.category_id = effective_category
    movement.account_id = new_account_id
    movement.is_debt_payment = new_is_debt_payment
    movement.amount_cents = amount_cents
    movement.entry_currency = currency
    movement.entry_amount_cents = entry_amount
    movement.rate_micros = rate
    movement.date = date.fromisoformat(new_date)
    movement.note = clean_note
    db.commit()
    db.refresh(movement)
    return _serialize_movement(movement, _account_name(db, movement.account_id))


@router.delete("/{movement_id}", status_code=204)
def delete_movement(movement_id: int, db: Session = Depends(get_db)) -> Response:
    movement = db.get(Movement, movement_id)
    if movement is None:
        raise HTTPException(status_code=404, detail="El movimiento no existe.")
    db.delete(movement)
    db.commit()
    return Response(status_code=204)
