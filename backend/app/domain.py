"""Pure business logic (no database, no I/O).

Everything here mirrors the rules validated in ``legacy/index.html``. All money
is an integer number of cents; months are ``YYYY-MM`` strings handled with pure
integer arithmetic; dates are ``YYYY-MM-DD`` validated against a real calendar.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime
from typing import Any

VALID_TYPES = ("gasto", "ingreso")

# Currencies in which a movement can be entered by the user. The canonical
# storage currency is always USD (``amount_cents``); ``VES`` is an entry mode.
ENTRY_CURRENCIES = ("USD", "VES")

# Upper bound for money columns: PostgreSQL ``INTEGER`` maximum (2^31 - 1).
# Values above this overflow the column and would crash the INSERT with a 500.
MAX_CENTS = 2_147_483_647

# Upper bound for the exchange rate (Bs per USD x 1_000_000). 1e15 micros is
# 1_000_000_000 Bs/USD: far above any realistic value, kept as BIGINT-safe.
MAX_RATE_MICROS = 10**15

MICROS_PER_UNIT = 1_000_000


class DomainError(ValueError):
    """Raised when a business rule is violated (mapped to HTTP 422 upstream)."""


def _round_half_up(value: float) -> int:
    """Round half towards positive infinity (matches JavaScript ``Math.round``)."""
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


def _half_up_div(num: int, den: int) -> int:
    """Integer division ``num / den`` rounded half towards positive infinity.

    Pure integer arithmetic (no float) so large values never lose precision.
    Generalizes :func:`_round_half_up` to arbitrary exact fractions.
    """
    if den <= 0:
        raise ValueError("El denominador debe ser mayor a cero.")
    return (2 * num + den) // (2 * den)


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
    if year < 1 or year > 9999:
        raise ValueError("El mes debe estar entre 0001-01 y 9999-12.")
    month = int(month_part)
    if month < 1 or month > 12:
        raise ValueError("El mes debe estar entre 01 y 12.")
    return year, month


def shift_month(month_key: str, delta: int) -> str:
    """Shift a ``YYYY-MM`` key by ``delta`` months using integer arithmetic."""
    year, month = parse_month(month_key)
    total = year * 12 + (month - 1) + delta
    new_year = total // 12
    if new_year < 1 or new_year > 9999:
        raise ValueError("El mes está fuera del rango soportado.")
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
    if year < 1 or year > 9999:
        return False
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


# --------------------------------------------------------------------------- #
# Entry currency and VES <-> USD conversion
# --------------------------------------------------------------------------- #
def validate_entry_currency(value: object) -> str:
    """Validate the currency in which the movement was entered."""
    if value not in ENTRY_CURRENCIES:
        raise DomainError("La moneda debe ser 'USD' o 'VES'.")
    return str(value)


def validate_rate_micros(value: object) -> int:
    """Validate the exchange rate (Bs per USD x 1_000_000)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise DomainError("La tasa debe ser un número entero de micros.")
    if value <= 0:
        raise DomainError("La tasa debe ser mayor a cero.")
    if value > MAX_RATE_MICROS:
        raise DomainError("La tasa es demasiado grande.")
    return value


def ves_to_usd_cents(ves_cents: int, rate_micros: int) -> int:
    """Convert an amount in Bs céntimos to USD cents (half-up)."""
    rate = validate_rate_micros(rate_micros)
    return _half_up_div(ves_cents * MICROS_PER_UNIT, rate)


def usd_to_ves_cents(usd_cents: int, rate_micros: int) -> int:
    """Convert an amount in USD cents to Bs céntimos (half-up). Display only."""
    rate = validate_rate_micros(rate_micros)
    return _half_up_div(usd_cents * rate, MICROS_PER_UNIT)


def compute_amount_cents(
    entry_currency: object,
    entry_amount_cents: object,
    rate_micros: object,
) -> int:
    """Return the canonical USD cents for a movement entry.

    ``'USD'`` returns the entered amount unchanged (a rate is forbidden);
    ``'VES'`` requires a rate and converts ``entry_amount_cents`` (Bs céntimos)
    to USD cents with half-up rounding. The result must fall in ``1..MAX_CENTS``.
    """
    currency = validate_entry_currency(entry_currency)
    amount = validate_amount(entry_amount_cents)

    if currency == "USD":
        if rate_micros is not None:
            raise DomainError("La tasa no aplica a los montos en dólares.")
        return amount

    if rate_micros is None:
        raise DomainError("La tasa es obligatoria para los montos en bolívares.")
    rate = validate_rate_micros(rate_micros)
    result = ves_to_usd_cents(amount, rate)
    if result < 1 or result > MAX_CENTS:
        raise DomainError("El monto en dólares equivalente está fuera de rango.")
    return result


# --------------------------------------------------------------------------- #
# Movement detail lines (optional invoice items)
# --------------------------------------------------------------------------- #
# Upper bound for the number of lines per movement and for the description of a
# single line (validated here exactly like the ``note <= 140`` rule).
MAX_MOVEMENT_ITEMS = 100
MAX_ITEM_DESC_LEN = 120


def validate_items(raw_items: object) -> list[dict]:
    """Normalize and validate the optional detail lines of a movement.

    Returns ``[]`` when ``raw_items`` is ``None`` or empty. Each line must be a
    mapping with a ``description`` (1..``MAX_ITEM_DESC_LEN`` chars after a
    ``strip``) and an ``amount_cents`` integer in ``1..MAX_CENTS``. Lines keep
    their incoming order.
    """
    if raw_items is None:
        return []
    if not isinstance(raw_items, Sequence) or isinstance(raw_items, (str, bytes)):
        raise DomainError("Las líneas del movimiento deben ser una lista.")
    if len(raw_items) > MAX_MOVEMENT_ITEMS:
        raise DomainError(f"Máximo {MAX_MOVEMENT_ITEMS} líneas por movimiento.")

    items: list[dict] = []
    for raw in raw_items:
        if not isinstance(raw, Mapping):
            raw = {}
        raw_description = raw.get("description")
        description = "" if raw_description is None else str(raw_description).strip()
        if not description or len(description) > MAX_ITEM_DESC_LEN:
            raise DomainError(
                "Cada línea necesita una descripción de hasta "
                f"{MAX_ITEM_DESC_LEN} caracteres."
            )
        amount_cents = raw.get("amount_cents")
        if (
            isinstance(amount_cents, bool)
            or not isinstance(amount_cents, int)
            or amount_cents < 1
            or amount_cents > MAX_CENTS
        ):
            raise DomainError("El precio de una línea debe ser mayor a cero.")
        items.append({"description": description, "amount_cents": amount_cents})
    return items


def items_total_cents(items: Iterable[Mapping[str, Any]]) -> int:
    """Sum of the detail lines in the movement's entry currency.

    Raises :class:`DomainError` when the total exceeds ``MAX_CENTS`` (it would
    overflow the money columns and crash the INSERT with a 500).
    """
    total = sum(int(item["amount_cents"]) for item in items)
    if total > MAX_CENTS:
        raise DomainError("La suma de las líneas supera el máximo permitido.")
    return total


def resolve_movement_amount(
    entry_currency: object,
    entry_amount_cents: object,
    rate_micros: object,
    items: Sequence[Mapping[str, Any]],
) -> tuple[int, int, str, int | None]:
    """Resolve the effective amount triplet of a movement.

    Returns ``(amount_cents, entry_amount_cents, entry_currency, rate_micros)``.

    With lines the entry amount is the sum of the lines, expressed in the entry
    currency (dollars for ``USD``, bolívares for ``VES``); any entry amount the
    caller may have sent alongside the lines is ignored. ``USD`` keeps that sum
    as the canonical amount and carries no rate; ``VES`` requires a rate and
    converts the sum to USD cents *once* with :func:`compute_amount_cents`, so
    the total matches the sum and no per-line rounding drift can appear.

    Without lines the canonical amount is computed from the entry triplet as
    usual and the amount is mandatory.
    """
    currency = validate_entry_currency(entry_currency)
    if items:
        entry_amount = items_total_cents(items)
        if currency == "USD":
            return entry_amount, entry_amount, "USD", None
        amount = compute_amount_cents("VES", entry_amount, rate_micros)
        return amount, entry_amount, "VES", rate_micros  # type: ignore[return-value]
    if entry_amount_cents is None:
        raise DomainError("El monto es obligatorio.")
    amount = compute_amount_cents(currency, entry_amount_cents, rate_micros)
    return amount, entry_amount_cents, currency, rate_micros  # type: ignore[return-value]


# --------------------------------------------------------------------------- #
# Money jars (25/15/50/10 plan)
# --------------------------------------------------------------------------- #
def jar_targets(
    income_cents: int,
    jars: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Per-jar USD target for ``income_cents`` using each jar ``pct``.

    The first ``N-1`` jars use half-up rounding; the last jar absorbs the
    remainder so ``sum(targets) == income_cents`` exactly. A non-positive income
    (or an empty catalogue) yields all-zero targets.
    """
    income = int(income_cents)
    if income <= 0 or not jars:
        return [{"jar_id": jar["id"], "target_cents": 0} for jar in jars]

    targets: list[dict[str, Any]] = []
    assigned = 0
    last_index = len(jars) - 1
    for index, jar in enumerate(jars):
        if index == last_index:
            target = income - assigned
        else:
            target = _half_up_div(income * int(jar["pct"]), 100)
            assigned += target
        targets.append({"jar_id": jar["id"], "target_cents": target})
    return targets


# --------------------------------------------------------------------------- #
# Accounts (named USD wallets) and debts
# --------------------------------------------------------------------------- #
# Expense category reserved for debt payments; it is seeded as a system
# category and never appears in the manual selector, budgets or jar mapping.
DEBT_CATEGORY_ID = "deudas"

# Upper bound for an account name (1..60 characters, after ``strip``).
MAX_NAME_LEN = 60


def validate_account_name(value: object) -> str:
    """Validate an account name: a non-empty, trimmed string of 1..60 chars."""
    if not isinstance(value, str):
        raise DomainError("El nombre de la cartera debe ser un texto.")
    name = value.strip()
    if not name:
        raise DomainError("El nombre de la cartera es obligatorio.")
    if len(name) > MAX_NAME_LEN:
        raise DomainError(
            f"El nombre de la cartera no puede superar los {MAX_NAME_LEN} caracteres."
        )
    return name


def validate_opening_balance(value: object) -> int:
    """Validate a signed opening balance in cents (``abs <= MAX_CENTS``).

    A negative value marks the account as a debt.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        raise DomainError("El saldo inicial debe ser un número entero de centavos.")
    if value < -MAX_CENTS or value > MAX_CENTS:
        raise DomainError("El saldo inicial está fuera de rango.")
    return value


def validate_is_debt_payment(value: object) -> bool:
    """Validate that the debt-payment flag is a genuine boolean."""
    if not isinstance(value, bool):
        raise DomainError("El campo 'pago de deuda' debe ser booleano.")
    return value


def validate_debt_payment(
    is_debt_payment: bool,
    type_value: str,
    opening_cents: int,
) -> None:
    """Business rule for a debt payment.

    When ``is_debt_payment`` is true the movement must be a ``gasto`` and its
    account must be a debt (``opening_cents < 0``); otherwise it is a no-op.
    """
    if not is_debt_payment:
        return
    if type_value != "gasto":
        raise DomainError("Un pago de deuda debe ser un gasto.")
    if int(opening_cents) >= 0:
        raise DomainError(
            "Solo se pueden registrar pagos de deuda en una cartera con saldo inicial negativo."
        )


def account_balance(opening_cents: int, movements: Iterable[tuple[str, int, bool]]) -> int:
    """Balance of an account in cents.

    ``balance = opening + Σ(ingreso) − Σ(gasto NO pago) + Σ(gasto pago)``.

    ``movements`` is a sequence of ``(type, amount_cents, is_debt_payment)``.
    """
    balance = int(opening_cents)
    for type_value, amount_cents, is_debt_payment in movements:
        amount = int(amount_cents)
        if type_value == "ingreso":
            balance += amount
        elif is_debt_payment:
            balance += amount
        else:
            balance -= amount
    return balance


def _opening_balance_of(account: object) -> int:
    """Read ``opening_balance_cents`` from a mapping or an object."""
    if isinstance(account, Mapping):
        value = account["opening_balance_cents"]
    else:
        value = account.opening_balance_cents  # type: ignore[union-attr]
    return int(value)


def account_balance_item(
    account: Mapping[str, Any] | object,
    movements: Iterable[tuple[str, int, bool]],
) -> dict[str, Any]:
    """Derived figures for an account: balance, debt flag, paid/remaining and %.

    ``remaining_cents`` and ``pct_paid`` are only meaningful for debt accounts
    (``opening_balance_cents < 0``); they are ``0`` otherwise.
    """
    movement_list = list(movements)
    opening = _opening_balance_of(account)
    balance = account_balance(opening, movement_list)
    is_debt = opening < 0
    paid_cents = sum(
        int(amount)
        for type_value, amount, is_debt_payment in movement_list
        if type_value == "gasto" and is_debt_payment
    )
    if is_debt:
        remaining_cents = -balance
        pct_paid = (paid_cents / (-opening)) if opening != 0 else 0.0
    else:
        remaining_cents = 0
        pct_paid = 0.0
    return {
        "balance_cents": balance,
        "is_debt": is_debt,
        "paid_cents": paid_cents,
        "remaining_cents": remaining_cents,
        "pct_paid": pct_paid,
    }


def total_debt_cents(balances: Iterable[int]) -> int:
    """Total outstanding debt: the sum of the negative balances, made positive."""
    return sum(-int(balance) for balance in balances if int(balance) < 0)
