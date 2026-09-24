"""Authentication primitives: password hashing, session tokens and the guards.

The app has a single administrator. Its password is hashed with ``hashlib.scrypt``
from the standard library (no dependency to build on ``python:3.12-slim``) and the
session token is opaque: only a peppered HMAC of it is stored, so a leaked
``sessions`` table never hands out a usable session.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from .config import get_settings
from .db import get_db
from .models import AdminSession, AdminUser

# --------------------------------------------------------------------------- #
# Password hashing (scrypt, standard library only)
# --------------------------------------------------------------------------- #
# OWASP-acceptable scrypt parameters: n=2^14, r=8, p=1 (about 16 MiB per hash).
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
SCRYPT_SALT_BYTES = 16

# Sanity bounds applied to the parameters parsed back out of a stored hash, so a
# tampered row can never make scrypt allocate an absurd amount of memory.
_SCRYPT_N_RANGE = (2**10, 2**20)
_SCRYPT_R_RANGE = (1, 32)
_SCRYPT_P_RANGE = (1, 16)

_PASSWORD_PREFIX = "scrypt"
_UNAUTHORIZED_DETAIL = "Sesión inválida o expirada."


def hash_password(password: str) -> str:
    """Hash a password with scrypt and a fresh random salt."""
    salt = secrets.token_bytes(SCRYPT_SALT_BYTES)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return "$".join(
        [
            _PASSWORD_PREFIX,
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(derived).decode("ascii"),
        ]
    )


def verify_password(password: str, stored: str | None) -> bool:
    """Verify a password against a stored hash in constant time.

    A missing or malformed hash is a plain ``False`` (never an exception): a
    corrupted row must not turn a login attempt into a 500.
    """
    if not stored:
        return False
    try:
        prefix, n_raw, r_raw, p_raw, salt_raw, expected_raw = stored.split("$")
        if prefix != _PASSWORD_PREFIX:
            return False
        n, r, p = int(n_raw), int(r_raw), int(p_raw)
        if not (_SCRYPT_N_RANGE[0] <= n <= _SCRYPT_N_RANGE[1]):
            return False
        if not (_SCRYPT_R_RANGE[0] <= r <= _SCRYPT_R_RANGE[1]):
            return False
        if not (_SCRYPT_P_RANGE[0] <= p <= _SCRYPT_P_RANGE[1]):
            return False
        salt = base64.b64decode(salt_raw, validate=True)
        expected = base64.b64decode(expected_raw, validate=True)
        if len(expected) != SCRYPT_DKLEN:
            return False
        derived = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=len(expected)
        )
    except (ValueError, TypeError):
        # binascii.Error is a ValueError; int()/split() failures land here too.
        return False
    return hmac.compare_digest(derived, expected)


@lru_cache(maxsize=1)
def dummy_password_hash() -> str:
    """A valid hash to verify against when the user does not exist.

    Comparing against it keeps the response time of an unknown username close to
    a known one, so the login endpoint does not reveal whether the user exists.
    """
    return hash_password("dummy-password-that-never-matches")


# --------------------------------------------------------------------------- #
# Session tokens and cookies
# --------------------------------------------------------------------------- #
SESSION_COOKIE_NAME = "financirdus_session"
TOKEN_BYTES = 32

# Sliding expiry is written at most once per this interval, so a burst of
# requests does not turn into a burst of UPDATEs.
TOUCH_INTERVAL = timedelta(seconds=60)


def new_session_token() -> str:
    """A fresh opaque session token (what goes into the cookie)."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    """Peppered hash of a session token: what the database actually stores."""
    secret = get_settings().secret_key.encode("utf-8")
    return hmac.new(secret, token.encode("utf-8"), hashlib.sha256).hexdigest()


def set_session_cookie(response: Response, token: str, max_age: int) -> None:
    """Attach the session cookie: httpOnly, SameSite=Lax, Secure when configured."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=get_settings().session_cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    """Expire the session cookie (logout, or a closed session)."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=get_settings().session_cookie_secure,
        path="/",
    )


# --------------------------------------------------------------------------- #
# Request metadata
# --------------------------------------------------------------------------- #
def client_ip(request: Request) -> str | None:
    """Best-effort client IP: the first ``X-Forwarded-For`` entry, else the peer."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else None


def client_user_agent(request: Request) -> str | None:
    """The request's User-Agent, bounded so a hostile header cannot bloat the row."""
    agent = request.headers.get("user-agent")
    return agent[:400] if agent else None


def _as_utc(value: datetime) -> datetime:
    """Normalize a datetime to UTC (SQLite drops the offset, so naive means UTC)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


# --------------------------------------------------------------------------- #
# Session lifecycle
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class AuthContext:
    """The authenticated request: the live session and the administrator behind it."""

    session: AdminSession
    user: AdminUser


def create_session(db: Session, user: AdminUser, request: Request) -> tuple[str, AdminSession]:
    """Open a session for ``user``; returns the raw token (its only appearance)."""
    settings = get_settings()
    now = datetime.now(UTC)
    token = new_session_token()
    session = AdminSession(
        token_hash=hash_token(token),
        user_id=user.id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + settings.session_ttl,
        absolute_expires_at=now + settings.session_absolute_ttl,
        ip=client_ip(request),
        user_agent=client_user_agent(request),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return token, session


def revoke_session(db: Session, session: AdminSession) -> None:
    """Mark a session as revoked (idempotent)."""
    if session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        db.commit()


def revoke_all_sessions(
    db: Session, user_id: int, keep_session_id: int | None = None
) -> int:
    """Revoke every live session of ``user_id``, optionally sparing one.

    Returns how many sessions were revoked.
    """
    now = datetime.now(UTC)
    stmt = select(AdminSession).where(
        AdminSession.user_id == user_id, AdminSession.revoked_at.is_(None)
    )
    if keep_session_id is not None:
        stmt = stmt.where(AdminSession.id != keep_session_id)
    revoked = 0
    for session in db.execute(stmt).scalars().all():
        session.revoked_at = now
        revoked += 1
    if revoked:
        db.commit()
    return revoked


def _touch_session(db: Session, session: AdminSession, now: datetime) -> None:
    """Slide the idle expiry forward, writing at most once per ``TOUCH_INTERVAL``."""
    if now - _as_utc(session.last_seen_at) < TOUCH_INTERVAL:
        return
    settings = get_settings()
    session.last_seen_at = now
    session.expires_at = min(
        now + settings.session_ttl, _as_utc(session.absolute_expires_at)
    )
    db.commit()


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_UNAUTHORIZED_DETAIL)


def require_session(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    """FastAPI dependency resolving the cookie into an :class:`AuthContext`.

    Raises 401 (readable Spanish message) when the cookie is missing, the session
    is unknown, revoked or expired, or its user no longer exists. On success it
    slides the idle expiry forward.
    """
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise _unauthorized()

    session = db.scalar(select(AdminSession).where(AdminSession.token_hash == hash_token(token)))
    if session is None or session.revoked_at is not None:
        raise _unauthorized()

    now = datetime.now(UTC)
    if _as_utc(session.expires_at) <= now or _as_utc(session.absolute_expires_at) <= now:
        raise _unauthorized()

    user = db.get(AdminUser, session.user_id)
    if user is None:
        raise _unauthorized()

    _touch_session(db, session, now)
    return AuthContext(session=session, user=user)


# --------------------------------------------------------------------------- #
# CSRF: cross-site mutating requests are refused
# --------------------------------------------------------------------------- #
_MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_CSRF_DETAIL = "Origen no permitido."


def _origin_allowed(origin: str, request: Request) -> bool:
    """True when ``origin`` is either a configured CORS origin or this host."""
    if origin in get_settings().cors_origins:
        return True
    # nginx forwards ``Host $host`` (no port), so compare hostnames, not netloc.
    return urlsplit(origin).hostname == request.url.hostname


class CsrfProtectionMiddleware:
    """Refuse cross-site mutating ``/api/`` requests (defence over ``SameSite=Lax``).

    A same-origin fetch is tagged ``Sec-Fetch-Site: same-origin``; a cross-site one
    is tagged ``cross-site`` and carries a foreign ``Origin``. Requests without
    browser origin headers (curl, the integration smoke test, server-to-server)
    are allowed: they cannot carry a victim's cookie from a browser.

    Written as a plain ASGI middleware on purpose: it only looks at headers, so it
    hands ``receive``/``send`` straight through and never touches the request body
    (the import endpoint streams and limits its own body).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] not in _MUTATING_METHODS
            or not scope["path"].startswith("/api/")
        ):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        fetch_site = headers.get("sec-fetch-site")
        origin = headers.get("origin")
        refused = fetch_site == "cross-site" or (
            origin is not None and not _origin_allowed(origin, Request(scope, receive))
        )
        if refused:
            await JSONResponse(status_code=403, content={"detail": _CSRF_DETAIL})(
                scope, receive, send
            )
            return

        await self.app(scope, receive, send)
