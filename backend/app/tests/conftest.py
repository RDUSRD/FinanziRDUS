"""Shared pytest fixtures: an in-memory SQLite database wired into the app."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# The suite must not depend on the ambient environment: a developer shell, or the
# docker compose service `make test-backend` uses, may export APP_ENV=production,
# and Settings refuses to boot in that mode while SECRET_KEY is still its dev
# default. This runs before app.config is imported below, so the (cached)
# Settings the app builds see these values.
os.environ["APP_ENV"] = "development"
os.environ["SECRET_KEY"] = "secret-de-prueba-no-usar-en-produccion"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from app.config import get_settings  # noqa: E402
from app.db import get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    CATEGORY_SEED,
    JAR_CATEGORY_SEED,
    JAR_SEED,
    SYSTEM_CATEGORY_IDS,
    Account,
    AdminSession,
    AdminUser,
    Base,
    Category,
    Jar,
    JarCategory,
)
from app.security import SESSION_COOKIE_NAME, hash_password, hash_token  # noqa: E402

# Default wallet id created by the ``db_session`` fixture (used by movement
# payloads/rows that must reference an account).
DEFAULT_ACCOUNT_ID = 1

# The administrator the authenticated ``client`` fixture is signed in as.
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "clave-de-prueba-2026"

# The raw token behind the cookie the ``client`` fixture carries. Sessions store
# only its peppered hash, so the fixture writes the row and the cookie by hand
# instead of going through ``/api/auth/login`` (which the auth tests exercise).
TEST_SESSION_TOKEN = "token-de-prueba-no-usar-en-produccion"


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


@lru_cache(maxsize=1)
def _admin_password_hash() -> str:
    """Hash the fixture password once: scrypt is deliberately slow."""
    return hash_password(ADMIN_PASSWORD)


@pytest.fixture()
def admin_user(db_session: Session) -> AdminUser:
    """The administrator whose credential the auth tests sign in with."""
    user = AdminUser(
        username=ADMIN_USERNAME,
        password_hash=_admin_password_hash(),
        must_change_password=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def admin_credentials() -> tuple[str, str]:
    """The username and password of the fixture administrator."""
    return ADMIN_USERNAME, ADMIN_PASSWORD


@pytest.fixture()
def test_app(session_factory: sessionmaker, admin_user: AdminUser) -> FastAPI:
    """The app whose ``get_db`` dependency points at the SQLite test database."""
    application = create_app()

    def override_get_db() -> Iterator[Session]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_db] = override_get_db
    yield application
    application.dependency_overrides.clear()


@pytest.fixture()
def anon_client(test_app: FastAPI) -> Iterator[TestClient]:
    """A TestClient with no session cookie: the starting point of the login tests."""
    with TestClient(test_app) as test_client:
        yield test_client


@pytest.fixture()
def client(
    test_app: FastAPI,
    session_factory: sessionmaker,
    admin_user: AdminUser,
) -> Iterator[TestClient]:
    """A TestClient already signed in, so the domain tests can hit protected routes."""
    with TestClient(test_app) as test_client:
        _open_session(session_factory, admin_user, TEST_SESSION_TOKEN)
        test_client.cookies.set(SESSION_COOKIE_NAME, TEST_SESSION_TOKEN)
        yield test_client


def _open_session(session_factory: sessionmaker, user: AdminUser, token: str) -> AdminSession:
    """Write a live session row for ``token`` and return it."""
    settings = get_settings()
    now = datetime.now(UTC)
    with session_factory() as session:
        stored = AdminSession(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
            expires_at=now + settings.session_ttl,
            absolute_expires_at=now + settings.session_absolute_ttl,
            ip="127.0.0.1",
            user_agent="pytest",
        )
        session.add(stored)
        session.commit()
        session.refresh(stored)
        return stored
