"""API routers for FinanciRDUS."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException

from ..domain import parse_month, shift_month
from ..models import AdminSession


def month_bounds(month_key: str) -> tuple[date, date]:
    """Return ``[first day, first day of next month)`` for a ``YYYY-MM`` key.

    Raises HTTP 422 with a readable Spanish message when the key is malformed.
    """
    try:
        year, month = parse_month(month_key)
        next_year, next_month = parse_month(shift_month(month_key, 1))
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="El mes debe tener el formato 'YYYY-MM'.",
        ) from exc
    return date(year, month, 1), date(next_year, next_month, 1)


def month_window_start(month_key: str, months_back: int) -> str:
    """Return the first month of an ``months_back``-month window ending at ``month_key``.

    Raises HTTP 422 when the window would fall outside the supported range.
    """
    try:
        return shift_month(month_key, -months_back)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="El mes está fuera del rango soportado para la ventana pedida.",
        ) from exc


def account_id_param(account: str | None) -> int | None:
    """Parse the optional ``account`` query parameter.

    Accepts a numeric account id (returns it) or ``all`` / an empty value
    (returns ``None`` = no filter). Anything else is a 422.
    """
    if account is None:
        return None
    candidate = account.strip()
    if candidate == "" or candidate == "all":
        return None
    try:
        return int(candidate)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="La cartera debe ser un id numérico o 'all'.",
        ) from exc


def session_out(session: AdminSession, current_id: int | None) -> dict:
    """Serialize one session for the admin panel.

    ``is_current`` cannot come from the model: it depends on which session the
    current request was made with.
    """
    return {
        "id": session.id,
        "created_at": session.created_at,
        "last_seen_at": session.last_seen_at,
        "expires_at": session.expires_at,
        "ip": session.ip,
        "user_agent": session.user_agent,
        "is_current": session.id == current_id,
    }
