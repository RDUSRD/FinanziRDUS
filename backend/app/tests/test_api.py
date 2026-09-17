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
from app.domain import shift_month
from app.main import create_app
from app.models import Budget, Movement
from app.seed import BUDGETS_PESOS, _seed

CURRENT_MONTH = get_settings().current_month()
PREV_MONTH = shift_month(CURRENT_MONTH, -1)


def _movement_payload(**overrides) -> dict:
    payload = {
        "type": "gasto",
        "category_id": "ocio",
        "amount_cents": 4500000,
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
    assert len(categories) == 14
    assert categories[0]["type"] == "gasto"
    assert categories[-1]["type"] == "ingreso"
    gasto = [c for c in categories if c["type"] == "gasto"]
    assert [c["sort_order"] for c in gasto] == list(range(1, 11))


# --------------------------------------------------------------------------- #
# Movements CRUD
# --------------------------------------------------------------------------- #
def test_movement_crud_lifecycle(client: TestClient) -> None:
    created = _create(client)
    assert created["type"] == "gasto"
    assert created["category_id"] == "ocio"
    assert created["amount_cents"] == 4500000
    assert created["date"] == f"{CURRENT_MONTH}-04"
    assert created["note"] == "Cine"
    assert "created_at" in created
    movement_id = created["id"]

    listed = client.get("/api/movements", params={"month": CURRENT_MONTH}).json()
    assert [m["id"] for m in listed] == [movement_id]

    updated = client.patch(
        f"/api/movements/{movement_id}",
        json={"amount_cents": 5000000, "note": "  Corregido  "},
    )
    assert updated.status_code == 200
    assert updated.json()["amount_cents"] == 5000000
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
        amount_cents=100000000,
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
    response = client.post("/api/movements", json=_movement_payload(amount_cents=0))
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

    missing = client.patch("/api/movements/9999", json={"amount_cents": 100})
    assert missing.status_code == 404
    assert client.delete("/api/movements/9999").status_code == 404


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
    _create(client, category_id="supermercado", amount_cents=9000)

    # over (> cap)
    client.put("/api/budgets/ocio", json={"cap_cents": 10000})
    _create(client, category_id="ocio", amount_cents=11000)

    # ok (below 80%)
    client.put("/api/budgets/transporte", json={"cap_cents": 10000})
    _create(client, category_id="transporte", amount_cents=5000)

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
    _create(client, category_id="ocio", amount_cents=11000, date=f"{PREV_MONTH}-10")
    response = client.get("/api/budgets", params={"month": PREV_MONTH})
    items = {item["category_id"]: item for item in response.json()["items"]}
    assert items["ocio"]["spent_cents"] == 11000
    assert items["ocio"]["status"] == "over"


def test_budgets_pct_is_raw_fraction(client: TestClient) -> None:
    # Over 100%: the fraction is > 1 (raw, never multiplied by 100).
    client.put("/api/budgets/supermercado", json={"cap_cents": 10000})
    _create(client, category_id="supermercado", amount_cents=25000)

    # Under 100%: the fraction is < 1.
    client.put("/api/budgets/transporte", json={"cap_cents": 10000})
    _create(client, category_id="transporte", amount_cents=5000)

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
    _create(client, category_id="sueldo", type="ingreso", amount_cents=100000)
    _create(client, category_id="ocio", type="gasto", amount_cents=40000)
    _create(client, category_id="supermercado", type="gasto", amount_cents=20000,
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
    _create(client, category_id="ocio", amount_cents=10000)
    summary = client.get("/api/stats/summary").json()
    assert summary["average_prev"] == {"avg_cents": 0, "months_used": 0}
    assert summary["comparison"] == {"pct": 0.0, "direction": "na"}


def test_by_category(client: TestClient) -> None:
    _create(client, category_id="ocio", amount_cents=30000)
    _create(client, category_id="salud", amount_cents=10000)

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
    _create(client, category_id="salud", amount_cents=10000)
    _create(client, category_id="ocio", amount_cents=10000)

    body = client.get("/api/stats/by-category").json()
    assert body["total_cents"] == 20000
    assert [item["category_id"] for item in body["items"]] == ["ocio", "salud"]
    assert [item["label"] for item in body["items"]] == ["Ocio", "Salud"]
    assert [item["share"] for item in body["items"]] == [0.5, 0.5]

    # The tie-break follows the label, not the id insertion order.
    labels = [item["label"] for item in body["items"]]
    assert labels == sorted(labels)


def test_monthly_window(client: TestClient) -> None:
    _create(client, category_id="ocio", amount_cents=30000)
    _create(client, category_id="sueldo", type="ingreso", amount_cents=50000)

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
    post_body = client.post("/api/movements", json=_movement_payload(amount_cents=too_big))
    assert post_body.status_code == 422
    assert post_body.json()["detail"] == "El monto es demasiado grande."

    patched = client.patch(
        f"/api/movements/{created['id']}", json={"amount_cents": too_big}
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
            "/api/movements", json=_movement_payload(amount_cents=2_147_483_647)
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
    assert body["version"] == 1
    assert "exported_at" in body
    assert isinstance(body["movements"], list)
    assert body["movements"][0]["amount_cents"] == 4500000
    assert body["budgets"] == {"ocio": 12345}


def test_import_merge_does_not_duplicate(client: TestClient) -> None:
    _create(client)
    _create(client, category_id="salud", amount_cents=1000)
    export = client.get("/api/data/export").json()

    first = client.post("/api/data/import", params={"mode": "merge"}, json=export).json()
    assert first == {
        "mode": "merge",
        "movements_imported": 0,
        "movements_skipped": 2,
        "budgets_imported": 0,
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
        "/api/data/import", json={"version": 2, "movements": [], "budgets": {}}
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
    _create(client, category_id="salud", amount_cents=1000)
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
    # seed injected 44 sample movements and overwrote the user's caps.
    db_session.add(Budget(category_id="ocio", cap_cents=7777))
    db_session.commit()

    result = _seed(db_session, force=False, month_key="2026-01")

    assert result["seeded"] is False
    assert result["reason"] == "already_has_data"
    assert db_session.scalar(select(func.count()).select_from(Movement)) == 0
    cap = db_session.scalar(select(Budget.cap_cents).where(Budget.category_id == "ocio"))
    assert cap == 7777


def test_seed_populates_empty_database(db_session: Session) -> None:
    result = _seed(db_session, force=False, month_key="2026-01")

    assert result["seeded"] is True
    assert result["movements"] == 44
    assert result["budgets"] == 10
    assert db_session.scalar(select(func.count()).select_from(Movement)) == 44
    assert db_session.scalar(select(func.count()).select_from(Budget)) == 10


def test_seed_force_wipes_and_reseeds(db_session: Session) -> None:
    db_session.add(
        Movement(
            type="gasto",
            category_id="ocio",
            amount_cents=1,
            date=date(2026, 1, 1),
            note="custom",
        )
    )
    db_session.add(Budget(category_id="ocio", cap_cents=1))
    db_session.commit()

    result = _seed(db_session, force=True, month_key="2026-01")

    assert result["seeded"] is True
    assert result["movements"] == 44
    assert result["budgets"] == 10
    # The custom movement was wiped and only the sample data remains.
    assert db_session.scalar(select(func.count()).select_from(Movement)) == 44
    # The custom cap was replaced by the sample cap for "ocio".
    cap = db_session.scalar(select(Budget.cap_cents).where(Budget.category_id == "ocio"))
    assert cap == BUDGETS_PESOS["ocio"] * 100


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

