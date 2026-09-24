"""Authentication: login, lockout, session management, password change and CSRF."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AdminSession, AdminUser
from app.security import (
    SESSION_COOKIE_NAME,
    hash_password,
    hash_token,
    verify_password,
)

SESSION_FIELDS = {
    "id",
    "created_at",
    "last_seen_at",
    "expires_at",
    "ip",
    "user_agent",
    "is_current",
}
BAD_CREDENTIALS = "Usuario o contraseña incorrectos."
CSRF_DETAIL = "Origen no permitido."


def _login(client: TestClient, username: str, password: str):
    return client.post("/api/auth/login", json={"username": username, "password": password})


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #
class TestLogin:
    def test_success_answers_and_sets_a_hardened_cookie(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        response = _login(anon_client, username, password)

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["username"] == username
        assert body["must_change_password"] is False
        assert set(body) == {"username", "must_change_password", "expires_at"}

        cookie_header = response.headers["set-cookie"]
        assert cookie_header.startswith(f"{SESSION_COOKIE_NAME}=")
        assert "HttpOnly" in cookie_header
        assert "samesite=lax" in cookie_header.lower()
        assert "Path=/" in cookie_header
        # SESSION_COOKIE_SECURE defaults to false so the plain-HTTP LAN setup works.
        assert "secure" not in cookie_header.lower()

    def test_session_cookie_opens_the_api(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        assert _login(anon_client, username, password).status_code == 200

        assert anon_client.get("/api/auth/me").status_code == 200
        assert anon_client.get("/api/categories").status_code == 200

    def test_username_is_matched_without_surrounding_spaces(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        assert _login(anon_client, f"  {username}  ", password).status_code == 200

    def test_wrong_password_is_a_generic_401(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, _ = admin_credentials
        response = _login(anon_client, username, "contrasena-equivocada")

        assert response.status_code == 401
        assert response.json() == {"detail": BAD_CREDENTIALS}
        assert SESSION_COOKIE_NAME not in anon_client.cookies

    def test_unknown_user_answers_the_very_same_message(self, anon_client: TestClient) -> None:
        response = _login(anon_client, "nadie", "contrasena-equivocada")

        assert response.status_code == 401
        # Same message as a wrong password: the endpoint must not reveal the user.
        assert response.json() == {"detail": BAD_CREDENTIALS}

    def test_empty_credentials_are_a_401_not_a_422(self, anon_client: TestClient) -> None:
        assert _login(anon_client, "", "").status_code == 401

    def test_lockout_after_the_configured_attempts(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        limit = get_settings().login_max_attempts

        for _ in range(limit):
            assert _login(anon_client, username, "mala").status_code == 401

        # Even the right password is refused while the lockout holds.
        blocked = _login(anon_client, username, password)
        assert blocked.status_code == 429
        assert blocked.headers["retry-after"] == str(
            get_settings().login_lockout_minutes * 60
        )

    def test_a_success_clears_the_previous_failures(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        limit = get_settings().login_max_attempts

        for _ in range(limit - 1):
            _login(anon_client, username, "mala")
        assert _login(anon_client, username, password).status_code == 200

        # The counter restarted: one more failure than before still is not a lockout.
        for _ in range(limit - 1):
            assert _login(anon_client, username, "mala").status_code == 401

    def test_failures_of_another_account_do_not_lock_the_admin(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        limit = get_settings().login_max_attempts

        # The other account gets throttled (401 and then 429); the point is what
        # it does NOT do to the administrator's own counter.
        for _ in range(limit + 2):
            assert _login(anon_client, "otro-usuario", "mala").status_code in (401, 429)

        # The throttle is per account: a shared IP (like a NAT) must not be able
        # to lock the owner out of their own app.
        assert _login(anon_client, username, password).status_code == 200


# --------------------------------------------------------------------------- #
# Protected routes
# --------------------------------------------------------------------------- #
class TestProtection:
    @pytest.mark.parametrize(
        "path",
        [
            "/api/categories",
            "/api/accounts",
            "/api/movements",
            "/api/budgets",
            "/api/plan",
            "/api/stats/summary",
            "/api/data/export",
            "/api/admin/sessions",
        ],
    )
    def test_without_a_session_is_401(self, anon_client: TestClient, path: str) -> None:
        assert anon_client.get(path).status_code == 401

    def test_writes_without_a_session_are_401(self, anon_client: TestClient) -> None:
        response = anon_client.post(
            "/api/movements",
            json={
                "type": "gasto",
                "category_id": "ocio",
                "account_id": 1,
                "entry_currency": "USD",
                "entry_amount_cents": 100,
                "date": "2026-09-01",
            },
        )
        assert response.status_code == 401

    def test_a_bogus_cookie_is_401(self, anon_client: TestClient) -> None:
        anon_client.cookies.set(SESSION_COOKIE_NAME, "token-inventado")
        assert anon_client.get("/api/categories").status_code == 401

    def test_with_a_session_is_ok(self, client: TestClient) -> None:
        assert client.get("/api/categories").status_code == 200
        assert client.get("/api/movements").status_code == 200

    def test_health_stays_public(self, anon_client: TestClient) -> None:
        response = anon_client.get("/api/health")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_me_requires_a_session(self, anon_client: TestClient) -> None:
        assert anon_client.get("/api/auth/me").status_code == 401

    def test_me_describes_the_current_session(
        self, client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, _ = admin_credentials
        response = client.get("/api/auth/me")

        assert response.status_code == 200
        body = response.json()
        assert body["username"] == username
        assert body["must_change_password"] is False
        assert set(body["session"]) == SESSION_FIELDS
        assert body["session"]["is_current"] is True
        assert body["session"]["user_agent"] == "pytest"


class TestExpiredSessions:
    def test_an_expired_session_is_401(self, client: TestClient, db_session: Session) -> None:
        stored = db_session.scalars(select(AdminSession)).one()
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db_session.commit()

        assert client.get("/api/auth/me").status_code == 401

    def test_the_absolute_cap_wins_over_activity(
        self, client: TestClient, db_session: Session
    ) -> None:
        stored = db_session.scalars(select(AdminSession)).one()
        stored.absolute_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db_session.commit()

        assert client.get("/api/auth/me").status_code == 401

    def test_activity_slides_the_idle_expiry(
        self, client: TestClient, db_session: Session
    ) -> None:
        stored = db_session.scalars(select(AdminSession)).one()
        # Last seen long ago: the next request must refresh it.
        stored.last_seen_at = datetime.now(UTC) - timedelta(hours=1)
        db_session.commit()

        assert client.get("/api/auth/me").status_code == 200

        db_session.expire_all()
        refreshed = db_session.scalars(select(AdminSession)).one()
        last_seen = refreshed.last_seen_at
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=UTC)
        assert datetime.now(UTC) - last_seen < timedelta(minutes=1)


# --------------------------------------------------------------------------- #
# Logout
# --------------------------------------------------------------------------- #
class TestLogout:
    def test_logout_revokes_the_session_and_drops_the_cookie(
        self, client: TestClient, db_session: Session
    ) -> None:
        assert client.get("/api/auth/me").status_code == 200

        response = client.post("/api/auth/logout")
        assert response.status_code == 204
        assert SESSION_COOKIE_NAME in response.headers["set-cookie"]

        assert client.get("/api/auth/me").status_code == 401
        stored = db_session.scalars(select(AdminSession)).one()
        assert stored.revoked_at is not None

    def test_logout_without_a_session_is_idempotent(self, anon_client: TestClient) -> None:
        assert anon_client.post("/api/auth/logout").status_code == 204


# --------------------------------------------------------------------------- #
# Password change
# --------------------------------------------------------------------------- #
class TestPasswordChange:
    NEW_PASSWORD = "clave-nueva-larga-2027"

    def test_a_wrong_current_password_is_401(
        self, client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        _, password = admin_credentials
        response = client.post(
            "/api/auth/password",
            json={"current_password": "no-es-la-actual", "new_password": self.NEW_PASSWORD},
        )

        assert response.status_code == 401
        # The credential is untouched: the session still works with the old one.
        assert _login(client, admin_credentials[0], password).status_code == 200

    @pytest.mark.parametrize("weak", ["corta", "1234567890123", "admin"])
    def test_a_weak_password_is_422(
        self, client: TestClient, admin_credentials: tuple[str, str], weak: str
    ) -> None:
        _, password = admin_credentials
        response = client.post(
            "/api/auth/password",
            json={"current_password": password, "new_password": weak},
        )

        assert response.status_code == 422
        assert isinstance(response.json()["detail"], str)

    def test_change_keeps_this_session_and_closes_the_others(
        self, test_app, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials

        with TestClient(test_app) as first, TestClient(test_app) as second:
            assert _login(first, username, password).status_code == 200
            assert _login(second, username, password).status_code == 200

            changed = first.post(
                "/api/auth/password",
                json={"current_password": password, "new_password": self.NEW_PASSWORD},
            )
            assert changed.status_code == 204

            assert first.get("/api/auth/me").status_code == 200
            assert second.get("/api/auth/me").status_code == 401

            with TestClient(test_app) as third:
                assert _login(third, username, password).status_code == 401
                assert _login(third, username, self.NEW_PASSWORD).status_code == 200

    def test_the_forced_flag_is_reported_and_cleared(
        self,
        anon_client: TestClient,
        db_session: Session,
        admin_credentials: tuple[str, str],
    ) -> None:
        username, password = admin_credentials
        user = db_session.scalar(select(AdminUser).where(AdminUser.username == username))
        assert user is not None
        user.must_change_password = True
        db_session.commit()

        assert _login(anon_client, username, password).json()["must_change_password"] is True
        assert anon_client.get("/api/auth/me").json()["must_change_password"] is True

        changed = anon_client.post(
            "/api/auth/password",
            json={"current_password": password, "new_password": self.NEW_PASSWORD},
        )
        assert changed.status_code == 204
        assert anon_client.get("/api/auth/me").json()["must_change_password"] is False


# --------------------------------------------------------------------------- #
# Sessions panel
# --------------------------------------------------------------------------- #
class TestSessionsPanel:
    def test_lists_the_live_sessions_of_the_administrator(
        self, test_app, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        with TestClient(test_app) as first, TestClient(test_app) as second:
            assert _login(first, username, password).status_code == 200
            assert _login(second, username, password).status_code == 200

            response = first.get("/api/admin/sessions")
            assert response.status_code == 200
            items = response.json()["items"]
            assert len(items) == 2
            assert all(set(item) == SESSION_FIELDS for item in items)
            assert [item["is_current"] for item in items].count(True) == 1

    def test_closing_another_session_kills_it_remotely(
        self, test_app, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        with TestClient(test_app) as first, TestClient(test_app) as second:
            _login(first, username, password)
            _login(second, username, password)

            items = first.get("/api/admin/sessions").json()["items"]
            other_id = next(item["id"] for item in items if not item["is_current"])

            assert first.delete(f"/api/admin/sessions/{other_id}").status_code == 204
            assert second.get("/api/auth/me").status_code == 401
            assert first.get("/api/auth/me").status_code == 200

            # A revoked session is gone from the panel.
            remaining = first.get("/api/admin/sessions").json()["items"]
            assert [item["id"] for item in remaining] == [
                item["id"] for item in items if item["id"] != other_id
            ]

    def test_closing_the_current_session_logs_out(self, client: TestClient) -> None:
        current = client.get("/api/auth/me").json()["session"]["id"]

        response = client.delete(f"/api/admin/sessions/{current}")

        assert response.status_code == 204
        assert SESSION_COOKIE_NAME in response.headers["set-cookie"]
        assert client.get("/api/auth/me").status_code == 401

    def test_an_unknown_session_is_404(self, client: TestClient) -> None:
        assert client.delete("/api/admin/sessions/999999").status_code == 404

    def test_revoke_all_closes_every_session(
        self, test_app, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        with TestClient(test_app) as first, TestClient(test_app) as second:
            _login(first, username, password)
            _login(second, username, password)

            assert first.post("/api/admin/sessions/revoke-all").status_code == 204
            assert first.get("/api/auth/me").status_code == 401
            assert second.get("/api/auth/me").status_code == 401


# --------------------------------------------------------------------------- #
# CSRF
# --------------------------------------------------------------------------- #
class TestCsrf:
    def test_a_foreign_origin_is_refused(self, client: TestClient) -> None:
        response = client.post("/api/auth/logout", headers={"Origin": "http://evil.example"})

        assert response.status_code == 403
        assert response.json() == {"detail": CSRF_DETAIL}
        # Nothing happened: the session is still alive.
        assert client.get("/api/auth/me").status_code == 200

    def test_cross_site_fetch_metadata_is_refused(self, client: TestClient) -> None:
        response = client.post("/api/auth/logout", headers={"Sec-Fetch-Site": "cross-site"})

        assert response.status_code == 403
        assert client.get("/api/auth/me").status_code == 200

    def test_the_configured_dev_origin_is_allowed(self, client: TestClient) -> None:
        response = client.post(
            "/api/auth/logout", headers={"Origin": "http://localhost:5173"}
        )

        assert response.status_code == 204

    def test_a_same_origin_request_is_allowed(self, client: TestClient) -> None:
        # nginx forwards `Host $host` (no port), so the host alone must match.
        response = client.post(
            "/api/auth/logout",
            headers={"Origin": "http://testserver", "Sec-Fetch-Site": "same-origin"},
        )

        assert response.status_code == 204

    def test_reads_are_never_blocked(self, client: TestClient) -> None:
        assert (
            client.get("/api/categories", headers={"Origin": "http://evil.example"}).status_code
            == 200
        )

    def test_the_login_endpoint_is_reachable_from_the_dev_origin(
        self, anon_client: TestClient, admin_credentials: tuple[str, str]
    ) -> None:
        username, password = admin_credentials
        response = anon_client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
            headers={"Origin": "http://localhost:5173"},
        )

        assert response.status_code == 200


# --------------------------------------------------------------------------- #
# Storage of the credential and the token
# --------------------------------------------------------------------------- #
class TestCredentialStorage:
    def test_password_round_trip(self) -> None:
        stored = hash_password("una-clave-larga")

        assert stored.startswith("scrypt$")
        assert verify_password("una-clave-larga", stored) is True
        assert verify_password("otra-clave-larga", stored) is False

    def test_the_salt_makes_every_hash_different(self) -> None:
        assert hash_password("misma-clave-larga") != hash_password("misma-clave-larga")

    @pytest.mark.parametrize(
        "stored",
        [
            "",
            "no-es-un-hash",
            "scrypt$16384$8$1$solo-cuatro-partes",
            "bcrypt$16384$8$1$AAAA$AAAA",
            "scrypt$16384$8$1$no-es-base64!$AAAA",
            "scrypt$2$8$1$AAAA$AAAA",
            "scrypt$1073741824$8$1$AAAA$AAAA",
        ],
    )
    def test_a_malformed_hash_is_a_plain_false(self, stored: str) -> None:
        assert verify_password("cualquier-clave", stored) is False

    def test_a_missing_hash_is_a_plain_false(self) -> None:
        assert verify_password("cualquier-clave", None) is False

    def test_the_database_stores_only_the_peppered_hash_of_the_token(
        self,
        anon_client: TestClient,
        db_session: Session,
        admin_credentials: tuple[str, str],
    ) -> None:
        username, password = admin_credentials
        assert _login(anon_client, username, password).status_code == 200
        token = anon_client.cookies[SESSION_COOKIE_NAME]

        stored = db_session.scalars(select(AdminSession)).all()

        assert len(stored) == 1
        assert stored[0].token_hash == hash_token(token)
        assert stored[0].token_hash != token
        assert len(stored[0].token_hash) == 64
