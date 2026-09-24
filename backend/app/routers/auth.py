"""Authentication endpoints: login, logout, current user and password change.

A personal app with a single administrator, so these endpoints are two things:
the door (login/logout) and the panel's own account actions (``/me`` and the
password change). Everything else in the API is locked behind
:func:`app.security.require_session`.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..domain import DomainError, validate_password
from ..models import AdminSession, AdminUser, LoginAttempt
from ..schemas import LoginIn, LoginOut, MeOut, PasswordChangeIn
from ..security import (
    SESSION_COOKIE_NAME,
    AuthContext,
    clear_session_cookie,
    create_session,
    dummy_password_hash,
    hash_password,
    hash_token,
    require_session,
    revoke_all_sessions,
    revoke_session,
    set_session_cookie,
    verify_password,
)
from . import session_out

router = APIRouter(prefix="/api/auth", tags=["auth"])

# One message for a wrong user and for a wrong password: the login endpoint must
# not tell an attacker which half of the credential it got right.
BAD_CREDENTIALS_DETAIL = "Usuario o contraseña incorrectos."
LOCKED_DETAIL = "Demasiados intentos fallidos. Probá de nuevo en unos minutos."
WRONG_CURRENT_DETAIL = "La contraseña actual no es correcta."

# Login attempts store the submitted username, kept short so a hostile payload
# cannot bloat the table.
MAX_ATTEMPT_USERNAME_LEN = 60


def _recent_failure_count(db: Session, username: str) -> int:
    """Failed attempts for this account inside the lockout window.

    Per account, not per IP: there is a single user, so the account is what needs
    protecting, and an IP dimension would let a shared address (NAT) lock the
    owner out of their own app.
    """
    since = datetime.now(UTC) - get_settings().login_lockout_window
    stmt = (
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            LoginAttempt.success.is_(False),
            LoginAttempt.created_at >= since,
            LoginAttempt.username == username,
        )
    )
    return int(db.scalar(stmt) or 0)


def _record_attempt(db: Session, username: str, success: bool) -> None:
    """Record an attempt; a success also clears the user's previous failures."""
    db.add(LoginAttempt(username=username[:MAX_ATTEMPT_USERNAME_LEN], success=success))
    if success:
        db.execute(
            delete(LoginAttempt).where(
                LoginAttempt.username == username,
                LoginAttempt.success.is_(False),
            )
        )
    db.commit()


@router.post("/login", response_model=LoginOut)
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    """Start a session and hand the cookie to the browser."""
    settings = get_settings()
    username = payload.username.strip()

    max_attempts = settings.login_max_attempts
    if _recent_failure_count(db, username) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=LOCKED_DETAIL,
            headers={"Retry-After": str(settings.login_lockout_minutes * 60)},
        )

    user = db.scalar(select(AdminUser).where(AdminUser.username == username))
    # Verify against a dummy hash when the user does not exist, so both failure
    # paths cost the same and the response does not leak which usernames are real.
    stored_hash = user.password_hash if user is not None else dummy_password_hash()
    authenticated = verify_password(payload.password, stored_hash) and user is not None
    _record_attempt(db, username, authenticated)

    if not authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=BAD_CREDENTIALS_DETAIL,
        )

    token, session = create_session(db, user, request)
    set_session_cookie(response, token, max_age=settings.session_ttl_minutes * 60)
    return {
        "username": user.username,
        "must_change_password": user.must_change_password,
        "expires_at": session.expires_at,
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    """Revoke the current session and drop the cookie (idempotent)."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        session = db.scalar(
            select(AdminSession).where(AdminSession.token_hash == hash_token(token))
        )
        if session is not None:
            revoke_session(db, session)

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response


@router.get("/me", response_model=MeOut)
def me(auth: AuthContext = Depends(require_session)) -> dict:
    """The signed-in administrator; the frontend uses it as its session gate."""
    return {
        "username": auth.user.username,
        "must_change_password": auth.user.must_change_password,
        "session": session_out(auth.session, auth.session.id),
    }


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChangeIn,
    auth: AuthContext = Depends(require_session),
    db: Session = Depends(get_db),
) -> Response:
    """Replace the admin password and close every other session."""
    try:
        new_password = validate_password(payload.new_password, auth.user.username)
    except DomainError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not verify_password(payload.current_password, auth.user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=WRONG_CURRENT_DETAIL,
        )

    auth.user.password_hash = hash_password(new_password)
    auth.user.must_change_password = False
    auth.user.password_changed_at = datetime.now(UTC)
    db.commit()

    # A password change is the moment to trust the other devices less.
    revoke_all_sessions(db, auth.user.id, keep_session_id=auth.session.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
