"""Accounts (named USD wallets) endpoints: list, create, update, delete.

A negative ``opening_balance_cents`` represents a debt; debt payments raise the
balance towards zero (see :mod:`app.domain`).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..domain import (
    DomainError,
    account_balance_item,
    total_debt_cents,
    validate_account_name,
    validate_opening_balance,
)
from ..models import Account, Movement
from ..schemas import AccountCreate, AccountOut, AccountsOut, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

DUPLICATE_NAME_DETAIL = "Ya existe una cartera con ese nombre."


def _movements_by_account(db: Session) -> dict[int, list[tuple[str, int, bool]]]:
    """Group ``(type, amount_cents, is_debt_payment)`` tuples per account id."""
    rows = db.execute(
        select(
            Movement.account_id,
            Movement.type,
            Movement.amount_cents,
            Movement.is_debt_payment,
        )
    ).all()
    grouped: dict[int, list[tuple[str, int, bool]]] = {}
    for account_id, type_value, amount_cents, is_debt_payment in rows:
        grouped.setdefault(account_id, []).append(
            (type_value, int(amount_cents), bool(is_debt_payment))
        )
    return grouped


def _account_out(account: Account, movements: list[tuple[str, int, bool]]) -> dict:
    data = account_balance_item(account, movements)
    return {
        "id": account.id,
        "name": account.name,
        "opening_balance_cents": account.opening_balance_cents,
        **data,
    }


def _get_account(db: Session, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="La cartera no existe.")
    return account


@router.get("", response_model=AccountsOut)
def list_accounts(db: Session = Depends(get_db)) -> dict:
    accounts = list(
        db.execute(select(Account).order_by(Account.sort_order, Account.id)).scalars().all()
    )
    grouped = _movements_by_account(db)
    items = [_account_out(account, grouped.get(account.id, [])) for account in accounts]
    return {
        "total_debt_cents": total_debt_cents([item["balance_cents"] for item in items]),
        "items": items,
    }


@router.post("", response_model=AccountOut, status_code=201)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)) -> dict:
    try:
        name = validate_account_name(payload.name)
        opening = validate_opening_balance(payload.opening_balance_cents)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if db.scalar(select(Account.id).where(Account.name == name)) is not None:
        raise HTTPException(status_code=422, detail=DUPLICATE_NAME_DETAIL)

    account = Account(name=name, opening_balance_cents=opening)
    db.add(account)
    try:
        db.commit()
    except IntegrityError as exc:
        # Lost the race against a concurrent create of the same name.
        db.rollback()
        raise HTTPException(status_code=422, detail=DUPLICATE_NAME_DETAIL) from exc
    db.refresh(account)
    return _account_out(account, [])


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
) -> dict:
    account = _get_account(db, account_id)
    data = payload.model_dump(exclude_unset=True)

    new_name = account.name
    if data.get("name") is not None:
        try:
            new_name = validate_account_name(data["name"])
        except DomainError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    new_opening = account.opening_balance_cents
    if data.get("opening_balance_cents") is not None:
        try:
            new_opening = validate_opening_balance(data["opening_balance_cents"])
        except DomainError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    if new_name != account.name:
        duplicate = db.scalar(
            select(Account.id).where(Account.name == new_name, Account.id != account_id)
        )
        if duplicate is not None:
            raise HTTPException(status_code=422, detail=DUPLICATE_NAME_DETAIL)

    account.name = new_name
    account.opening_balance_cents = new_opening
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=DUPLICATE_NAME_DETAIL) from exc
    db.refresh(account)

    grouped = _movements_by_account(db)
    return _account_out(account, grouped.get(account.id, []))


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)) -> Response:
    account = _get_account(db, account_id)

    movement_count = db.scalar(
        select(func.count()).select_from(Movement).where(Movement.account_id == account_id)
    ) or 0
    if movement_count > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede borrar una cartera con movimientos.",
        )

    total_accounts = db.scalar(select(func.count()).select_from(Account)) or 0
    if total_accounts <= 1:
        raise HTTPException(
            status_code=409,
            detail="No se puede borrar la última cartera.",
        )

    db.delete(account)
    db.commit()
    return Response(status_code=204)
