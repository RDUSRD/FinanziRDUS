"""Data export/import endpoints (JSON backup and restore)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..domain import (
    DEBT_CATEGORY_ID,
    MAX_CENTS,
    VALID_TYPES,
    DomainError,
    compute_amount_cents,
    valid_date_str,
    validate_account_name,
    validate_entry_currency,
    validate_opening_balance,
)
from ..models import Account, Budget, Category, Jar, JarCategory, Movement
from ..schemas import ImportResultOut

router = APIRouter(prefix="/api/data", tags=["data"])

DATA_VERSION = 3
ACCEPTED_DATA_VERSIONS = (1, 2, DATA_VERSION)

# Account imported against when the payload does not carry accounts (v1/v2).
DEFAULT_ACCOUNT_NAME = "Cartera USD"

# Defensive limits against absurd payloads (no auth, personal app).
MAX_IMPORT_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_IMPORT_MOVEMENTS = 20_000
MAX_IMPORT_ACCOUNTS = 1_000
BODY_TOO_LARGE_DETAIL = "El archivo es demasiado grande (máximo 5 MB)."


async def _read_body_within_limit(request: Request) -> bytes:
    """Read the raw request body, rejecting anything above ``MAX_IMPORT_BYTES``.

    Checks the declared ``Content-Length`` first (which can lie or be missing)
    and then the real number of bytes read off the stream, aborting as soon as
    the limit is exceeded so a huge body is never parsed.
    """
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail=BODY_TOO_LARGE_DETAIL)

    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_IMPORT_BYTES:
            raise HTTPException(status_code=413, detail=BODY_TOO_LARGE_DETAIL)
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/export")
def export_data(db: Session = Depends(get_db)) -> JSONResponse:
    settings = get_settings()
    accounts = (
        db.execute(select(Account).order_by(Account.sort_order, Account.id)).scalars().all()
    )
    name_by_id = {account.id: account.name for account in accounts}
    movements = (
        db.execute(select(Movement).order_by(Movement.date, Movement.id)).scalars().all()
    )
    budgets = {
        budget.category_id: budget.cap_cents
        for budget in db.execute(select(Budget)).scalars().all()
    }
    jar_categories = {
        row.category_id: row.jar_id
        for row in db.execute(select(JarCategory)).scalars().all()
    }

    payload = {
        "version": DATA_VERSION,
        "exported_at": settings.now().isoformat(),
        "accounts": [
            {"name": account.name, "opening_balance_cents": account.opening_balance_cents}
            for account in accounts
        ],
        "movements": [
            {
                "type": movement.type,
                "category_id": movement.category_id,
                "amount_cents": movement.amount_cents,
                "entry_currency": movement.entry_currency,
                "entry_amount_cents": movement.entry_amount_cents,
                "rate_micros": movement.rate_micros,
                "date": movement.date.isoformat(),
                "note": movement.note,
                "account_id": movement.account_id,
                "account_name": name_by_id.get(movement.account_id, DEFAULT_ACCOUNT_NAME),
                "is_debt_payment": movement.is_debt_payment,
            }
            for movement in movements
        ],
        "budgets": budgets,
        "jar_categories": jar_categories,
    }
    filename = f"financirdus-{settings.today().isoformat()}.json"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _validate_accounts(payload: dict) -> tuple[list[dict], dict[int, str]]:
    """Validate the ``accounts`` section, returning specs and an id -> name map."""
    raw_accounts = payload.get("accounts")
    accounts: list[dict] = []
    id_to_name: dict[int, str] = {}
    if raw_accounts is None:
        return accounts, id_to_name
    if not isinstance(raw_accounts, list):
        raise HTTPException(status_code=422, detail='El campo "accounts" debe ser una lista.')
    if len(raw_accounts) > MAX_IMPORT_ACCOUNTS:
        raise HTTPException(
            status_code=422,
            detail=f"El archivo tiene demasiadas carteras (máximo {MAX_IMPORT_ACCOUNTS}).",
        )

    seen: set[str] = set()
    for index, item in enumerate(raw_accounts):
        position = index + 1
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail=f"La cartera {position} es inválida.")
        try:
            name = validate_account_name(item.get("name"))
        except DomainError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"La cartera {position} tiene un nombre inválido: {exc}",
            ) from exc
        try:
            opening = validate_opening_balance(item.get("opening_balance_cents", 0))
        except DomainError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"La cartera {position} tiene un saldo inicial inválido: {exc}",
            ) from exc
        if name in seen:
            raise HTTPException(
                status_code=422,
                detail=f"La cartera {position} tiene un nombre duplicado.",
            )
        seen.add(name)
        accounts.append({"name": name, "opening_balance_cents": opening})
        raw_id = item.get("id")
        if isinstance(raw_id, int) and not isinstance(raw_id, bool):
            id_to_name[raw_id] = name

    return accounts, id_to_name


def _movement_account_name(item: dict, id_to_name: dict[int, str]) -> str | None:
    """Resolve the account name of an imported movement (``None`` = default)."""
    raw_name = item.get("account_name")
    if isinstance(raw_name, str) and raw_name.strip():
        return validate_account_name(raw_name)
    raw_id = item.get("account_id")
    if isinstance(raw_id, int) and not isinstance(raw_id, bool):
        return id_to_name.get(raw_id)
    return None


def _validate_payload(
    payload: Any,
    category_types: dict[str, str],
    jar_ids: set[str],
) -> tuple[list[dict], list[dict], dict, dict]:
    """Validate an import payload.

    Raises HTTP 422 with a concrete, numbered Spanish message on the first
    problem found. Returns ``(accounts, movements, budgets, jar_categories)``
    ready to persist. Version 1 payloads (no entry fields) are accepted and
    normalized to ``entry_currency='USD'`` with ``entry_amount_cents =
    amount_cents``; versions 1 and 2 (no accounts) fall back to the default
    account.
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="El archivo no contiene un objeto válido.")

    if payload.get("version") not in ACCEPTED_DATA_VERSIONS:
        expected = ", ".join(map(str, ACCEPTED_DATA_VERSIONS))
        raise HTTPException(
            status_code=422,
            detail=f"Versión de datos no compatible (se esperaba {expected}).",
        )

    accounts, id_to_name = _validate_accounts(payload)

    raw_movements = payload.get("movements")
    if not isinstance(raw_movements, list):
        raise HTTPException(status_code=422, detail='El campo "movements" debe ser una lista.')
    if len(raw_movements) > MAX_IMPORT_MOVEMENTS:
        raise HTTPException(
            status_code=422,
            detail=f"El archivo tiene demasiados movimientos (máximo {MAX_IMPORT_MOVEMENTS}).",
        )

    movements: list[dict] = []
    for index, item in enumerate(raw_movements):
        position = index + 1
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail=f"El movimiento {position} es inválido.")

        type_value = item.get("type")
        if type_value not in VALID_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene un tipo inválido.",
            )

        is_debt_payment = item.get("is_debt_payment", False)
        if not isinstance(is_debt_payment, bool):
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene un 'pago de deuda' inválido.",
            )

        # Debt payments are always expense movements in the system category.
        if is_debt_payment:
            type_value = "gasto"
            category_id = DEBT_CATEGORY_ID
        else:
            category_id = item.get("category_id")

        # Entry triplet. Version 1 payloads carry only ``amount_cents``: it is
        # used as the entry amount with currency 'USD' and no rate.
        entry_currency = item.get("entry_currency", "USD")
        entry_amount = item.get("entry_amount_cents", item.get("amount_cents"))
        if isinstance(entry_amount, bool) or not isinstance(entry_amount, int) or entry_amount <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene un monto inválido.",
            )
        if entry_amount > MAX_CENTS:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene un monto demasiado grande.",
            )
        rate_micros = item.get("rate_micros")
        try:
            currency = validate_entry_currency(entry_currency)
            amount = compute_amount_cents(currency, entry_amount, rate_micros)
        except DomainError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene una entrada inválida: {exc}",
            ) from exc

        date_str = item.get("date")
        if not valid_date_str(date_str):
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene una fecha inválida.",
            )

        if not isinstance(category_id, str) or category_types.get(category_id) != type_value:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene una categoría inválida.",
            )

        try:
            account_name = _movement_account_name(item, id_to_name)
        except DomainError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene una cartera inválida: {exc}",
            ) from exc
        if account_name is None:
            account_name = DEFAULT_ACCOUNT_NAME

        note_value = item.get("note")
        note = "" if note_value is None else str(note_value).strip()
        if len(note) > 140:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"El movimiento {position} tiene una nota demasiado larga "
                    "(máximo 140 caracteres)."
                ),
            )

        movements.append(
            {
                "type": type_value,
                "category_id": category_id,
                "amount_cents": amount,
                "entry_currency": currency,
                "entry_amount_cents": entry_amount,
                "rate_micros": rate_micros if currency == "VES" else None,
                "date": date_str,
                "note": note,
                "account_name": account_name,
                "is_debt_payment": is_debt_payment,
            }
        )

    distinct_names = {spec["name"] for spec in accounts}
    distinct_names.update(movement["account_name"] for movement in movements)
    if len(distinct_names) > MAX_IMPORT_ACCOUNTS:
        raise HTTPException(
            status_code=422,
            detail=f"El archivo tiene demasiadas carteras (máximo {MAX_IMPORT_ACCOUNTS}).",
        )

    budgets: dict[str, int] = {}
    raw_budgets = payload.get("budgets")
    if isinstance(raw_budgets, dict):
        for key, value in raw_budgets.items():
            if not isinstance(key, str) or category_types.get(key) != "gasto":
                raise HTTPException(
                    status_code=422,
                    detail=f'El presupuesto de la categoría "{key}" es inválido.',
                )
            # ``null``, ``0`` and ``""`` mean "no cap": ignore them without error
            # (exactly like leaving the input empty in the UI).
            if value is None or value == "" or (not isinstance(value, bool) and value == 0):
                continue
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise HTTPException(
                    status_code=422,
                    detail=f'El presupuesto de la categoría "{key}" es inválido.',
                )
            if value > MAX_CENTS:
                raise HTTPException(status_code=422, detail="El tope es demasiado grande.")
            budgets[key] = value

    jar_categories: dict[str, str] = {}
    raw_jars = payload.get("jar_categories")
    if isinstance(raw_jars, dict):
        for key, value in raw_jars.items():
            if not isinstance(key, str) or category_types.get(key) != "gasto":
                raise HTTPException(
                    status_code=422,
                    detail=f'La categoría "{key}" no puede asignarse a un frasco.',
                )
            if value not in jar_ids:
                raise HTTPException(
                    status_code=422,
                    detail=f'El frasco "{value}" es inválido.',
                )
            jar_categories[key] = value

    return accounts, movements, budgets, jar_categories


def _apply_jar_categories(db: Session, jar_categories: dict[str, str]) -> None:
    for category_id, jar_id in jar_categories.items():
        assignment = db.get(JarCategory, category_id)
        if assignment is None:
            db.add(JarCategory(category_id=category_id, jar_id=jar_id))
        else:
            assignment.jar_id = jar_id


def _ensure_account(
    db: Session,
    name_to_id: dict[str, int],
    name: str,
    opening_balance_cents: int = 0,
) -> tuple[int, bool]:
    """Return the id of ``name``, creating the account (opening ``0``) if missing."""
    if name in name_to_id:
        return name_to_id[name], False
    account = Account(name=name, opening_balance_cents=opening_balance_cents)
    db.add(account)
    db.flush()
    name_to_id[name] = account.id
    return account.id, True


def _existing_signatures(db: Session) -> set[tuple]:
    """Dedupe signatures of the stored movements (includes account + debt flag)."""
    name_by_id = {
        account.id: account.name for account in db.execute(select(Account)).scalars().all()
    }
    signatures: set[tuple] = set()
    for movement in db.execute(select(Movement)).scalars().all():
        signatures.add(
            (
                movement.type,
                movement.category_id,
                movement.amount_cents,
                movement.entry_currency,
                movement.entry_amount_cents,
                movement.rate_micros,
                movement.date.isoformat(),
                movement.note,
                name_by_id.get(movement.account_id),
                movement.is_debt_payment,
            )
        )
    return signatures


def _movement_signature(movement: dict) -> tuple:
    return (
        movement["type"],
        movement["category_id"],
        movement["amount_cents"],
        movement["entry_currency"],
        movement["entry_amount_cents"],
        movement["rate_micros"],
        movement["date"],
        movement["note"],
        movement["account_name"],
        movement["is_debt_payment"],
    )


def _add_movement(db: Session, movement: dict, account_id: int) -> None:
    db.add(
        Movement(
            type=movement["type"],
            category_id=movement["category_id"],
            amount_cents=movement["amount_cents"],
            entry_currency=movement["entry_currency"],
            entry_amount_cents=movement["entry_amount_cents"],
            rate_micros=movement["rate_micros"],
            date=date.fromisoformat(movement["date"]),
            note=movement["note"],
            account_id=account_id,
            is_debt_payment=movement["is_debt_payment"],
        )
    )


def _apply_merge(
    db: Session,
    accounts: list[dict],
    movements: list[dict],
    budgets: dict[str, int],
    jar_categories: dict[str, str],
) -> tuple[int, int, int]:
    name_to_id = {
        account.name: account.id for account in db.execute(select(Account)).scalars().all()
    }
    accounts_imported = 0
    for spec in accounts:
        _, created = _ensure_account(
            db, name_to_id, spec["name"], spec["opening_balance_cents"]
        )
        accounts_imported += int(created)

    existing_signatures = _existing_signatures(db)
    imported = 0
    skipped = 0
    for movement in movements:
        account_id, created = _ensure_account(db, name_to_id, movement["account_name"])
        accounts_imported += int(created)
        signature = _movement_signature(movement)
        if signature in existing_signatures:
            skipped += 1
            continue
        _add_movement(db, movement, account_id)
        existing_signatures.add(signature)
        imported += 1

    for category_id, cap_cents in budgets.items():
        budget = db.get(Budget, category_id)
        if budget is None:
            db.add(Budget(category_id=category_id, cap_cents=cap_cents))
        else:
            budget.cap_cents = cap_cents

    _apply_jar_categories(db, jar_categories)

    return imported, skipped, accounts_imported


def _apply_replace(
    db: Session,
    accounts: list[dict],
    movements: list[dict],
    budgets: dict[str, int],
    jar_categories: dict[str, str],
) -> tuple[int, int, int]:
    db.execute(delete(Movement))
    db.execute(delete(Budget))

    # Replace the accounts too: keep the ones present in the file (by name) and
    # drop the rest (movements are already gone, so the FK is not in the way).
    desired_names = {spec["name"] for spec in accounts}
    desired_names.update(movement["account_name"] for movement in movements)
    for account in list(db.execute(select(Account)).scalars().all()):
        if account.name not in desired_names:
            db.delete(account)
    db.flush()

    name_to_id = {
        account.name: account.id for account in db.execute(select(Account)).scalars().all()
    }
    accounts_imported = 0
    for spec in accounts:
        if spec["name"] in name_to_id:
            existing = db.get(Account, name_to_id[spec["name"]])
            existing.opening_balance_cents = spec["opening_balance_cents"]
        else:
            _, created = _ensure_account(
                db, name_to_id, spec["name"], spec["opening_balance_cents"]
            )
            accounts_imported += int(created)

    for movement in movements:
        account_id, created = _ensure_account(db, name_to_id, movement["account_name"])
        accounts_imported += int(created)
        _add_movement(db, movement, account_id)

    for category_id, cap_cents in budgets.items():
        db.add(Budget(category_id=category_id, cap_cents=cap_cents))

    _apply_jar_categories(db, jar_categories)

    return len(movements), 0, accounts_imported


@router.post("/import", response_model=ImportResultOut)
def import_data(
    raw_body: bytes = Depends(_read_body_within_limit),
    mode: str = "merge",
    db: Session = Depends(get_db),
) -> dict:
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=422, detail="El modo debe ser 'merge' o 'replace'.")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError) as exc:
        raise HTTPException(status_code=422, detail="El archivo no es un JSON válido.") from exc

    category_types = {
        category.id: category.type
        for category in db.execute(select(Category)).scalars().all()
    }
    jar_ids = {jar.id for jar in db.execute(select(Jar)).scalars().all()}
    accounts, movements, budgets, jar_categories = _validate_payload(
        payload, category_types, jar_ids
    )

    # Everything below happens in a single transaction: on any error nothing is
    # applied (the session is rolled back and never committed).
    try:
        if mode == "replace":
            imported, skipped, accounts_imported = _apply_replace(
                db, accounts, movements, budgets, jar_categories
            )
        else:
            imported, skipped, accounts_imported = _apply_merge(
                db, accounts, movements, budgets, jar_categories
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "mode": mode,
        "movements_imported": imported,
        "movements_skipped": skipped,
        "budgets_imported": len(budgets),
        "accounts_imported": accounts_imported,
    }
