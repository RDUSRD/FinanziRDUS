"""Integration test against a real PostgreSQL database.

Skipped automatically unless ``TEST_DATABASE_URL`` points at a reachable
database. Run it explicitly with ``pytest -m postgres`` and skip it with
``pytest -m "not postgres"``.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.config import get_settings
from app.db import get_db
from app.main import create_app
from app.models import AdminUser
from app.security import hash_password

pytestmark = pytest.mark.postgres

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

# The administrator this test signs in as (the migration creates the tables; the
# credential itself is the bootstrap's job, so here it is written directly).
PG_ADMIN_USERNAME = "admin"
PG_ADMIN_PASSWORD = "clave-de-postgres-2026"


def _create_admin(factory: sessionmaker) -> None:
    with factory() as session:
        session.add(
            AdminUser(
                username=PG_ADMIN_USERNAME,
                password_hash=hash_password(PG_ADMIN_PASSWORD),
                must_change_password=False,
            )
        )
        session.commit()


def _sign_in(client: TestClient) -> None:
    """Sign in through the real endpoint; the TestClient keeps the cookie."""
    response = client.post(
        "/api/auth/login",
        json={"username": PG_ADMIN_USERNAME, "password": PG_ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text



@pytest.fixture(scope="module")
def pg_url() -> str:
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL is not set")
    engine = create_engine(TEST_DATABASE_URL)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - report and skip
        pytest.skip(f"PostgreSQL is not reachable: {exc}")
    finally:
        engine.dispose()
    return TEST_DATABASE_URL


@pytest.fixture(scope="module")
def migrated_app(pg_url: str):
    config = Config(str(ALEMBIC_INI))
    config.attributes["db_url"] = pg_url
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    engine = create_engine(pg_url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    application = create_app()

    def override_get_db() -> Iterator[Session]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_db] = override_get_db
    with TestClient(application) as client:
        _create_admin(factory)
        _sign_in(client)
        yield client
    application.dependency_overrides.clear()
    engine.dispose()


def test_migrations_seed_categories_and_api_flow(migrated_app: TestClient) -> None:
    current_month = get_settings().current_month()

    health = migrated_app.get("/api/health")
    assert health.status_code == 200
    assert health.json()["db"] == "ok"

    categories = migrated_app.get("/api/categories").json()
    assert len(categories) == 15
    deudas = next(category for category in categories if category["id"] == "deudas")
    assert deudas["is_system"] is True

    # Migration 0003 seeds the default wallet.
    accounts = migrated_app.get("/api/accounts").json()
    assert [account["name"] for account in accounts["items"]] == ["Cartera USD"]
    default_account_id = accounts["items"][0]["id"]

    created = migrated_app.post(
        "/api/movements",
        json={
            "type": "gasto",
            "category_id": "ocio",
            "account_id": default_account_id,
            "entry_currency": "USD",
            "entry_amount_cents": 123400,
            "date": f"{current_month}-05",
            "note": "Postgres",
        },
    )
    assert created.status_code == 201
    movement_id = created.json()["id"]
    assert created.json()["account_id"] == default_account_id
    assert created.json()["account_name"] == "Cartera USD"
    assert created.json()["entry_currency"] == "USD"
    assert created.json()["entry_amount_cents"] == 123400
    # Serialized in the application timezone (ISO 8601 with a UTC offset).
    created_at = created.json()["created_at"]
    assert created_at[-6] in "+-" and created_at[-3] == ":"

    assert migrated_app.put("/api/budgets/ocio", json={"cap_cents": 100000}).status_code == 200
    budgets = migrated_app.get("/api/budgets").json()
    ocio = next(item for item in budgets["items"] if item["category_id"] == "ocio")
    assert ocio["status"] == "over"

    summary = migrated_app.get("/api/stats/summary").json()
    assert summary["income_cents"] == 0
    assert summary["expenses_cents"] == 123400
    assert summary["balance_cents"] == -123400

    # Migration 0002 seeds the money-jars catalogue and the default mapping.
    plan = migrated_app.get("/api/plan").json()
    assert [jar["jar_id"] for jar in plan["jars"]] == [
        "crecimiento",
        "estabilidad",
        "esencial",
        "recompensas",
    ]
    assert plan["income_cents"] == 0

    # A movement entered in bolívares is converted to the canonical USD amount.
    ves = migrated_app.post(
        "/api/movements",
        json={
            "type": "gasto",
            "category_id": "supermercado",
            "account_id": default_account_id,
            "entry_currency": "VES",
            "entry_amount_cents": 400000,
            "rate_micros": 40000000,
            "date": f"{current_month}-06",
            "note": "Bs",
        },
    )
    assert ves.status_code == 201
    assert ves.json()["amount_cents"] == 10000
    assert ves.json()["rate_micros"] == 40000000
    assert migrated_app.delete(f"/api/movements/{ves.json()['id']}").status_code == 204

    export = migrated_app.get("/api/data/export").json()
    assert export["version"] == 4
    assert export["jar_categories"]["supermercado"] == "esencial"
    assert export["accounts"] == [{"name": "Cartera USD", "opening_balance_cents": 0}]
    assert export["movements"][0]["account_name"] == "Cartera USD"

    assert migrated_app.delete(f"/api/movements/{movement_id}").status_code == 204
