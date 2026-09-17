"""Bounded local probe of domain.py month/date helpers (pure stdlib, no deps).

Replicates the exact control flow of routers/__init__.month_bounds and
movements._validate_and_build to observe whether a year-0000 month key or an
out-of-range fromisoformat value raises an *uncaught* ValueError (HTTP 500).
"""

import sys
from datetime import date

sys.path.insert(0, "/home/rdus/code/FinanciRDUS/backend")

from app.domain import parse_month, shift_month, valid_date_str  # noqa: E402


def month_bounds_like_router(month_key: str):
    # Mirrors backend/app/routers/__init__.py exactly.
    try:
        year, month = parse_month(month_key)
    except ValueError as exc:
        return ("HTTPException422", str(exc))
    next_year, next_month = parse_month(shift_month(month_key, 1))  # NOT guarded
    return ("dates", date(year, month, 1), date(next_year, next_month, 1))


cases = ["2026-09", "0000-01", "0000-12", "9999-12", "0001-01"]

for key in cases:
    try:
        print(key, "->", month_bounds_like_router(key))
    except Exception as exc:  # noqa: BLE001
        print(key, "-> UNCAUGHT", type(exc).__name__, exc)

print("-" * 40)

# valid_date_str accepts year 0000, then date.fromisoformat raises ValueError.
for d in ["0000-01-01", "0000-02-29", "2026-02-31"]:
    ok = valid_date_str(d)
    try:
        built = date.fromisoformat(d)
        print(d, "valid_date_str=", ok, "fromisoformat=", built)
    except Exception as exc:  # noqa: BLE001
        print(d, "valid_date_str=", ok, "fromisoformat UNCAUGHT", type(exc).__name__, exc)
