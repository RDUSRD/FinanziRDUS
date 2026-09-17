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

pytestmark = pytest.mark.postgres

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


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
        yield client
    application.dependency_overrides.clear()
    engine.dispose()


def test_migrations_seed_categories_and_api_flow(migrated_app: TestClient) -> None:
    current_month = get_settings().current_month()

    health = migrated_app.get("/api/health")
    assert health.status_code == 200
    assert health.json()["db"] == "ok"

    categories = migrated_app.get("/api/categories").json()
    assert len(categories) == 14

    created = migrated_app.post(
        "/api/movements",
        json={
            "type": "gasto",
            "category_id": "ocio",
            "amount_cents": 123400,
            "date": f"{current_month}-05",
            "note": "Postgres",
        },
    )
    assert created.status_code == 201
    movement_id = created.json()["id"]
    assert created.json()["created_at"].endswith("-03:00") or "+" in created.json()["created_at"]

    assert migrated_app.put("/api/budgets/ocio", json={"cap_cents": 100000}).status_code == 200
    budgets = migrated_app.get("/api/budgets").json()
    ocio = next(item for item in budgets["items"] if item["category_id"] == "ocio")
    assert ocio["status"] == "over"

    summary = migrated_app.get("/api/stats/summary").json()
    assert summary["income_cents"] == 0
    assert summary["expenses_cents"] == 123400
    assert summary["balance_cents"] == -123400

    export = migrated_app.get("/api/data/export").json()
    assert export["version"] == 1

    assert migrated_app.delete(f"/api/movements/{movement_id}").status_code == 204
