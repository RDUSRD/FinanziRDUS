"""API tests using TestClient against an in-memory SQLite database."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.domain import account_balance, shift_month, total_debt_cents
from app.main import create_app
from app.models import Account, Budget, Movement, MovementItem
from app.seed import (
    ACCOUNT_SEED,
    BUDGETS_USD,
    DEFAULT_ACCOUNT_NAME,
    _seed,
    build_movements,
)

CURRENT_MONTH = get_settings().current_month()
PREV_MONTH = shift_month(CURRENT_MONTH, -1)

# Default wallet id created by the ``db_session`` fixture.
ACCOUNT_ID = 1


def _movement_payload(**overrides) -> dict:
    payload = {
        "type": "gasto",
        "category_id": "ocio",
        "account_id": ACCOUNT_ID,
        "entry_currency": "USD",
        "entry_amount_cents": 4500000,
        "date": f"{CURRENT_MONTH}-04",
        "note": "Cine",
    }
    payload.update(overrides)
    return payload


def _create(client: TestClient, **overrides) -> dict:
    response = client.post("/api/movements", json=_movement_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# Health & categories
# --------------------------------------------------------------------------- #
def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok", "version": "1.0.0"}


def test_health_returns_503_when_db_is_down() -> None:
    application = create_app()

    class BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise RuntimeError("database is down")

    def override_get_db():
        yield BrokenSession()

    application.dependency_overrides[get_db] = override_get_db
    with TestClient(application) as broken_client:
        response = broken_client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "db": "error"}


def test_categories_are_grouped_and_ordered(client: TestClient) -> None:
    response = client.get("/api/categories")
    assert response.status_code == 200
    categories = response.json()
    assert len(categories) == 15
    assert categories[0]["type"] == "gasto"
    assert categories[-1]["type"] == "ingreso"
    gasto = [c for c in categories if c["type"] == "gasto"]
    assert [c["sort_order"] for c in gasto] == list(range(1, 12))
    # The debt category is flagged as system-managed.
    deudas = next(c for c in categories if c["id"] == "deudas")
    assert deudas["is_system"] is True
    assert all(c["is_system"] is False for c in categories if c["id"] != "deudas")


# --------------------------------------------------------------------------- #
# Movements CRUD
# --------------------------------------------------------------------------- #
def test_movement_crud_lifecycle(client: TestClient) -> None:
    created = _create(client)
    assert created["type"] == "gasto"
    assert created["category_id"] == "ocio"
    assert created["amount_cents"] == 4500000
    assert created["account_id"] == ACCOUNT_ID
    assert created["account_name"] == "Cartera USD"
    assert created["is_debt_payment"] is False
    assert created["entry_currency"] == "USD"
    assert created["entry_amount_cents"] == 4500000
    assert created["rate_micros"] is None
    assert created["date"] == f"{CURRENT_MONTH}-04"
    assert created["note"] == "Cine"
    assert "created_at" in created
    movement_id = created["id"]

    listed = client.get("/api/movements", params={"month": CURRENT_MONTH}).json()
    assert [m["id"] for m in listed] == [movement_id]

    updated = client.patch(
        f"/api/movements/{movement_id}",
        json={"entry_amount_cents": 5000000, "note": "  Corregido  "},
    )
    assert updated.status_code == 200
    assert updated.json()["amount_cents"] == 5000000
    assert updated.json()["entry_amount_cents"] == 5000000
    assert updated.json()["note"] == "Corregido"

    deleted = client.delete(f"/api/movements/{movement_id}")
    assert deleted.status_code == 204
    assert client.get("/api/movements").json() == []


def test_movement_filters(client: TestClient) -> None:
    _create(client, category_id="ocio", type="gasto")
    _create(
        client,
        category_id="sueldo",
        type="ingreso",
        entry_amount_cents=100000000,
        date=f"{CURRENT_MONTH}-01",
    )
    _create(client, category_id="salud", type="gasto", date=f"{PREV_MONTH}-10")

    assert len(client.get("/api/movements").json()) == 3
    assert len(client.get("/api/movements", params={"month": CURRENT_MONTH}).json()) == 2
    assert len(client.get("/api/movements", params={"category": "ocio"}).json()) == 1
    assert len(client.get("/api/movements", params={"type": "ingreso"}).json()) == 1

    bad_type = client.get("/api/movements", params={"type": "otro"})
    assert bad_type.status_code == 422
    assert isinstance(bad_type.json()["detail"], str)

    bad_month = client.get("/api/movements", params={"month": "2026-13"})
    assert bad_month.status_code == 422


def test_create_movement_business_errors(client: TestClient) -> None:
    # Category does not exist.
    response = client.post("/api/movements", json=_movement_payload(category_id="nope"))
    assert response.status_code == 422
    assert response.json()["detail"] == "La categoría no existe."

    # Type does not match the category type.
    response = client.post("/api/movements", json=_movement_payload(type="ingreso"))
    assert response.status_code == 422
    assert response.json()["detail"] == "La categoría no corresponde al tipo elegido."

    # Amount must be > 0.
    response = client.post("/api/movements", json=_movement_payload(entry_amount_cents=0))
    assert response.status_code == 422
    assert response.json()["detail"] == "El monto debe ser mayor a cero."

    # Invalid calendar date (February 31st).
    response = client.post("/api/movements", json=_movement_payload(date="2026-02-31"))
    assert response.status_code == 422
    assert response.json()["detail"] == "La fecha no es válida."

    # Note longer than 140 characters.
    response = client.post("/api/movements", json=_movement_payload(note="x" * 141))
    assert response.status_code == 422
    assert response.json()["detail"] == "La nota no puede superar los 140 caracteres."


def test_update_movement_errors_and_missing(client: TestClient) -> None:
    created = _create(client)
    movement_id = created["id"]

    mismatch = client.patch(
        f"/api/movements/{movement_id}", json={"category_id": "sueldo"}
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["detail"] == "La categoría no corresponde al tipo elegido."

    missing = client.patch("/api/movements/9999", json={"entry_amount_cents": 100})
    assert missing.status_code == 404
    assert client.delete("/api/movements/9999").status_code == 404


# --------------------------------------------------------------------------- #
# Movements entered in bolívares (VES)
# --------------------------------------------------------------------------- #
def test_create_movement_in_ves_computes_usd(client: TestClient) -> None:
    # 4.000,00 Bs at 40 Bs/USD = $100,00.
    created = _create(
        client,
        entry_currency="VES",
        entry_amount_cents=400_000,
        rate_micros=40_000_000,
    )
    assert created["amount_cents"] == 10_000
    assert created["entry_currency"] == "VES"
    assert created["entry_amount_cents"] == 400_000
    assert created["rate_micros"] == 40_000_000

    # The triplet is persisted and the canonical USD value is what gets listed.
    stored = client.get("/api/movements").json()
    assert len(stored) == 1
    assert stored[0]["amount_cents"] == 10_000
    assert stored[0]["entry_currency"] == "VES"
    assert stored[0]["entry_amount_cents"] == 400_000
    assert stored[0]["rate_micros"] == 40_000_000


def test_entry_validation_errors(client: TestClient) -> None:
    # VES requires a rate.
    no_rate = client.post(
        "/api/movements",
        json=_movement_payload(entry_currency="VES", entry_amount_cents=400_000),
    )
    assert no_rate.status_code == 422
    assert no_rate.json()["detail"] == "La tasa es obligatoria para los montos en bolívares."

    # A non-positive rate is invalid.
    zero_rate = client.post(
        "/api/movements",
        json=_movement_payload(
            entry_currency="VES", entry_amount_cents=400_000, rate_micros=0
        ),
    )
    assert zero_rate.status_code == 422
    assert zero_rate.json()["detail"] == "La tasa debe ser mayor a cero."

    # USD must not carry a rate.
    usd_rate = client.post(
        "/api/movements",
        json=_movement_payload(
            entry_currency="USD", entry_amount_cents=1000, rate_micros=40_000_000
        ),
    )
    assert usd_rate.status_code == 422
    assert usd_rate.json()["detail"] == "La tasa no aplica a los montos en dólares."

    # Unknown currency.
    bad_currency = client.post(
        "/api/movements",
        json=_movement_payload(entry_currency="ARS", entry_amount_cents=1000),
    )
    assert bad_currency.status_code == 422
    assert bad_currency.json()["detail"] == "La moneda debe ser 'USD' o 'VES'."

    # Rate above the supported ceiling.
    huge_rate = client.post(
        "/api/movements",
        json=_movement_payload(
            entry_currency="VES",
            entry_amount_cents=400_000,
            rate_micros=10**15 + 1,
        ),
    )
    assert huge_rate.status_code == 422
    assert huge_rate.json()["detail"] == "La tasa es demasiado grande."

    # A VES amount that rounds down to $0 is out of range.
    out_of_range = client.post(
        "/api/movements",
        json=_movement_payload(
            entry_currency="VES", entry_amount_cents=1, rate_micros=10**15
        ),
    )
    assert out_of_range.status_code == 422
    assert (
        out_of_range.json()["detail"] == "El monto en dólares equivalente está fuera de rango."
    )

    # ``entry_amount_cents`` is required on create.
    missing_amount = client.post(
        "/api/movements",
        json={"type": "gasto", "category_id": "ocio", "date": f"{CURRENT_MONTH}-04"},
    )
    assert missing_amount.status_code == 422


def test_update_movement_switches_currency(client: TestClient) -> None:
    created = _create(client)  # USD, 4500000 cents
    movement_id = created["id"]

    # USD -> VES recomputes the canonical amount and stores the rate.
    to_ves = client.patch(
        f"/api/movements/{movement_id}",
        json={
            "entry_currency": "VES",
            "entry_amount_cents": 800_000,
            "rate_micros": 40_000_000,
        },
    )
    assert to_ves.status_code == 200
    body = to_ves.json()
    assert body["amount_cents"] == 20_000
    assert body["entry_currency"] == "VES"
    assert body["rate_micros"] == 40_000_000

    # A later patch that only touches the amount keeps the stored rate.
    amount_only = client.patch(
        f"/api/movements/{movement_id}", json={"entry_amount_cents": 1_000_000}
    )
    assert amount_only.json()["amount_cents"] == 25_000
    assert amount_only.json()["rate_micros"] == 40_000_000

    # VES -> USD clears the rate (it would be meaningless).
    to_usd = client.patch(
        f"/api/movements/{movement_id}",
        json={"entry_currency": "USD", "entry_amount_cents": 5_000},
    )
    assert to_usd.status_code == 200
    body = to_usd.json()
    assert body["amount_cents"] == 5_000
    assert body["entry_currency"] == "USD"
    assert body["entry_amount_cents"] == 5_000
    assert body["rate_micros"] is None


# --------------------------------------------------------------------------- #
# Budgets
# --------------------------------------------------------------------------- #
def test_budgets_statuses_and_delete(client: TestClient) -> None:
    initial = client.get("/api/budgets").json()
    assert initial["month"] == CURRENT_MONTH
    assert len(initial["items"]) == 10
    assert all(item["cap_cents"] == 0 for item in initial["items"])
    assert all(item["status"] == "none" for item in initial["items"])

    # warn (90% of cap)
    assert client.put("/api/budgets/supermercado", json={"cap_cents": 10000}).status_code == 200
    _create(client, category_id="supermercado", entry_amount_cents=9000)

    # over (> cap)
    client.put("/api/budgets/ocio", json={"cap_cents": 10000})
    _create(client, category_id="ocio", entry_amount_cents=11000)

    # ok (below 80%)
    client.put("/api/budgets/transporte", json={"cap_cents": 10000})
    _create(client, category_id="transporte", entry_amount_cents=5000)

    items = {item["category_id"]: item for item in client.get("/api/budgets").json()["items"]}
    assert items["supermercado"]["status"] == "warn"
    assert items["supermercado"]["spent_cents"] == 9000
    assert items["ocio"]["status"] == "over"
    assert items["transporte"]["status"] == "ok"

    budgets = client.get("/api/budgets").json()
    assert budgets["total_cap_cents"] == 30000
    assert budgets["total_spent_cents"] == 25000

    # Deleting the cap reverts the category to "sin tope".
    assert client.delete("/api/budgets/supermercado").status_code == 204
    after = {item["category_id"]: item for item in client.get("/api/budgets").json()["items"]}
    assert after["supermercado"]["cap_cents"] == 0
    assert after["supermercado"]["status"] == "none"


def test_budget_validation(client: TestClient) -> None:
    assert client.put("/api/budgets/supermercado", json={"cap_cents": 0}).status_code == 422
    assert client.put("/api/budgets/supermercado", json={"cap_cents": -5}).status_code == 422
    # Income categories cannot have a budget.
    assert client.put("/api/budgets/sueldo", json={"cap_cents": 1000}).status_code == 422
    assert client.put("/api/budgets/nope", json={"cap_cents": 1000}).status_code == 422


def test_budgets_month_query(client: TestClient) -> None:
    client.put("/api/budgets/ocio", json={"cap_cents": 10000})
    _create(client, category_id="ocio", entry_amount_cents=11000, date=f"{PREV_MONTH}-10")
    response = client.get("/api/budgets", params={"month": PREV_MONTH})
    items = {item["category_id"]: item for item in response.json()["items"]}
    assert items["ocio"]["spent_cents"] == 11000
    assert items["ocio"]["status"] == "over"


def test_budgets_pct_is_raw_fraction(client: TestClient) -> None:
    # Over 100%: the fraction is > 1 (raw, never multiplied by 100).
    client.put("/api/budgets/supermercado", json={"cap_cents": 10000})
    _create(client, category_id="supermercado", entry_amount_cents=25000)

    # Under 100%: the fraction is < 1.
    client.put("/api/budgets/transporte", json={"cap_cents": 10000})
    _create(client, category_id="transporte", entry_amount_cents=5000)

    # A cap with no spending reports 0.0 (no division error).
    client.put("/api/budgets/ocio", json={"cap_cents": 8000})

    items = {item["category_id"]: item for item in client.get("/api/budgets").json()["items"]}

    supermercado = items["supermercado"]
    assert supermercado["pct"] == 2.5
    assert supermercado["pct"] == supermercado["spent_cents"] / supermercado["cap_cents"]
    assert supermercado["pct"] > 1

    transporte = items["transporte"]
    assert transporte["pct"] == 0.5
    assert transporte["pct"] == transporte["spent_cents"] / transporte["cap_cents"]

    assert items["ocio"]["pct"] == 0.0
    assert items["ocio"]["status"] == "ok"


# --------------------------------------------------------------------------- #
# Stats
# --------------------------------------------------------------------------- #
def test_summary_is_coherent(client: TestClient) -> None:
    _create(client, category_id="sueldo", type="ingreso", entry_amount_cents=100000)
    _create(client, category_id="ocio", type="gasto", entry_amount_cents=40000)
    _create(client, category_id="supermercado", type="gasto", entry_amount_cents=20000,
            date=f"{PREV_MONTH}-10")

    summary = client.get("/api/stats/summary").json()
    assert summary["month"] == CURRENT_MONTH
    assert summary["income_cents"] == 100000
    assert summary["expenses_cents"] == 40000
    assert summary["balance_cents"] == 60000
    assert summary["average_prev"] == {"avg_cents": 20000, "months_used": 1}
    assert summary["comparison"]["direction"] == "above"
    assert summary["comparison"]["pct"] == 1.0


def test_summary_without_history_is_na(client: TestClient) -> None:
    _create(client, category_id="ocio", entry_amount_cents=10000)
    summary = client.get("/api/stats/summary").json()
    assert summary["average_prev"] == {"avg_cents": 0, "months_used": 0}
    assert summary["comparison"] == {"pct": 0.0, "direction": "na"}


def test_by_category(client: TestClient) -> None:
    _create(client, category_id="ocio", entry_amount_cents=30000)
    _create(client, category_id="salud", entry_amount_cents=10000)

    body = client.get("/api/stats/by-category").json()
    assert body["month"] == CURRENT_MONTH
    assert body["total_cents"] == 40000
    assert [item["category_id"] for item in body["items"]] == ["ocio", "salud"]
    assert body["items"][0]["label"] == "Ocio"
    assert body["items"][0]["share"] == 0.75


def test_by_category_empty(client: TestClient) -> None:
    body = client.get("/api/stats/by-category").json()
    assert body == {"month": CURRENT_MONTH, "total_cents": 0, "items": []}


def test_by_category_tie_break_by_label(client: TestClient) -> None:
    # Two categories with the exact same cents must be ordered by label asc.
    _create(client, category_id="salud", entry_amount_cents=10000)
    _create(client, category_id="ocio", entry_amount_cents=10000)

    body = client.get("/api/stats/by-category").json()
    assert body["total_cents"] == 20000
    assert [item["category_id"] for item in body["items"]] == ["ocio", "salud"]
    assert [item["label"] for item in body["items"]] == ["Ocio", "Salud"]
    assert [item["share"] for item in body["items"]] == [0.5, 0.5]

    # The tie-break follows the label, not the id insertion order.
    labels = [item["label"] for item in body["items"]]
    assert labels == sorted(labels)


def test_monthly_window(client: TestClient) -> None:
    _create(client, category_id="ocio", entry_amount_cents=30000)
    _create(client, category_id="sueldo", type="ingreso", entry_amount_cents=50000)

    points = client.get("/api/stats/monthly", params={"end": CURRENT_MONTH, "months": 6}).json()
    assert len(points) == 6
    assert points[-1]["month"] == CURRENT_MONTH
    assert points[-1]["expenses_cents"] == 30000
    assert points[-1]["income_cents"] == 50000
    assert all(point["expenses_cents"] == 0 for point in points[:-1])

    # Invalid range size -> pydantic 422.
    assert client.get("/api/stats/monthly", params={"months": 0}).status_code == 422


def test_monthly_months_bounds(client: TestClient) -> None:
    # Above the documented ceiling (1..24) -> 422 query validation.
    too_many = client.get("/api/stats/monthly", params={"months": 25})
    assert too_many.status_code == 422

    # The minimum window returns exactly one month (the end month, inclusive).
    single = client.get("/api/stats/monthly", params={"months": 1}).json()
    assert single == [{"month": CURRENT_MONTH, "expenses_cents": 0, "income_cents": 0}]


def test_monthly_malformed_end_is_422(client: TestClient) -> None:
    # A malformed `end` must be validated before any month arithmetic -> 422, not 500.
    for bad_end in ("2026-13", "abc", "2026-9", "2026-00", "202609"):
        response = client.get("/api/stats/monthly", params={"end": bad_end})
        assert response.status_code == 422, bad_end
        assert response.json()["detail"] == "El mes debe tener el formato 'YYYY-MM'."


# --------------------------------------------------------------------------- #
# Money upper bound
# --------------------------------------------------------------------------- #
def test_money_upper_bound(client: TestClient) -> None:
    too_big = 2_147_483_648

    created = _create(client)
    post_body = client.post("/api/movements", json=_movement_payload(entry_amount_cents=too_big))
    assert post_body.status_code == 422
    assert post_body.json()["detail"] == "El monto es demasiado grande."

    patched = client.patch(
        f"/api/movements/{created['id']}", json={"entry_amount_cents": too_big}
    )
    assert patched.status_code == 422
    assert patched.json()["detail"] == "El monto es demasiado grande."

    budget = client.put("/api/budgets/ocio", json={"cap_cents": too_big})
    assert budget.status_code == 422
    assert budget.json()["detail"] == "El tope es demasiado grande."

    # The exact PostgreSQL INTEGER maximum is still accepted.
    assert client.put("/api/budgets/ocio", json={"cap_cents": 2_147_483_647}).status_code == 200
    assert (
        client.post(
            "/api/movements", json=_movement_payload(entry_amount_cents=2_147_483_647)
        ).status_code
        == 201
    )


# --------------------------------------------------------------------------- #
# Export / import
# --------------------------------------------------------------------------- #
def test_export_shape(client: TestClient) -> None:
    _create(client)
    client.put("/api/budgets/ocio", json={"cap_cents": 12345})

    response = client.get("/api/data/export")
    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="financirdus-')
    assert disposition.endswith('.json"')

    body = response.json()
    assert body["version"] == 4
    assert "exported_at" in body
    assert isinstance(body["movements"], list)
    assert body["accounts"] == [{"name": "Cartera USD", "opening_balance_cents": 0}]
    movement = body["movements"][0]
    assert movement["amount_cents"] == 4500000
    assert movement["entry_currency"] == "USD"
    assert movement["entry_amount_cents"] == 4500000
    assert movement["rate_micros"] is None
    assert movement["account_id"] == ACCOUNT_ID
    assert movement["account_name"] == "Cartera USD"
    assert movement["is_debt_payment"] is False
    assert body["budgets"] == {"ocio": 12345}
    # The jar mapping is part of the backup (default mapping from the catalogue).
    assert body["jar_categories"]["ahorro"] == "crecimiento"
    assert body["jar_categories"]["supermercado"] == "esencial"


def test_import_merge_does_not_duplicate(client: TestClient) -> None:
    _create(client)
    _create(client, category_id="salud", entry_amount_cents=1000)
    export = client.get("/api/data/export").json()

    first = client.post("/api/data/import", params={"mode": "merge"}, json=export).json()
    assert first == {
        "mode": "merge",
        "movements_imported": 0,
        "movements_skipped": 2,
        "budgets_imported": 0,
        "accounts_imported": 0,
    }
    assert len(client.get("/api/movements").json()) == 2

    new_payload = {
        "version": 1,
        "movements": [
            {"type": "gasto", "category_id": "ocio", "amount_cents": 999,
             "date": f"{CURRENT_MONTH}-09", "note": "nuevo"},
        ],
        "budgets": {"ocio": 5000},
    }
    second = client.post("/api/data/import", params={"mode": "merge"}, json=new_payload).json()
    assert second["movements_imported"] == 1
    assert second["movements_skipped"] == 0
    assert second["budgets_imported"] == 1
    assert len(client.get("/api/movements").json()) == 3


def test_import_replace(client: TestClient) -> None:
    _create(client)
    client.put("/api/budgets/ocio", json={"cap_cents": 5000})

    payload = {
        "version": 1,
        "movements": [
            {"type": "ingreso", "category_id": "sueldo", "amount_cents": 100,
             "date": f"{CURRENT_MONTH}-01", "note": ""},
            {"type": "gasto", "category_id": "salud", "amount_cents": 200,
             "date": f"{CURRENT_MONTH}-02", "note": ""},
        ],
        "budgets": {"salud": 999},
    }
    result = client.post("/api/data/import", params={"mode": "replace"}, json=payload).json()
    assert result == {
        "mode": "replace",
        "movements_imported": 2,
        "movements_skipped": 0,
        "budgets_imported": 1,
        "accounts_imported": 0,
    }
    movements = client.get("/api/movements").json()
    assert len(movements) == 2
    budgets = client.get("/api/data/export").json()["budgets"]
    assert budgets == {"salud": 999}


def test_import_invalid_payloads_do_not_mutate(client: TestClient) -> None:
    created = _create(client)
    before = client.get("/api/movements").json()

    broken = client.post("/api/data/import", content=b"{not valid json")
    assert broken.status_code == 422
    assert broken.json()["detail"] == "El archivo no es un JSON válido."

    wrong_version = client.post(
        "/api/data/import", json={"version": 9, "movements": [], "budgets": {}}
    )
    assert wrong_version.status_code == 422
    assert "Versión" in wrong_version.json()["detail"]

    not_a_list = client.post(
        "/api/data/import", json={"version": 1, "movements": {}, "budgets": {}}
    )
    assert not_a_list.status_code == 422
    assert not_a_list.json()["detail"] == 'El campo "movements" debe ser una lista.'

    bad_category = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 1,
            "movements": [
                {"type": "gasto", "category_id": "ocio", "amount_cents": 1,
                 "date": f"{CURRENT_MONTH}-01", "note": ""},
                {"type": "gasto", "category_id": "salud", "amount_cents": 1,
                 "date": f"{CURRENT_MONTH}-02", "note": ""},
                {"type": "gasto", "category_id": "nope", "amount_cents": 1,
                 "date": f"{CURRENT_MONTH}-03", "note": ""},
            ],
            "budgets": {},
        },
    )
    assert bad_category.status_code == 422
    assert bad_category.json()["detail"] == "El movimiento 3 tiene una categoría inválida."

    # None of the failed imports changed the existing data.
    after = client.get("/api/movements").json()
    assert after == before
    assert after[0]["id"] == created["id"]


def test_import_invalid_mode(client: TestClient) -> None:
    response = client.post("/api/data/import", params={"mode": "bogus"}, json={})
    assert response.status_code == 422


def test_import_rejects_oversized_body(client: TestClient) -> None:
    limit = 5 * 1024 * 1024

    # Declared Content-Length above the limit: rejected without parsing.
    declared = client.post("/api/data/import", content=b"x" * (limit + 1))
    assert declared.status_code == 413
    assert declared.json()["detail"] == "El archivo es demasiado grande (máximo 5 MB)."

    # No Content-Length (chunked stream): the real byte count is enforced.
    chunked = client.post("/api/data/import", content=iter([b"x" * (limit + 1)]))
    assert chunked.status_code == 413
    assert chunked.json()["detail"] == "El archivo es demasiado grande (máximo 5 MB)."

    # A body right at the limit is accepted (and fails later as invalid JSON).
    at_limit = client.post("/api/data/import", content=b"x" * limit)
    assert at_limit.status_code == 422


def test_import_rejects_too_many_movements(client: TestClient) -> None:
    created = _create(client)
    entry = {
        "type": "gasto",
        "category_id": "ocio",
        "amount_cents": 1,
        "date": f"{CURRENT_MONTH}-01",
        "note": "",
    }
    payload = {"version": 1, "movements": [entry] * 20_001, "budgets": {}}

    response = client.post("/api/data/import", params={"mode": "merge"}, json=payload)
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "El archivo tiene demasiados movimientos (máximo 20000)."
    )

    # Nothing was imported.
    assert [m["id"] for m in client.get("/api/movements").json()] == [created["id"]]


def test_import_deeply_nested_json_is_422_not_500(client: TestClient) -> None:
    # json.loads raises RecursionError on very deep nesting: it must be a 422.
    nested = b"[" * 100_000 + b"]" * 100_000
    response = client.post("/api/data/import", content=nested)
    assert response.status_code == 422
    assert response.json()["detail"] == "El archivo no es un JSON válido."


def test_import_invalid_budget_keeps_data_intact(client: TestClient) -> None:
    _create(client)
    client.put("/api/budgets/ocio", json={"cap_cents": 5000})
    before = client.get("/api/data/export").json()

    unknown = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={"version": 1, "movements": [], "budgets": {"nope": 1000}},
    )
    assert unknown.status_code == 422
    assert unknown.json()["detail"] == 'El presupuesto de la categoría "nope" es inválido.'

    negative = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={"version": 1, "movements": [], "budgets": {"ocio": -100}},
    )
    assert negative.status_code == 422
    assert negative.json()["detail"] == 'El presupuesto de la categoría "ocio" es inválido.'

    non_integer = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={"version": 1, "movements": [], "budgets": {"ocio": "5000"}},
    )
    assert non_integer.status_code == 422
    assert non_integer.json()["detail"] == 'El presupuesto de la categoría "ocio" es inválido.'

    too_big = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={"version": 1, "movements": [], "budgets": {"ocio": 2_147_483_648}},
    )
    assert too_big.status_code == 422
    assert too_big.json()["detail"] == "El tope es demasiado grande."

    after = client.get("/api/data/export").json()
    assert after["movements"] == before["movements"]
    assert after["budgets"] == before["budgets"]


def test_import_budget_no_cap_sentinels_are_ignored(client: TestClient) -> None:
    response = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 1,
            "movements": [],
            "budgets": {"ocio": None, "salud": 0, "transporte": ""},
        },
    )
    assert response.status_code == 200
    assert response.json()["budgets_imported"] == 0
    # A "no cap" sentinel is never persisted as a ceiling of 0.
    assert client.get("/api/data/export").json()["budgets"] == {}


def test_import_export_twice_is_idempotent(client: TestClient) -> None:
    _create(client)
    _create(client, category_id="salud", entry_amount_cents=1000)
    client.put("/api/budgets/ocio", json={"cap_cents": 7000})
    export = client.get("/api/data/export").json()

    first = client.post("/api/data/import", params={"mode": "merge"}, json=export).json()
    assert first["movements_imported"] == 0
    assert first["movements_skipped"] == 2
    after_first = client.get("/api/movements").json()

    second = client.post("/api/data/import", params={"mode": "merge"}, json=export).json()
    assert second["movements_imported"] == 0
    assert second["movements_skipped"] == 2
    after_second = client.get("/api/movements").json()

    assert len(after_second) == 2
    assert after_second == after_first


def test_import_movement_amount_upper_bound(client: TestClient) -> None:
    created = _create(client)
    before = client.get("/api/movements").json()

    response = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 1,
            "movements": [
                {"type": "gasto", "category_id": "ocio", "amount_cents": 2_147_483_648,
                 "date": f"{CURRENT_MONTH}-01", "note": ""},
            ],
            "budgets": {},
        },
    )
    assert response.status_code == 422
    assert "demasiado grande" in response.json()["detail"]
    assert client.get("/api/movements").json() == before
    assert before[0]["id"] == created["id"]


# --------------------------------------------------------------------------- #
# Data versioning: v1 payloads are accepted, v2 round-trips the entry triplet
# --------------------------------------------------------------------------- #
def test_import_accepts_v1_payload_with_entry_defaults(client: TestClient) -> None:
    payload = {
        "version": 1,
        "movements": [
            {"type": "gasto", "category_id": "ocio", "amount_cents": 5000,
             "date": f"{CURRENT_MONTH}-01", "note": ""},
        ],
        "budgets": {},
    }
    result = client.post("/api/data/import", params={"mode": "merge"}, json=payload).json()
    assert result["movements_imported"] == 1

    stored = client.get("/api/movements").json()
    assert len(stored) == 1
    assert stored[0]["amount_cents"] == 5000
    assert stored[0]["entry_currency"] == "USD"
    assert stored[0]["entry_amount_cents"] == 5000
    assert stored[0]["rate_micros"] is None


def test_export_import_round_trip_preserves_ves(client: TestClient) -> None:
    _create(
        client,
        entry_currency="VES",
        entry_amount_cents=400_000,
        rate_micros=40_000_000,
    )
    export = client.get("/api/data/export").json()
    assert export["version"] == 4

    result = client.post("/api/data/import", params={"mode": "replace"}, json=export).json()
    assert result["movements_imported"] == 1

    stored = client.get("/api/movements").json()
    assert len(stored) == 1
    assert stored[0]["amount_cents"] == 10_000
    assert stored[0]["entry_currency"] == "VES"
    assert stored[0]["entry_amount_cents"] == 400_000
    assert stored[0]["rate_micros"] == 40_000_000


def test_import_restores_jar_mapping(client: TestClient) -> None:
    # Change the mapping, export, restore the default, then import the backup.
    assert (
        client.put("/api/plan/categories/ocio", json={"jar_id": "esencial"}).status_code
        == 200
    )
    export = client.get("/api/data/export").json()
    assert export["jar_categories"]["ocio"] == "esencial"

    client.put("/api/plan/categories/ocio", json={"jar_id": "recompensas"})
    result = client.post("/api/data/import", params={"mode": "merge"}, json=export).json()
    assert result["movements_imported"] == 0

    jars = {jar["jar_id"]: jar for jar in client.get("/api/plan").json()["jars"]}
    assert "ocio" in jars["esencial"]["category_ids"]
    assert "ocio" not in jars["recompensas"]["category_ids"]


def test_import_rejects_unknown_jar(client: TestClient) -> None:
    response = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 2,
            "movements": [],
            "budgets": {},
            "jar_categories": {"ocio": "nope"},
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == 'El frasco "nope" es inválido.'


def test_import_rejects_income_jar_mapping(client: TestClient) -> None:
    response = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 2,
            "movements": [],
            "budgets": {},
            "jar_categories": {"sueldo": "esencial"},
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == 'La categoría "sueldo" no puede asignarse a un frasco.'


# --------------------------------------------------------------------------- #
# Money-jars plan (25/15/50/10)
# --------------------------------------------------------------------------- #
def test_plan_zero_income_has_zero_targets(client: TestClient) -> None:
    plan = client.get("/api/plan").json()
    assert plan["month"] == CURRENT_MONTH
    assert plan["income_cents"] == 0
    assert [jar["jar_id"] for jar in plan["jars"]] == [
        "crecimiento",
        "estabilidad",
        "esencial",
        "recompensas",
    ]
    assert all(jar["target_cents"] == 0 for jar in plan["jars"])
    assert all(jar["status"] == "none" for jar in plan["jars"])
    assert all(jar["used"] == 0 for jar in plan["jars"])


def test_plan_targets_sum_to_income(client: TestClient) -> None:
    _create(client, category_id="sueldo", type="ingreso", entry_amount_cents=100_001)

    plan = client.get("/api/plan").json()
    assert plan["income_cents"] == 100_001

    jars = {jar["jar_id"]: jar for jar in plan["jars"]}
    assert {jar_id: jar["pct"] for jar_id, jar in jars.items()} == {
        "crecimiento": 25,
        "estabilidad": 15,
        "esencial": 50,
        "recompensas": 10,
    }
    assert sum(jar["target_cents"] for jar in plan["jars"]) == 100_001
    assert jars["crecimiento"]["target_cents"] == 25_000
    assert jars["estabilidad"]["target_cents"] == 15_000
    assert jars["esencial"]["target_cents"] == 50_001  # half-up of 50000.5
    assert jars["recompensas"]["target_cents"] == 10_000  # absorbs the remainder


def test_plan_spent_remaining_and_status(client: TestClient) -> None:
    _create(client, category_id="sueldo", type="ingreso", entry_amount_cents=100_000)
    _create(client, category_id="supermercado", entry_amount_cents=40_000)  # esencial
    _create(client, category_id="ahorro", entry_amount_cents=10_000)        # crecimiento

    jars = {jar["jar_id"]: jar for jar in client.get("/api/plan").json()["jars"]}

    esencial = jars["esencial"]
    assert esencial["target_cents"] == 50_000
    assert esencial["spent_cents"] == 40_000
    assert esencial["remaining_cents"] == 10_000
    assert esencial["used"] == pytest.approx(0.8)
    assert esencial["status"] == "warn"
    # Mapped categories follow the category catalogue order.
    assert esencial["category_ids"] == [
        "supermercado",
        "transporte",
        "alquiler-servicios",
        "salud",
        "suscripciones",
    ]

    crecimiento = jars["crecimiento"]
    assert crecimiento["target_cents"] == 25_000
    assert crecimiento["spent_cents"] == 10_000
    assert crecimiento["status"] == "ok"
    assert crecimiento["category_ids"] == ["ahorro"]


def test_plan_reassign_category(client: TestClient) -> None:
    ok = client.put("/api/plan/categories/ocio", json={"jar_id": "esencial"})
    assert ok.status_code == 200
    assert ok.json() == {"category_id": "ocio", "jar_id": "esencial"}

    jars = {jar["jar_id"]: jar for jar in client.get("/api/plan").json()["jars"]}
    assert "ocio" in jars["esencial"]["category_ids"]
    assert "ocio" not in jars["recompensas"]["category_ids"]

    # Unknown jar is rejected.
    assert (
        client.put("/api/plan/categories/ocio", json={"jar_id": "nope"}).status_code == 422
    )
    # Income categories cannot be assigned to a jar.
    assert (
        client.put("/api/plan/categories/sueldo", json={"jar_id": "esencial"}).status_code
        == 422
    )
    # Unknown category is rejected too.
    assert (
        client.put("/api/plan/categories/nope", json={"jar_id": "esencial"}).status_code
        == 422
    )


def test_plan_month_matches_movement_month(client: TestClient) -> None:
    _create(client, category_id="sueldo", type="ingreso", entry_amount_cents=100_000)
    _create(client, category_id="ocio", entry_amount_cents=9_000, date=f"{PREV_MONTH}-10")

    plan = client.get("/api/plan", params={"month": PREV_MONTH}).json()
    assert plan["month"] == PREV_MONTH
    assert plan["income_cents"] == 0
    assert sum(jar["spent_cents"] for jar in plan["jars"]) == 9_000

    bad_month = client.get("/api/plan", params={"month": "2026-13"})
    assert bad_month.status_code == 422


# --------------------------------------------------------------------------- #
# Regression: out-of-range months must be a 422, never a 500
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("path", "params"),
    [
        # Year 0000: rejected by parse_month.
        ("/api/movements", {"month": "0000-01"}),
        # 9999-12 + 1 month would overflow the year range (a distinct bug).
        ("/api/movements", {"month": "9999-12"}),
        ("/api/budgets", {"month": "0000-01"}),
        ("/api/stats/summary", {"month": "0000-01"}),
        ("/api/stats/by-category", {"month": "9999-12"}),
        ("/api/stats/monthly", {"end": "9999-12"}),
    ],
)
def test_out_of_range_month_is_422_not_500(
    client: TestClient, path: str, params: dict
) -> None:
    response = client.get(path, params=params)
    assert response.status_code == 422, f"{path}?{params} -> {response.status_code}"
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert "mes" in detail  # readable Spanish message, never a traceback


# --------------------------------------------------------------------------- #
# Regression: year 0000 dates are a 422, the year-1 boundary is accepted
# --------------------------------------------------------------------------- #
def test_year_zero_dates_are_422_and_year_one_is_accepted(client: TestClient) -> None:
    # POST with year 0000 used to crash (uncaught ValueError in date.fromisoformat).
    bad_post = client.post("/api/movements", json=_movement_payload(date="0000-01-01"))
    assert bad_post.status_code == 422
    assert bad_post.json()["detail"] == "La fecha no es válida."

    created = _create(client)
    bad_patch = client.patch(
        f"/api/movements/{created['id']}", json={"date": "0000-01-01"}
    )
    assert bad_patch.status_code == 422
    assert bad_patch.json()["detail"] == "La fecha no es válida."

    # The lower valid bound is still accepted.
    boundary = _create(client, date="0001-01-01")
    assert boundary["date"] == "0001-01-01"

    # Clean up.
    assert client.delete(f"/api/movements/{created['id']}").status_code == 204
    assert client.delete(f"/api/movements/{boundary['id']}").status_code == 204
    assert client.get("/api/movements").json() == []


# --------------------------------------------------------------------------- #
# Regression: import rejects malformed category_id instead of raising a 500
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bad_category", [["ocio"], {"a": 1}])
def test_import_non_string_category_is_422_not_500(
    client: TestClient, bad_category: object
) -> None:
    created = _create(client)
    before = client.get("/api/movements").json()

    # Before the fix, dict.get(list) raised TypeError: unhashable type -> HTTP 500.
    response = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 1,
            "movements": [
                {"type": "gasto", "category_id": bad_category, "amount_cents": 1,
                 "date": f"{CURRENT_MONTH}-01", "note": ""},
            ],
            "budgets": {},
        },
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert "categoría" in detail
    assert detail.startswith("El movimiento 1")  # numbered message

    # The failed import did not touch the data (transactional).
    after = client.get("/api/movements").json()
    assert after == before
    assert after[0]["id"] == created["id"]


# --------------------------------------------------------------------------- #
# Regression: import rejects (not truncates) an over-long note
# --------------------------------------------------------------------------- #
def test_import_long_note_is_422_not_truncated(client: TestClient) -> None:
    too_long = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 1,
            "movements": [
                {"type": "gasto", "category_id": "ocio", "amount_cents": 1,
                 "date": f"{CURRENT_MONTH}-01", "note": "x" * 141},
            ],
            "budgets": {},
        },
    )
    assert too_long.status_code == 422
    assert too_long.json()["detail"] == (
        "El movimiento 1 tiene una nota demasiado larga (máximo 140 caracteres)."
    )

    # Exactly 140 characters is accepted and stored whole: the import now rejects
    # like the CRUD instead of silently truncating (the earlier divergence).
    note = "y" * 140
    at_limit = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 1,
            "movements": [
                {"type": "gasto", "category_id": "ocio", "amount_cents": 1,
                 "date": f"{CURRENT_MONTH}-02", "note": note},
            ],
            "budgets": {},
        },
    )
    assert at_limit.status_code == 200
    assert at_limit.json()["movements_imported"] == 1

    stored = client.get("/api/movements").json()
    assert len(stored) == 1
    assert stored[0]["note"] == note
    assert len(stored[0]["note"]) == 140


def test_import_year_zero_date_is_422_and_keeps_data(client: TestClient) -> None:
    created = _create(client)
    before = client.get("/api/movements").json()

    response = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 1,
            "movements": [
                {"type": "gasto", "category_id": "ocio", "amount_cents": 1,
                 "date": "0000-01-01", "note": ""},
            ],
            "budgets": {},
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "El movimiento 1 tiene una fecha inválida."
    assert client.get("/api/movements").json() == before
    assert before[0]["id"] == created["id"]


# --------------------------------------------------------------------------- #
# Regression: PUT budget upsert and IntegrityError recovery race
# --------------------------------------------------------------------------- #
def test_put_budget_creates_then_updates(client: TestClient) -> None:
    first = client.put("/api/budgets/ocio", json={"cap_cents": 1000})
    assert first.status_code == 200
    assert first.json() == {"category_id": "ocio", "cap_cents": 1000}

    second = client.put("/api/budgets/ocio", json={"cap_cents": 2000})
    assert second.status_code == 200
    assert second.json() == {"category_id": "ocio", "cap_cents": 2000}

    assert client.get("/api/data/export").json()["budgets"] == {"ocio": 2000}


def test_put_budget_recovers_from_integrity_error_race(
    client: TestClient, session_factory, monkeypatch
) -> None:
    # Simulate the concurrent-PUT race: the row already exists in the database,
    # but the request session's first lookup "misses" it, so the create branch
    # runs and the INSERT hits a real uniqueness violation. The recovery branch
    # must then load the raced-in row, apply the cap and answer 200 (not a 500).
    with session_factory() as rival:
        rival.add(Budget(category_id="ocio", cap_cents=999))
        rival.commit()

    state = {"missed": False, "integrity_error": False}
    real_get = Session.get
    real_commit = Session.commit

    def flaky_get(self, entity, ident, *args, **kwargs):
        if entity is Budget and not state["missed"]:
            state["missed"] = True
            return None
        return real_get(self, entity, ident, *args, **kwargs)

    def spy_commit(self):
        try:
            return real_commit(self)
        except IntegrityError:
            state["integrity_error"] = True
            raise

    monkeypatch.setattr(Session, "get", flaky_get)
    monkeypatch.setattr(Session, "commit", spy_commit)

    response = client.put("/api/budgets/ocio", json={"cap_cents": 5000})
    assert response.status_code == 200, response.text
    assert response.json() == {"category_id": "ocio", "cap_cents": 5000}
    # The recovery path was really exercised: the create attempt raised IntegrityError.
    assert state["integrity_error"] is True

    monkeypatch.undo()
    # The recovery applied the requested cap (5000), not the raced-in 999.
    assert client.get("/api/data/export").json()["budgets"] == {"ocio": 5000}


# --------------------------------------------------------------------------- #
# Regression: the sample-data seed is idempotent and never clobbers user data
# --------------------------------------------------------------------------- #
def test_seed_skips_when_movements_exist(db_session: Session) -> None:
    db_session.add(
        Movement(
            type="gasto",
            category_id="ocio",
            amount_cents=1234,
            account_id=ACCOUNT_ID,
            entry_currency="USD",
            entry_amount_cents=1234,
            date=date(2026, 1, 5),
            note="custom",
        )
    )
    db_session.commit()

    result = _seed(db_session, force=False, month_key="2026-01")

    assert result["seeded"] is False
    assert result["reason"] == "already_has_data"
    # No sample movement was injected on top of the existing one.
    assert db_session.scalar(select(func.count()).select_from(Movement)) == 1


def test_seed_skips_when_only_budget_exists_and_keeps_cap(db_session: Session) -> None:
    # A user budget with no movements must stop the seed: the bug was that the
    # seed injected the sample movements and overwrote the user's caps.
    db_session.add(Budget(category_id="ocio", cap_cents=7777))
    db_session.commit()

    result = _seed(db_session, force=False, month_key="2026-01")

    assert result["seeded"] is False
    assert result["reason"] == "already_has_data"
    assert db_session.scalar(select(func.count()).select_from(Movement)) == 0
    cap = db_session.scalar(select(Budget.cap_cents).where(Budget.category_id == "ocio"))
    assert cap == 7777


def test_seed_populates_empty_database(db_session: Session) -> None:
    expected = len(build_movements("2026-01"))
    result = _seed(db_session, force=False, month_key="2026-01")

    assert result["seeded"] is True
    assert result["movements"] == expected
    assert result["budgets"] == 10
    assert result["accounts"] == len(ACCOUNT_SEED)
    assert db_session.scalar(select(func.count()).select_from(Movement)) == expected
    assert db_session.scalar(select(func.count()).select_from(Budget)) == 10
    assert db_session.scalar(select(func.count()).select_from(Account)) == len(ACCOUNT_SEED)
    # At least one sample movement was entered in bolívares.
    entered_in_ves = db_session.scalar(
        select(func.count()).select_from(Movement).where(Movement.entry_currency == "VES")
    )
    assert entered_in_ves >= 1
    # One sample movement is a debt payment on the "Binance" wallet.
    debt_payments = db_session.scalar(
        select(func.count()).select_from(Movement).where(Movement.is_debt_payment.is_(True))
    )
    assert debt_payments == 1
    binance_id = db_session.scalar(select(Account.id).where(Account.name == "Binance"))
    debt_account = db_session.scalar(
        select(Movement.account_id).where(Movement.is_debt_payment.is_(True))
    )
    assert debt_account == binance_id


def test_seed_main_wallet_is_positive_and_not_a_debt(db_session: Session) -> None:
    # ``_seed`` only creates the wallets that are missing, so the fixture's default
    # wallet is wiped (``force``) to exercise the real ACCOUNT_SEED opening balance.
    _seed(db_session, force=True, month_key="2026-01")

    accounts = list(
        db_session.execute(select(Account).order_by(Account.sort_order, Account.id)).scalars()
    )
    movements_by_account: dict[int, list[tuple[str, int, bool]]] = {}
    for movement in db_session.execute(select(Movement)).scalars():
        movements_by_account.setdefault(movement.account_id, []).append(
            (movement.type, movement.amount_cents, movement.is_debt_payment)
        )
    balances: dict[str, int] = {}
    for account in accounts:
        balances[account.name] = account_balance(
            account.opening_balance_cents, movements_by_account.get(account.id, [])
        )

    # The sample net (income - expenses) is about -154_700 cents, so the positive
    # opening balance (200_000) leaves the main wallet clearly in the black.
    assert balances[DEFAULT_ACCOUNT_NAME] == 200_000 - 154_700
    assert balances[DEFAULT_ACCOUNT_NAME] > 0

    # total_debt stays the sum of the negative balances and only reflects the two
    # declared debt wallets, never the main one.
    total_debt = total_debt_cents(balances.values())
    assert total_debt == 60_000
    assert total_debt == -balances["Binance"] - balances["Cartera USD normal"]
    assert total_debt_cents([balances[DEFAULT_ACCOUNT_NAME]]) == 0


def test_seed_non_force_reconciles_sample_wallet(db_session: Session) -> None:
    # Simulate the fresh-migration state: migration 0003 pre-creates the default
    # wallet with opening 0 and the database has no movements nor budgets (both
    # provided by the ``db_session`` fixture). A non-force seed -- what the
    # container entrypoint runs on an empty database -- must reconcile the sample
    # opening balances instead of leaving the main wallet looking like an
    # accidental debt.
    extra = Account(name="Mi cartera", opening_balance_cents=12_345, sort_order=9)
    db_session.add(extra)
    db_session.commit()
    extra_id = extra.id

    result = _seed(db_session, force=False, month_key="2026-01")

    assert result["seeded"] is True
    accounts = {
        account.name: account
        for account in db_session.execute(select(Account)).scalars()
    }

    # The pre-existing sample wallet kept its id but got the seeded opening balance.
    main = accounts[DEFAULT_ACCOUNT_NAME]
    assert main.id == ACCOUNT_ID
    assert main.opening_balance_cents == 200_000

    movements_by_account: dict[int, list[tuple[str, int, bool]]] = {}
    for movement in db_session.execute(select(Movement)).scalars():
        movements_by_account.setdefault(movement.account_id, []).append(
            (movement.type, movement.amount_cents, movement.is_debt_payment)
        )
    balances = {
        account.id: account_balance(
            account.opening_balance_cents, movements_by_account.get(account.id, [])
        )
        for account in accounts.values()
    }

    # The reconciled opening balance leaves the main wallet clearly in the black.
    assert balances[main.id] > 0
    # The sample debt is still the sum of the two declared debt wallets only.
    assert total_debt_cents(balances.values()) == 60_000

    # A wallet whose name is not in ACCOUNT_SEED is never clobbered.
    assert accounts["Mi cartera"].id == extra_id
    assert accounts["Mi cartera"].opening_balance_cents == 12_345
    assert balances[extra_id] == 12_345


def test_seed_force_wipes_and_reseeds(db_session: Session) -> None:
    expected = len(build_movements("2026-01"))
    db_session.add(
        Movement(
            type="gasto",
            category_id="ocio",
            amount_cents=1,
            account_id=ACCOUNT_ID,
            entry_currency="USD",
            entry_amount_cents=1,
            date=date(2026, 1, 1),
            note="custom",
        )
    )
    db_session.add(Budget(category_id="ocio", cap_cents=1))
    db_session.add(Account(name="Extra", opening_balance_cents=0))
    db_session.commit()

    result = _seed(db_session, force=True, month_key="2026-01")

    assert result["seeded"] is True
    assert result["movements"] == expected
    assert result["budgets"] == 10
    assert result["accounts"] == len(ACCOUNT_SEED)
    # The custom movement and the extra wallet were wiped; only sample data remains.
    assert db_session.scalar(select(func.count()).select_from(Movement)) == expected
    assert db_session.scalar(select(func.count()).select_from(Account)) == len(ACCOUNT_SEED)
    assert db_session.scalar(select(Account.id).where(Account.name == "Extra")) is None
    # The custom cap was replaced by the sample cap for "ocio".
    cap = db_session.scalar(select(Budget.cap_cents).where(Budget.category_id == "ocio"))
    assert cap == BUDGETS_USD["ocio"] * 100


# --------------------------------------------------------------------------- #
# Regression: settings fail closed and docs respect DOCS_ENABLED
# --------------------------------------------------------------------------- #
def test_settings_reject_invalid_timezone() -> None:
    with pytest.raises(ValidationError):
        Settings(app_tz="No/Existe")


def test_settings_reject_wildcard_cors_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="production", cors_origins="*")


def test_settings_reject_unknown_app_env() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="staging")


def test_settings_defaults_build() -> None:
    settings = Settings()
    assert settings.app_env == "development"
    assert settings.docs_enabled is True


def test_docs_disabled_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCS_ENABLED", "false")
    get_settings.cache_clear()
    try:
        application = create_app()
        with TestClient(application) as test_client:
            assert test_client.get("/api/docs").status_code == 404
            assert test_client.get("/api/openapi.json").status_code == 404
    finally:
        get_settings.cache_clear()


def test_docs_enabled_by_default(client: TestClient) -> None:
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").status_code == 200


# --------------------------------------------------------------------------- #
# Regression: month windows must fit inside 0001-01..9999-12 (422, never 500)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("path", "params", "expected_status"),
    [
        # summary looks back six months, so the requested month must be >= 0001-07.
        ("/api/stats/summary", {"month": "0001-01"}, 422),
        ("/api/stats/summary", {"month": "0001-06"}, 422),
        ("/api/stats/summary", {"month": "0001-07"}, 200),
        ("/api/stats/summary", {"month": "9999-12"}, 422),
        # monthly requires end - (months - 1) >= 0001-01 and end <= 9999-12.
        ("/api/stats/monthly", {"end": "0001-01", "months": 1}, 200),
        ("/api/stats/monthly", {"end": "0001-01", "months": 2}, 422),
        ("/api/stats/monthly", {"end": "0001-01", "months": 24}, 422),
        ("/api/stats/monthly", {"end": "0001-07", "months": 6}, 200),
        ("/api/stats/monthly", {"end": "9999-11", "months": 2}, 200),
        ("/api/stats/monthly", {"end": "9999-12", "months": 1}, 422),
    ],
)
def test_month_window_matrix(
    client: TestClient, path: str, params: dict, expected_status: int
) -> None:
    response = client.get(path, params=params)
    assert response.status_code == expected_status, f"{path}?{params} -> {response.status_code}"
    if expected_status == 422:
        detail = response.json()["detail"]
        # A readable, human Spanish message — never a traceback or an error code.
        assert isinstance(detail, str)
        assert detail.strip()
        assert "mes" in detail.lower()


# Adversarial month values aimed at every month/end-consuming endpoint.
ADVERSARIAL_MONTHS = [
    "0000-01",
    "0000-12",
    "0001-01",
    "0001-06",
    "0001-07",
    "9999-11",
    "9999-12",
    "9999-13",
    "10000-01",
    "2026-00",
    "2026-13",
    "2026-1",
    "abc",
    "",
    "2026-09 ",
]


@pytest.mark.parametrize("month", ADVERSARIAL_MONTHS)
@pytest.mark.parametrize(
    ("path", "param_name"),
    [
        ("/api/movements", "month"),
        ("/api/budgets", "month"),
        ("/api/stats/summary", "month"),
        ("/api/stats/by-category", "month"),
        ("/api/stats/monthly", "end"),
    ],
)
def test_month_value_never_5xx(
    client: TestClient, path: str, param_name: str, month: str
) -> None:
    # Safety net: no adversarial month/end value may ever produce a 5xx. A
    # malformed or out-of-range value is allowed to be a Pydantic or a domain
    # 422, but never an unhandled server error.
    response = client.get(path, params={param_name: month})
    assert response.status_code in {200, 422}, (
        f"{path}?{param_name}={month!r} -> {response.status_code}: {response.text}"
    )


@pytest.mark.parametrize("months", [1, 2, 24])
@pytest.mark.parametrize("end", ["0001-01", "9999-12"])
def test_monthly_months_never_5xx(client: TestClient, end: str, months: int) -> None:
    # Combining an extreme `end` with every legal window size must stay 2xx/4xx.
    response = client.get("/api/stats/monthly", params={"end": end, "months": months})
    assert response.status_code in {200, 422}, (
        f"/api/stats/monthly?end={end}&months={months} -> {response.status_code}"
    )



# --------------------------------------------------------------------------- #
# Accounts (named USD wallets) and debts
# --------------------------------------------------------------------------- #
def _new_account(client: TestClient, name: str, opening: int = 0) -> dict:
    response = client.post(
        "/api/accounts", json={"name": name, "opening_balance_cents": opening}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_accounts_list_default_wallet(client: TestClient) -> None:
    body = client.get("/api/accounts").json()
    assert body["total_debt_cents"] == 0
    assert body["items"] == [
        {
            "id": ACCOUNT_ID,
            "name": "Cartera USD",
            "opening_balance_cents": 0,
            "balance_cents": 0,
            "is_debt": False,
            "paid_cents": 0,
            "remaining_cents": 0,
            "pct_paid": 0.0,
        }
    ]


def test_accounts_create_validation(client: TestClient) -> None:
    # Duplicate of the default wallet name.
    assert client.post("/api/accounts", json={"name": "Cartera USD"}).status_code == 422
    # Empty / whitespace-only name.
    assert client.post("/api/accounts", json={"name": "   "}).status_code == 422
    # Too long.
    assert client.post("/api/accounts", json={"name": "x" * 61}).status_code == 422
    # Opening balance out of range.
    assert (
        client.post(
            "/api/accounts", json={"name": "Nueva", "opening_balance_cents": 2_147_483_648}
        ).status_code
        == 422
    )


def test_accounts_update_and_missing(client: TestClient) -> None:
    created = _new_account(client, "Binance", -10_000)
    updated = client.patch(
        f"/api/accounts/{created['id']}",
        json={"name": "Binance 2", "opening_balance_cents": -20_000},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "Binance 2"
    assert body["opening_balance_cents"] == -20_000
    assert body["balance_cents"] == -20_000
    assert body["is_debt"] is True
    assert body["remaining_cents"] == 20_000

    # Renaming onto an existing name is a conflict.
    conflict = client.patch(f"/api/accounts/{created['id']}", json={"name": "Cartera USD"})
    assert conflict.status_code == 422

    assert client.patch("/api/accounts/9999", json={"name": "X"}).status_code == 404


def test_account_delete_conflicts(client: TestClient) -> None:
    # Only the default wallet exists -> cannot delete the last one.
    assert client.delete(f"/api/accounts/{ACCOUNT_ID}").status_code == 409
    assert client.delete("/api/accounts/9999").status_code == 404

    # An account that holds movements cannot be deleted.
    other = _new_account(client, "Con movimientos")
    _create(client, account_id=other["id"])
    assert client.delete(f"/api/accounts/{other['id']}").status_code == 409

    # An empty account is deletable.
    empty = _new_account(client, "Vacia")
    assert client.delete(f"/api/accounts/{empty['id']}").status_code == 204
    names = {account["name"] for account in client.get("/api/accounts").json()["items"]}
    assert "Vacia" not in names


def test_account_balance_math(client: TestClient) -> None:
    binance = _new_account(client, "Binance", -60_000)
    binance_id = binance["id"]

    # income raises the balance, a normal expense lowers it, a debt payment raises it
    _create(client, account_id=binance_id, category_id="sueldo", type="ingreso",
            entry_amount_cents=10_000)
    _create(client, account_id=binance_id, category_id="ocio", type="gasto",
            entry_amount_cents=5_000)
    _create(client, account_id=binance_id, is_debt_payment=True, entry_amount_cents=20_000)

    items = {account["name"]: account for account in client.get("/api/accounts").json()["items"]}
    item = items["Binance"]
    assert item["balance_cents"] == -60_000 + 10_000 - 5_000 + 20_000
    assert item["paid_cents"] == 20_000
    assert item["remaining_cents"] == 35_000
    assert item["pct_paid"] == pytest.approx(20_000 / 60_000)
    assert client.get("/api/accounts").json()["total_debt_cents"] == 35_000


# --------------------------------------------------------------------------- #
# Movements: account requirement and debt payments
# --------------------------------------------------------------------------- #
def test_movement_requires_account(client: TestClient) -> None:
    payload = _movement_payload()
    payload.pop("account_id")
    assert client.post("/api/movements", json=payload).status_code == 422

    # Unknown account -> 422.
    unknown = client.post("/api/movements", json=_movement_payload(account_id=9999))
    assert unknown.status_code == 422
    assert unknown.json()["detail"] == "La cartera no existe."


def test_movement_category_required_unless_debt_payment(client: TestClient) -> None:
    payload = _movement_payload()
    payload.pop("category_id")
    response = client.post("/api/movements", json=payload)
    assert response.status_code == 422
    assert response.json()["detail"] == "La categoría es obligatoria."


def test_debt_payment_forces_category_and_type(client: TestClient) -> None:
    binance = _new_account(client, "Binance", -50_000)
    created = _create(
        client,
        account_id=binance["id"],
        is_debt_payment=True,
        type="ingreso",
        category_id="sueldo",
        entry_amount_cents=10_000,
    )
    assert created["type"] == "gasto"
    assert created["category_id"] == "deudas"
    assert created["is_debt_payment"] is True
    assert created["account_id"] == binance["id"]
    assert created["account_name"] == "Binance"


def test_debt_payment_requires_debt_account(client: TestClient) -> None:
    # The default wallet has opening 0 (not a debt): the payment is rejected.
    response = client.post(
        "/api/movements",
        json=_movement_payload(account_id=ACCOUNT_ID, is_debt_payment=True),
    )
    assert response.status_code == 422
    assert "saldo inicial negativo" in response.json()["detail"]


# --------------------------------------------------------------------------- #
# Stats / budgets / plan with accounts and system categories
# --------------------------------------------------------------------------- #
def test_stats_account_filter(client: TestClient) -> None:
    binance = _new_account(client, "Binance", -100_000)
    _create(client, account_id=ACCOUNT_ID, category_id="ocio", entry_amount_cents=30_000)
    _create(client, account_id=binance["id"], category_id="salud", entry_amount_cents=10_000)

    assert client.get("/api/stats/summary").json()["expenses_cents"] == 40_000
    assert (
        client.get("/api/stats/summary", params={"account": ACCOUNT_ID}).json()["expenses_cents"]
        == 30_000
    )
    # "all" behaves like no filter.
    assert (
        client.get("/api/stats/summary", params={"account": "all"}).json()["expenses_cents"]
        == 40_000
    )

    by_cat = client.get("/api/stats/by-category", params={"account": binance["id"]}).json()
    assert [item["category_id"] for item in by_cat["items"]] == ["salud"]

    monthly = client.get("/api/stats/monthly", params={"account": binance["id"]}).json()
    assert monthly[-1]["expenses_cents"] == 10_000

    # Movement list filter.
    assert len(client.get("/api/movements", params={"account": binance["id"]}).json()) == 1
    assert len(client.get("/api/movements", params={"account": "all"}).json()) == 2

    # A non-numeric, non-"all" value is a 422.
    assert client.get("/api/movements", params={"account": "x"}).status_code == 422


def test_budgets_exclude_system_category(client: TestClient) -> None:
    items = client.get("/api/budgets").json()["items"]
    assert len(items) == 10
    assert all(item["category_id"] != "deudas" for item in items)


def test_debt_payment_not_counted_in_any_jar(client: TestClient) -> None:
    binance = _new_account(client, "Binance", -50_000)
    _create(client, account_id=binance["id"], is_debt_payment=True, entry_amount_cents=20_000)

    jars = client.get("/api/plan").json()["jars"]
    mapped = [category_id for jar in jars for category_id in jar["category_ids"]]
    assert "deudas" not in mapped
    assert all(jar["spent_cents"] == 0 for jar in jars)


# --------------------------------------------------------------------------- #
# Export / import with accounts (v3) and v1/v2 fallback
# --------------------------------------------------------------------------- #
def test_export_import_v3_round_trip_with_accounts(client: TestClient) -> None:
    binance = _new_account(client, "Binance", -50_000)
    _create(client, account_id=ACCOUNT_ID, category_id="ocio", entry_amount_cents=1_000)
    _create(client, account_id=binance["id"], is_debt_payment=True, entry_amount_cents=20_000)

    export = client.get("/api/data/export").json()
    assert export["version"] == 4
    names = {account["name"] for account in export["accounts"]}
    assert names == {"Cartera USD", "Binance"}
    debt_movement = next(m for m in export["movements"] if m["is_debt_payment"])
    assert debt_movement["account_name"] == "Binance"

    result = client.post("/api/data/import", params={"mode": "replace"}, json=export).json()
    assert result["movements_imported"] == 2
    assert result["accounts_imported"] == 0  # both wallets already existed

    accounts = {account["name"] for account in client.get("/api/accounts").json()["items"]}
    assert accounts == {"Cartera USD", "Binance"}
    stored = client.get("/api/movements").json()
    assert len([m for m in stored if m["is_debt_payment"]]) == 1


def test_import_v3_creates_missing_accounts(client: TestClient) -> None:
    payload = {
        "version": 3,
        "accounts": [{"name": "Nueva", "opening_balance_cents": -1_000}],
        "movements": [
            {"type": "gasto", "category_id": "ocio", "amount_cents": 500,
             "date": f"{CURRENT_MONTH}-02", "note": "", "account_name": "Nueva"},
        ],
        "budgets": {},
    }
    result = client.post("/api/data/import", params={"mode": "merge"}, json=payload).json()
    assert result["accounts_imported"] == 1

    accounts = {account["name"]: account for account in client.get("/api/accounts").json()["items"]}
    assert accounts["Nueva"]["opening_balance_cents"] == -1_000
    stored = client.get("/api/movements").json()[0]
    assert stored["account_name"] == "Nueva"


def test_import_v1_and_v2_fall_back_to_default_account(client: TestClient) -> None:
    v1 = {
        "version": 1,
        "movements": [
            {"type": "gasto", "category_id": "ocio", "amount_cents": 500,
             "date": f"{CURRENT_MONTH}-01", "note": ""},
        ],
        "budgets": {},
    }
    first = client.post("/api/data/import", params={"mode": "merge"}, json=v1).json()
    assert first["movements_imported"] == 1
    stored = client.get("/api/movements").json()[0]
    assert stored["account_name"] == "Cartera USD"
    assert stored["is_debt_payment"] is False

    v2 = {
        "version": 2,
        "movements": [
            {"type": "gasto", "category_id": "salud", "amount_cents": 300,
             "entry_currency": "USD", "entry_amount_cents": 300, "rate_micros": None,
             "date": f"{CURRENT_MONTH}-02", "note": ""},
        ],
        "budgets": {},
        "jar_categories": {},
    }
    second = client.post("/api/data/import", params={"mode": "merge"}, json=v2).json()
    assert second["movements_imported"] == 1
    assert len(client.get("/api/movements").json()) == 2


def test_import_dedupe_signature_includes_account(client: TestClient) -> None:
    _new_account(client, "Otra", 0)
    # Same content, different wallet -> must not be considered a duplicate.
    payload = {
        "version": 3,
        "movements": [
            {"type": "gasto", "category_id": "ocio", "amount_cents": 500,
             "date": f"{CURRENT_MONTH}-03", "note": "", "account_name": "Cartera USD"},
            {"type": "gasto", "category_id": "ocio", "amount_cents": 500,
             "date": f"{CURRENT_MONTH}-03", "note": "", "account_name": "Otra"},
        ],
        "budgets": {},
    }
    result = client.post("/api/data/import", params={"mode": "merge"}, json=payload).json()
    assert result["movements_imported"] == 2
    assert len(client.get("/api/movements").json()) == 2


# --------------------------------------------------------------------------- #
# Movement detail lines (optional invoice items)
# --------------------------------------------------------------------------- #
def _count_items(db_session: Session, movement_id: int) -> int:
    return db_session.scalar(
        select(func.count())
        .select_from(MovementItem)
        .where(MovementItem.movement_id == movement_id)
    )


def test_create_movement_with_items_derives_amount(client: TestClient) -> None:
    created = _create(
        client,
        items=[
            {"description": "Leche", "amount_cents": 350},
            {"description": "Pan", "amount_cents": 200},
        ],
    )
    # The total is the sum of the lines, in USD, ignoring the sent entry amount.
    assert created["amount_cents"] == 550
    assert created["entry_currency"] == "USD"
    assert created["entry_amount_cents"] == 550
    assert created["rate_micros"] is None
    assert created["items"] == [
        {"description": "Leche", "amount_cents": 350},
        {"description": "Pan", "amount_cents": 200},
    ]


def test_list_movements_returns_items(client: TestClient) -> None:
    with_items = _create(
        client,
        category_id="supermercado",
        items=[
            {"description": "Leche", "amount_cents": 350},
            {"description": "Pan", "amount_cents": 200},
        ],
    )
    without = _create(client, category_id="ocio", entry_amount_cents=5_000)

    listed = {movement["id"]: movement for movement in client.get("/api/movements").json()}
    assert listed[with_items["id"]]["items"] == [
        {"description": "Leche", "amount_cents": 350},
        {"description": "Pan", "amount_cents": 200},
    ]
    assert listed[without["id"]]["items"] == []


def test_items_only_apply_to_usd_movements(client: TestClient) -> None:
    response = client.post(
        "/api/movements",
        json=_movement_payload(
            entry_currency="VES",
            entry_amount_cents=400_000,
            rate_micros=40_000_000,
            items=[{"description": "Leche", "amount_cents": 350}],
        ),
    )
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Las líneas de detalle solo aplican a movimientos en dólares (USD)."
    )


def test_create_movement_too_many_items(client: TestClient) -> None:
    items = [{"description": "x", "amount_cents": 1}] * 101
    response = client.post("/api/movements", json=_movement_payload(items=items))
    assert response.status_code == 422
    assert response.json()["detail"] == "Máximo 100 líneas por movimiento."


def test_create_movement_invalid_items(client: TestClient) -> None:
    bad_description = client.post(
        "/api/movements",
        json=_movement_payload(items=[{"description": "   ", "amount_cents": 100}]),
    )
    assert bad_description.status_code == 422
    assert bad_description.json()["detail"] == (
        "Cada línea necesita una descripción de hasta 120 caracteres."
    )

    bad_amount = client.post(
        "/api/movements",
        json=_movement_payload(items=[{"description": "Línea", "amount_cents": 0}]),
    )
    assert bad_amount.status_code == 422
    assert bad_amount.json()["detail"] == "El precio de una línea debe ser mayor a cero."


def test_debt_payment_with_items_is_rejected(client: TestClient) -> None:
    binance = _new_account(client, "Binance", -50_000)
    response = client.post(
        "/api/movements",
        json=_movement_payload(
            account_id=binance["id"],
            is_debt_payment=True,
            items=[{"description": "Cuota", "amount_cents": 500}],
        ),
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Un pago de deuda no lleva líneas de detalle."


def test_update_movement_replaces_items_and_recalculates(client: TestClient) -> None:
    created = _create(
        client,
        items=[
            {"description": "Leche", "amount_cents": 350},
            {"description": "Pan", "amount_cents": 200},
        ],
    )
    movement_id = created["id"]
    assert created["amount_cents"] == 550

    patched = client.patch(
        f"/api/movements/{movement_id}",
        json={"items": [{"description": "Solo", "amount_cents": 700}]},
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["amount_cents"] == 700
    assert body["entry_currency"] == "USD"
    assert body["entry_amount_cents"] == 700
    assert body["rate_micros"] is None
    assert body["items"] == [{"description": "Solo", "amount_cents": 700}]

    listed = client.get("/api/movements").json()
    assert listed[0]["items"] == [{"description": "Solo", "amount_cents": 700}]


def test_update_movement_clears_items(client: TestClient, db_session: Session) -> None:
    created = _create(client, items=[{"description": "A", "amount_cents": 500}])
    movement_id = created["id"]
    assert _count_items(db_session, movement_id) == 1

    patched = client.patch(f"/api/movements/{movement_id}", json={"items": []})
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["items"] == []
    # Without lines the stored USD entry amount is kept (no VES rate involved).
    assert body["amount_cents"] == 500
    assert body["entry_currency"] == "USD"
    assert _count_items(db_session, movement_id) == 0


def test_delete_movement_removes_items(client: TestClient, db_session: Session) -> None:
    created = _create(client, items=[{"description": "A", "amount_cents": 500}])
    movement_id = created["id"]
    assert _count_items(db_session, movement_id) == 1

    assert client.delete(f"/api/movements/{movement_id}").status_code == 204
    assert _count_items(db_session, movement_id) == 0


def test_export_v4_includes_items_and_round_trips(client: TestClient) -> None:
    _create(
        client,
        items=[
            {"description": "Leche", "amount_cents": 350},
            {"description": "Pan", "amount_cents": 200},
        ],
    )
    export = client.get("/api/data/export").json()
    assert export["version"] == 4
    assert export["movements"][0]["items"] == [
        {"description": "Leche", "amount_cents": 350},
        {"description": "Pan", "amount_cents": 200},
    ]

    result = client.post("/api/data/import", params={"mode": "replace"}, json=export).json()
    assert result["movements_imported"] == 1

    stored = client.get("/api/movements").json()
    assert len(stored) == 1
    assert stored[0]["amount_cents"] == 550
    assert stored[0]["items"] == export["movements"][0]["items"]


def test_import_items_derive_amount_from_lines(client: TestClient) -> None:
    result = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 4,
            "movements": [
                {"type": "gasto", "category_id": "supermercado", "amount_cents": 999_999,
                 "date": f"{CURRENT_MONTH}-01", "note": "",
                 "items": [
                     {"description": "A", "amount_cents": 300},
                     {"description": "B", "amount_cents": 200},
                 ]},
            ],
            "budgets": {},
        },
    ).json()
    assert result["movements_imported"] == 1

    stored = client.get("/api/movements").json()[0]
    assert stored["amount_cents"] == 500
    assert stored["entry_amount_cents"] == 500
    assert stored["entry_currency"] == "USD"
    assert stored["items"] == [
        {"description": "A", "amount_cents": 300},
        {"description": "B", "amount_cents": 200},
    ]


def test_import_rejects_invalid_items(client: TestClient) -> None:
    created = _create(client)
    before = client.get("/api/movements").json()

    response = client.post(
        "/api/data/import",
        params={"mode": "merge"},
        json={
            "version": 4,
            "movements": [
                {"type": "gasto", "category_id": "ocio", "amount_cents": 500,
                 "date": f"{CURRENT_MONTH}-01", "note": "",
                 "items": [{"description": "  ", "amount_cents": 100}]},
            ],
            "budgets": {},
        },
    )
    assert response.status_code == 422
    assert "líneas inválidas" in response.json()["detail"]
    # The failed import did not touch the data.
    after = client.get("/api/movements").json()
    assert after == before
    assert after[0]["id"] == created["id"]


def test_import_items_merge_is_idempotent(client: TestClient) -> None:
    _create(client, items=[{"description": "A", "amount_cents": 500}])
    export = client.get("/api/data/export").json()

    first = client.post("/api/data/import", params={"mode": "merge"}, json=export).json()
    assert first["movements_imported"] == 0
    assert first["movements_skipped"] == 1

    stored = client.get("/api/movements").json()
    assert len(stored) == 1
    assert stored[0]["items"] == [{"description": "A", "amount_cents": 500}]


# --------------------------------------------------------------------------- #
# Seed detail lines
# --------------------------------------------------------------------------- #
def test_seed_creates_coherent_movement_items(db_session: Session) -> None:
    _seed(db_session, force=False, month_key="2026-01")

    grouped = dict(
        db_session.execute(
            select(MovementItem.movement_id, func.sum(MovementItem.amount_cents)).group_by(
                MovementItem.movement_id
            )
        ).all()
    )
    assert grouped  # at least one sample movement carries lines
    for movement_id, total_cents in grouped.items():
        amount = db_session.scalar(
            select(Movement.amount_cents).where(Movement.id == movement_id)
        )
        assert total_cents == amount


def test_seed_force_wipes_stale_movement_items(db_session: Session) -> None:
    movement = Movement(
        type="gasto",
        category_id="ocio",
        amount_cents=100,
        account_id=ACCOUNT_ID,
        entry_currency="USD",
        entry_amount_cents=100,
        date=date(2026, 1, 5),
        note="custom",
    )
    db_session.add(movement)
    db_session.commit()
    db_session.add(MovementItem(movement_id=movement.id, description="stale", amount_cents=100))
    db_session.commit()

    _seed(db_session, force=True, month_key="2026-01")

    stale = db_session.scalar(
        select(func.count())
        .select_from(MovementItem)
        .where(MovementItem.description == "stale")
    )
    assert stale == 0
