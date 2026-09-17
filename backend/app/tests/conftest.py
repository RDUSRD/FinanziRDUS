"""Shared pytest fixtures: an in-memory SQLite database wired into the app."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import create_app
from app.models import (
    CATEGORY_SEED,
    JAR_CATEGORY_SEED,
    JAR_SEED,
    SYSTEM_CATEGORY_IDS,
    Account,
    Base,
    Category,
    Jar,
    JarCategory,
)

# Default wallet id created by the ``db_session`` fixture (used by movement
# payloads/rows that must reference an account).
DEFAULT_ACCOUNT_ID = 1


@pytest.fixture()
def engine() -> Iterator:
    """A fresh in-memory SQLite engine shared across connections."""
    test_engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture()
def session_factory(engine) -> sessionmaker:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def db_session(session_factory: sessionmaker) -> Iterator[Session]:
    """A session with the fixed catalogues and a default wallet already seeded."""
    session = session_factory()
    session.add_all(
        [
            Category(**item, is_system=item["id"] in SYSTEM_CATEGORY_IDS)
            for item in CATEGORY_SEED
        ]
    )
    session.flush()
    session.add_all([Jar(**item) for item in JAR_SEED])
    session.flush()
    session.add_all([JarCategory(**item) for item in JAR_CATEGORY_SEED])
    session.add(Account(name="Cartera USD", opening_balance_cents=0, sort_order=1))
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(session_factory: sessionmaker, db_session: Session) -> Iterator[TestClient]:
    """A TestClient whose ``get_db`` dependency uses the SQLite test database."""
    application = create_app()

    def override_get_db() -> Iterator[Session]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_db] = override_get_db
    with TestClient(application) as test_client:
        yield test_client
    application.dependency_overrides.clear()
