"""API routers for FinanciRDUS."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException

from ..domain import parse_month, shift_month


def month_bounds(month_key: str) -> tuple[date, date]:
    """Return ``[first day, first day of next month)`` for a ``YYYY-MM`` key.

    Raises HTTP 422 with a readable Spanish message when the key is malformed.
    """
    try:
        year, month = parse_month(month_key)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="El mes debe tener el formato 'YYYY-MM'.",
        ) from exc
    next_year, next_month = parse_month(shift_month(month_key, 1))
    return date(year, month, 1), date(next_year, next_month, 1)
