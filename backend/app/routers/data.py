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
from ..domain import MAX_CENTS, VALID_TYPES, valid_date_str
from ..models import Budget, Category, Movement
from ..schemas import ImportResultOut

router = APIRouter(prefix="/api/data", tags=["data"])

DATA_VERSION = 1

# Defensive limits against absurd payloads (no auth, personal app).
MAX_IMPORT_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_IMPORT_MOVEMENTS = 20_000
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
    movements = (
        db.execute(select(Movement).order_by(Movement.date, Movement.id)).scalars().all()
    )
    budgets = {
        budget.category_id: budget.cap_cents
        for budget in db.execute(select(Budget)).scalars().all()
    }

    payload = {
        "version": DATA_VERSION,
        "exported_at": settings.now().isoformat(),
        "movements": [
            {
                "type": movement.type,
                "category_id": movement.category_id,
                "amount_cents": movement.amount_cents,
                "date": movement.date.isoformat(),
                "note": movement.note,
            }
            for movement in movements
        ],
        "budgets": budgets,
    }
    filename = f"financirdus-{settings.today().isoformat()}.json"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _validate_payload(payload: Any, category_types: dict[str, str]) -> tuple[list[dict], dict]:
    """Validate an import payload.

    Raises HTTP 422 with a concrete, numbered Spanish message on the first
    problem found. Returns ``(movements, budgets)`` ready to persist.
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="El archivo no contiene un objeto válido.")

    if payload.get("version") != DATA_VERSION:
        raise HTTPException(
            status_code=422,
            detail="Versión de datos no compatible (se esperaba 1).",
        )

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

        amount = item.get("amount_cents")
        if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene un monto inválido.",
            )
        if amount > MAX_CENTS:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene un monto demasiado grande.",
            )

        date_str = item.get("date")
        if not valid_date_str(date_str):
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene una fecha inválida.",
            )

        category_id = item.get("category_id")
        if not isinstance(category_id, str) or category_types.get(category_id) != type_value:
            raise HTTPException(
                status_code=422,
                detail=f"El movimiento {position} tiene una categoría inválida.",
            )

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
                "date": date_str,
                "note": note,
            }
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

    return movements, budgets


def _apply_merge(db: Session, movements: list[dict], budgets: dict[str, int]) -> tuple[int, int]:
    existing_signatures = {
        (movement.type, movement.category_id, movement.amount_cents,
         movement.date.isoformat(), movement.note)
        for movement in db.execute(select(Movement)).scalars().all()
    }
    imported = 0
    skipped = 0
    for movement in movements:
        signature = (
            movement["type"],
            movement["category_id"],
            movement["amount_cents"],
            movement["date"],
            movement["note"],
        )
        if signature in existing_signatures:
            skipped += 1
            continue
        db.add(
            Movement(
                type=movement["type"],
                category_id=movement["category_id"],
                amount_cents=movement["amount_cents"],
                date=date.fromisoformat(movement["date"]),
                note=movement["note"],
            )
        )
        existing_signatures.add(signature)
        imported += 1

    for category_id, cap_cents in budgets.items():
        budget = db.get(Budget, category_id)
        if budget is None:
            db.add(Budget(category_id=category_id, cap_cents=cap_cents))
        else:
            budget.cap_cents = cap_cents

    return imported, skipped


def _apply_replace(db: Session, movements: list[dict], budgets: dict[str, int]) -> tuple[int, int]:
    db.execute(delete(Budget))
    db.execute(delete(Movement))
    for movement in movements:
        db.add(
            Movement(
                type=movement["type"],
                category_id=movement["category_id"],
                amount_cents=movement["amount_cents"],
                date=date.fromisoformat(movement["date"]),
                note=movement["note"],
            )
        )
    for category_id, cap_cents in budgets.items():
        db.add(Budget(category_id=category_id, cap_cents=cap_cents))
    return len(movements), 0


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
    movements, budgets = _validate_payload(payload, category_types)

    # Everything below happens in a single transaction: on any error nothing is
    # applied (the session is rolled back and never committed).
    try:
        if mode == "replace":
            imported, skipped = _apply_replace(db, movements, budgets)
        else:
            imported, skipped = _apply_merge(db, movements, budgets)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "mode": mode,
        "movements_imported": imported,
        "movements_skipped": skipped,
        "budgets_imported": len(budgets),
    }
