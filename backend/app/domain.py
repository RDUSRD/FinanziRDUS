"""Pure business logic (no database, no I/O).

Everything here mirrors the rules validated in ``legacy/index.html``. All money
is an integer number of cents; months are ``YYYY-MM`` strings handled with pure
integer arithmetic; dates are ``YYYY-MM-DD`` validated against a real calendar.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any

VALID_TYPES = ("gasto", "ingreso")

# Upper bound for money columns: PostgreSQL ``INTEGER`` maximum (2^31 - 1).
# Values above this overflow the column and would crash the INSERT with a 500.
MAX_CENTS = 2_147_483_647


class DomainError(ValueError):
    """Raised when a business rule is violated (mapped to HTTP 422 upstream)."""


def _round_half_up(value: float) -> int:
    """Round half towards positive infinity (matches JavaScript ``Math.round``)."""
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


# --------------------------------------------------------------------------- #
# Months and dates
# --------------------------------------------------------------------------- #
def parse_month(month_key: str) -> tuple[int, int]:
    """Parse ``YYYY-MM`` into ``(year, month)`` raising ``ValueError`` if invalid."""
    if not isinstance(month_key, str):
        raise ValueError("El mes debe ser un texto 'YYYY-MM'.")
    parts = month_key.split("-")
    if len(parts) != 2:
        raise ValueError("El mes debe tener el formato 'YYYY-MM'.")
    year_part, month_part = parts
    if len(year_part) != 4 or not year_part.isdigit():
        raise ValueError("El mes debe tener el formato 'YYYY-MM'.")
    if len(month_part) != 2 or not month_part.isdigit():
        raise ValueError("El mes debe tener el formato 'YYYY-MM'.")
    year = int(year_part)
    month = int(month_part)
    if month < 1 or month > 12:
        raise ValueError("El mes debe estar entre 01 y 12.")
    return year, month


def shift_month(month_key: str, delta: int) -> str:
    """Shift a ``YYYY-MM`` key by ``delta`` months using integer arithmetic."""
    year, month = parse_month(month_key)
    total = year * 12 + (month - 1) + delta
    new_year = total // 12
    new_month = total % 12 + 1
    return f"{new_year:04d}-{new_month:02d}"


def month_key_of(value: date | datetime | str) -> str:
    """Return the ``YYYY-MM`` month key of a date, datetime or date string."""
    if isinstance(value, str):
        return value[:7]
    return f"{value.year:04d}-{value.month:02d}"


def valid_date_str(value: object) -> bool:
    """Validate a ``YYYY-MM-DD`` string against the real calendar (leap years)."""
    if not isinstance(value, str) or len(value) != 10:
        return False
    parts = value.split("-")
    if len(parts) != 3:
        return False
    year_part, month_part, day_part = parts
    if len(year_part) != 4 or not year_part.isdigit():
        return False
    if len(month_part) != 2 or not month_part.isdigit():
        return False
    if len(day_part) != 2 or not day_part.isdigit():
        return False
    year = int(year_part)
    month = int(month_part)
    day = int(day_part)
    if month < 1 or month > 12 or day < 1:
        return False
    leap = (year % 4 == 0 and year % 100 != 0) or year % 400 == 0
    days_in_month = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return day <= days_in_month[month - 1]


# --------------------------------------------------------------------------- #
# Stats helpers
# --------------------------------------------------------------------------- #
def average_prev_months(
    monthly_expenses: Mapping[str, int],
    month_key: str,
    n: int = 6,
) -> tuple[int, int]:
    """Average expenses of the ``n`` months *before* ``month_key``.

    Only months with spending (> 0) are averaged. Returns
    ``(avg_cents, months_used)``; ``(0, 0)`` when there is no history.
    """
    if n <= 0:
        return 0, 0
    total = 0
    months_used = 0
    for offset in range(1, n + 1):
        key = shift_month(month_key, -offset)
        spent = int(monthly_expenses.get(key, 0) or 0)
        if spent > 0:
            total += spent
            months_used += 1
    if months_used == 0:
        return 0, 0
    return _round_half_up(total / months_used), months_used


def budget_status(spent_cents: int, cap_cents: int) -> str:
    """Return ``none|ok|warn|over`` for a budget threshold."""
    if cap_cents <= 0:
        return "none"
    if spent_cents > cap_cents:
        return "over"
    # 80% exactly => warn, using integer math (spent / cap >= 4 / 5).
    if spent_cents * 5 >= cap_cents * 4:
        return "warn"
    return "ok"


def category_shares(by_cat: Mapping[str, int]) -> list[dict[str, Any]]:
    """Expense shares per category, ordered by cents descending.

    ``share`` is a fraction in ``0..1`` (``0`` when the total is ``0``).
    """
    total = sum(int(cents) for cents in by_cat.values() if cents)
    items: list[dict[str, Any]] = []
    for category_id, cents in by_cat.items():
        cents_int = int(cents)
        share = (cents_int / total) if total > 0 else 0.0
        items.append({"category_id": category_id, "cents": cents_int, "share": share})
    items.sort(key=lambda item: (-item["cents"], item["category_id"]))
    return items


def monthly_totals(
    expenses_by_month: Mapping[str, int],
    income_by_month: Mapping[str, int],
    end_month: str,
    n: int,
) -> list[dict[str, Any]]:
    """Totals for ``n`` months ending at ``end_month`` (inclusive), ascending.

    Months without data are reported as ``0``.
    """
    if n <= 0:
        return []
    result: list[dict[str, Any]] = []
    for offset in range(n - 1, -1, -1):
        key = shift_month(end_month, -offset)
        result.append(
            {
                "month": key,
                "expenses_cents": int(expenses_by_month.get(key, 0) or 0),
                "income_cents": int(income_by_month.get(key, 0) or 0),
            }
        )
    return result


def comparison(current_cents: int, avg_cents: int) -> dict[str, Any]:
    """Compare current expenses against an average.

    ``direction`` is ``above|below|equal|na`` (``na`` when ``avg <= 0``);
    ``pct`` is the signed fraction ``(current - avg) / avg``.
    """
    if avg_cents <= 0:
        return {"pct": 0.0, "direction": "na"}
    diff = current_cents - avg_cents
    if diff > 0:
        direction = "above"
    elif diff < 0:
        direction = "below"
    else:
        direction = "equal"
    return {"pct": diff / avg_cents, "direction": direction}


# --------------------------------------------------------------------------- #
# Input validation
# --------------------------------------------------------------------------- #
def validate_type(type_value: object) -> str:
    if type_value not in VALID_TYPES:
        raise DomainError("El tipo debe ser 'gasto' o 'ingreso'.")
    return str(type_value)


def validate_amount(amount_cents: object) -> int:
    if isinstance(amount_cents, bool) or not isinstance(amount_cents, int):
        raise DomainError("El monto debe ser un número entero de centavos.")
    if amount_cents <= 0:
        raise DomainError("El monto debe ser mayor a cero.")
    if amount_cents > MAX_CENTS:
        raise DomainError("El monto es demasiado grande.")
    return amount_cents


def validate_cap(cap_cents: object) -> int:
    if isinstance(cap_cents, bool) or not isinstance(cap_cents, int):
        raise DomainError("El tope debe ser un número entero de centavos.")
    if cap_cents <= 0:
        raise DomainError("El tope debe ser mayor a cero.")
    if cap_cents > MAX_CENTS:
        raise DomainError("El tope es demasiado grande.")
    return cap_cents


def validate_date(value: object) -> str:
    if not valid_date_str(value):
        raise DomainError("La fecha no es válida.")
    return str(value)


def validate_note(note: object) -> str:
    text_value = "" if note is None else str(note).strip()
    if len(text_value) > 140:
        raise DomainError("La nota no puede superar los 140 caracteres.")
    return text_value


def validate_category_match(type_value: str, category_type: str | None) -> None:
    if category_type is None:
        raise DomainError("La categoría no existe.")
    if category_type != type_value:
        raise DomainError("La categoría no corresponde al tipo elegido.")
