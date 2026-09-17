"""Bounded local harness for h2 (import/export coverage units).

Only exercises pure-stdlib logic (backend/app/domain.py) and the stdlib date
parser used at the data.py sink. No network, no third-party deps.
"""

import sys
from datetime import date

sys.path.insert(0, "/home/rdus/code/FinanciRDUS/backend")

from app.domain import valid_date_str  # noqa: E402

CASES = [
    "2026-09-04",
    "2026-02-29",   # not a leap year -> invalid
    "2024-02-29",   # leap year -> valid
    "0000-01-01",   # year 0
    "0001-01-01",
    "9999-12-31",
]

for value in CASES:
    accepted = valid_date_str(value)
    try:
        date.fromisoformat(value)
        parsed = "OK"
    except ValueError as exc:
        parsed = f"ValueError: {exc}"
    gap = accepted and parsed != "OK"
    print(f"valid_date_str({value!r})={accepted!s:5}  date.fromisoformat -> {parsed}"
          + ("   <<< MISMATCH (validator accepts, sink raises)" if gap else ""))

# Demonstrate the unhashable-key TypeError on dict.get for non-string category ids.
category_types = {"ocio": "gasto", "sueldo": "ingreso"}
for bad in ([1], {"a": 1}):
    try:
        category_types.get(bad)
        print(f"category_types.get({bad!r}) -> no error")
    except TypeError as exc:
        print(f"category_types.get({bad!r}) -> TypeError: {exc}  <<< unhandled in _validate_payload")
